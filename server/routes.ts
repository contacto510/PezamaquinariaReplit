import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { storage, MissingQuotationSalespersonError } from "./storage";
import { sendQuotationEmail } from "./email";
import { db } from "@db";
import { reports, reportItems, reportPayments, clients, clientProjects, quotations, repairs as repairsTable } from "@shared/schema";
import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { 
  quotationFormSchema, 
  quotationItemsSchema, 
  quotationInsertSchema, 
  quotationItemInsertSchema,
  clientSchema,
  clientProjectSchema,
  clientInsertSchema,
  clientProjectInsertSchema,
  conceptSchema,
  conceptInsertSchema,
  repairFormSchema,
  repairItemsSchema,
  repairInsertSchema,
  repairItemInsertSchema,
  reportInsertSchema,
  reportItemInsertSchema,
  reportPaymentInsertSchema,
  reportPaymentUpdateSchema,
  partialPaymentSchema,
  type RepairInsert
} from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { normalizeRepairStatus } from "@shared/repair-status";
import { summarizeAccountStatement } from "@shared/account-statement";
import { buildAccountsReceivable } from "@shared/accounts-receivable";
import { InvalidLiquidationDate, parseLiquidationDay } from "./repair-liquidation";
import { InvalidRepairReview } from "@shared/repair-review";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Resuelve la ruta del objeto en storage a partir de la URL.
// Solo se permiten fotos de reparación bajo el prefijo public/repairs/;
// cualquier otra ruta o formato (incluidas las Base64 antiguas) devuelve null.
const REPAIR_IMAGE_PREFIX = 'public/repairs/';
function resolveRepairImagePath(url: string): string | null {
  let objectPath: string | undefined;
  const bucketId = process.env.REPLIT_BUCKET_ID || '';
  if (url.startsWith('https://storage.googleapis.com/')) {
    objectPath = url.replace('https://storage.googleapis.com/', '').split('/').slice(1).join('/');
  } else if (bucketId && url.includes(`${bucketId}/`)) {
    objectPath = url.split(`${bucketId}/`)[1];
  } else if (url.startsWith('/public/')) {
    objectPath = url.slice(1); // quitar la barra inicial
  }
  if (!objectPath) return null;
  // Normalizar y validar: sin traversal y solo dentro del prefijo de fotos de reparación
  if (objectPath.includes('..') || !objectPath.startsWith(REPAIR_IMAGE_PREFIX)) return null;
  return objectPath;
}

// ¿Alguna reparación sigue referenciando esta URL de imagen?
// (Las reparaciones duplicadas comparten las mismas URLs de foto.)
async function isRepairImageReferenced(url: string): Promise<boolean> {
  const rows = await db.select({ id: repairsTable.id })
    .from(repairsTable)
    .where(or(
      eq(repairsTable.image1, url),
      eq(repairsTable.image2, url),
      eq(repairsTable.image3, url),
    ))
    .limit(1);
  return rows.length > 0;
}

// Borra del object storage una imagen de reparación a partir de su URL.
// Devuelve true si se borró; false si la URL no es válida, sigue referenciada
// por alguna reparación, o el borrado falló.
async function deleteStoredImageByUrl(url: string): Promise<boolean> {
  const objectPath = resolveRepairImagePath(url);
  if (!objectPath) return false;

  // No borrar si otra reparación aún usa la misma foto (p. ej., duplicados)
  if (await isRepairImageReferenced(url)) {
    console.log(`Imagen aún referenciada por otra reparación, no se borra: ${url.slice(0, 100)}`);
    return false;
  }

  const client = new ObjectStorageClient({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
  const result = await client.delete(objectPath);
  if (!result.ok) {
    console.error("Error eliminando de Object Storage:", result.error);
    return false;
  }
  return true;
}

// ==== Sesión persistente con cookie firmada (30 días) ====
const SESSION_COOKIE = "peza_session";
const SESSION_DAYS = 30;

function getSessionSecret(): string {
  // Derivado de las credenciales: si cambia la contraseña, las sesiones se invalidan
  const base = `${process.env.ADMIN_EMAIL || ""}|${process.env.ADMIN_PASSWORD || ""}|peza-session-v1`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

function createSessionToken(email: string): string {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): { email: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return { email: data.email };
  } catch {
    return null;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || "";
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// Middleware: exigir sesión activa (cookie firmada) para datos privados del negocio
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
  if (!session) {
    return res.status(401).json({ message: "Sesión requerida" });
  }
  next();
}

class ReportPaymentError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // API prefix
  const apiPrefix = "/api";

  // POST - Reporte de errores del cliente (mobile/desktop) para diagnóstico
  // Rate-limit simple en memoria por IP para evitar abuso/flooding.
  const clientErrorHits = new Map<string, { count: number; windowStart: number }>();
  const CLIENT_ERR_WINDOW_MS = 60_000;
  const CLIENT_ERR_MAX_PER_WINDOW = 30;
  const sanitizeField = (v: unknown, max: number): string => {
    if (v == null) return "";
    let s = typeof v === "string" ? v : String(v);
    // Quitar caracteres de control que romperían los logs
    s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
    if (s.length > max) s = s.slice(0, max) + "…[truncated]";
    return s;
  };
  app.post(
    `${apiPrefix}/client-errors`,
    express.json({ limit: "64kb" }),
    async (req, res) => {
      try {
        const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
        const now = Date.now();
        const hit = clientErrorHits.get(ip);
        if (!hit || now - hit.windowStart > CLIENT_ERR_WINDOW_MS) {
          clientErrorHits.set(ip, { count: 1, windowStart: now });
        } else {
          hit.count += 1;
          if (hit.count > CLIENT_ERR_MAX_PER_WINDOW) {
            return res.status(204).end();
          }
        }

        const body = req.body || {};
        const source = sanitizeField(body.source, 64) || "unknown";
        const message = sanitizeField(body.message, 1000);
        const stack = sanitizeField(body.stack, 4000);
        const componentStack = sanitizeField(body.componentStack, 4000);
        const url = sanitizeField(body.url, 500);
        const userAgent = sanitizeField(body.userAgent, 500);
        const viewport = sanitizeField(body.viewport, 32);
        const timestamp = sanitizeField(body.timestamp, 32);

        console.error(
          `[CLIENT ERROR] ${timestamp} | source=${source} | viewport=${viewport}\n` +
          `  url=${url}\n` +
          `  ua=${userAgent}\n` +
          `  message=${message}\n` +
          (stack ? `  stack=${stack.split("\n").slice(0, 12).join("\n         ")}\n` : "") +
          (componentStack ? `  componentStack=${componentStack.split("\n").slice(0, 12).join("\n         ")}\n` : "")
        );
        return res.status(204).end();
      } catch (err) {
        console.error("[CLIENT ERROR] Error al registrar:", err);
        return res.status(204).end();
      }
    }
  );

  // POST - Login endpoint
  app.post(`${apiPrefix}/login`, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email y contraseña son requeridos" });
      }

      // Credenciales de Péza Maquinaria (leídas de variables de entorno)
      const validEmail = process.env.ADMIN_EMAIL;
      const validPassword = process.env.ADMIN_PASSWORD;

      if (!validEmail || !validPassword) {
        console.error("ADMIN_EMAIL o ADMIN_PASSWORD no están configurados en las variables de entorno");
        return res.status(500).json({ message: "Error de configuración del servidor" });
      }

      if (email === validEmail && password === validPassword) {
        // Sesión persistente: cookie firmada válida por 30 días
        setSessionCookie(req, res, createSessionToken(email));
        return res.status(200).json({
          success: true,
          message: "Iniciaste sesión correctamente",
          user: { email },
        });
      }

      return res.status(401).json({ message: "Correo o contraseña incorrectos" });
    } catch (error) {
      console.error("Error en login:", error);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // GET - Verificar sesión activa (renueva la cookie: sesión "rodante")
  app.get(`${apiPrefix}/me`, (req, res) => {
    const session = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
    if (!session) {
      return res.status(401).json({ authenticated: false });
    }
    // Renovar la cookie para extender la sesión otros 30 días
    setSessionCookie(req, res, createSessionToken(session.email));
    return res.json({ authenticated: true, user: { email: session.email } });
  });

  // POST - Cerrar sesión
  app.post(`${apiPrefix}/logout`, (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return res.json({ success: true });
  });

  // Todo lo registrado después de este punto es información privada del negocio.
  // Las únicas rutas públicas de API son client-errors, login, me y logout.
  app.use(apiPrefix, requireAuth);

  // GET - Get the next quotation number
  app.get(`${apiPrefix}/quotations/next-number`, async (req, res) => {
    try {
      console.log("API - Obteniendo el siguiente número de cotización");
      const nextNumber = await storage.getNextQuotationNumber();
      console.log(`API - Número obtenido: ${nextNumber}`);
      return res.json({ nextNumber });
    } catch (error) {
      console.error("Error getting next quotation number:", error);
      return res.status(500).json({ message: "Error obteniendo el siguiente número de cotización" });
    }
  });
  
  // GET - Get a quotation by quotation number (with items)
  app.get(`${apiPrefix}/quotations/number/:number`, async (req, res) => {
    try {
      const quotationNumber = Number(req.params.number);
      if (isNaN(quotationNumber)) {
        return res.status(400).json({ message: "Número de cotización inválido" });
      }

      console.log(`API - Buscando cotización por número: ${quotationNumber}`);
      const quotation = await storage.getQuotationByNumber(quotationNumber);
      if (!quotation) {
        console.log(`API - Cotización #${quotationNumber} no encontrada`);
        return res.status(404).json({ message: "Cotización no encontrada" });
      }

      // Get quotation items
      const items = await storage.getQuotationItems(quotation.id);
      console.log(`API - Cotización #${quotationNumber} encontrada con ${items.length} conceptos`);

      // Return quotation with items
      return res.json({
        ...quotation,
        items
      });
    } catch (error) {
      console.error("Error getting quotation by number with items:", error);
      return res.status(500).json({ message: "Error obteniendo la cotización" });
    }
  });

  // GET - Get all quotations with pagination
  app.get(`${apiPrefix}/quotations`, async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 500;
      
      const quotations = await storage.getQuotations(page, limit);
      return res.json(quotations);
    } catch (error) {
      console.error("Error getting quotations:", error);
      return res.status(500).json({ message: "Error obteniendo las cotizaciones" });
    }
  });

  // GET - Get a quotation by ID
  app.get(`${apiPrefix}/quotations/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cotización inválido" });
      }

      const quotation = await storage.getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Cotización no encontrada" });
      }

      return res.json(quotation);
    } catch (error) {
      console.error("Error getting quotation:", error);
      return res.status(500).json({ message: "Error obteniendo la cotización" });
    }
  });

  // POST - Create a new quotation
  app.post(`${apiPrefix}/quotations`, async (req, res) => {
    try {
      const { quotation, items } = req.body;
      const seller = z.string().trim().min(1).safeParse(quotation?.salesperson);
      if (!seller.success) {
        return res.status(400).json({ message: "El vendedor es requerido" });
      }
      
      // Obtenemos el número de cotización más reciente
      const nextQuotationNumber = await storage.getNextQuotationNumber();
      console.log(`POST /quotations - Usando número de cotización: ${nextQuotationNumber}`);
      
      // Sobreescribimos el número de cotización para asegurar que sea único
      const quotationWithUpdatedNumber = {
        ...quotation,
        salesperson: seller.data,
        quotationNumber: nextQuotationNumber
      };
      
      // Validate quotation data
      const validatedQuotation = quotationInsertSchema.parse(quotationWithUpdatedNumber);
      
      // Validate items data
      const validatedItems = z.array(quotationItemInsertSchema.omit({ quotationId: true })).parse(items);
      
      // Create quotation with items
      const newQuotation = await storage.createQuotation(validatedQuotation, validatedItems);
      
      // Registrar/actualizar el cliente a partir de la cotización
      await storage.registerClientFromQuotation(newQuotation);
      
      console.log(`Cotización creada con éxito: #${newQuotation.quotationNumber}`);
      return res.status(201).json(newQuotation);
    } catch (error) {
      console.error("Error creating quotation:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error creando la cotización", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // POST - Duplicate a saved quotation with a new folio and current date.
  app.post(`${apiPrefix}/quotations/:id/duplicate`, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID de cotización inválido" });
    }
    try {
      let salespersonOverride: string | undefined;
      if (req.body?.salesperson !== undefined) {
        const seller = z.string().trim().min(1).safeParse(req.body.salesperson);
        if (!seller.success) {
          return res.status(400).json({ message: "El vendedor es requerido" });
        }
        salespersonOverride = seller.data;
      }
      const copy = await storage.duplicateQuotation(id, salespersonOverride);
      if (!copy) {
        return res.status(404).json({ message: "Cotización no encontrada" });
      }
      return res.status(201).json(copy);
    } catch (error) {
      if (error instanceof MissingQuotationSalespersonError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error duplicando cotización:", error);
      return res.status(500).json({ message: "No se pudo duplicar la cotización" });
    }
  });

  // PUT - Update a quotation with items
  app.put(`${apiPrefix}/quotations/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cotización inválido" });
      }

      const { quotation, items } = req.body;
      
      // Primero obtenemos la cotización original para mantener el número original
      const originalQuotation = await storage.getQuotationById(id);
      if (!originalQuotation) {
        return res.status(404).json({ message: "Cotización no encontrada" });
      }
      // An omitted seller preserves the saved value; explicit blanks are invalid.
      let salesperson = originalQuotation.salesperson?.trim();
      if (quotation?.salesperson !== undefined) {
        const seller = z.string().trim().min(1).safeParse(quotation.salesperson);
        if (!seller.success) {
          return res.status(400).json({ message: "El vendedor es requerido" });
        }
        salesperson = seller.data;
      }
      if (!salesperson) {
        return res.status(400).json({ message: "El vendedor es requerido" });
      }
      
      // Aseguramos que el número de cotización no cambie en la actualización
      const quotationWithOriginalNumber = {
        ...quotation,
        salesperson,
        quotationNumber: originalQuotation.quotationNumber
      };
      
      // Validate quotation data
      const validatedQuotation = quotationInsertSchema.partial().parse(quotationWithOriginalNumber);
      
      console.log(`Actualizando cotización #${originalQuotation.quotationNumber} (ID: ${id})`);
      
      // Update quotation basic info
      const updatedQuotation = await storage.updateQuotation(id, validatedQuotation);
      
      if (!updatedQuotation) {
        return res.status(404).json({ message: "Cotización no encontrada" });
      }
      
      // Handle items updates
      if (items && Array.isArray(items)) {
        // 1. Delete existing items that are not in the new list
        const existingItems = await storage.getQuotationItems(id);
        const newItemIds = items.filter(item => item.id).map(item => item.id);
        
        // Delete items that are not in the new list
        for (const existingItem of existingItems) {
          if (!newItemIds.includes(existingItem.id)) {
            await storage.deleteQuotationItem(existingItem.id);
          }
        }
        
        // 2. Update or create items
        for (const item of items) {
          if (item.id) {
            // Update existing item
            const validatedItem = quotationItemInsertSchema.omit({ quotationId: true }).partial().parse(item);
            await storage.updateQuotationItem(item.id, validatedItem);
          } else {
            // Create new item
            const validatedItem = quotationItemInsertSchema.omit({ quotationId: true }).parse(item);
            await storage.addQuotationItem(id, validatedItem);
          }
        }
      }
      
      // Get updated quotation with items
      const updatedItems = await storage.getQuotationItems(id);
      
      // Obtener la cotización completa actualizada
      const fullUpdatedQuotation = {
        ...updatedQuotation,
        items: updatedItems
      };
      
      // Actualizar los datos del cliente relacionado
      if (updatedQuotation.clientId) {
        await storage.syncClientData(updatedQuotation.clientId);
      }
      
      // Si la cotización tiene un proyecto, actualizar sus datos también
      if (updatedQuotation.projectId) {
        await storage.syncProjectData(updatedQuotation.projectId);
      }
      
      return res.json(fullUpdatedQuotation);
    } catch (error) {
      console.error("Error updating quotation:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error actualizando la cotización", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // DELETE - Delete a quotation
  app.delete(`${apiPrefix}/quotations/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cotización inválido" });
      }
      
      // Obtener la cotización antes de eliminarla para actualizar cliente y proyecto después
      const quotation = await storage.getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ message: "Cotización no encontrada" });
      }
      
      // Guardar referencias a cliente y proyecto si existen
      const clientId = quotation.clientId;
      const projectId = quotation.projectId;
      
      // Eliminar la cotización
      const success = await storage.deleteQuotation(id);
      
      if (!success) {
        return res.status(404).json({ message: "Error al eliminar la cotización" });
      }
      
      // Actualizar datos del cliente y proyecto relacionados
      if (clientId) {
        await storage.syncClientData(clientId);
      }
      
      if (projectId) {
        await storage.syncProjectData(projectId);
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting quotation:", error);
      return res.status(500).json({ message: "Error eliminando la cotización" });
    }
  });

  // POST - Add an item to a quotation
  app.post(`${apiPrefix}/quotations/:id/items`, async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      if (isNaN(quotationId)) {
        return res.status(400).json({ message: "ID de cotización inválido" });
      }

      const itemData = req.body;
      
      // Validate item data
      const validatedItem = quotationItemInsertSchema.omit({ quotationId: true }).parse(itemData);
      
      // Add item to quotation
      const newItem = await storage.addQuotationItem(quotationId, validatedItem);
      
      return res.status(201).json(newItem);
    } catch (error) {
      console.error("Error adding quotation item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error agregando el artículo a la cotización" });
    }
  });

  // PUT - Update a quotation item
  app.put(`${apiPrefix}/quotations/items/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de artículo inválido" });
      }

      const itemData = req.body;
      
      // Validate item data
      const validatedItem = quotationItemInsertSchema.omit({ quotationId: true }).partial().parse(itemData);
      
      // Update quotation item
      const updatedItem = await storage.updateQuotationItem(id, validatedItem);
      
      if (!updatedItem) {
        return res.status(404).json({ message: "Artículo no encontrado" });
      }
      
      // Actualizar cotización, cliente y proyecto relacionados
      if (updatedItem.quotationId) {
        const quotation = await storage.getQuotationById(updatedItem.quotationId);
        if (quotation && quotation.clientId) {
          await storage.syncClientData(quotation.clientId);
        }
        if (quotation && quotation.projectId) {
          await storage.syncProjectData(quotation.projectId);
        }
      }
      
      return res.json(updatedItem);
    } catch (error) {
      console.error("Error updating quotation item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error actualizando el artículo de la cotización" });
    }
  });

  // DELETE - Delete a quotation item
  app.delete(`${apiPrefix}/quotations/items/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de artículo inválido" });
      }

      // Obtener el artículo antes de eliminarlo para saber a qué cotización pertenece
      const item = await storage.getQuotationItems(0).then(items => items.find(i => i.id === id));
      if (!item) {
        return res.status(404).json({ message: "Artículo no encontrado" });
      }
      
      // Guardar el ID de la cotización
      const quotationId = item.quotationId;
      
      // Eliminar el artículo
      const success = await storage.deleteQuotationItem(id);
      
      if (!success) {
        return res.status(404).json({ message: "Error al eliminar el artículo" });
      }
      
      // Actualizar cotización, cliente y proyecto relacionados
      if (quotationId) {
        const quotation = await storage.getQuotationById(quotationId);
        if (quotation && quotation.clientId) {
          await storage.syncClientData(quotation.clientId);
        }
        if (quotation && quotation.projectId) {
          await storage.syncProjectData(quotation.projectId);
        }
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting quotation item:", error);
      return res.status(500).json({ message: "Error eliminando el artículo de la cotización" });
    }
  });

  // GET - Get all items for a quotation
  app.get(`${apiPrefix}/quotations/:id/items`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cotización inválido" });
      }

      const items = await storage.getQuotationItems(id);
      return res.json(items);
    } catch (error) {
      console.error("Error getting quotation items:", error);
      return res.status(500).json({ message: "Error obteniendo los artículos de la cotización" });
    }
  });

  // POST - Enviar cotización por email
  app.post(`${apiPrefix}/quotations/:quotationNumber/send-email`, async (req, res) => {
    try {
      const quotationNumber = Number(req.params.quotationNumber);
      const { email, pdfContent } = req.body;
      
      if (isNaN(quotationNumber)) {
        return res.status(400).json({ message: "Número de cotización inválido" });
      }
      
      if (!email || !pdfContent) {
        return res.status(400).json({ message: "Email y contenido PDF son requeridos" });
      }
      
      const emailSent = await sendQuotationEmail(quotationNumber, email, pdfContent);
      
      if (emailSent) {
        return res.json({ success: true, message: "Email enviado exitosamente" });
      } else {
        return res.status(500).json({ success: false, message: "Error enviando el email" });
      }
    } catch (error) {
      console.error("Error enviando email:", error);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ======================= Rutas para Clientes =======================

  // GET - Cuentas por cobrar agrupadas por cliente
  // Reportes de renta y reparaciones cobrables, sin duplicados de reparación.
  app.get(`${apiPrefix}/accounts-receivable`, async (req, res) => {
    try {
      const [allReports, allRepairs] = await Promise.all([
        db.query.reports.findMany({
        columns: {
          id: true, clientId: true, clientName: true, reportNumber: true,
          folioReporte: true, projectId: true, nombreObra: true,
          fechaReporte: true, total: true, paymentStatus: true,
        },
        with: {
          payments: { columns: { amount: true } },
          client: { columns: { id: true, name: true } }
        },
        orderBy: desc(reports.fechaReporte)
        }),
        db.query.repairs.findMany({
          // Never fetch legacy image data for this summary.
          columns: {
            id: true, clientId: true, repairNumber: true, equipment: true,
            receivedDate: true, total: true, status: true, paymentStatus: true, reviewOnly: true,
          },
          with: { client: { columns: { name: true } } },
        }),
      ]);
      return res.json(buildAccountsReceivable(allReports, allRepairs));
    } catch (error) {
      console.error("Error obteniendo cuentas por cobrar:", error);
      return res.status(500).json({ error: "Error al obtener cuentas por cobrar" });
    }
  });

  // GET - Obtener todos los clientes con paginación
  // GET - Endpoint para estadísticas generales (sin paginación)
  app.get(`${apiPrefix}/stats`, async (req, res) => {
    try {
      const totalClients = await db.query.clients.findMany({
        columns: { id: true }
      });
      
      const totalProjects = await db.query.clientProjects.findMany({
        columns: { id: true }
      });
      
      const quotationsAgg = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          total: sql<string>`COALESCE(SUM(${quotations.total}), 0)::text`
        })
        .from(quotations);
      
      const reportsAgg = await db
        .select({
          count: sql<number>`COUNT(*)::int`,
          total: sql<string>`COALESCE(SUM(${reports.total}), 0)::text`
        })
        .from(reports);
      
      const stats = {
        totalClients: totalClients.length,
        totalProjects: totalProjects.length,
        totalCotizaciones: quotationsAgg[0]?.count ?? 0,
        totalCotizado: parseFloat(quotationsAgg[0]?.total ?? "0"),
        totalReportes: reportsAgg[0]?.count ?? 0,
        totalEnReportes: parseFloat(reportsAgg[0]?.total ?? "0"),
      };
      
      return res.json(stats);
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      return res.status(500).json({ message: "Error obteniendo las estadísticas" });
    }
  });

  app.get(`${apiPrefix}/clients`, async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 500;
      const search = req.query.search as string | undefined;
      
      const clients = await storage.getClients(page, limit, search);
      return res.json(clients);
    } catch (error) {
      console.error("Error obteniendo clientes:", error);
      return res.status(500).json({ message: "Error obteniendo los clientes" });
    }
  });

  // GET - Obtener un cliente por ID con sus proyectos y cotizaciones (OPTIMIZADO)
  app.get(`${apiPrefix}/clients/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cliente inválido" });
      }

      // Obtener datos del cliente de forma optimizada (sin cargar items de cotizaciones)
      const client = await storage.getClientByIdOptimized(id);
      if (!client) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }

      // Obtener reportes y reparaciones para que las tarjetas usen exactamente
      // las mismas fuentes que el Estado de Cuenta Resumido.
      const [clientReports, clientRepairs] = await Promise.all([
        storage.getReportsByClientIdWithDetails(id),
        storage.getRepairsByClientId(id),
      ]);
      
      // Procesar reportes (sin queries adicionales)
      const reportsWithItems = clientReports.map((report) => {
        const payments = report.payments || [];
        const totalPaid = payments.reduce((sum: number, payment: any) => sum + parseFloat(payment.amount), 0);
        const reportTotal = parseFloat(report.total) || 0;
        const remaining = reportTotal - totalPaid;
        
        return {
          ...report,
          paymentSummary: {
            totalPaid,
            remaining,
            reportTotal
          }
        };
      });
      
      const totalReportAmount = clientReports.reduce((sum, report) => {
        return sum + (parseFloat(report.total) || 0);
      }, 0);

      // Calcular total pagado y pendiente considerando paymentStatus (sincronizado con PDF)
      let totalPaidAmount = 0;
      let totalPendingAmount = 0;
      
      reportsWithItems.forEach((report) => {
        const reportTotal = parseFloat(report.total) || 0;
        
        // Si está marcado como "pagado" manualmente, considerar como 100% pagado
        if (report.paymentStatus === 'pagado') {
          totalPaidAmount += reportTotal;
        } else {
          // Si no, usar los abonos reales
          const realPaid = report.paymentSummary?.totalPaid || 0;
          totalPaidAmount += realPaid;
          totalPendingAmount += Math.max(0, reportTotal - realPaid);
        }
      });

      const accountSummary = summarizeAccountStatement(
        reportsWithItems,
        clientRepairs,
      );

      // Obtener todas las cotizaciones del cliente sin límite
      const clientQuotations = await db.query.quotations.findMany({
        where: eq(quotations.clientId, id),
        orderBy: desc(quotations.quotationNumber)
      });

      // Agregar información adicional al cliente
      const clientWithReportData = {
        ...client,
        totalReports: clientReports.length,
        totalReportAmount: totalReportAmount.toFixed(2),
        totalPaidAmount: totalPaidAmount.toFixed(2),
        totalPendingAmount: totalPendingAmount.toFixed(2),
        accountTotalEntries: accountSummary.totalEntries,
        accountReportEntries: accountSummary.reportEntries,
        accountRepairEntries: accountSummary.repairEntries,
        accountTotalAmount: accountSummary.totalAmount.toFixed(2),
        accountTotalPaidAmount: accountSummary.totalPaidAmount.toFixed(2),
        accountTotalPendingAmount: accountSummary.totalPendingAmount.toFixed(2),
        reports: reportsWithItems,
        quotations: clientQuotations
      };
      
      return res.json(clientWithReportData);
    } catch (error) {
      console.error("Error obteniendo cliente:", error);
      return res.status(500).json({ message: "Error obteniendo el cliente" });
    }
  });

  // POST - Registrar un pago y distribuirlo entre varios reportes del cliente
  app.post(`${apiPrefix}/clients/:id/partial-payment`, requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ message: "ID de cliente inválido" });
    }

    const parsed = partialPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos del abono inválidos",
        errors: parsed.error.errors
      });
    }

    class PartialPaymentError extends Error {
      constructor(message: string, public status: number = 400) {
        super(message);
      }
    }

    try {
      const data = parsed.data;
      const session = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
      if (!session) {
        return res.status(401).json({ message: "Sesión requerida" });
      }
      const result = await db.transaction(async (tx) => {
        const client = await tx.query.clients.findFirst({
          where: eq(clients.id, clientId),
          columns: { id: true }
        });
        if (!client) throw new PartialPaymentError("Cliente no encontrado", 404);

        const reportIds = data.allocations.map(allocation => allocation.reportId);

        // Bloquea los reportes involucrados para que dos pagos simultáneos no sobrepasen el saldo.
        await tx.execute(sql`SELECT id FROM reports WHERE id IN (${sql.join(
          reportIds.map(reportId => sql`${reportId}`),
          sql`, `
        )}) FOR UPDATE`);

        const selectedReports = await tx.select({
          id: reports.id,
          clientId: reports.clientId,
          total: reports.total,
          paymentStatus: reports.paymentStatus
        }).from(reports).where(inArray(reports.id, reportIds));

        if (selectedReports.length !== reportIds.length) {
          throw new PartialPaymentError("Uno o más reportes no existen");
        }
        if (selectedReports.some(report => report.clientId !== clientId)) {
          throw new PartialPaymentError("Todos los reportes deben pertenecer al cliente");
        }
        const collectibleStatuses = new Set(["pendiente", "facturado", "vencido"]);
        if (selectedReports.some(report => !collectibleStatuses.has(report.paymentStatus))) {
          throw new PartialPaymentError("Uno o más reportes no tienen un estado cobrable");
        }

        const paymentTotals = await tx.select({
          reportId: reportPayments.reportId,
          totalPaid: sql<string>`COALESCE(SUM(${reportPayments.amount}), 0)::text`
        }).from(reportPayments)
          .where(inArray(reportPayments.reportId, reportIds))
          .groupBy(reportPayments.reportId);
        const paidByReport = new Map(
          paymentTotals.map(payment => [payment.reportId, Math.round(Number(payment.totalPaid) * 100)])
        );
        const reportsById = new Map(selectedReports.map(report => [report.id, report]));

        for (const allocation of data.allocations) {
          const report = reportsById.get(allocation.reportId)!;
          const totalCents = Math.round(Number(report.total) * 100);
          const paidCents = paidByReport.get(report.id) || 0;
          const allocationCents = Math.round(allocation.amount * 100);
          const balanceCents = Math.max(0, totalCents - paidCents);
          if (allocationCents > balanceCents) {
            throw new PartialPaymentError(
              `La asignación al reporte ${report.id} excede su saldo pendiente de $${(balanceCents / 100).toFixed(2)}`
            );
          }
        }

        const paymentDate = new Date(`${data.paymentDate}T12:00:00`);
        const inserted = await tx.insert(reportPayments).values(
          data.allocations.map(allocation => ({
            reportId: allocation.reportId,
            amount: allocation.amount.toFixed(2),
            paymentDate,
            paymentMethod: data.paymentMethod,
            reference: data.reference || null,
            notes: data.notes || null,
            createdBy: session.email
          }))
        ).returning();

        for (const allocation of data.allocations) {
          const report = reportsById.get(allocation.reportId)!;
          const totalCents = Math.round(Number(report.total) * 100);
          const newPaidCents = (paidByReport.get(report.id) || 0) + Math.round(allocation.amount * 100);
          await tx.update(reports).set({
            paymentStatus: newPaidCents >= totalCents
              ? "pagado"
              : report.paymentStatus === "vencido"
                ? "vencido"
                : "facturado",
            updatedAt: new Date()
          }).where(eq(reports.id, report.id));
        }

        return inserted;
      });

      return res.status(201).json({
        message: "Abono parcial registrado correctamente",
        totalAmount: parsed.data.totalAmount,
        payments: result
      });
    } catch (error) {
      if (error instanceof PartialPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Error registrando abono parcial:", error);
      return res.status(500).json({ message: "Error registrando el abono parcial" });
    }
  });
  
  // POST - Crear un nuevo cliente
  app.post(`${apiPrefix}/clients`, async (req, res) => {
    try {
      const clientData = req.body;
      
      // Normalizar email: cadena vacía → null para respetar la restricción UNIQUE
      if (clientData.email === "" || clientData.email === undefined) {
        clientData.email = null;
      }
      
      // Validar datos del cliente
      const validatedClient = clientInsertSchema.parse(clientData);
      
      // Verificar duplicado de email solo si se proporcionó uno
      if (validatedClient.email) {
        const existingClient = await storage.getClientByEmail(validatedClient.email);
        if (existingClient) {
          return res.status(400).json({ message: "Ya existe un cliente con ese correo electrónico" });
        }
      }
      
      // Crear cliente
      const newClient = await storage.createClient(validatedClient);
      
      return res.status(201).json(newClient);
    } catch (error) {
      console.error("Error creando cliente:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error creando el cliente" });
    }
  });
  
  // PUT - Actualizar un cliente
  app.put(`${apiPrefix}/clients/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cliente inválido" });
      }

      const clientData = req.body;
      
      // Validar datos del cliente
      const validatedClient = clientInsertSchema.partial().parse(clientData);
      
      // Si se está actualizando el email, verificar que no exista otro cliente con ese email
      if (validatedClient.email) {
        const existingClient = await storage.getClientByEmail(validatedClient.email);
        if (existingClient && existingClient.id !== id) {
          return res.status(400).json({ message: "Ya existe otro cliente con ese correo electrónico" });
        }
      }
      
      // Actualizar cliente
      const updatedClient = await storage.updateClient(id, validatedClient);
      
      if (!updatedClient) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }
      
      return res.json(updatedClient);
    } catch (error) {
      console.error("Error actualizando cliente:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error actualizando el cliente" });
    }
  });
  
  // DELETE - Eliminar un cliente
  app.delete(`${apiPrefix}/clients/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de cliente inválido" });
      }

      const success = await storage.deleteClient(id);
      
      if (!success) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error eliminando cliente:", error);
      return res.status(500).json({ message: "Error eliminando el cliente" });
    }
  });
  
  // ======================= Rutas para Proyectos de Clientes =======================
  
  // GET - Obtener todos los proyectos de un cliente
  app.get(`${apiPrefix}/clients/:id/projects`, async (req, res) => {
    try {
      const clientId = Number(req.params.id);
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "ID de cliente inválido" });
      }

      const projects = await storage.getClientProjects(clientId);
      return res.json(projects);
    } catch (error) {
      console.error("Error obteniendo proyectos del cliente:", error);
      return res.status(500).json({ message: "Error obteniendo los proyectos del cliente" });
    }
  });
  
  // GET - Obtener un proyecto por ID
  app.get(`${apiPrefix}/projects/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de proyecto inválido" });
      }

      const project = await storage.getClientProjectById(id);
      if (!project) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }
      
      // Sincronizar los datos del proyecto para asegurar que los totales estén actualizados
      const syncedProject = await storage.syncProjectData(id);
      
      return res.json(syncedProject);
    } catch (error) {
      console.error("Error obteniendo proyecto:", error);
      return res.status(500).json({ message: "Error obteniendo el proyecto" });
    }
  });

  // GET - Obtener un proyecto con todas sus cotizaciones (para la página de detalles)
  app.get(`${apiPrefix}/projects/:id/detailed`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de proyecto inválido" });
      }

      const project = await storage.getProjectWithQuotations(id);
      if (!project) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }
      
      return res.json(project);
    } catch (error) {
      console.error("Error obteniendo proyecto detallado:", error);
      return res.status(500).json({ message: "Error obteniendo el proyecto" });
    }
  });
  
  // POST - Crear un nuevo proyecto para un cliente
  app.post(`${apiPrefix}/clients/:id/projects`, async (req, res) => {
    try {
      const clientId = Number(req.params.id);
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "ID de cliente inválido" });
      }

      const projectData = req.body;
      
      // Validar datos del proyecto
      const validatedProject = clientProjectSchema.parse({
        ...projectData,
        clientId
      });
      
      // Crear proyecto
      const newProject = await storage.createClientProject({
        name: validatedProject.name,
        clientId: validatedProject.clientId
      });
      
      return res.status(201).json(newProject);
    } catch (error) {
      console.error("Error creando proyecto:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error creando el proyecto" });
    }
  });
  
  // PUT - Actualizar un proyecto
  app.put(`${apiPrefix}/projects/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de proyecto inválido" });
      }

      const projectData = req.body;
      
      // Validar datos del proyecto
      const validatedProject = clientProjectSchema.partial().parse(projectData);
      
      // Actualizar proyecto
      const updatedProject = await storage.updateClientProject(id, validatedProject);
      
      if (!updatedProject) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }
      
      return res.json(updatedProject);
    } catch (error) {
      console.error("Error actualizando proyecto:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error actualizando el proyecto" });
    }
  });
  
  // DELETE - Eliminar un proyecto
  app.delete(`${apiPrefix}/projects/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de proyecto inválido" });
      }

      const success = await storage.deleteClientProject(id);
      
      if (!success) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error eliminando proyecto:", error);
      return res.status(500).json({ message: "Error eliminando el proyecto" });
    }
  });
  
  // POST - Registrar un cliente a partir de una cotización existente
  app.post(`${apiPrefix}/quotations/:id/register-client`, async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      if (isNaN(quotationId)) {
        return res.status(400).json({ message: "ID de cotización inválido" });
      }

      // Obtener la cotización
      const quotation = await storage.getQuotationById(quotationId);
      if (!quotation) {
        return res.status(404).json({ message: "Cotización no encontrada" });
      }
      
      // Registrar el cliente
      const client = await storage.registerClientFromQuotation(quotation);
      
      return res.json(client);
    } catch (error) {
      console.error("Error registrando cliente desde cotización:", error);
      return res.status(500).json({ message: "Error registrando cliente desde la cotización" });
    }
  });

  // ================ API de conceptos ================

  // GET - Obtener todos los conceptos
  app.get(`${apiPrefix}/concepts`, async (req, res) => {
    try {
      console.log("API - Request para obtener conceptos:", req.query);
      let active: boolean | undefined = undefined;
      
      // Manejar el parámetro active de forma simplificada
      if (req.query.active !== undefined) {
        // Convertir el valor a booleano
        const activeValue = req.query.active;
        if (activeValue === 'true') {
          active = true;
        } else if (activeValue === 'false') {
          active = false;
        }
      }
      
      console.log(`API - Buscando conceptos ${active !== undefined ? (active ? 'activos' : 'inactivos') : 'todos'}`);
      
      // Usar la función de almacenamiento para obtener conceptos
      const concepts = await storage.getAllConcepts(active);
      
      // Procesar conceptos para añadir categoría y limpiar descripción
      const processedConcepts = concepts.map(concept => {
        const isRepair = concept.description && concept.description.startsWith('[REPAIR]');
        return {
          ...concept,
          // Limpiamos la descripción para la UI
          description: isRepair && concept.description 
            ? concept.description.replace('[REPAIR] ', '') 
            : concept.description
        };
      });
      
      // Si se solicita filtrar por categoría, aplicamos el filtro
      const category = req.query.category as string | undefined;
      if (category) {
        console.log(`API - Filtrando conceptos por categoría: ${category}`);
        const processedConcepts = concepts.filter(concept => {
          // Para 'repair', buscamos en la descripción si contiene [REPAIR]
          if (category === 'repair') {
            return concept.description && concept.description.includes('[REPAIR]');
          } else {
            // Para 'general', no debería tener [REPAIR] en la descripción
            return !concept.description || !concept.description.includes('[REPAIR]');
          }
        });
        return res.json(processedConcepts);
      }
      
      return res.json(concepts);
    } catch (error) {
      console.error("Error getting concepts:", error);
      return res.status(500).json({ message: "Error obteniendo los conceptos" });
    }
  });

  // GET - Buscar conceptos por término
  app.get(`${apiPrefix}/concepts/search`, async (req, res) => {
    try {
      const searchTerm = req.query.term as string || '';
      const active = req.query.active !== undefined 
        ? req.query.active === 'true' 
        : true;
      
      const concepts = await storage.searchConcepts(searchTerm, active);
      return res.json(concepts);
    } catch (error) {
      console.error("Error searching concepts:", error);
      return res.status(500).json({ message: "Error buscando conceptos" });
    }
  });

  // GET - Grupos de conceptos duplicados
  app.get(`${apiPrefix}/concepts/duplicates`, async (req, res) => {
    try {
      const groups = await storage.findDuplicateConceptGroups();
      return res.json(groups);
    } catch (error) {
      console.error("Error getting duplicate concepts:", error);
      return res.status(500).json({ message: "Error obteniendo los conceptos duplicados" });
    }
  });

  // POST - Unir conceptos duplicados (conserva uno, elimina el resto)
  app.post(`${apiPrefix}/concepts/merge`, async (req, res) => {
    try {
      const { keepId, removeIds } = req.body;
      if (
        typeof keepId !== "number" ||
        !Array.isArray(removeIds) ||
        removeIds.length === 0 ||
        removeIds.some((id) => typeof id !== "number")
      ) {
        return res.status(400).json({ message: "Datos inválidos para unir conceptos" });
      }

      if (removeIds.includes(keepId)) {
        return res.status(400).json({ message: "El concepto a conservar no puede estar en la lista de eliminados" });
      }

      const keepConcept = await storage.getConceptById(keepId);
      if (!keepConcept) {
        return res.status(404).json({ message: "El concepto a conservar no existe" });
      }

      // Validar que todos los conceptos a eliminar sean duplicados reales del
      // concepto a conservar (mismo nombre normalizado y mismo catálogo)
      const keepKey = storage.normalizeConceptName(keepConcept.name || "");
      const keepCategory = storage.conceptCategory(keepConcept);
      for (const removeId of removeIds) {
        const removeConcept = await storage.getConceptById(removeId);
        if (!removeConcept) {
          return res.status(404).json({ message: `El concepto con ID ${removeId} no existe` });
        }
        if (
          storage.normalizeConceptName(removeConcept.name || "") !== keepKey ||
          storage.conceptCategory(removeConcept) !== keepCategory
        ) {
          return res.status(400).json({
            message: `El concepto "${removeConcept.name}" no es un duplicado del concepto a conservar`
          });
        }
      }

      const removedCount = await storage.mergeConcepts(keepId, removeIds);
      return res.json({ success: true, removedCount, kept: keepConcept });
    } catch (error) {
      console.error("Error merging concepts:", error);
      return res.status(500).json({ message: "Error uniendo los conceptos duplicados" });
    }
  });

  // GET - Obtener un concepto por ID
  app.get(`${apiPrefix}/concepts/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de concepto inválido" });
      }

      const concept = await storage.getConceptById(id);
      if (!concept) {
        return res.status(404).json({ message: "Concepto no encontrado" });
      }

      return res.json(concept);
    } catch (error) {
      console.error("Error getting concept:", error);
      return res.status(500).json({ message: "Error obteniendo el concepto" });
    }
  });

  // POST - Crear un nuevo concepto
  app.post(`${apiPrefix}/concepts`, async (req, res) => {
    try {
      const conceptData = req.body;
      
      // Extraer solo los campos necesarios
      const { 
        name, 
        description = "", 
        defaultUnit = "pza", 
        defaultPrice = "0", 
        active = true,
      } = conceptData;
      
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "El nombre del concepto es obligatorio" });
      }

      // Prevención de duplicados: mismo nombre ignorando mayúsculas/acentos/espacios
      // (solo dentro del mismo catálogo: general o reparación)
      const newConceptCategory: 'repair' | 'general' =
        conceptData.category === 'repair' ||
        (typeof description === 'string' && description.trim().startsWith('[REPAIR]'))
          ? 'repair'
          : 'general';
      const existingConcept = await storage.findConceptByNormalizedName(name, undefined, newConceptCategory);
      if (existingConcept) {
        return res.status(409).json({
          message: `Ya existe un concepto con ese nombre: "${existingConcept.name}"${existingConcept.active ? "" : " (está inactivo; puedes reactivarlo en el catálogo)"}`
        });
      }
      
      let conceptDescription = description;
      
      // Si es un concepto de reparación, lo marcamos en la descripción
      if (conceptData.category === 'repair') {
        conceptDescription = `[REPAIR] ${conceptDescription}`;
      }
      
      console.log("Intentando guardar concepto simplificado con storage:", { name, description: conceptDescription, defaultUnit, defaultPrice, active });
      
      // Crear objeto para storage
      const conceptToCreate = {
        name, 
        description: conceptDescription,
        defaultUnit,
        defaultPrice,
        active
      };
      
      // Usar storage para crear el concepto
      const newConcept = await storage.createConcept(conceptToCreate);
      
      // Añadir la categoría al resultado para la UI
      const result = {
        ...newConcept,
        category: 'repair'
      };
      
      return res.status(201).json(result);
    } catch (error) {
      console.error("Error creating concept:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error creando el concepto" });
    }
  });

  // PUT - Actualizar un concepto existente
  app.put(`${apiPrefix}/concepts/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de concepto inválido" });
      }

      const conceptData = req.body;
      
      // Validar datos del concepto
      const validatedConcept = conceptInsertSchema.partial().parse(conceptData);
      
      // Prevención de duplicados al renombrar (excluyendo el propio concepto,
      // solo dentro del mismo catálogo)
      if (validatedConcept.name) {
        const currentConcept = await storage.getConceptById(id);
        const currentCategory = currentConcept ? storage.conceptCategory(currentConcept) : undefined;
        const existingConcept = await storage.findConceptByNormalizedName(validatedConcept.name, id, currentCategory);
        if (existingConcept) {
          return res.status(409).json({
            message: `Ya existe otro concepto con ese nombre: "${existingConcept.name}"`
          });
        }
      }
      
      // Actualizar concepto
      const updatedConcept = await storage.updateConcept(id, validatedConcept);
      
      if (!updatedConcept) {
        return res.status(404).json({ message: "Concepto no encontrado" });
      }
      
      return res.json(updatedConcept);
    } catch (error) {
      console.error("Error updating concept:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      return res.status(500).json({ message: "Error actualizando el concepto" });
    }
  });

  // PATCH - Cambiar el estado de activación de un concepto
  app.patch(`${apiPrefix}/concepts/:id/toggle-status`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de concepto inválido" });
      }

      const { active } = req.body;
      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: "El estado de activación debe ser un booleano" });
      }
      
      const updatedConcept = await storage.toggleConceptStatus(id, active);
      
      if (!updatedConcept) {
        return res.status(404).json({ message: "Concepto no encontrado" });
      }
      
      return res.json(updatedConcept);
    } catch (error) {
      console.error("Error toggling concept status:", error);
      return res.status(500).json({ message: "Error cambiando el estado del concepto" });
    }
  });

  // DELETE - Eliminar un concepto
  app.delete(`${apiPrefix}/concepts/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de concepto inválido" });
      }
      
      const success = await storage.deleteConcept(id);
      
      if (!success) {
        return res.status(404).json({ message: "Concepto no encontrado" });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting concept:", error);
      return res.status(500).json({ message: "Error eliminando el concepto" });
    }
  });

  // API para reparaciones
  
  // GET - Next repair number
  app.get(`${apiPrefix}/repairs/next-number`, async (req, res) => {
    try {
      const nextNumber = await storage.getNextRepairNumber();
      res.status(200).json({ repairNumber: nextNumber });
    } catch (error) {
      console.error("Error al obtener el siguiente número de reparación:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // GET - All repairs with pagination and optional search
  app.get(`${apiPrefix}/repairs`, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 500;
      const search = req.query.search as string || '';
      const includeItems = req.query.includeItems === 'true';
      
      const repairs = await storage.getRepairs(page, limit);
      
      // Filtrar por búsqueda si se proporciona
      let filteredRepairs = repairs;
      if (search) {
        const lowerSearch = search.toLowerCase();
        filteredRepairs = repairs.filter((repair: any) => 
          repair.client?.name?.toLowerCase().includes(lowerSearch) ||
          repair.equipment?.toLowerCase().includes(lowerSearch) ||
          repair.repairNumber?.toLowerCase().includes(lowerSearch) ||
          repair.serialNumber?.toLowerCase().includes(lowerSearch)
        );
      }
      
      // Solo cargar items si se solicita explícitamente (no necesario para la lista)
      if (includeItems) {
        // Una sola consulta para los items de todas las reparaciones (evita N+1)
        const allItems = await storage.getRepairItemsByRepairIds(
          filteredRepairs.map((r: any) => r.id)
        );
        const itemsByRepair = new Map<number, any[]>();
        for (const item of allItems) {
          const list = itemsByRepair.get(item.repairId) || [];
          list.push(item);
          itemsByRepair.set(item.repairId, list);
        }
        const repairsWithItems = filteredRepairs.map((repair: any) => ({
          ...repair,
          items: itemsByRepair.get(repair.id) || [],
        }));
        return res.status(200).json(repairsWithItems);
      }
      
      // Respuesta ligera sin items ni imágenes para carga rápida de la lista
      const lightRepairs = filteredRepairs.map((repair: any) => {
        const { image1, image2, image3, ...rest } = repair;
        return rest;
      });
      res.status(200).json(lightRepairs);
    } catch (error) {
      console.error("Error al obtener reparaciones:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // GET - Repairs of a specific client (for estado de cuenta)
  app.get(`${apiPrefix}/clients/:clientId/repairs`, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "ID de cliente inválido" });
      }
      const clientRepairs = await storage.getRepairsByClientId(clientId);
      res.status(200).json(clientRepairs);
    } catch (error) {
      console.error("Error al obtener reparaciones del cliente:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // GET - Repair by ID
  app.get(`${apiPrefix}/repairs/:id`, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      const repair = await storage.getRepairById(id);
      if (!repair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      
      res.status(200).json(repair);
    } catch (error) {
      console.error(`Error al obtener reparación con ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // POST - Duplicate a repair
  app.post(`${apiPrefix}/repairs/:id/duplicate`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de reparación inválido" });
      }

      console.log(`API - Duplicando reparación ID: ${id}`);
      
      // Get the original repair with items
      const originalRepair = await storage.getRepairById(id);
      if (!originalRepair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }

      const items = await storage.getRepairItems(id);
      
      // Get next repair number
      const nextRepairNumber = await storage.getNextRepairNumber();
      
      // Create duplicated repair data
      const duplicatedRepairData: RepairInsert = {
        repairNumber: nextRepairNumber,
        clientId: originalRepair.clientId,
        equipment: originalRepair.equipment,
        serialNumber: originalRepair.serialNumber,
        model: originalRepair.model,
        repairManager: originalRepair.repairManager,
        receivedDate: new Date(), // Set current date for duplicated repair
        deliveryDate: originalRepair.deliveryDate,
        departureDate: originalRepair.departureDate,
        elaborationDate: originalRepair.elaborationDate,
        deliveredBy: originalRepair.deliveredBy,
        clientReport: originalRepair.clientReport,
        equipmentObservations: originalRepair.equipmentObservations,
        image1: originalRepair.image1,
        image2: originalRepair.image2,
        image3: originalRepair.image3,
        status: "Espera de confirmación",
        subtotal: originalRepair.subtotal,
        iva: originalRepair.iva,
        total: originalRepair.total,
        includeIVA: originalRepair.includeIVA,
        repairOrder: originalRepair.repairOrder,
        reviewAmount: originalRepair.reviewAmount,
        reviewOnly: originalRepair.reviewOnly,
      };

      // Create the duplicated items
      const duplicatedItems = items.map(item => ({
        itemNumber: item.itemNumber,
        concept: item.concept,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      }));

      const newRepair = await storage.createRepair(duplicatedRepairData, duplicatedItems);
      
      console.log(`Reparación duplicada con éxito: #${newRepair.repairNumber}`);
      return res.status(201).json(newRepair);
    } catch (error) {
      console.error("Error duplicating repair:", error);
      return res.status(500).json({ message: "Error duplicando la reparación" });
    }
  });

  // POST - Create new repair
  const validPaymentStatusesRepair = ["Pagada", "No Pagada", "Cotización", "Revisión"];

  app.post(`${apiPrefix}/repairs`, async (req, res) => {
    try {
      const formData = req.body;
      const parsedForm = repairFormSchema.parse({
        ...formData,
        receivedDate: formData.receivedDate ? new Date(formData.receivedDate) : new Date(),
        deliveryDate: formData.deliveryDate ? new Date(formData.deliveryDate) : null,
        departureDate: formData.departureDate ? new Date(formData.departureDate) : null,
        elaborationDate: formData.elaborationDate ? new Date(formData.elaborationDate) : null,
      });
      const parsedItems = repairItemsSchema.parse(formData.items || []);
      const rawEmail = parsedForm.clientEmail.trim();
      const clientEmail = rawEmail === "" || rawEmail.toUpperCase() === "N/A" ? null : rawEmail;

      const repairData: RepairInsert = {
        repairNumber: formData.repairNumber || await storage.getNextRepairNumber(),
        repairOrder: parsedForm.repairOrder || null,
        clientEmail: clientEmail || "N/A",
        equipment: parsedForm.equipment,
        serialNumber: parsedForm.serialNumber || null,
        model: parsedForm.model || null,
        repairManager: parsedForm.repairManager || null,
        receivedDate: parsedForm.receivedDate,
        deliveredBy: parsedForm.deliveredBy || null,
        deliveryDate: parsedForm.deliveryDate,
        departureDate: parsedForm.departureDate,
        elaborationDate: parsedForm.elaborationDate,
        clientReport: parsedForm.clientReport || null,
        equipmentObservations: parsedForm.equipmentObservations || null,
        image1: parsedForm.image1 || null,
        image2: parsedForm.image2 || null,
        image3: parsedForm.image3 || null,
        subtotal: "0.00",
        iva: "0.00",
        total: "0.00",
        includeIVA: parsedForm.includeIVA,
        status: parsedForm.status,
        paymentStatus: validPaymentStatusesRepair.includes(parsedForm.paymentStatus)
          ? parsedForm.paymentStatus
          : "No Pagada",
        reviewReason: parsedForm.reviewReason || null,
        reviewAmount: parsedForm.reviewAmount ?? "0.00",
        reviewOnly: parsedForm.reviewOnly ?? false,
      };

      const repairItems = parsedItems.map(item => ({
          itemNumber: item.itemNumber,
          concept: item.concept,
          quantity: item.quantity.toString(),
          unit: item.unit,
          unitPrice: item.unitPrice.toString(),
          subtotal: "0.00",
      }));

      const newRepair = await storage.createRepair(repairData, repairItems, {
        name: parsedForm.clientName,
        email: clientEmail,
      });
      res.status(201).json(newRepair);
    } catch (error) {
      console.error("Error al crear reparación:", error);
      if (error instanceof InvalidRepairReview) return res.status(400).json({ message: error.message });
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // PATCH - Update repair
  app.patch(`${apiPrefix}/repairs/:id`, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      // Obtener la reparación actual para preservar las imágenes existentes
      const currentRepair = await storage.getRepairById(id);
      if (!currentRepair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      
      const formData = req.body;
      const parsedForm = repairFormSchema.parse({
        ...formData,
        receivedDate: formData.receivedDate ? new Date(formData.receivedDate) : currentRepair.receivedDate,
        deliveryDate: formData.deliveryDate !== undefined
          ? (formData.deliveryDate ? new Date(formData.deliveryDate) : null)
          : currentRepair.deliveryDate,
        departureDate: formData.departureDate !== undefined
          ? (formData.departureDate ? new Date(formData.departureDate) : null)
          : currentRepair.departureDate,
        elaborationDate: formData.elaborationDate !== undefined
          ? (formData.elaborationDate ? new Date(formData.elaborationDate) : null)
          : currentRepair.elaborationDate,
      });
      const parsedItems = repairItemsSchema.parse(
        formData.items !== undefined
          ? formData.items
          : (currentRepair.items || []).map(item => ({
              itemNumber: item.itemNumber,
              concept: item.concept,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            }))
      );
      const rawEmailPatch = parsedForm.clientEmail.trim();
      const clientEmail = rawEmailPatch === "" || rawEmailPatch.toUpperCase() === "N/A"
        ? null
        : rawEmailPatch;
      const effectiveClientEmail = formData.clientEmail !== undefined
        ? clientEmail
        : currentRepair.client?.email || null;
      
      // Preparar los datos para actualizar en la base de datos
      // Solo actualizar imágenes si se proporcionan nuevas, de lo contrario mantener las existentes
      const repairData: Partial<RepairInsert> = {
        repairOrder: formData.repairOrder !== undefined
          ? parsedForm.repairOrder || null
          : currentRepair.repairOrder,
        clientEmail: formData.clientEmail !== undefined
          ? clientEmail || "N/A"
          : currentRepair.clientEmail,
        equipment: parsedForm.equipment,
        serialNumber: formData.serialNumber !== undefined
          ? parsedForm.serialNumber || null
          : currentRepair.serialNumber,
        model: formData.model !== undefined ? parsedForm.model || null : currentRepair.model,
        repairManager: formData.repairManager !== undefined
          ? parsedForm.repairManager || null
          : currentRepair.repairManager,
        receivedDate: parsedForm.receivedDate,
        deliveredBy: formData.deliveredBy !== undefined
          ? parsedForm.deliveredBy || null
          : currentRepair.deliveredBy,
        deliveryDate: parsedForm.deliveryDate,
        departureDate: parsedForm.departureDate,
        elaborationDate: parsedForm.elaborationDate,
        clientReport: formData.clientReport !== undefined
          ? parsedForm.clientReport || null
          : currentRepair.clientReport,
        equipmentObservations: formData.equipmentObservations !== undefined
          ? parsedForm.equipmentObservations || null
          : currentRepair.equipmentObservations,
        image1: formData.image1 !== undefined ? formData.image1 : currentRepair.image1,
        image2: formData.image2 !== undefined ? formData.image2 : currentRepair.image2,
        image3: formData.image3 !== undefined ? formData.image3 : currentRepair.image3,
        includeIVA: formData.includeIVA !== undefined
          ? parsedForm.includeIVA
          : currentRepair.includeIVA,
        status: formData.status !== undefined
          ? parsedForm.status
          : currentRepair.status || "Espera de confirmación",
        paymentStatus: formData.paymentStatus !== undefined &&
          validPaymentStatusesRepair.includes(parsedForm.paymentStatus)
          ? parsedForm.paymentStatus
          : (currentRepair as any).paymentStatus || "No Pagada",
        reviewReason: parsedForm.reviewReason !== undefined ? parsedForm.reviewReason : currentRepair.reviewReason,
        ...(formData.reviewAmount !== undefined ? { reviewAmount: parsedForm.reviewAmount } : {}),
        ...(formData.reviewOnly !== undefined ? { reviewOnly: parsedForm.reviewOnly } : {}),
      };

      const replacementItems = parsedItems.map(item => ({
          itemNumber: item.itemNumber,
          concept: item.concept,
          quantity: item.quantity.toString(),
          unit: item.unit,
          unitPrice: item.unitPrice.toString(),
          subtotal: "0.00",
      }));
      const updatedRepair = await storage.replaceRepair(id, repairData, replacementItems, {
        name: parsedForm.clientName,
        email: effectiveClientEmail,
      });
      if (!updatedRepair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      
      res.status(200).json(updatedRepair);
    } catch (error) {
      console.error(`Error al actualizar reparación con ID ${req.params.id}:`, error);
      if (error instanceof InvalidRepairReview) return res.status(400).json({ message: error.message });
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // PATCH - Quick status update (fast endpoint)
  app.patch(`${apiPrefix}/repairs/:id/status`, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      const status = typeof req.body.status === "string" ? normalizeRepairStatus(req.body.status) : "";
      const validStatuses = ["Espera de confirmación", "Taller", "En Proceso", "Entregada", "Terminada", "No autorizado"];
      
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Estado inválido" });
      }
      
      const repair = await storage.updateRepair(id, { 
        status, 
        updatedAt: new Date() 
      });
      
      if (!repair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      
      res.status(200).json(repair);
    } catch (error) {
      console.error(`Error al actualizar estado de reparación con ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // PATCH - Actualizar solo las fechas de la reparación (rápido desde la tarjeta)
  app.patch(`${apiPrefix}/repairs/:id/dates`, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const { receivedDate, deliveryDate } = req.body;
      const updates: any = { updatedAt: new Date() };

      const parseLocalDate = (value: string) => {
        // Si viene como "YYYY-MM-DD", anclamos al mediodía UTC para evitar
        // que la zona horaria CDMX (GMT-6) la mueva al día anterior.
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return new Date(`${value}T12:00:00.000Z`);
        }
        return new Date(value);
      };

      if (receivedDate !== undefined) {
        updates.receivedDate = receivedDate ? parseLocalDate(receivedDate) : null;
      }
      if (deliveryDate !== undefined) {
        updates.deliveryDate = deliveryDate ? parseLocalDate(deliveryDate) : null;
      }

      const repair = await storage.updateRepair(id, updates);
      if (!repair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      res.status(200).json(repair);
    } catch (error) {
      console.error(`Error al actualizar fechas de reparación con ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.patch(`${apiPrefix}/repairs/:id/payment-status`, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      const { paymentStatus } = req.body;
      const validPaymentStatuses = ["Pagada", "No Pagada", "Cotización", "Revisión"];
      
      if (!paymentStatus || !validPaymentStatuses.includes(paymentStatus)) {
        return res.status(400).json({ message: "Estado de pago inválido" });
      }

      // A supplied date is an explicit historical correction, not a request
      // to clear the date. Leaving Pagada clears it automatically instead.
      if (Object.prototype.hasOwnProperty.call(req.body, "liquidatedAt") &&
          (paymentStatus !== "Pagada" || req.body.liquidatedAt === null)) {
        return res.status(400).json({ message: "liquidatedAt requiere una fecha válida y estado Pagada; para borrarla cambie el estado" });
      }
      const explicitDate = Object.prototype.hasOwnProperty.call(req.body, "liquidatedAt")
        ? parseLiquidationDay(req.body.liquidatedAt)
        : undefined;
      const reviewPatch = repairFormSchema.pick({ reviewAmount: true, reviewOnly: true }).parse(req.body);
      
      const repair = await storage.updateRepair(id, { 
        paymentStatus, 
        ...reviewPatch,
        ...(explicitDate !== undefined ? { liquidatedAt: explicitDate } : {}),
        updatedAt: new Date() 
      });
      
      if (!repair) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      
      res.status(200).json(repair);
    } catch (error) {
      console.error(`Error al actualizar estado de pago de reparación con ID ${req.params.id}:`, error);
      if (error instanceof InvalidLiquidationDate || error instanceof InvalidRepairReview) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Monto o modalidad de revisión inválidos", errors: error.errors });
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // DELETE - Delete repair
  app.delete(`${apiPrefix}/repairs/:id`, requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      // Obtener la reparación antes de borrarla para conocer sus fotos en el almacenamiento
      const repair = await storage.getRepairById(id);
      
      const success = await storage.deleteRepair(id);
      if (!success) {
        return res.status(404).json({ message: "Reparación no encontrada" });
      }
      
      // Borrar del almacenamiento las fotos con URL (las Base64 antiguas no aplican)
      if (repair) {
        const bucketId = process.env.REPLIT_BUCKET_ID || '';
        const storageUrls = [repair.image1, repair.image2, repair.image3].filter((url): url is string =>
          !!url && (
            url.startsWith('/public/') ||
            url.startsWith('https://storage.googleapis.com/') ||
            (!!bucketId && url.includes(bucketId))
          )
        );
        for (const url of storageUrls) {
          // Aislar fallos por imagen: la reparación ya se borró de la BD,
          // así que un fallo de storage no debe convertir la respuesta en error
          try {
            const deleted = await deleteStoredImageByUrl(url);
            if (!deleted) {
              console.error(`No se pudo borrar la imagen del almacenamiento para la reparación ${id}:`, url.slice(0, 100));
            }
          } catch (err) {
            console.error(`Error borrando imagen del almacenamiento para la reparación ${id}:`, url.slice(0, 100), err);
          }
        }
      }
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error(`Error al eliminar reparación con ID ${req.params.id}:`, error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Routes for client reports
  app.get(`${apiPrefix}/reports/clients`, async (req, res) => {
    try {
      const clientReports = await storage.getClientReports();
      res.json(clientReports);
    } catch (error) {
      console.error('Error fetching client reports:', error);
      res.status(500).json({ message: 'Error obteniendo los reportes de clientes' });
    }
  });



  // Get Zoho authorization URL
  app.get(`${apiPrefix}/zoho-auth-url`, (req, res) => {
    const clientId = process.env.ZOHO_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ error: 'ZOHO_CLIENT_ID no configurado' });
    }
    
    const redirectUri = 'https://renta-maquinaria-psfidalgomx.replit.app/api/zoho-callback';
    const scope = 'ZohoMail.messages.CREATE,ZohoMail.accounts.READ';
    
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    res.json({
      authUrl: authUrl,
      clientId: clientId,
      redirectUri: redirectUri,
      instructions: [
        '1. Visita la URL de autorización',
        '2. Autoriza la aplicación en Zoho',
        '3. Copia el código de la URL de retorno',
        '4. Usa el código en el endpoint /api/zoho-token'
      ]
    });
  });

  // Zoho OAuth token exchange endpoint
  app.post(`${apiPrefix}/zoho-token`, async (req, res) => {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    try {
      const clientId = process.env.ZOHO_CLIENT_ID;
      const clientSecret = process.env.ZOHO_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Credenciales de Zoho no configuradas' });
      }
      
      const redirectUri = 'https://renta-maquinaria-psfidalgomx.replit.app/api/zoho-callback';
      
      // Exchange code for tokens
      const tokenResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        return res.status(400).json({ error: tokenData.error });
      }

      res.json({
        success: true,
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        message: 'Configura ZOHO_REFRESH_TOKEN con el valor del refresh_token'
      });
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      res.status(500).json({ error: 'Error obteniendo tokens de Zoho' });
    }
  });

  // Test route to verify it works
  app.get(`${apiPrefix}/test-zoho`, (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Zoho OAuth Setup</h2>
          <p>Tu aplicación está corriendo en: <strong>${baseUrl}</strong></p>
          <p>Para configurar Zoho OAuth, visita:</p>
          <a href="${baseUrl}${apiPrefix}/auth/zoho" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Iniciar configuración Zoho OAuth
          </a>
        </body>
      </html>
    `);
  });

  // Zoho OAuth routes - temporary for setup
  app.get(`${apiPrefix}/auth/zoho`, (req, res) => {
    const clientId = process.env.ZOHO_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ error: 'ZOHO_CLIENT_ID not configured. Please set up your Zoho credentials first.' });
    }
    
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/zoho/callback`;
    const scope = 'ZohoMail.messages.CREATE,ZohoMail.accounts.READ';
    
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    res.redirect(authUrl);
  });

  app.get(`${apiPrefix}/auth/zoho/callback`, async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code received' });
    }

    try {
      const clientId = process.env.ZOHO_CLIENT_ID;
      const clientSecret = process.env.ZOHO_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Zoho credentials not configured' });
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}${apiPrefix}/auth/zoho/callback`;
      
      // Exchange code for tokens
      const tokenResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: code as string,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        return res.status(400).json({ error: tokenData.error });
      }

      // Display the tokens for the user to copy
      res.send(`
        <html>
          <head><title>Zoho OAuth Success</title></head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>¡Zoho OAuth configurado exitosamente!</h1>
            <p>Copia estos valores y configúralos como secretos en tu proyecto:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <strong>ZOHO_REFRESH_TOKEN:</strong><br>
              <code style="word-break: break-all;">${tokenData.refresh_token}</code>
            </div>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
              <strong>ZOHO_ACCESS_TOKEN (temporal):</strong><br>
              <code style="word-break: break-all;">${tokenData.access_token}</code>
            </div>
            <p><strong>Expira en:</strong> ${tokenData.expires_in} segundos</p>
            <p>El refresh_token es el que necesitas para configurar permanentemente.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      res.status(500).json({ error: 'Error getting tokens from Zoho' });
    }
  });

  // ================ API de reportes ================

  // GET - Obtener el siguiente número de reporte
  app.get(`${apiPrefix}/reports/next-number`, async (req, res) => {
    try {
      const nextNumber = await storage.getNextReportNumber();
      return res.json({ nextNumber });
    } catch (error) {
      console.error("Error getting next report number:", error);
      return res.status(500).json({ message: "Error obteniendo el siguiente número de reporte" });
    }
  });

  // GET - Obtener todos los reportes para cálculos de totales (debe ir ANTES que la ruta con parámetro)
  app.get(`${apiPrefix}/reports/totals`, async (req, res) => {
    try {
      const allReports = await storage.getAllReportsForTotals();
      res.json(allReports);
    } catch (error) {
      console.error('Error fetching reports totals:', error);
      res.status(500).json({ message: 'Error obteniendo los totales de reportes' });
    }
  });

  // GET - Obtener todos los reportes con paginación
  app.get(`${apiPrefix}/reports`, async (req, res) => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 100;
      
      const reports = await storage.getReports(page, limit);
      return res.json(reports);
    } catch (error) {
      console.error("Error getting reports:", error);
      return res.status(500).json({ message: "Error obteniendo los reportes" });
    }
  });

  // GET - Obtener un reporte por ID con items
  app.get(`${apiPrefix}/reports/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      const report = await storage.getReportById(id);
      if (!report) {
        return res.status(404).json({ message: "Reporte no encontrado" });
      }
      
      
      return res.json(report);
    } catch (error) {
      console.error("Error getting report:", error);
      return res.status(500).json({ message: "Error obteniendo el reporte" });
    }
  });

  // POST - Crear un nuevo reporte
  app.post(`${apiPrefix}/reports`, requireAuth, async (req, res) => {
    try {
      const reportData = req.body;
      
      console.log("API - Creando nuevo reporte:", reportData);
      
      // Validar que el cliente y proyecto existen
      const client = await storage.getClientById(reportData.clientId);
      if (!client) {
        return res.status(404).json({ message: "Cliente no encontrado" });
      }
      
      const project = await storage.getClientProjectById(reportData.projectId);
      if (!project) {
        return res.status(404).json({ message: "Proyecto no encontrado" });
      }
      
      // Validar items
      if (!reportData.items || reportData.items.length === 0) {
        return res.status(400).json({ message: "Debe incluir al menos un concepto en el reporte" });
      }
      
      // Calcular totales
      let subtotalCents = 0;
      const normalizedItems = reportData.items.map((item: any) => {
        const quantityHundredths = Math.round(Number(item.cantidad) * 100);
        const unitPriceCents = Math.round(Number(item.precioUnitario) * 100);
        if (!Number.isFinite(quantityHundredths) || quantityHundredths <= 0 ||
            !Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
          throw new ReportPaymentError("Cantidad o precio unitario inválido");
        }
        const itemSubtotalCents = Math.round((quantityHundredths * unitPriceCents) / 100);
        subtotalCents += itemSubtotalCents;
        return {
          ...item,
          cantidad: (quantityHundredths / 100).toFixed(2),
          precioUnitario: (unitPriceCents / 100).toFixed(2),
          subtotal: (itemSubtotalCents / 100).toFixed(2),
        };
      });
      
      const includeIva = reportData.includeIva ?? true;
      const ivaCents = includeIva ? Math.round(subtotalCents * 0.16) : 0;
      const totalCents = subtotalCents + ivaCents;
      
      // Sincronizar dias_uso desde los items para el Estado de Cuenta
      const diasUsoFromItems = reportData.items
        .map((item: any) => item.diasUso)
        .filter((dias: string) => dias && dias.trim() !== "")
        .filter((dias: string, index: number, array: string[]) => array.indexOf(dias) === index) // eliminar duplicados
        .join(", ");
      
      // Obtener el siguiente número de reporte
      const reportNumber = await storage.getNextReportNumber();
      
      const newItems = normalizedItems.map((item: any) => ({
        numero: item.numero,
        concepto: item.concepto,
        obra: item.obra,
        diasUso: item.diasUso,
        periodoRenta: reportData.periodoRentaInicio && reportData.periodoRentaFin
          ? `${new Date(reportData.periodoRentaInicio).toLocaleDateString("es-MX")} - ${new Date(reportData.periodoRentaFin).toLocaleDateString("es-MX")}`
          : "",
        cantidad: item.cantidad.toString(),
        unidad: item.unidad,
        precioUnitario: item.precioUnitario.toString(),
        subtotal: item.subtotal.toString()
      }));

      // Crear cabecera e items en una sola transacción
      const newReport = await storage.createReport({
        reportNumber,
        folioReporte: reportData.folioReporte,
        clientId: reportData.clientId,
        clientName: reportData.clientName,
        projectId: reportData.projectId,
        diasUso: diasUsoFromItems || reportData.diasUso,
        nombreObra: reportData.nombreObra,
        fechaReporte: new Date(reportData.fechaReporte),
        periodoRentaInicio: reportData.periodoRentaInicio ? new Date(reportData.periodoRentaInicio) : null,
        periodoRentaFin: reportData.periodoRentaFin ? new Date(reportData.periodoRentaFin) : null,
        subtotal: (subtotalCents / 100).toFixed(2),
        iva: (ivaCents / 100).toFixed(2),
        total: (totalCents / 100).toFixed(2),
        includeIva
      }, newItems);
      
      console.log("API - Reporte creado exitosamente:", newReport.id);
      
      return res.status(201).json({
        ...newReport,
        items: newReport.items || []
      });
    } catch (error) {
      console.error("Error creating report:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      if (error instanceof ReportPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: "Error creando el reporte" });
    }
  });

  // PUT - Actualizar un reporte
  app.put(`${apiPrefix}/reports/:id`, requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      const reportData = req.body;
      
      // Crear objeto solo con campos válidos del schema
      const processedReportData: any = {};
      
      // Solo incluir campos que existen en el schema
      if (reportData.folioReporte !== undefined) processedReportData.folioReporte = reportData.folioReporte;
      if (reportData.clientName !== undefined) processedReportData.clientName = reportData.clientName;
      if (reportData.diasUso !== undefined) processedReportData.diasUso = reportData.diasUso;
      if (reportData.nombreObra !== undefined) processedReportData.nombreObra = reportData.nombreObra;
      if (reportData.subtotal !== undefined) processedReportData.subtotal = reportData.subtotal.toString();
      if (reportData.iva !== undefined) processedReportData.iva = reportData.iva.toString();
      if (reportData.total !== undefined) processedReportData.total = reportData.total.toString();
      if (reportData.includeIva !== undefined) processedReportData.includeIva = reportData.includeIva;
      
      // Procesar fechas correctamente
      if (reportData.fechaReporte) {
        const fechaDate = new Date(reportData.fechaReporte);
        if (!isNaN(fechaDate.getTime())) {
          processedReportData.fechaReporte = fechaDate;
        }
      }
      if (reportData.periodoRentaInicio) {
        const inicioDate = new Date(reportData.periodoRentaInicio);
        if (!isNaN(inicioDate.getTime())) {
          processedReportData.periodoRentaInicio = inicioDate;
        }
      }
      if (reportData.periodoRentaFin) {
        const finDate = new Date(reportData.periodoRentaFin);
        if (!isNaN(finDate.getTime())) {
          processedReportData.periodoRentaFin = finDate;
        }
      }
      
      let normalizedItems: Array<any> | null = null;
      let normalizedSubtotalCents = 0;

      // Recalcular totales usando exactamente los valores de dos decimales que se guardarán.
      if (reportData.items && Array.isArray(reportData.items)) {
        normalizedItems = reportData.items.map((item: any) => {
          const quantityHundredths = Math.round(Number(item.cantidad) * 100);
          const unitPriceCents = Math.round(Number(item.precioUnitario) * 100);
          if (!Number.isFinite(quantityHundredths) || quantityHundredths <= 0 ||
              !Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
            throw new ReportPaymentError("Cantidad o precio unitario inválido");
          }
          const itemSubtotalCents = Math.round((quantityHundredths * unitPriceCents) / 100);
          normalizedSubtotalCents += itemSubtotalCents;
          return {
            ...item,
            cantidad: (quantityHundredths / 100).toFixed(2),
            precioUnitario: (unitPriceCents / 100).toFixed(2),
            subtotal: (itemSubtotalCents / 100).toFixed(2),
          };
        });
        
      }
      
      const completeReport = await db.transaction(async (tx) => {
        // Serializa la edición con cualquier alta/baja de abonos del mismo reporte.
        await tx.execute(sql`SELECT id FROM reports WHERE id = ${id} FOR UPDATE`);
        const currentReport = await tx.query.reports.findFirst({
          where: eq(reports.id, id)
        });
        if (!currentReport) {
          throw new ReportPaymentError("Reporte no encontrado", 404);
        }

        if (normalizedItems) {
          const effectiveIncludeIva = reportData.includeIva !== undefined
            ? Boolean(reportData.includeIva)
            : currentReport.includeIva;
          const ivaCents = effectiveIncludeIva
            ? Math.round(normalizedSubtotalCents * 0.16)
            : 0;
          processedReportData.includeIva = effectiveIncludeIva;
          processedReportData.subtotal = (normalizedSubtotalCents / 100).toFixed(2);
          processedReportData.iva = (ivaCents / 100).toFixed(2);
          processedReportData.total = ((normalizedSubtotalCents + ivaCents) / 100).toFixed(2);
        }

        const paymentTotals = await tx.select({
          totalPaid: sql<string>`COALESCE(SUM(${reportPayments.amount}), 0)::text`
        }).from(reportPayments).where(eq(reportPayments.reportId, id));
        const totalPaidCents = Math.round(Number(paymentTotals[0]?.totalPaid || 0) * 100);
        const updatedTotalCents = Math.round(
          Number(processedReportData.total ?? currentReport.total) * 100
        );
        if (updatedTotalCents < totalPaidCents) {
          throw new ReportPaymentError(
            `El total del reporte no puede ser menor a lo ya abonado: $${(totalPaidCents / 100).toFixed(2)}`
          );
        }

        if (totalPaidCents >= updatedTotalCents && updatedTotalCents > 0) {
          processedReportData.paymentStatus = "pagado";
        } else if (totalPaidCents > 0) {
          processedReportData.paymentStatus = currentReport.paymentStatus === "vencido"
            ? "vencido"
            : "facturado";
        }

        await tx.update(reports).set({
          ...processedReportData,
          updatedAt: new Date()
        }).where(eq(reports.id, id));

        if (reportData.items && Array.isArray(reportData.items)) {
          await tx.delete(reportItems).where(eq(reportItems.reportId, id));
          if (normalizedItems && normalizedItems.length > 0) {
            const periodoRentaInicio = processedReportData.periodoRentaInicio ?? currentReport.periodoRentaInicio;
            const periodoRentaFin = processedReportData.periodoRentaFin ?? currentReport.periodoRentaFin;
            await tx.insert(reportItems).values(normalizedItems.map((item: any) => {
              return {
                reportId: id,
                numero: item.numero,
                concepto: item.concepto,
                obra: item.obra,
                diasUso: item.diasUso,
                periodoRenta: periodoRentaInicio && periodoRentaFin
                  ? `${new Date(periodoRentaInicio).toLocaleDateString("es-MX")} - ${new Date(periodoRentaFin).toLocaleDateString("es-MX")}`
                  : "",
                cantidad: item.cantidad,
                unidad: item.unidad,
                precioUnitario: item.precioUnitario,
                subtotal: item.subtotal
              };
            }));
          }
        }

        return tx.query.reports.findFirst({
          where: eq(reports.id, id),
          with: {
            client: true,
            project: true,
            items: true,
            payments: true
          }
        });
      });
      
      return res.json(completeReport);
    } catch (error) {
      console.error("Error updating report:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      if (error instanceof ReportPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: "Error actualizando el reporte" });
    }
  });

  // POST - Duplicar un reporte
  app.post(`${apiPrefix}/reports/:id/duplicate`, requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      // Obtener el reporte original con todos sus items
      const originalReport = await storage.getReportById(id);
      if (!originalReport) {
        return res.status(404).json({ message: "Reporte no encontrado" });
      }

      console.log("API - Duplicando reporte:", originalReport.reportNumber);

      // Validar que el cliente y proyecto aún existen
      const client = await storage.getClientById(originalReport.clientId);
      if (!client) {
        return res.status(404).json({ message: "Cliente del reporte original no encontrado" });
      }
      
      const project = await storage.getClientProjectById(originalReport.projectId);
      if (!project) {
        return res.status(404).json({ message: "Proyecto del reporte original no encontrado" });
      }

      // Obtener el siguiente número de reporte
      const newReportNumber = await storage.getNextReportNumber();
      // Usar el folio original con " COPIA" al final para que el usuario pueda modificarlo
      const newFolioNumber = `${originalReport.folioReporte} COPIA`;
      
      const duplicatedItems = (originalReport.items || []).map(originalItem => ({
        numero: originalItem.numero,
        concepto: originalItem.concepto,
        obra: originalItem.obra,
        diasUso: originalItem.diasUso,
        periodoRenta: originalItem.periodoRenta,
        cantidad: originalItem.cantidad,
        unidad: originalItem.unidad,
        precioUnitario: originalItem.precioUnitario,
        subtotal: originalItem.subtotal
      }));

      // Crear cabecera e items duplicados en una sola transacción
      const duplicatedReport = await storage.createReport({
        reportNumber: newReportNumber,
        folioReporte: newFolioNumber,
        clientId: originalReport.clientId,
        clientName: originalReport.clientName,
        projectId: originalReport.projectId,
        diasUso: originalReport.diasUso,
        nombreObra: originalReport.nombreObra,
        fechaReporte: new Date(), // Nueva fecha actual
        periodoRentaInicio: originalReport.periodoRentaInicio,
        periodoRentaFin: originalReport.periodoRentaFin,
        subtotal: originalReport.subtotal,
        iva: originalReport.iva,
        total: originalReport.total,
        includeIva: originalReport.includeIva,
        paymentStatus: 'pendiente' // Nuevo reporte siempre pendiente
      }, duplicatedItems);

      console.log("API - Reporte duplicado exitosamente:", duplicatedReport.reportNumber);

      return res.status(201).json({
        ...duplicatedReport,
        items: duplicatedReport.items || []
      });
    } catch (error) {
      console.error("Error duplicating report:", error);
      return res.status(500).json({ message: "Error duplicando el reporte" });
    }
  });

  // DELETE - Eliminar un reporte
  app.delete(`${apiPrefix}/reports/:id`, requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      const success = await storage.deleteReport(id);
      
      if (!success) {
        return res.status(404).json({ message: "Reporte no encontrado" });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting report:", error);
      return res.status(500).json({ message: "Error eliminando el reporte" });
    }
  });

  // PATCH - Actualizar estado de pago de un reporte (con sincronización automática)
  app.patch(`${apiPrefix}/reports/:id/payment-status`, requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      const { paymentStatus } = req.body;
      
      // Validar que el estado de pago es válido
      const validStatuses = ['pendiente', 'facturado', 'pagado', 'vencido'];
      if (!validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ message: "Estado de pago inválido" });
      }

      const finalReport = await db.transaction(async (tx) => {
        // Comparte el mismo bloqueo que las altas y repartos para evitar sobrepagos simultáneos.
        await tx.execute(sql`SELECT id FROM reports WHERE id = ${id} FOR UPDATE`);
        const report = await tx.query.reports.findFirst({
          where: eq(reports.id, id)
        });
        if (!report) {
          throw new ReportPaymentError("Reporte no encontrado", 404);
        }

        if (paymentStatus === 'pendiente') {
          const systemPayments = await tx.query.reportPayments.findMany({
            where: and(
              eq(reportPayments.reportId, id),
              eq(reportPayments.createdBy, 'Sistema')
            )
          });
          if (systemPayments.length > 0) {
            await tx.delete(reportPayments).where(and(
              eq(reportPayments.reportId, id),
              eq(reportPayments.createdBy, 'Sistema')
            ));
            const totalDeleted = systemPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            console.log(`🗑️ ABONOS AUTOMÁTICOS ELIMINADOS: ${systemPayments.length} abono(s) por $${totalDeleted.toFixed(2)} del reporte ${id} (marcado como Pendiente)`);
          }
        }

        let paymentTotals = await tx.select({
          totalPaid: sql<string>`COALESCE(SUM(${reportPayments.amount}), 0)::text`
        }).from(reportPayments).where(eq(reportPayments.reportId, id));
        let totalPaidCents = Math.round(Number(paymentTotals[0]?.totalPaid || 0) * 100);
        const reportTotalCents = Math.round(Number(report.total) * 100);

        if (paymentStatus === 'pagado') {
          const remainingCents = Math.max(0, reportTotalCents - totalPaidCents);
          if (remainingCents > 0) {
            await tx.insert(reportPayments).values({
              reportId: id,
              amount: (remainingCents / 100).toFixed(2),
              paymentDate: new Date(),
              paymentMethod: 'Sistema',
              reference: 'Abono automático al marcar como Pagado',
              notes: 'Abono automático generado por el sistema para completar el 100% del pago',
              createdBy: 'Sistema'
            });
            totalPaidCents += remainingCents;
            console.log(`💰 ABONO AUTOMÁTICO CREADO: $${(remainingCents / 100).toFixed(2)} para reporte ${id} (marcado como Pagado)`);
          }
        }

        let finalStatus = paymentStatus;
        if (reportTotalCents > 0 && totalPaidCents >= reportTotalCents) {
          finalStatus = 'pagado';
        } else if (paymentStatus === 'pendiente' && totalPaidCents > 0) {
          finalStatus = 'facturado';
        }

        await tx.update(reports).set({
          paymentStatus: finalStatus,
          updatedAt: new Date()
        }).where(eq(reports.id, id));

        return tx.query.reports.findFirst({
          where: eq(reports.id, id)
        });
      });

      console.log(`✅ Estado manual actualizado: Reporte ${id} -> ${finalReport?.paymentStatus}`);
      return res.json(finalReport);
    } catch (error) {
      console.error("Error al actualizar estado de pago:", error);
      if (error instanceof ReportPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // GET - Obtener todos los abonos de un reporte
  app.get(`${apiPrefix}/reports/:id/payments`, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      // Verificar que el reporte existe
      const report = await db.query.reports.findFirst({
        where: eq(reports.id, reportId)
      });
      
      if (!report) {
        return res.status(404).json({ message: "Reporte no encontrado" });
      }

      // Obtener todos los abonos del reporte ordenados por fecha de pago
      const payments = await db.query.reportPayments.findMany({
        where: eq(reportPayments.reportId, reportId),
        orderBy: desc(reportPayments.paymentDate)
      });

      // Calcular totales
      const totalPaid = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      const remaining = parseFloat(report.total) - totalPaid;

      return res.json({
        payments,
        summary: {
          reportTotal: parseFloat(report.total),
          totalPaid,
          remaining: Math.max(0, remaining)
        }
      });
    } catch (error) {
      console.error("Error obteniendo abonos:", error);
      return res.status(500).json({ message: "Error obteniendo los abonos" });
    }
  });

  // POST - Agregar un nuevo abono a un reporte
  app.post(`${apiPrefix}/reports/:id/payments`, requireAuth, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "ID de reporte inválido" });
      }

      const paymentData = req.body;
      const session = verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
      if (!session) {
        return res.status(401).json({ message: "Sesión requerida" });
      }
      
      // Validar datos con Zod
      const validatedData = reportPaymentInsertSchema.parse({
        ...paymentData,
        reportId,
        amount: paymentData.amount != null ? String(paymentData.amount) : paymentData.amount,
        paymentDate: new Date(paymentData.paymentDate),
        createdBy: session.email
      });

      const newPayment = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM reports WHERE id = ${reportId} FOR UPDATE`);
        const report = await tx.query.reports.findFirst({
          where: eq(reports.id, reportId)
        });
        if (!report) {
          throw new ReportPaymentError("Reporte no encontrado", 404);
        }
        if (!new Set(["pendiente", "facturado", "vencido"]).has(report.paymentStatus)) {
          throw new ReportPaymentError("El reporte no tiene un estado cobrable");
        }

        const paymentTotals = await tx.select({
          totalPaid: sql<string>`COALESCE(SUM(${reportPayments.amount}), 0)::text`
        }).from(reportPayments).where(eq(reportPayments.reportId, reportId));
        const paidCents = Math.round(Number(paymentTotals[0]?.totalPaid || 0) * 100);
        const totalCents = Math.round(Number(report.total) * 100);
        const amountCents = Math.round(Number(validatedData.amount) * 100);
        const remainingCents = Math.max(0, totalCents - paidCents);

        if (amountCents > remainingCents) {
          throw new ReportPaymentError(
            `El abono excede el monto pendiente. Pendiente: $${(remainingCents / 100).toFixed(2)}`
          );
        }

        const [insertedPayment] = await tx.insert(reportPayments)
          .values(validatedData)
          .returning();
        const newPaidCents = paidCents + amountCents;
        await tx.update(reports).set({
          paymentStatus: newPaidCents >= totalCents
            ? "pagado"
            : report.paymentStatus === "vencido"
              ? "vencido"
              : "facturado",
          updatedAt: new Date()
        }).where(eq(reports.id, reportId));
        return insertedPayment;
      });

      console.log(`API - Abono creado: $${validatedData.amount} para reporte ${reportId}`);
      return res.status(201).json(newPayment);
    } catch (error) {
      console.error("Error creando abono:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      if (error instanceof ReportPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: "Error creando el abono" });
    }
  });

  // PATCH - Actualizar un abono existente
  app.patch(`${apiPrefix}/reports/:id/payments/:paymentId`, requireAuth, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      
      if (isNaN(reportId) || isNaN(paymentId)) {
        return res.status(400).json({ message: "IDs inválidos" });
      }

      // Validar datos de actualización con Zod schema
      const validatedData = reportPaymentUpdateSchema.parse(req.body);

      const updatedPayment = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM reports WHERE id = ${reportId} FOR UPDATE`);
        const report = await tx.query.reports.findFirst({
          where: eq(reports.id, reportId)
        });
        if (!report) {
          throw new ReportPaymentError("Reporte no encontrado", 404);
        }

        const payment = await tx.query.reportPayments.findFirst({
          where: eq(reportPayments.id, paymentId)
        });
        if (!payment) {
          throw new ReportPaymentError("Abono no encontrado", 404);
        }
        if (payment.reportId !== reportId) {
          throw new ReportPaymentError("El abono no pertenece a este reporte", 403);
        }

        const otherPayments = await tx.select({
          totalPaid: sql<string>`COALESCE(SUM(${reportPayments.amount}), 0)::text`
        }).from(reportPayments).where(and(
          eq(reportPayments.reportId, reportId),
          sql`${reportPayments.id} <> ${paymentId}`
        ));
        const otherPaidCents = Math.round(Number(otherPayments[0]?.totalPaid || 0) * 100);
        const reportTotalCents = Math.round(Number(report.total) * 100);
        const amountCents = validatedData.amount === undefined
          ? Math.round(Number(payment.amount) * 100)
          : Math.round(validatedData.amount * 100);
        if (otherPaidCents + amountCents > reportTotalCents) {
          const availableCents = Math.max(0, reportTotalCents - otherPaidCents);
          throw new ReportPaymentError(
            `El abono excede el monto disponible. Máximo: $${(availableCents / 100).toFixed(2)}`
          );
        }

        const { amount: _amount, ...nonAmountUpdates } = validatedData;
        const values = {
          ...nonAmountUpdates,
          ...(validatedData.amount === undefined ? {} : {
            amount: (amountCents / 100).toFixed(2)
          }),
          updatedAt: new Date()
        };
        const [updated] = await tx.update(reportPayments)
          .set(values)
          .where(and(
            eq(reportPayments.id, paymentId),
            eq(reportPayments.reportId, reportId)
          ))
          .returning();

        const newPaidCents = otherPaidCents + amountCents;
        const balanceRemains = newPaidCents < reportTotalCents;
        const paymentStatus = !balanceRemains && reportTotalCents > 0
          ? "pagado"
          : report.paymentStatus === "vencido"
            ? "vencido"
            : newPaidCents > 0
              ? "facturado"
              : "pendiente";
        await tx.update(reports).set({
          paymentStatus,
          updatedAt: new Date()
        }).where(eq(reports.id, reportId));
        return updated;
      });

      console.log(`API - Abono actualizado: ${paymentId} del reporte ${reportId}`);
      
      return res.json(updatedPayment);
    } catch (error) {
      console.error("Error actualizando abono:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos de actualización inválidos",
          errors: error.errors 
        });
      }
      if (error instanceof ReportPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: "Error actualizando el abono" });
    }
  });

  // DELETE - Eliminar un abono
  app.delete(`${apiPrefix}/reports/:id/payments/:paymentId`, requireAuth, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const paymentId = Number(req.params.paymentId);
      
      if (isNaN(reportId) || isNaN(paymentId)) {
        return res.status(400).json({ message: "IDs inválidos" });
      }

      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM reports WHERE id = ${reportId} FOR UPDATE`);
        const report = await tx.query.reports.findFirst({
          where: eq(reports.id, reportId)
        });
        if (!report) {
          throw new ReportPaymentError("Reporte no encontrado", 404);
        }

        const payment = await tx.query.reportPayments.findFirst({
          where: eq(reportPayments.id, paymentId)
        });
        if (!payment) {
          throw new ReportPaymentError("Abono no encontrado", 404);
        }
        if (payment.reportId !== reportId) {
          throw new ReportPaymentError("El abono no pertenece a este reporte");
        }

        await tx.delete(reportPayments).where(eq(reportPayments.id, paymentId));
        const remainingPayments = await tx.select({
          totalPaid: sql<string>`COALESCE(SUM(${reportPayments.amount}), 0)::text`
        }).from(reportPayments).where(eq(reportPayments.reportId, reportId));
        const totalPaidCents = Math.round(Number(remainingPayments[0]?.totalPaid || 0) * 100);
        const reportTotalCents = Math.round(Number(report.total) * 100);
        const newStatus = totalPaidCents >= reportTotalCents && reportTotalCents > 0
          ? "pagado"
          : totalPaidCents > 0
            ? "facturado"
            : "pendiente";
        await tx.update(reports).set({
          paymentStatus: newStatus,
          updatedAt: new Date()
        }).where(eq(reports.id, reportId));
      });
      
      console.log(`API - Abono eliminado: ${paymentId} del reporte ${reportId}`);
      return res.json({ success: true, message: "Abono eliminado correctamente" });
    } catch (error) {
      console.error("Error eliminando abono:", error);
      if (error instanceof ReportPaymentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: "Error eliminando el abono" });
    }
  });

  // Función auxiliar para recalcular estado de pago automáticamente
  async function updatePaymentStatusBasedOnPayments(reportId: number) {
    try {
      // Obtener el reporte
      const report = await db.query.reports.findFirst({
        where: eq(reports.id, reportId)
      });
      
      if (!report) return;
      
      // Obtener todos los pagos del reporte
      const payments = await db.query.reportPayments.findMany({
        where: eq(reportPayments.reportId, reportId)
      });
      
      const totalPaid = payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      const reportTotal = parseFloat(report.total) || 0;
      
      // Determinar el nuevo estado basado en el porcentaje abonado
      let newStatus: 'pendiente' | 'facturado' | 'pagado';
      
      if (reportTotal <= 0) {
        // Si el total es 0 o negativo, mantener pendiente
        newStatus = 'pendiente';
      } else {
        // Redondear a centavos para evitar problemas de precisión
        const totalPaidCents = Math.round(totalPaid * 100);
        const reportTotalCents = Math.round(reportTotal * 100);
        const paidPercentage = (totalPaidCents / reportTotalCents) * 100;
        
        if (totalPaidCents === 0) {
          newStatus = 'pendiente';  // 0% pagado - Rojo
        } else if (totalPaidCents >= reportTotalCents) {
          newStatus = 'pagado';  // 100% o más pagado - Verde
        } else {
          newStatus = 'facturado';  // 1-99% pagado - Amarillo
        }
      }
      
      const paidPercentage = reportTotal > 0 ? (totalPaid / reportTotal) * 100 : 0;
      
      // Actualizar el estado solo si es diferente al actual
      if (report.paymentStatus !== newStatus) {
        await db.update(reports)
          .set({ 
            paymentStatus: newStatus,
            updatedAt: new Date()
          })
          .where(eq(reports.id, reportId));
        
        console.log(`⚙️ ESTADO AUTO-ACTUALIZADO: Reporte ${reportId} -> ${newStatus} (${paidPercentage.toFixed(1)}% pagado - $${totalPaid.toFixed(2)} de $${reportTotal.toFixed(2)})`);
      }
    } catch (error) {
      console.error('Error actualizando estado de pago automáticamente:', error);
    }
  }

  // POST - Upload repair image to Object Storage
  app.post(`${apiPrefix}/upload-image`, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: "El archivo es demasiado grande. El límite es 50MB." });
        }
        return res.status(400).json({ message: "Error procesando el archivo: " + err.message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se recibió ningún archivo" });
      }

      const rawRepairNumber = req.body.repairNumber || 'unknown';
      const repairNumber = String(rawRepairNumber).replace(/[^a-zA-Z0-9_-]/g, '-') || 'unknown';
      const imageIndex = String(req.body.imageIndex || '1').replace(/[^0-9]/g, '') || '1';
      const timestamp = Date.now();
      const ext = req.file.mimetype.includes('png') ? 'png' : 'jpg';
      const objectPath = `public/repairs/repair-${repairNumber}-image-${imageIndex}-${timestamp}.${ext}`;

      const client = new ObjectStorageClient({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
      // Content-Type se determina por la extensión al servir la imagen
      const result = await client.uploadFromBytes(objectPath, req.file.buffer);

      if (!result.ok) {
        console.error("Error subiendo a Object Storage:", result.error);
        return res.status(500).json({ message: "Error al subir la imagen al almacenamiento" });
      }

      // Return a relative URL served by this server (GET /public/repairs/:filename)
      return res.json({ url: `/${objectPath}` });
    } catch (error) {
      console.error("Error uploading image:", error);
      return res.status(500).json({ message: "Error al subir la imagen" });
    }
  });

  // GET - Serve repair images from Object Storage
  app.get('/public/repairs/:filename', requireAuth, async (req, res) => {
    try {
      const filename = req.params.filename;
      // Prevent path traversal
      if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ message: "Nombre de archivo inválido" });
      }
      const objectPath = `public/repairs/${filename}`;
      const client = new ObjectStorageClient({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
      const result = await client.downloadAsBytes(objectPath);
      if (!result.ok) {
        return res.status(404).json({ message: "Imagen no encontrada" });
      }
      const bytes = Array.isArray(result.value) ? result.value[0] : result.value;
      res.set('Content-Type', filename.endsWith('.png') ? 'image/png' : 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=31536000, immutable');
      return res.send(bytes);
    } catch (error) {
      console.error("Error sirviendo imagen:", error);
      return res.status(500).json({ message: "Error al obtener la imagen" });
    }
  });

  // POST - Delete repair image from Object Storage (requiere sesión activa)
  app.post(`${apiPrefix}/delete-image`, requireAuth, async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL de imagen requerida" });
      }

      // Solo se permiten fotos de reparación (prefijo public/repairs/)
      const objectPath = resolveRepairImagePath(url);
      if (!objectPath) {
        return res.status(400).json({ message: "Formato de URL de imagen no reconocido" });
      }

      // Si otra reparación aún referencia la foto (p. ej., duplicados), no borrarla
      if (await isRepairImageReferenced(url)) {
        return res.json({ success: true, skipped: true, message: "La imagen sigue en uso por otra reparación" });
      }

      const client = new ObjectStorageClient({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
      const result = await client.delete(objectPath);
      if (!result.ok) {
        console.error("Error eliminando de Object Storage:", result.error);
        return res.status(500).json({ message: "Error al eliminar la imagen del almacenamiento" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting image:", error);
      return res.status(500).json({ message: "Error al eliminar la imagen" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}
