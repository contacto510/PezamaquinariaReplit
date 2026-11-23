import { z } from "zod";
import { pgTable, serial, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const common = z.object({
  submission_id: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  tipo_solicitud: z.enum(["cotizacion_renta", "reparacion"]),
  nombre: z.string().trim().min(2).max(200),
  telefono: z.string().trim().min(7).max(40),
  correo: z.union([z.literal(""), z.string().trim().email().max(254)]).optional().default(""),
  municipio: optionalText(200),
  equipo: z.string().trim().min(2).max(500),
  mensaje: optionalText(5000),
  pagina_url: z.string().url().max(2000),
  pagina_titulo: optionalText(200),
  utm_source: optionalText(200),
  utm_medium: optionalText(200),
  utm_campaign: optionalText(200),
});
const positiveInteger = z.coerce.number().int().min(1).max(10000);
export const webRequestSchema = z.discriminatedUnion("tipo_solicitud", [
  common.extend({
    tipo_solicitud: z.literal("cotizacion_renta"),
    cantidad_equipos: positiveInteger,
    dias_renta: positiveInteger,
    entrega: z.enum(["entrega_obra", "recoge_sucursal"]),
    fecha_requerida: optionalText(40),
  }),
  common.extend({
    tipo_solicitud: z.literal("reparacion"),
    marca_modelo: optionalText(300),
    falla_reportada: z.string().trim().min(2).max(5000),
  }),
]);
export type WebRequestPayload = z.infer<typeof webRequestSchema>;
export const webRequests = pgTable("web_requests", {
  id: serial("id").primaryKey(),
  submissionId: text("submission_id").notNull().unique(),
  type: text("type").notNull(),
  status: text("status").notNull().default("nueva"),
  payload: jsonb("payload").$type<WebRequestPayload>().notNull(),
  payloadHash: text("payload_hash").notNull(),
  convertedId: integer("converted_id"),
  convertedFolio: text("converted_folio"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type WebRequest = typeof webRequests.$inferSelect;
export type WebRequestView = Omit<WebRequest, "receivedAt" | "updatedAt" | "payloadHash"> & {
  receivedAt: string;
  updatedAt: string;
};
export type WebRequestsResponse = {
  items: WebRequestView[];
  total: number;
  counts: { nueva: number; seguimiento: number; convertida: number; descartada: number; renta: number; reparacion: number };
  webhookConfigured: boolean;
};
