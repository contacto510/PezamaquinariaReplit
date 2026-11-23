import type { Express, RequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@db";
import { webRequests, webRequestSchema } from "@shared/web-requests";
import { z } from "zod";

function normalizeRadio(value: Record<string, unknown>, field: string) {
  const unwrap = (input: unknown) => Array.isArray(input) && input.length === 1 ? input[0] : input;
  const plain = unwrap(value[field]);
  const bracketed = unwrap(value[`${field}[]`]);
  if (plain !== undefined && bracketed !== undefined && JSON.stringify(plain) !== JSON.stringify(bracketed)) {
    throw new z.ZodError([{ code: z.ZodIssueCode.custom, path: [field], message: "Opciones contradictorias" }]);
  }
  if (plain !== undefined || bracketed !== undefined) value[field] = plain ?? bracketed;
  delete value[`${field}[]`];
}

export function invalidWebRequestFields(error: unknown): string[] | null {
  if (error instanceof z.ZodError) {
    return Array.from(new Set(error.issues.map(issue => String(issue.path[0] ?? "body"))));
  }
  if (error instanceof Error && error.message === "Página de origen no permitida") return ["pagina_url"];
  return null;
}

export function webhookAuthorized(header: unknown, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || typeof header !== "string" || header.length > 512) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header), hash(secret));
}

export function parseWebRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return webRequestSchema.parse(body);
  const value = { ...body } as Record<string, unknown>;
  // Bricks radios may arrive as scalars, single-element arrays or bracketed names.
  normalizeRadio(value, "tipo_solicitud");
  // Inactive rental fields must not invalidate a repair request.
  if (value.tipo_solicitud === "cotizacion_renta") normalizeRadio(value, "entrega");
  const parsed = webRequestSchema.parse(value);
  const source = new URL(parsed.pagina_url);
  if (source.protocol !== "https:" || !["sd.pezamaquinaria.com.mx", "pezamaquinaria.com.mx", "www.pezamaquinaria.com.mx"].includes(source.hostname)) {
    throw new Error("Página de origen no permitida");
  }
  // Never persist query strings which may contain personal data or credentials.
  parsed.pagina_url = source.origin + source.pathname;
  return parsed;
}

export function registerWebRequestWebhook(app: Express) {
  app.post("/api/integrations/bricks/requests", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!process.env.WORDPRESS_WEBHOOK_SECRET || process.env.WORDPRESS_WEBHOOK_SECRET.length < 32) {
      return res.status(503).json({ message: "Recepción web no configurada" });
    }
    if (!webhookAuthorized(req.headers["x-webhook-secret"], process.env.WORDPRESS_WEBHOOK_SECRET)) {
      return res.status(401).json({ message: "Credencial de integración inválida" });
    }
    try {
      const payload = parseWebRequest(req.body);
      const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      const outcome = await db.transaction(async tx => {
        // Database-backed lock/limit also works across multiple server instances.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(87340211)`);
        const [existing] = await tx.select().from(webRequests).where(eq(webRequests.submissionId, payload.submission_id)).limit(1);
        if (existing) return { code: existing.payloadHash === hash ? 200 : 409, duplicate: true };
        const [recent] = await tx.select({ value: count() }).from(webRequests).where(gte(webRequests.receivedAt, new Date(Date.now() - 3600000)));
        if (Number(recent.value) >= 120) return { code: 429, duplicate: false };
        await tx.insert(webRequests).values({
          submissionId: payload.submission_id, type: payload.tipo_solicitud, payload, payloadHash: hash,
        });
        return { code: 201, duplicate: false };
      });
      if (outcome.code === 429) {
        res.set("Retry-After", "3600");
        return res.status(429).json({ message: "Límite de recepción alcanzado; conservar y reintentar el envío" });
      }
      if (outcome.code === 409) return res.status(409).json({ message: "Identificador reutilizado con datos diferentes" });
      return res.status(outcome.code).json({ accepted: true, duplicate: outcome.duplicate });
    } catch (error) {
      const invalidFields = invalidWebRequestFields(error);
      if (invalidFields) {
        // Only field names, never values or credentials, are returned to the authenticated sender.
        return res.status(400).json({ message: "Datos de solicitud inválidos; verificar los campos y el identificador de envío", camposInvalidos: invalidFields });
      }
      console.error("No se pudo recibir solicitud web"); // Do not log personal data or headers.
      return res.status(503).json({ message: "No se pudo guardar; conservar y reintentar el envío" });
    }
  });
}

export function registerPrivateWebRequests(app: Express) {
  const safe: RequestHandler = (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); };
  app.get("/api/web-requests", safe, async (req, res) => {
    try {
      const { status, type, from, to } = req.query;
      const dates = [];
      for (const [key, value] of [["from", from], ["to", to]] as const) {
        if (value !== undefined) {
          if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) {
            return res.status(400).json({ message: "Fecha inválida" });
          }
          // Mexico City business dates, inclusive end date.
          const date = new Date(value + "T00:00:00-06:00");
          dates.push(key === "from" ? gte(webRequests.receivedAt, date) : lt(webRequests.receivedAt, new Date(date.getTime() + 86400000)));
        }
      }
      if (status && !["nueva", "seguimiento", "convertida", "descartada"].includes(String(status))) return res.status(400).json({ message: "Estado inválido" });
      if (type && !["cotizacion_renta", "reparacion"].includes(String(type))) return res.status(400).json({ message: "Tipo inválido" });
      const filters = [...dates, ...(status ? [eq(webRequests.status, String(status))] : []), ...(type ? [eq(webRequests.type, String(type))] : [])];
      const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
      const [items, totals, groups] = await Promise.all([
        db.select().from(webRequests).where(and(...filters)).orderBy(desc(webRequests.receivedAt), desc(webRequests.id)).limit(50).offset((Math.floor(page) - 1) * 50),
        db.select({ value: count() }).from(webRequests).where(and(...filters)),
        db.select({ status: webRequests.status, type: webRequests.type, value: count() }).from(webRequests).where(and(...dates)).groupBy(webRequests.status, webRequests.type),
      ]);
      const counts = { nueva: 0, seguimiento: 0, convertida: 0, descartada: 0, renta: 0, reparacion: 0 };
      for (const group of groups) {
        counts[group.status as "nueva"] += Number(group.value);
        counts[group.type === "reparacion" ? "reparacion" : "renta"] += Number(group.value);
      }
      res.json({ items: items.map(({ payloadHash, ...item }) => item), total: Number(totals[0].value), counts, webhookConfigured: !!process.env.WORDPRESS_WEBHOOK_SECRET && process.env.WORDPRESS_WEBHOOK_SECRET.length >= 32 });
    } catch { res.status(503).json({ message: "No se pudieron cargar las solicitudes web" }); }
  });
  app.get("/api/web-requests/:id", safe, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "ID inválido" });
    try {
      const [item] = await db.select().from(webRequests).where(eq(webRequests.id, id)).limit(1);
      if (!item) return res.status(404).json({ message: "Solicitud no encontrada" });
      const { payloadHash, ...result } = item;
      res.json(result);
    } catch { res.status(503).json({ message: "No se pudo cargar la solicitud" }); }
  });
  app.patch("/api/web-requests/:id", safe, async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(id) || id < 1 || !["nueva", "seguimiento", "descartada"].includes(status)) return res.status(400).json({ message: "Cambio inválido" });
    try {
      const [item] = await db.update(webRequests).set({ status, updatedAt: new Date() })
        .where(and(eq(webRequests.id, id), sql`${webRequests.convertedId} IS NULL`)).returning({ id: webRequests.id });
      if (!item) return res.status(409).json({ message: "No existe la solicitud o ya fue convertida" });
      res.json({ success: true });
    } catch { res.status(503).json({ message: "No se pudo actualizar la solicitud" }); }
  });
}
