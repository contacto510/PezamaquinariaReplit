import { pgTable, text, serial, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Tabla de clientes
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  totalProjects: integer("total_projects").default(0).notNull(),
  totalQuotations: integer("total_quotations").default(0).notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabla para proyectos de los clientes
export const clientProjects = pgTable("client_projects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  totalQuotations: integer("total_quotations").default(0).notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabla de conceptos para cotizaciones
export const concepts = pgTable("concepts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultUnit: text("default_unit"),
  defaultPrice: numeric("default_price", { precision: 10, scale: 2 }),
  category: text("category"), // Nueva columna: 'general' o 'repair'
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabla para reparaciones
export const repairs = pgTable("repairs", {
  id: serial("id").primaryKey(),
  repairNumber: text("repair_number").notNull().unique(), // formato R-01, R-02, etc.
  repairOrder: text("repair_order"), // Orden de Reparación - llenado manual
  clientId: integer("client_id").references(() => clients.id),
  clientEmail: text("client_email").default(""), // Correo del cliente para esta reparación (independiente del cliente)
  equipment: text("equipment").notNull(),
  serialNumber: text("serial_number"),
  model: text("model"),
  repairManager: text("repair_manager"),
  receivedDate: timestamp("received_date").defaultNow().notNull(),
  deliveredBy: text("delivered_by"),
  deliveryDate: timestamp("delivery_date"),
  departureDate: timestamp("departure_date"),
  elaborationDate: timestamp("elaboration_date"),
  clientReport: text("client_report"),
  equipmentObservations: text("equipment_observations"),
  image1: text("image_1"), // URL to image in Object Storage
  image2: text("image_2"), // URL to image in Object Storage
  image3: text("image_3"), // URL to image in Object Storage
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
  iva: numeric("iva", { precision: 10, scale: 2 }).default("0").notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).default("0").notNull(),
  includeIVA: boolean("include_iva").default(true).notNull(),
  status: text("status").default("Espera de confirmación").notNull(), // Espera de confirmación, Diagnóstico, En Proceso, Entregada, Terminada, No autorizado
  paymentStatus: text("payment_status").default("No Pagada").notNull(), // Pagada, No Pagada, Cotización
  liquidatedAt: timestamp("liquidated_at"), // Fecha de liquidación, nullable para reparaciones históricas
  reviewReason: text("review_reason"), // Razón de revisión - información interna, no se muestra en PDF
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabla para los items/conceptos de cada reparación
export const repairItems = pgTable("repair_items", {
  id: serial("id").primaryKey(),
  repairId: integer("repair_id").notNull().references(() => repairs.id, { onDelete: 'cascade' }),
  itemNumber: text("item_number").notNull(), // N1, N2, etc.
  concept: text("concept").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User model for authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Quotation model
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quotationNumber: integer("quotation_number").notNull().unique(),
  clientId: integer("client_id").references(() => clients.id),
  projectId: integer("project_id").references(() => clientProjects.id),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").default("N/A").notNull(),
  projectName: text("project_name"),
  rentalPeriod: text("rental_period"),
  salesperson: text("salesperson"),
  includeIVA: boolean("include_iva").default(true).notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  iva: numeric("iva", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Quotation items model
export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id, { onDelete: 'cascade' }),
  concept: text("concept").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// Define relations
export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(clientProjects),
  quotations: many(quotations),
  repairs: many(repairs),
}));

export const clientProjectsRelations = relations(clientProjects, ({ one, many }) => ({
  client: one(clients, {
    fields: [clientProjects.clientId],
    references: [clients.id],
  }),
  quotations: many(quotations),
}));

export const repairsRelations = relations(repairs, ({ one, many }) => ({
  client: one(clients, {
    fields: [repairs.clientId],
    references: [clients.id],
  }),
  items: many(repairItems),
}));

export const repairItemsRelations = relations(repairItems, ({ one }) => ({
  repair: one(repairs, {
    fields: [repairItems.repairId],
    references: [repairs.id],
  }),
}));

export const quotationsRelations = relations(quotations, ({ many, one }) => ({
  items: many(quotationItems),
  client: one(clients, {
    fields: [quotations.clientId],
    references: [clients.id],
  }),
  project: one(clientProjects, {
    fields: [quotations.projectId],
    references: [clientProjects.id],
  }),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationItems.quotationId],
    references: [quotations.id],
  }),
}));

// Schemas for data validation
export const quotationFormSchema = z.object({
  clientName: z.string().min(3, { message: "El nombre del cliente debe tener al menos 3 caracteres" }),
  clientEmail: z.string().optional().transform(val => val && val.trim() !== "" ? val : "N/A"),
  projectName: z.string().optional(),
  rentalPeriod: z.string().optional(),
  salesperson: z.string().trim().min(1, { message: "El vendedor es requerido" }),
  includeIVA: z.boolean().default(true),
});

export const quotationItemSchema = z.object({
  concept: z.string().min(1, { message: "El concepto es requerido" }),
  quantity: z.coerce.number().positive({ message: "La cantidad debe ser mayor a 0" }),
  unit: z.string().min(1, { message: "La unidad es requerida" }),
  unitPrice: z.coerce.number().nonnegative({ message: "El precio unitario debe ser mayor o igual a 0" }),
});

export const quotationItemsSchema = z.array(quotationItemSchema);

// Validación y esquemas para clientes
export const clientSchema = z.object({
  name: z.string().min(3, { message: "El nombre del cliente debe tener al menos 3 caracteres" }),
  email: z.string().email({ message: "Correo electrónico inválido" }).optional().or(z.literal("")),
});

export const clientProjectSchema = z.object({
  name: z.string().min(3, { message: "El nombre del proyecto debe tener al menos 3 caracteres" }),
  clientId: z.number().int().positive(),
});

// Validación y esquema para conceptos
export const conceptSchema = z.object({
  name: z.string().min(3, { message: "El nombre del concepto debe tener al menos 3 caracteres" }),
  description: z.string().optional(),
  defaultUnit: z.string().optional(),
  defaultPrice: z.coerce.number().nonnegative().optional(),
  category: z.string().optional().default("general"), // general o repair
  active: z.boolean().default(true)
});

// Esquema para validación de reparaciones
export const repairFormSchema = z.object({
  clientName: z.string().min(3, { message: "El nombre del cliente debe tener al menos 3 caracteres" }),
  clientEmail: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '') ? 'N/A' : (val || 'N/A'),
    z.string()
  ),
  equipment: z.string().min(1, { message: "El nombre del equipo es requerido" }),
  serialNumber: z.string().optional(),
  model: z.string().optional(),
  repairManager: z.string().optional(),
  repairOrder: z.string().optional(),
  receivedDate: z.date().default(() => new Date()),
  deliveredBy: z.string().optional(),
  deliveryDate: z.date().optional().nullable(),
  departureDate: z.date().optional().nullable(),
  elaborationDate: z.date().optional().nullable(),
  clientReport: z.string().optional(),
  equipmentObservations: z.string().optional(),
  // Sin foto = null; omitir el campo en una edición conserva la existente.
  image1: z.string().nullable().optional(),
  image2: z.string().nullable().optional(),
  image3: z.string().nullable().optional(),
  includeIVA: z.boolean().default(true),
  status: z.string().default("Espera de confirmación"),
  paymentStatus: z.string().default("No Pagada"),
  reviewReason: z.string().optional(),
});

// Esquema para los items de reparación
export const repairItemSchema = z.object({
  itemNumber: z.string().min(1, { message: "El número de item es requerido" }),
  concept: z.string().min(1, { message: "El concepto es requerido" }),
  quantity: z.coerce.number().positive({ message: "La cantidad debe ser mayor a 0" }),
  unit: z.string().min(1, { message: "La unidad es requerida" }),
  unitPrice: z.coerce.number().nonnegative({ message: "El precio unitario debe ser mayor o igual a 0" }),
  subtotal: z.coerce.number().optional(),
});

export const clientInsertSchema = createInsertSchema(clients);
export const clientProjectInsertSchema = createInsertSchema(clientProjects);
export const quotationInsertSchema = createInsertSchema(quotations);
export const quotationItemInsertSchema = createInsertSchema(quotationItems);
export const conceptInsertSchema = createInsertSchema(concepts);
export const repairInsertSchema = createInsertSchema(repairs);
export const repairItemInsertSchema = createInsertSchema(repairItems);

export type ClientInsert = z.infer<typeof clientInsertSchema>;
export type ClientProjectInsert = z.infer<typeof clientProjectInsertSchema>;
export type QuotationInsert = z.infer<typeof quotationInsertSchema>;
export type QuotationItemInsert = z.infer<typeof quotationItemInsertSchema>;
export type ConceptInsert = z.infer<typeof conceptInsertSchema>;
export type RepairInsert = z.infer<typeof repairInsertSchema>;
export type RepairItemInsert = z.infer<typeof repairItemInsertSchema>;

// Tipo básico del cliente desde la tabla
export type Client = typeof clients.$inferSelect & {
  // Propiedades adicionales para la UI
  projects?: ClientProject[];
  quotations?: Quotation[];
};
// Tipo de proyecto de cliente con relaciones
export type ClientProject = typeof clientProjects.$inferSelect & {
  client?: Client;
  quotations?: Quotation[];
};
export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;

export type ClientFormData = z.infer<typeof clientSchema>;
export type ClientProjectFormData = z.infer<typeof clientProjectSchema>;
export type QuotationFormData = z.infer<typeof quotationFormSchema>;
export type QuotationItemData = z.infer<typeof quotationItemSchema>;
export type ConceptFormData = z.infer<typeof conceptSchema>;
export type RepairFormData = z.infer<typeof repairFormSchema>;
export type RepairItemData = z.infer<typeof repairItemSchema>;

// Define el array de items de reparación
export const repairItemsSchema = z.array(repairItemSchema);

export type Concept = typeof concepts.$inferSelect;
export type Repair = typeof repairs.$inferSelect & {
  client?: Client;
  items?: RepairItem[];
};
export type RepairItem = typeof repairItems.$inferSelect & {
  repair?: Repair;
};

// Tabla para reportes
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reportNumber: text("report_number").notNull().unique(), // formato REP-1001, REP-1002, etc.
  folioReporte: text("folio_reporte").notNull(), // folio del reporte para orden interno
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  clientName: text("client_name").notNull(),
  projectId: integer("project_id").notNull().references(() => clientProjects.id, { onDelete: 'cascade' }),
  diasUso: text("dias_uso").notNull(),
  nombreObra: text("nombre_obra").notNull(),
  fechaReporte: timestamp("fecha_reporte").notNull(), // fecha del reporte seleccionada por el usuario
  periodoRentaInicio: timestamp("periodo_renta_inicio"), // fecha de inicio del período de renta
  periodoRentaFin: timestamp("periodo_renta_fin"), // fecha de fin del período de renta
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
  iva: numeric("iva", { precision: 10, scale: 2 }).default("0").notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).default("0").notNull(),
  includeIva: boolean("include_iva").default(true).notNull(),
  paymentStatus: text("payment_status").default("pendiente").notNull(), // pendiente, facturado, pagado, vencido
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabla para los items/conceptos de cada reporte
export const reportItems = pgTable("report_items", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
  numero: text("numero").notNull(), // N1, N2, etc.
  concepto: text("concepto").notNull(),
  obra: text("obra").notNull(),
  diasUso: text("dias_uso").notNull(),
  periodoRenta: text("periodo_renta").notNull(), // PERÍODO DE RENTA
  cantidad: numeric("cantidad", { precision: 10, scale: 2 }).notNull(),
  unidad: text("unidad").notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tabla para abonos/pagos de reportes
export const reportPayments = pgTable("report_payments", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => reports.id, { onDelete: 'cascade' }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentMethod: text("payment_method").notNull(), // efectivo, transferencia, cheque, etc.
  reference: text("reference"), // numero de cheque, transferencia, etc.
  notes: text("notes"), // notas adicionales
  createdBy: text("created_by").notNull(), // quien registró el abono
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relaciones para reportes
export const reportsRelations = relations(reports, ({ one, many }) => ({
  client: one(clients, { fields: [reports.clientId], references: [clients.id] }),
  project: one(clientProjects, { fields: [reports.projectId], references: [clientProjects.id] }),
  items: many(reportItems),
  payments: many(reportPayments)
}));

export const reportItemsRelations = relations(reportItems, ({ one }) => ({
  report: one(reports, { fields: [reportItems.reportId], references: [reports.id] })
}));

export const reportPaymentsRelations = relations(reportPayments, ({ one }) => ({
  report: one(reports, { fields: [reportPayments.reportId], references: [reports.id] })
}));

// Esquemas de inserción para reportes
export const reportInsertSchema = createInsertSchema(reports);
export const reportItemInsertSchema = createInsertSchema(reportItems);
export const reportPaymentInsertSchema = createInsertSchema(reportPayments, {
  amount: (schema) => schema.min(0.01, "El monto debe ser mayor a 0"),
  paymentMethod: (schema) => schema.min(1, "Método de pago es requerido"),
  createdBy: (schema) => schema.min(1, "Creado por es requerido")
});

// Schema específico para actualización de pagos (reportId nunca es editable)
export const reportPaymentUpdateSchema = z.object({
  amount: z.coerce.number()
    .finite("El monto debe ser válido")
    .positive("El monto debe ser mayor a 0")
    .max(99999999.99, "El monto excede el máximo permitido")
    .refine(
      value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      "El monto debe tener máximo dos decimales"
    )
    .optional(),
  paymentDate: z.coerce.date()
    .refine(date => !isNaN(date.getTime()), "Fecha inválida")
    .optional(),
  paymentMethod: z.enum(["efectivo", "transferencia", "cheque", "tarjeta", "deposito", "Sistema"], {
    errorMap: () => ({ message: "Método de pago inválido" })
  }).optional(),
  reference: z.string().max(200, "La referencia no puede exceder 200 caracteres").trim().optional().nullable(),
  notes: z.string().max(500, "Las notas no pueden exceder 500 caracteres").trim().optional().nullable()
}).strict().refine(
  data => Object.keys(data).length > 0,
  "Debe proporcionar al menos un campo para actualizar"
);

const moneyAmountSchema = z.number()
  .finite("El monto debe ser válido")
  .positive("El monto debe ser mayor a 0")
  .max(99999999.99, "El monto excede el máximo permitido")
  .refine(
    value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "El monto debe tener máximo dos decimales"
  );

export const partialPaymentSchema = z.object({
  paymentDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD")
    .refine(value => {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
    }, "Fecha inválida"),
  paymentMethod: z.enum(["efectivo", "transferencia", "cheque", "tarjeta", "deposito", "Sistema"], {
    errorMap: () => ({ message: "Método de pago inválido" })
  }),
  reference: z.string().trim().max(200, "La referencia no puede exceder 200 caracteres").optional().nullable(),
  notes: z.string().trim().max(500, "Las notas no pueden exceder 500 caracteres").optional().nullable(),
  totalAmount: moneyAmountSchema,
  allocations: z.array(z.object({
    reportId: z.number().int().positive("ID de reporte inválido"),
    amount: moneyAmountSchema
  }).strict()).min(1, "Debe asignar el abono a al menos un reporte")
}).strict().superRefine((data, ctx) => {
  const reportIds = new Set<number>();
  for (const allocation of data.allocations) {
    if (reportIds.has(allocation.reportId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: "Los reportes no pueden repetirse"
      });
      break;
    }
    reportIds.add(allocation.reportId);
  }
  const allocatedCents = data.allocations.reduce(
    (sum, allocation) => sum + Math.round(allocation.amount * 100),
    0
  );
  if (allocatedCents !== Math.round(data.totalAmount * 100)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allocations"],
      message: "La suma de las asignaciones debe ser igual al total recibido"
    });
  }
});

// Tipos para reportes
export type ReportInsert = z.infer<typeof reportInsertSchema>;
export type ReportItemInsert = z.infer<typeof reportItemInsertSchema>;
export type ReportPaymentInsert = z.infer<typeof reportPaymentInsertSchema>;
export type ReportPaymentUpdate = z.infer<typeof reportPaymentUpdateSchema>;
export type PartialPayment = z.infer<typeof partialPaymentSchema>;
export type Report = typeof reports.$inferSelect & {
  client?: Client;
  project?: ClientProject;
  items?: ReportItem[];
  payments?: ReportPayment[];
};
export type ReportItem = typeof reportItems.$inferSelect & {
  report?: Report;
};
export type ReportPayment = typeof reportPayments.$inferSelect & {
  report?: Report;
};
