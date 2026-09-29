import { db, pool } from "@db";
import { 
  quotations, 
  quotationItems, 
  clients,
  clientProjects,
  concepts,
  repairs,
  repairItems,
  reports,
  reportItems,
  reportPayments,
  Quotation, 
  QuotationItem, 
  QuotationInsert, 
  QuotationItemInsert,
  Client,
  ClientInsert,
  ClientProject,
  ClientProjectInsert,
  Concept,
  ConceptInsert,
  Repair,
  RepairItem,
  RepairInsert,
  RepairItemInsert,
  Report,
  ReportItem,
  ReportInsert,
  ReportItemInsert
} from "@shared/schema";
import { eq, and, desc, like, ilike, or, sql, isNotNull, inArray } from "drizzle-orm";
import { resolveLiquidatedAt } from "./repair-liquidation";

export class MissingQuotationSalespersonError extends Error {
  constructor() {
    super("El vendedor es requerido para duplicar la cotización");
  }
}

function normalizeLineAmounts(quantityValue: unknown, unitPriceValue: unknown) {
  const quantityHundredths = Math.round(Number(quantityValue) * 100);
  const unitPriceCents = Math.round(Number(unitPriceValue) * 100);
  if (!Number.isFinite(quantityHundredths) || quantityHundredths <= 0) {
    throw new Error("La cantidad debe ser un número mayor a cero");
  }
  if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
    throw new Error("El precio unitario debe ser un número válido");
  }
  const subtotalCents = Math.round((quantityHundredths * unitPriceCents) / 100);
  return {
    quantity: (quantityHundredths / 100).toFixed(2),
    unitPrice: (unitPriceCents / 100).toFixed(2),
    subtotal: (subtotalCents / 100).toFixed(2),
    subtotalCents,
  };
}

export const storage = {
  // Get the next quotation number
  async getNextQuotationNumber(): Promise<number> {
    try {
      console.log("Buscando el siguiente número de cotización disponible...");
      
      // Vamos a usar SQL directo para hacer la consulta
      const { rows } = await pool.query('SELECT MAX(quotation_number) as max_number FROM quotations');
      
      // Handle null or undefined value from the database
      let maxNumber = rows[0]?.max_number;
      console.log(`Número máximo encontrado en la base de datos: ${maxNumber}`);
      
      if (maxNumber === null || maxNumber === undefined) {
        console.log("No se encontraron cotizaciones, comenzando desde 1001");
        return 1001; // Start from 1001 if no quotations exist
      }
      
      // Ensure it's a number (add 1 to the current max)
      const nextNumber = Number(maxNumber) + 1;
      console.log(`Siguiente número de cotización: ${nextNumber}`);
      return nextNumber;
    } catch (error) {
      console.error('Error in getNextQuotationNumber:', error);
      // Es mejor lanzar un error que retornar un valor posiblemente duplicado
      throw new Error("Error al obtener el siguiente número de cotización");
    }
  },

  // Get all quotations with pagination
  async getQuotations(page: number = 1, limit: number = 10): Promise<Quotation[]> {
    return db.query.quotations.findMany({
      orderBy: desc(quotations.createdAt),
      limit,
      offset: (page - 1) * limit,
    });
  },

  // Get a quotation by ID with its items
  async getQuotationById(id: number): Promise<Quotation | null> {
    const result = await db.query.quotations.findFirst({
      where: eq(quotations.id, id),
      with: {
        items: true
      }
    });
    return result || null;
  },

  // Get quotation by quotation number
  async getQuotationByNumber(quotationNumber: number): Promise<Quotation | null> {
    const result = await db.query.quotations.findFirst({
      where: eq(quotations.quotationNumber, quotationNumber),
      with: {
        items: true
      }
    });
    return result || null;
  },

  // Create a new quotation with items
  async createQuotation(quotationData: QuotationInsert, items: Omit<QuotationItemInsert, "quotationId">[]): Promise<Quotation> {
    // Begin transaction
    return db.transaction(async (tx) => {
      // Insert quotation
      const [insertedQuotation] = await tx.insert(quotations)
        .values(quotationData)
        .returning();

      // Insert quotation items
      if (items.length > 0) {
        await tx.insert(quotationItems).values(
          items.map(item => ({
            ...item,
            quotationId: insertedQuotation.id
          }))
        );
      }

      return insertedQuotation;
    });
  },

  // Copy a quotation and its items atomically, keeping the original untouched.
  async duplicateQuotation(id: number, salespersonOverride?: string): Promise<Quotation | null> {
    return db.transaction(async (tx) => {
      // Allocate the folio inside the write transaction. Concurrent duplications
      // must not read the same MAX value.
      await tx.execute(sql`LOCK TABLE quotations IN SHARE ROW EXCLUSIVE MODE`);
      const original = await tx.query.quotations.findFirst({
        where: eq(quotations.id, id),
        with: { items: true },
      });
      if (!original) return null;
      // Existing seller always wins; older quotations without one require an override.
      const salesperson = original.salesperson?.trim() || salespersonOverride?.trim();
      if (!salesperson) throw new MissingQuotationSalespersonError();
      const [number] = await tx.select({
        next: sql<number>`COALESCE(MAX(${quotations.quotationNumber}), 1000) + 1`,
      }).from(quotations);
      const [copy] = await tx.insert(quotations).values({
        quotationNumber: Number(number.next),
        clientId: original.clientId,
        projectId: original.projectId,
        clientName: original.clientName,
        clientEmail: original.clientEmail,
        projectName: original.projectName,
        rentalPeriod: original.rentalPeriod,
        salesperson,
        includeIVA: original.includeIVA,
        subtotal: original.subtotal,
        iva: original.iva,
        total: original.total,
      }).returning();
      const items = original.items.length
        ? await tx.insert(quotationItems).values(original.items.map(item => ({
            quotationId: copy.id,
            concept: item.concept,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          }))).returning()
        : [];

      // Preserve the exact client association, including clients without email.
      if (copy.clientId != null) {
        await tx.update(clients).set({
          totalQuotations: sql`${clients.totalQuotations} + 1`,
          totalAmount: sql`${clients.totalAmount} + ${copy.total}`,
          updatedAt: new Date(),
        }).where(eq(clients.id, copy.clientId));
        const project = copy.projectId != null
          ? eq(clientProjects.id, copy.projectId)
          : copy.projectName
            ? and(eq(clientProjects.clientId, copy.clientId), eq(clientProjects.name, copy.projectName))
            : undefined;
        if (project) {
          await tx.update(clientProjects).set({
            totalQuotations: sql`${clientProjects.totalQuotations} + 1`,
            totalAmount: sql`${clientProjects.totalAmount} + ${copy.total}`,
            updatedAt: new Date(),
          }).where(project);
        }
      }
      return { ...copy, items };
    });
  },

  // Update an existing quotation
  async updateQuotation(id: number, quotationData: Partial<QuotationInsert>): Promise<Quotation | null> {
    const [updatedQuotation] = await db.update(quotations)
      .set({ ...quotationData, updatedAt: new Date() })
      .where(eq(quotations.id, id))
      .returning();
    
    return updatedQuotation || null;
  },

  // Delete a quotation and its items
  async deleteQuotation(id: number): Promise<boolean> {
    const [deletedQuotation] = await db.delete(quotations)
      .where(eq(quotations.id, id))
      .returning();
    
    return !!deletedQuotation;
  },

  // Add an item to a quotation
  async addQuotationItem(quotationId: number, itemData: Omit<QuotationItemInsert, "quotationId">): Promise<QuotationItem> {
    const [insertedItem] = await db.insert(quotationItems)
      .values({ ...itemData, quotationId })
      .returning();
    
    return insertedItem;
  },

  // Update a quotation item
  async updateQuotationItem(id: number, itemData: Partial<Omit<QuotationItemInsert, "quotationId">>): Promise<QuotationItem | null> {
    const [updatedItem] = await db.update(quotationItems)
      .set(itemData)
      .where(eq(quotationItems.id, id))
      .returning();
    
    return updatedItem || null;
  },

  // Delete a quotation item
  async deleteQuotationItem(id: number): Promise<boolean> {
    const [deletedItem] = await db.delete(quotationItems)
      .where(eq(quotationItems.id, id))
      .returning();
    
    return !!deletedItem;
  },

  // Get items for a quotation
  async getQuotationItems(quotationId: number): Promise<QuotationItem[]> {
    return db.query.quotationItems.findMany({
      where: eq(quotationItems.quotationId, quotationId),
    });
  },

  // ================ Funciones para manejo de clientes ================

  // Obtener todos los clientes
  async getClients(page: number = 1, limit: number = 10, search?: string): Promise<Client[]> {
    const clientList = search
      ? await db.query.clients.findMany({
          where: or(
            ilike(clients.name, `%${search}%`),
            ilike(clients.email, `%${search}%`)
          ),
          orderBy: desc(clients.createdAt),
          limit,
          offset: (page - 1) * limit,
          with: { projects: true }
        })
      : await db.query.clients.findMany({
          orderBy: desc(clients.createdAt),
          limit,
          offset: (page - 1) * limit,
          with: { projects: true }
        });

    // Calcular conteo real y suma total de cotizaciones por cliente
    const quotationStats = await db
      .select({
        clientId: quotations.clientId,
        count: sql<number>`count(*)::int`,
        total: sql<string>`COALESCE(SUM(${quotations.total}), 0)::text`
      })
      .from(quotations)
      .groupBy(quotations.clientId);

    const countMap: Record<number, number> = {};
    const totalMap: Record<number, string> = {};
    for (const row of quotationStats) {
      if (row.clientId != null) {
        countMap[row.clientId] = row.count;
        totalMap[row.clientId] = row.total;
      }
    }

    return clientList.map((client: any) => ({
      ...client,
      totalQuotations: countMap[client.id] ?? 0,
      totalAmount: totalMap[client.id] ?? "0"
    })) as Client[];
  },

  // Obtener cliente por ID
  async getClientById(id: number): Promise<Client | null> {
    const result = await db.query.clients.findFirst({
      where: eq(clients.id, id),
      with: {
        projects: true,
        quotations: {
          with: {
            items: true,
          },
        },
      },
    });
    return result || null;
  },

  // Obtener cliente por correo electrónico
  async getClientByEmail(email: string | null | undefined): Promise<Client | null> {
    if (!email || email.trim() === "" || email === "N/A" || email === "n/a") return null;
    const result = await db.query.clients.findFirst({
      where: eq(clients.email, email),
    });
    return result || null;
  },

  async getClientByName(name: string): Promise<Client | null> {
    const result = await db.query.clients.findFirst({
      where: ilike(clients.name, name.trim()),
    });
    return result || null;
  },

  // Crear un nuevo cliente
  async createClient(clientData: ClientInsert): Promise<Client> {
    const [insertedClient] = await db.insert(clients)
      .values(clientData)
      .returning();
    
    return insertedClient;
  },

  // Actualizar un cliente existente
  async updateClient(id: number, clientData: Partial<ClientInsert>): Promise<Client | null> {
    const [updatedClient] = await db.update(clients)
      .set({ ...clientData, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    
    return updatedClient || null;
  },

  // Eliminar un cliente
  async deleteClient(id: number): Promise<boolean> {
    const [deletedClient] = await db.delete(clients)
      .where(eq(clients.id, id))
      .returning();
    
    return !!deletedClient;
  },

  // ================ Funciones para manejo de proyectos de clientes ================

  // Obtener todos los proyectos de un cliente
  async getClientProjects(clientId: number): Promise<ClientProject[]> {
    return db.query.clientProjects.findMany({
      where: eq(clientProjects.clientId, clientId),
      orderBy: desc(clientProjects.createdAt),
    });
  },

  // Obtener proyecto por ID
  async getClientProjectById(id: number): Promise<ClientProject | null> {
    const result = await db.query.clientProjects.findFirst({
      where: eq(clientProjects.id, id),
      with: {
        client: true,
        quotations: {
          with: {
            items: true,
          },
        },
      },
    });
    return result || null;
  },

  // Obtener proyecto con todas sus cotizaciones para la página de detalles
  async getProjectWithQuotations(id: number): Promise<any> {
    const project = await db.query.clientProjects.findFirst({
      where: eq(clientProjects.id, id),
      with: {
        client: true,
        quotations: {
          with: {
            items: true,
          },
          orderBy: desc(quotations.createdAt),
        },
      },
    });

    if (!project) {
      return null;
    }

    // Formatear los datos para el frontend
    return {
      id: project.id,
      name: project.name,
      clientId: project.clientId,
      clientName: project.client.name,
      createdAt: project.createdAt,
      totalQuotations: project.totalQuotations || 0,
      totalAmount: project.totalAmount || "0",
      quotations: project.quotations.map(quotation => ({
        id: quotation.id,
        quotationNumber: quotation.quotationNumber,
        clientName: quotation.clientName,
        projectName: quotation.projectName,
        totalAmount: quotation.total,
        iva: quotation.iva,
        grandTotal: quotation.total,
        createdAt: quotation.createdAt,
        items: quotation.items || []
      }))
    };
  },

  // Crear un nuevo proyecto para un cliente
  async createClientProject(projectData: ClientProjectInsert): Promise<ClientProject> {
    return db.transaction(async (tx) => {
      // Insertar el proyecto
      const [insertedProject] = await tx.insert(clientProjects)
        .values(projectData)
        .returning();
      
      // Actualizar el contador de proyectos del cliente
      await tx.update(clients)
        .set({
          totalProjects: sql`${clients.totalProjects} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, projectData.clientId));
      
      return insertedProject;
    });
  },

  // Actualizar un proyecto existente
  async updateClientProject(id: number, projectData: Partial<ClientProjectInsert>): Promise<ClientProject | null> {
    const [updatedProject] = await db.update(clientProjects)
      .set({ ...projectData, updatedAt: new Date() })
      .where(eq(clientProjects.id, id))
      .returning();
    
    return updatedProject || null;
  },

  // Eliminar un proyecto
  async deleteClientProject(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Primero obtener el proyecto para saber a qué cliente pertenece
      const project = await tx.query.clientProjects.findFirst({
        where: eq(clientProjects.id, id),
      });
      
      if (!project) return false;
      
      // Eliminar el proyecto
      const [deletedProject] = await tx.delete(clientProjects)
        .where(eq(clientProjects.id, id))
        .returning();
      
      if (deletedProject) {
        // Actualizar el contador de proyectos del cliente
        await tx.update(clients)
          .set({
            totalProjects: sql`${clients.totalProjects} - 1`,
            updatedAt: new Date(),
          })
          .where(eq(clients.id, project.clientId));
        
        return true;
      }
      
      return false;
    });
  },

  // Sincronizar los datos del cliente con sus cotizaciones y proyectos
  async syncClientData(clientId: number): Promise<Client | null> {
    return db.transaction(async (tx) => {
      // Calcular el total de cotizaciones
      const quotationsCountResult = await tx
        .select({ count: sql`COUNT(*)::int` })
        .from(quotations)
        .where(eq(quotations.clientId, clientId));
      
      const quotationsCount = quotationsCountResult[0]?.count || 0;
      
      // Calcular el monto total de todas las cotizaciones
      const totalAmountResult = await tx
        .select({ total: sql`COALESCE(SUM(${quotations.total}), '0')` })
        .from(quotations)
        .where(eq(quotations.clientId, clientId));
      
      const totalAmount = totalAmountResult[0]?.total || '0';
      
      // Actualizar los datos del cliente
      const [updatedClient] = await tx.update(clients)
        .set({
          totalQuotations: Number(quotationsCount),
          totalAmount: totalAmount as string,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, clientId))
        .returning();
      
      return updatedClient || null;
    });
  },
  
  // Sincronizar los datos de un proyecto con sus cotizaciones
  async syncProjectData(projectId: number): Promise<ClientProject | null> {
    return db.transaction(async (tx) => {
      // Calcular el total de cotizaciones
      const quotationsCountResult = await tx
        .select({ count: sql`COUNT(*)::int` })
        .from(quotations)
        .where(eq(quotations.projectId, projectId));
      
      const quotationsCount = quotationsCountResult[0]?.count || 0;
      
      // Calcular el monto total de todas las cotizaciones
      const totalAmountResult = await tx
        .select({ total: sql`COALESCE(SUM(${quotations.total}), '0')` })
        .from(quotations)
        .where(eq(quotations.projectId, projectId));
      
      const totalAmount = totalAmountResult[0]?.total || '0';
      
      // Actualizar los datos del proyecto
      const [updatedProject] = await tx.update(clientProjects)
        .set({
          totalQuotations: Number(quotationsCount),
          totalAmount: totalAmount as string,
          updatedAt: new Date(),
        })
        .where(eq(clientProjects.id, projectId))
        .returning();
      
      return updatedProject || null;
    });
  },

  // Función para intentar registrar/asociar un cliente a partir de una cotización
  async registerClientFromQuotation(quotation: Quotation): Promise<Client> {
    return db.transaction(async (tx) => {
      let client: Client | undefined = undefined;
      
      // 1. Si la cotización ya trae el ID del cliente (creada desde su ficha), usarlo directamente
      if (quotation.clientId) {
        client = await tx.query.clients.findFirst({
          where: eq(clients.id, quotation.clientId),
        });
      }
      
      // 2. Buscar por email, solo si es un email real (no vacío ni "N/A")
      const email = (quotation.clientEmail || "").trim();
      const hasRealEmail = email !== "" && email.toUpperCase() !== "N/A";
      if (!client && hasRealEmail) {
        client = await tx.query.clients.findFirst({
          where: eq(clients.email, email),
        });
      }
      
      // 3. Buscar por nombre exacto (ignorando mayúsculas y espacios extras)
      const name = (quotation.clientName || "").trim();
      if (!client && name) {
        client = await tx.query.clients.findFirst({
          where: sql`LOWER(TRIM(${clients.name})) = ${name.toLowerCase()}`,
        });
      }
      
      if (!client) {
        // Si no existe, crear un nuevo cliente
        const [newClient] = await tx.insert(clients)
          .values({
            name: name || quotation.clientName,
            email: hasRealEmail ? email : null,
            totalQuotations: 1,
            totalAmount: quotation.total,
          })
          .returning();
        
        client = newClient;
      } else {
        // Si existe, actualizar su información
        await tx.update(clients)
          .set({
            totalQuotations: sql`${clients.totalQuotations} + 1`,
            totalAmount: sql`${clients.totalAmount} + ${quotation.total}`,
            updatedAt: new Date(),
          })
          .where(eq(clients.id, client.id));
      }
      
      // Si hay un proyecto mencionado, crear o actualizar el proyecto
      if (quotation.projectName) {
        let project = await tx.query.clientProjects.findFirst({
          where: and(
            eq(clientProjects.clientId, client.id),
            eq(clientProjects.name, quotation.projectName)
          ),
        });
        
        if (!project) {
          // Si no existe el proyecto, crearlo
          await tx.insert(clientProjects)
            .values({
              clientId: client.id,
              name: quotation.projectName,
              totalQuotations: 1,
              totalAmount: quotation.total,
            });
        } else {
          // Si existe, actualizar sus datos
          await tx.update(clientProjects)
            .set({
              totalQuotations: sql`${clientProjects.totalQuotations} + 1`,
              totalAmount: sql`${clientProjects.totalAmount} + ${quotation.total}`,
              updatedAt: new Date(),
            })
            .where(eq(clientProjects.id, project.id));
        }
      }
      
      // Actualizar la cotización con el ID del cliente
      await tx.update(quotations)
        .set({
          clientId: client.id,
          updatedAt: new Date(),
        })
        .where(eq(quotations.id, quotation.id));
      
      return client;
    });
  },

  // ================ Funciones para manejo de conceptos ================

  // Obtener todos los conceptos
  async getAllConcepts(active?: boolean): Promise<Concept[]> {
    if (active !== undefined) {
      return db.query.concepts.findMany({
        where: eq(concepts.active, active),
        orderBy: concepts.name
      });
    }
    
    return db.query.concepts.findMany({
      orderBy: concepts.name
    });
  },

  // Buscar conceptos por nombre
  async searchConcepts(searchTerm: string, active: boolean = true): Promise<Concept[]> {
    if (active) {
      return db.query.concepts.findMany({
        where: and(
          like(concepts.name, `%${searchTerm}%`),
          eq(concepts.active, true)
        ),
        orderBy: concepts.name,
        limit: 10
      });
    }
    
    return db.query.concepts.findMany({
      where: like(concepts.name, `%${searchTerm}%`),
      orderBy: concepts.name,
      limit: 10
    });
  },

  // Obtener un concepto por ID
  async getConceptById(id: number): Promise<Concept | null> {
    const result = await db.query.concepts.findFirst({
      where: eq(concepts.id, id)
    });
    
    return result || null;
  },

  // Crear un nuevo concepto
  async createConcept(conceptData: ConceptInsert): Promise<Concept> {
    // Extraer solo los campos que existen en la tabla para evitar errores
    const cleanData = {
      name: conceptData.name,
      description: conceptData.description,
      defaultUnit: conceptData.defaultUnit,
      defaultPrice: conceptData.defaultPrice,
      active: conceptData.active === undefined ? true : conceptData.active
    };
    
    console.log("Storage: Insertando concepto con datos limpios:", cleanData);
    
    // Insertar directamente con SQL para evitar problemas con campos no existentes
    const [insertedConcept] = await db.insert(concepts)
      .values(cleanData)
      .returning();
    
    return insertedConcept;
  },

  // Actualizar un concepto existente
  async updateConcept(id: number, conceptData: Partial<ConceptInsert>): Promise<Concept | null> {
    const [updatedConcept] = await db.update(concepts)
      .set({ ...conceptData, updatedAt: new Date() })
      .where(eq(concepts.id, id))
      .returning();
    
    return updatedConcept || null;
  },

  // Cambiar el estado de activación de un concepto
  async toggleConceptStatus(id: number, active: boolean): Promise<Concept | null> {
    const [updatedConcept] = await db.update(concepts)
      .set({ 
        active,
        updatedAt: new Date() 
      })
      .where(eq(concepts.id, id))
      .returning();
    
    return updatedConcept || null;
  },

  // Eliminar un concepto
  async deleteConcept(id: number): Promise<boolean> {
    const [deletedConcept] = await db.delete(concepts)
      .where(eq(concepts.id, id))
      .returning();
    
    return !!deletedConcept;
  },

  // Normalizar nombre de concepto para detectar duplicados
  // (ignora mayúsculas/minúsculas, acentos y espacios extra)
  normalizeConceptName(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  },

  // Determinar la categoría de un concepto (general o reparación)
  // según el marcador [REPAIR] en la descripción
  conceptCategory(concept: { description: string | null }): "repair" | "general" {
    return concept.description && concept.description.trim().startsWith("[REPAIR]")
      ? "repair"
      : "general";
  },

  // Encontrar grupos de conceptos duplicados (mismo nombre normalizado,
  // comparando solo dentro del mismo catálogo: general o reparación)
  async findDuplicateConceptGroups(): Promise<Concept[][]> {
    const allConcepts = await db.query.concepts.findMany({
      orderBy: concepts.id
    });

    const groups = new Map<string, Concept[]>();
    for (const concept of allConcepts) {
      const normalizedName = this.normalizeConceptName(concept.name || "");
      if (!normalizedName) continue;
      const key = `${this.conceptCategory(concept)}|${normalizedName}`;
      const group = groups.get(key);
      if (group) {
        group.push(concept);
      } else {
        groups.set(key, [concept]);
      }
    }

    return Array.from(groups.values()).filter(group => group.length > 1);
  },

  // Buscar un concepto existente con el mismo nombre normalizado
  // (opcionalmente restringido a una categoría)
  async findConceptByNormalizedName(
    name: string,
    excludeId?: number,
    category?: "repair" | "general"
  ): Promise<Concept | null> {
    const key = this.normalizeConceptName(name || "");
    if (!key) return null;

    const allConcepts = await db.query.concepts.findMany();
    const match = allConcepts.find(concept =>
      concept.id !== excludeId &&
      this.normalizeConceptName(concept.name || "") === key &&
      (category === undefined || this.conceptCategory(concept) === category)
    );

    return match || null;
  },

  // Unir duplicados: conservar uno y eliminar el resto
  // (seguro: los documentos guardan el concepto como texto, no como referencia)
  async mergeConcepts(keepId: number, removeIds: number[]): Promise<number> {
    const idsToRemove = removeIds.filter(id => id !== keepId);
    if (idsToRemove.length === 0) return 0;

    const deleted = await db.delete(concepts)
      .where(inArray(concepts.id, idsToRemove))
      .returning();

    return deleted.length;
  },

  // Get the next repair number
  async getNextRepairNumber(): Promise<string> {
    try {
      const result = await db.execute(
        sql`SELECT COALESCE(MAX((SPLIT_PART(repair_number, '-', 2))::int), 0) AS max_num FROM repairs WHERE SPLIT_PART(repair_number, '-', 2) ~ '^[0-9]+$'`
      );
      const maxNumber = Number((result.rows?.[0] as any)?.max_num ?? 0);
      const nextNumber = maxNumber + 1;
      return `R-${nextNumber.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error("Error al obtener el siguiente número de reparación:", error);
      throw error;
    }
  },

  // Get all repairs (lightweight - excludes images for list performance)
  async getRepairs(page: number = 1, limit: number = 500): Promise<Repair[]> {
    try {
      const offset = (page - 1) * limit;
      const repairsData = await db.query.repairs.findMany({
        columns: {
          image1: false,
          image2: false,
          image3: false,
        },
        with: {
          client: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: desc(repairs.id),
        limit: limit,
        offset: offset,
      });
      return repairsData as Repair[];
    } catch (error) {
      console.error("Error al obtener reparaciones:", error);
      throw error;
    }
  },

  // Get repairs for a specific client (lightweight - no images)
  async getRepairsByClientId(clientId: number): Promise<Repair[]> {
    try {
      const repairsData = await db.query.repairs.findMany({
        where: eq(repairs.clientId, clientId),
        columns: {
          image1: false,
          image2: false,
          image3: false,
        },
        orderBy: desc(repairs.id),
      });
      return repairsData as Repair[];
    } catch (error) {
      console.error(`Error al obtener reparaciones del cliente ${clientId}:`, error);
      throw error;
    }
  },

  // Get repair by ID
  async getRepairById(id: number): Promise<Repair | null> {
    try {
      const repairData = await db.query.repairs.findFirst({
        where: eq(repairs.id, id),
        with: {
          client: true,
          items: true,
        },
      });
      return (repairData as Repair) || null;
    } catch (error) {
      console.error(`Error al obtener la reparación con ID ${id}:`, error);
      throw error;
    }
  },

  // Get repair by repair number
  async getRepairByNumber(repairNumber: string): Promise<Repair | null> {
    try {
      const repairData = await db.query.repairs.findFirst({
        where: eq(repairs.repairNumber, repairNumber),
        with: {
          client: true,
          items: true,
        },
      });
      return (repairData as Repair) || null;
    } catch (error) {
      console.error(`Error al obtener la reparación con número ${repairNumber}:`, error);
      throw error;
    }
  },

  // Create repair
  async createRepair(
    repairData: RepairInsert,
    items: Omit<RepairItemInsert, "repairId">[],
    clientIdentity?: { name: string; email: string | null }
  ): Promise<Repair> {
    const createdRepair = await db.transaction(async (tx) => {
      try {
        let clientId = repairData.clientId;
        if (clientIdentity) {
          const name = clientIdentity.name.trim();
          const email = clientIdentity.email?.trim() || null;
          let client = await tx.query.clients.findFirst({
            where: sql`LOWER(TRIM(${clients.name})) = ${name.toLowerCase()}`,
          });
          if (!client && email) {
            client = await tx.query.clients.findFirst({
              where: eq(clients.email, email),
            });
          }
          if (!client) {
            [client] = await tx.insert(clients).values({
              name,
              email,
              totalProjects: 0,
              totalQuotations: 0,
              totalAmount: "0",
            }).returning();
          } else if (email && (!client.email || client.email.toUpperCase() === "N/A")) {
            [client] = await tx.update(clients)
              .set({ email, updatedAt: new Date() })
              .where(eq(clients.id, client.id))
              .returning();
          }
          clientId = client.id;
        }

        const itemValues = items.map(item => {
          const normalized = normalizeLineAmounts(item.quantity, item.unitPrice);
          return {
            ...item,
            quantity: normalized.quantity,
            unitPrice: normalized.unitPrice,
            subtotal: normalized.subtotal,
          };
        });
        const subtotalCents = itemValues.reduce(
          (sum, item) => sum + Math.round(Number(item.subtotal) * 100),
          0
        );
        const ivaCents = repairData.includeIVA ? Math.round(subtotalCents * 0.16) : 0;

        // Insertamos la reparación
        const [newRepair] = await tx.insert(repairs).values({
          ...repairData,
          liquidatedAt: resolveLiquidatedAt(null, null, repairData.paymentStatus ?? "No Pagada"),
          clientId,
          subtotal: (subtotalCents / 100).toFixed(2),
          iva: (ivaCents / 100).toFixed(2),
          total: ((subtotalCents + ivaCents) / 100).toFixed(2),
        }).returning();
        
        // Insertamos los items de la reparación
        if (itemValues.length > 0) {
          const itemsWithRepairId = itemValues.map(item => ({
            ...item,
            repairId: newRepair.id,
          }));
          await tx.insert(repairItems).values(itemsWithRepairId);
        }

        return newRepair;
      } catch (error) {
        console.error("Error al crear la reparación:", error);
        throw error;
      }
    });
    
    // Obtenemos la reparación completa con los items
    return this.getRepairById(createdRepair.id) as Promise<Repair>;
  },

  // Reemplaza cabecera e items como una sola operación. Los totales siempre se
  // derivan de los items validados y el vínculo de cliente se resuelve dentro
  // de la misma transacción.
  async replaceRepair(
    id: number,
    repairData: Partial<RepairInsert>,
    items: Omit<RepairItemInsert, "repairId">[],
    clientIdentity?: { name: string; email: string | null }
  ): Promise<Repair | null> {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM repairs WHERE id = ${id} FOR UPDATE`);
      const existing = await tx.query.repairs.findFirst({ where: eq(repairs.id, id) });
      if (!existing) return null;

      let clientId = repairData.clientId ?? existing.clientId;
      if (clientIdentity) {
        const name = clientIdentity.name.trim();
        const email = clientIdentity.email?.trim() || null;
        let client = clientId
          ? await tx.query.clients.findFirst({ where: eq(clients.id, clientId) })
          : undefined;
        if (!client || client.name.trim().toLowerCase() !== name.toLowerCase()) {
          client = await tx.query.clients.findFirst({
            where: sql`LOWER(TRIM(${clients.name})) = ${name.toLowerCase()}`,
          });
          if (!client && email) {
            client = await tx.query.clients.findFirst({ where: eq(clients.email, email) });
          }
        }
        if (!client) {
          [client] = await tx.insert(clients).values({
            name,
            email,
            totalProjects: 0,
            totalQuotations: 0,
            totalAmount: "0",
          }).returning();
        } else if (email && (!client.email || client.email.toUpperCase() === "N/A")) {
          [client] = await tx.update(clients)
            .set({ email, updatedAt: new Date() })
            .where(eq(clients.id, client.id))
            .returning();
        }
        clientId = client.id;
      }

      const itemValues = items.map(item => {
        const normalized = normalizeLineAmounts(item.quantity, item.unitPrice);
        return {
          ...item,
          quantity: normalized.quantity,
          unitPrice: normalized.unitPrice,
          subtotal: normalized.subtotal,
          repairId: id,
        };
      });
      const subtotalCents = itemValues.reduce(
        (sum, item) => sum + Math.round(Number(item.subtotal) * 100),
        0
      );
      const includeIVA = repairData.includeIVA ?? existing.includeIVA;
      const ivaCents = includeIVA ? Math.round(subtotalCents * 0.16) : 0;

      const [header] = await tx.update(repairs).set({
        ...repairData,
        liquidatedAt: resolveLiquidatedAt(
          existing.paymentStatus, existing.liquidatedAt,
          repairData.paymentStatus ?? existing.paymentStatus,
        ),
        clientId,
        includeIVA,
        subtotal: (subtotalCents / 100).toFixed(2),
        iva: (ivaCents / 100).toFixed(2),
        total: ((subtotalCents + ivaCents) / 100).toFixed(2),
        updatedAt: new Date(),
      }).where(eq(repairs.id, id)).returning();

      await tx.delete(repairItems).where(eq(repairItems.repairId, id));
      if (itemValues.length > 0) await tx.insert(repairItems).values(itemValues);
      return header;
    });
    return updated ? this.getRepairById(id) : null;
  },

  // Update repair
  async updateRepair(id: number, repairData: Partial<RepairInsert>): Promise<Repair | null> {
    const client = await db.transaction(async (tx) => {
      try {
        await tx.execute(sql`SELECT id FROM repairs WHERE id = ${id} FOR UPDATE`);
        // Verificamos que exista la reparación
        const existingRepair = await tx.query.repairs.findFirst({
          where: eq(repairs.id, id),
        });
        
        if (!existingRepair) {
          return null;
        }
        
        // Actualizamos la reparación
        const [updatedRepair] = await tx.update(repairs)
          .set({
            ...repairData,
            liquidatedAt: resolveLiquidatedAt(
              existingRepair.paymentStatus, existingRepair.liquidatedAt,
              repairData.paymentStatus ?? existingRepair.paymentStatus,
              repairData.liquidatedAt === null ? undefined : repairData.liquidatedAt,
            ),
          })
          .where(eq(repairs.id, id))
          .returning();
        
        // Si hay cliente asociado, actualizamos las estadísticas del cliente
        if (repairData.clientId || existingRepair.clientId) {
          const clientId = repairData.clientId || existingRepair.clientId;
          if (clientId) {
            await this.syncClientData(clientId);
          }
        }
        
        return updatedRepair;
      } catch (error) {
        console.error(`Error al actualizar la reparación con ID ${id}:`, error);
        throw error;
      }
    });
    
    if (!client) {
      return null;
    }
    
    // Obtenemos la reparación completa con los items
    return this.getRepairById(client.id);
  },

  // Delete repair
  async deleteRepair(id: number): Promise<boolean> {
    const success = await db.transaction(async (tx) => {
      try {
        // Verificamos que exista la reparación
        const existingRepair = await tx.query.repairs.findFirst({
          where: eq(repairs.id, id),
        });
        
        if (!existingRepair) {
          return false;
        }
        
        // Eliminamos los items de la reparación
        await tx.delete(repairItems).where(eq(repairItems.repairId, id));
        
        // Eliminamos la reparación
        await tx.delete(repairs).where(eq(repairs.id, id));
        
        // Si hay cliente asociado, actualizamos las estadísticas del cliente
        if (existingRepair.clientId) {
          await this.syncClientData(existingRepair.clientId);
        }
        
        return true;
      } catch (error) {
        console.error(`Error al eliminar la reparación con ID ${id}:`, error);
        throw error;
      }
    });
    
    return success;
  },

  // Add repair item
  async addRepairItem(repairId: number, itemData: Omit<RepairItemInsert, "repairId">): Promise<RepairItem> {
    const client = await db.transaction(async (tx) => {
      try {
        // Insertamos el item
        const [newItem] = await tx.insert(repairItems)
          .values({
            ...itemData,
            repairId,
          })
          .returning();
        
        // Actualizamos los totales de la reparación
        await this.updateRepairTotals(repairId);
        
        return newItem;
      } catch (error) {
        console.error(`Error al agregar item a la reparación con ID ${repairId}:`, error);
        throw error;
      }
    });
    
    return client;
  },

  // Update repair item
  async updateRepairItem(id: number, itemData: Partial<Omit<RepairItemInsert, "repairId">>): Promise<RepairItem | null> {
    const client = await db.transaction(async (tx) => {
      try {
        // Verificamos que exista el item
        const existingItem = await tx.query.repairItems.findFirst({
          where: eq(repairItems.id, id),
        });
        
        if (!existingItem) {
          return null;
        }
        
        // Actualizamos el item
        const [updatedItem] = await tx.update(repairItems)
          .set(itemData)
          .where(eq(repairItems.id, id))
          .returning();
        
        // Actualizamos los totales de la reparación
        await this.updateRepairTotals(existingItem.repairId);
        
        return updatedItem;
      } catch (error) {
        console.error(`Error al actualizar item con ID ${id}:`, error);
        throw error;
      }
    });
    
    return client;
  },

  // Delete repair item
  async deleteRepairItem(id: number): Promise<boolean> {
    const success = await db.transaction(async (tx) => {
      try {
        // Verificamos que exista el item
        const existingItem = await tx.query.repairItems.findFirst({
          where: eq(repairItems.id, id),
        });
        
        if (!existingItem) {
          return false;
        }
        
        // Eliminamos el item
        await tx.delete(repairItems).where(eq(repairItems.id, id));
        
        // Actualizamos los totales de la reparación
        await this.updateRepairTotals(existingItem.repairId);
        
        return true;
      } catch (error) {
        console.error(`Error al eliminar item con ID ${id}:`, error);
        throw error;
      }
    });
    
    return success;
  },

  // Get repair items
  async getRepairItems(repairId: number): Promise<RepairItem[]> {
    try {
      const itemsData = await db.query.repairItems.findMany({
        where: eq(repairItems.repairId, repairId),
        orderBy: repairItems.id,
      });
      return itemsData;
    } catch (error) {
      console.error(`Error al obtener items de la reparación con ID ${repairId}:`, error);
      throw error;
    }
  },

  // Get repair items for multiple repairs in one query (avoids N+1)
  async getRepairItemsByRepairIds(repairIds: number[]): Promise<RepairItem[]> {
    try {
      if (!repairIds.length) return [];
      const itemsData = await db.query.repairItems.findMany({
        where: inArray(repairItems.repairId, repairIds),
        orderBy: repairItems.id,
      });
      return itemsData;
    } catch (error) {
      console.error("Error al obtener items de múltiples reparaciones:", error);
      throw error;
    }
  },

  // Update repair totals
  async updateRepairTotals(repairId: number): Promise<void> {
    try {
      // Obtenemos la reparación
      const repairData = await db.query.repairs.findFirst({
        where: eq(repairs.id, repairId),
      });
      
      if (!repairData) {
        throw new Error(`No se encontró la reparación con ID ${repairId}`);
      }
      
      // Obtenemos los items de la reparación
      const items = await db.query.repairItems.findMany({
        where: eq(repairItems.repairId, repairId),
      });
      
      // Calculamos el subtotal
      const subtotal = items.reduce((sum, item) => {
        return sum + parseFloat(item.subtotal.toString());
      }, 0);
      
      // Calculamos el IVA y total
      let iva = 0;
      let total = subtotal;
      
      if (repairData.includeIVA) {
        iva = subtotal * 0.16;
        total = subtotal + iva;
      }
      
      // Actualizamos la reparación
      await db.update(repairs)
        .set({
          subtotal: subtotal.toFixed(2),
          iva: iva.toFixed(2),
          total: total.toFixed(2),
        })
        .where(eq(repairs.id, repairId));
    } catch (error) {
      console.error(`Error al actualizar totales de la reparación con ID ${repairId}:`, error);
      throw error;
    }
  },

  // Get client reports with totals
  async getClientReports(): Promise<any[]> {
    try {
      // Obtener todas las cotizaciones agrupadas por cliente
      const result = await db
        .select({
          clientId: quotations.clientId,
          clientName: quotations.clientName,
          clientEmail: quotations.clientEmail,
          quotationTotal: quotations.total,
          createdAt: quotations.createdAt
        })
        .from(quotations)
        .where(sql`${quotations.clientId} IS NOT NULL`);

      // Agrupar por cliente y calcular métricas
      const clientReportsMap = new Map();
      
      result.forEach((quotation) => {
        const clientId = quotation.clientId;
        const total = Number(quotation.quotationTotal) || 0;
        
        if (clientReportsMap.has(clientId)) {
          const existing = clientReportsMap.get(clientId);
          existing.totalQuotations += 1;
          existing.totalAmount += total;
          
          // Actualizar fecha más reciente
          if (new Date(quotation.createdAt) > new Date(existing.lastQuotationDate)) {
            existing.lastQuotationDate = quotation.createdAt;
          }
        } else {
          clientReportsMap.set(clientId, {
            clientId: quotation.clientId,
            clientName: quotation.clientName,
            clientEmail: quotation.clientEmail,
            totalQuotations: 1,
            totalAmount: total,
            lastQuotationDate: quotation.createdAt,
            averageQuotationValue: total
          });
        }
      });

      // Calcular promedio y convertir a array
      const clientReports = Array.from(clientReportsMap.values()).map(report => ({
        ...report,
        averageQuotationValue: report.totalAmount / report.totalQuotations
      }));

      // Ordenar por monto total descendente
      return clientReports.sort((a, b) => b.totalAmount - a.totalAmount);
    } catch (error) {
      console.error('Error getting client reports:', error);
      throw new Error('Error obteniendo reportes de clientes');
    }
  },

  // ================ Funciones para reportes ================

  // Obtener el siguiente número de reporte
  async getNextReportNumber(): Promise<string> {
    try {
      console.log("Buscando el siguiente número de reporte disponible...");
      
      const { rows } = await pool.query('SELECT MAX(CAST(SUBSTRING(report_number FROM 5) AS INTEGER)) as max_number FROM reports WHERE report_number LIKE \'REP-%\'');
      
      let maxNumber = rows[0]?.max_number;
      console.log(`Número máximo encontrado en la base de datos: ${maxNumber}`);
      
      if (maxNumber === null || maxNumber === undefined) {
        console.log("No se encontraron reportes, comenzando desde REP-1001");
        return "REP-1001";
      }
      
      const nextNumber = Number(maxNumber) + 1;
      const reportNumber = `REP-${nextNumber}`;
      console.log(`Siguiente número de reporte: ${reportNumber}`);
      return reportNumber;
    } catch (error) {
      console.error('Error in getNextReportNumber:', error);
      throw new Error("Error al obtener el siguiente número de reporte");
    }
  },

  // Obtener el siguiente número de folio
  async getNextFolioNumber(): Promise<string> {
    try {
      console.log("Buscando el siguiente número de folio disponible...");
      
      // Filtrar solo folios que sean numéricos válidos (ignorar FOL-U1 y otros mal formados)
      const { rows } = await pool.query(`
        SELECT MAX(CAST(SUBSTRING(folio_reporte FROM 5) AS INTEGER)) as max_number 
        FROM reports 
        WHERE folio_reporte LIKE 'FOL-%' 
        AND SUBSTRING(folio_reporte FROM 5) ~ '^[0-9]+$'
      `);
      
      let maxNumber = rows[0]?.max_number;
      console.log(`Número máximo de folio encontrado en la base de datos: ${maxNumber}`);
      
      if (maxNumber === null || maxNumber === undefined) {
        console.log("No se encontraron folios numéricos válidos, comenzando desde FOL-001");
        return "FOL-001";
      }
      
      const nextNumber = Number(maxNumber) + 1;
      const folioNumber = `FOL-${nextNumber.toString().padStart(3, '0')}`;
      console.log(`Siguiente número de folio: ${folioNumber}`);
      return folioNumber;
    } catch (error) {
      console.error('Error in getNextFolioNumber:', error);
      throw new Error("Error al obtener el siguiente número de folio");
    }
  },

  // Obtener todos los reportes con paginación
  async getReports(page: number = 1, limit: number = 10): Promise<Report[]> {
    return db.query.reports.findMany({
      orderBy: desc(reports.createdAt),
      limit,
      offset: (page - 1) * limit,
      with: {
        client: true,
        project: true,
        items: true
      }
    });
  },

  // Obtener un reporte por ID con sus items y abonos/pagos
  async getReportById(id: number): Promise<Report | null> {
    const result = await db.query.reports.findFirst({
      where: eq(reports.id, id),
      with: {
        client: true,
        project: true,
        items: true,
        payments: true
      }
    });
    return result || null;
  },

  // Crear un nuevo reporte
  async createReport(
    reportData: Omit<ReportInsert, 'id' | 'createdAt' | 'updatedAt'>,
    items: Omit<ReportItemInsert, 'id' | 'createdAt' | 'reportId'>[] = []
  ): Promise<Report> {
    return db.transaction(async (tx) => {
      const [newReport] = await tx.insert(reports).values({
        ...reportData,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      let insertedItems: ReportItem[] = [];
      if (items.length > 0) {
        insertedItems = await tx.insert(reportItems).values(
          items.map(item => ({ ...item, reportId: newReport.id, createdAt: new Date() }))
        ).returning();
      }
      return { ...newReport, items: insertedItems } as Report;
    });
  },

  // Crear un item de reporte
  async createReportItem(itemData: Omit<ReportItemInsert, 'id' | 'createdAt'>): Promise<ReportItem> {
    const [newItem] = await db.insert(reportItems).values({
      ...itemData,
      createdAt: new Date()
    }).returning();
    
    return newItem as ReportItem;
  },

  // Actualizar un reporte
  async updateReport(id: number, reportData: Partial<ReportInsert>): Promise<Report | null> {
    const [updatedReport] = await db.update(reports)
      .set({
        ...reportData,
        updatedAt: new Date()
      })
      .where(eq(reports.id, id))
      .returning();
    
    return updatedReport as Report || null;
  },

  // Eliminar un reporte
  async deleteReport(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      // El esquema declara CASCADE para ambas tablas; los deletes explícitos
      // mantienen el comportamiento seguro en bases antiguas sin esa regla.
      await tx.delete(reportPayments).where(eq(reportPayments.reportId, id));
      await tx.delete(reportItems).where(eq(reportItems.reportId, id));
      const deleted = await tx.delete(reports).where(eq(reports.id, id)).returning({ id: reports.id });
      return deleted.length === 1;
    });
  },

  // Eliminar todos los items de un reporte
  async deleteReportItems(reportId: number): Promise<boolean> {
    try {
      await db.delete(reportItems).where(eq(reportItems.reportId, reportId));
      return true;
    } catch (error) {
      console.error(`Error deleting report items for report ${reportId}:`, error);
      return false;
    }
  },

  // Obtener items de un reporte
  async getReportItems(reportId: number): Promise<ReportItem[]> {
    try {
      const itemsData = await db.query.reportItems.findMany({
        where: eq(reportItems.reportId, reportId),
        orderBy: reportItems.id,
      });
      return itemsData;
    } catch (error) {
      console.error(`Error al obtener items del reporte con ID ${reportId}:`, error);
      throw error;
    }
  },

  // Obtener reportes por ID de cliente
  async getReportsByClientId(clientId: number): Promise<Report[]> {
    try {
      const clientReports = await db.query.reports.findMany({
        where: eq(reports.clientId, clientId),
        orderBy: desc(reports.createdAt),
        with: {
          items: true
        }
      });
      return clientReports;
    } catch (error) {
      console.error(`Error al obtener reportes del cliente con ID ${clientId}:`, error);
      throw error;
    }
  },

  // Obtener todos los reportes para cálculos de totales
  async getAllReportsForTotals(): Promise<{ total: string }[]> {
    try {
      const allReports = await db.query.reports.findMany({
        columns: {
          total: true
        }
      });
      return allReports;
    } catch (error) {
      console.error('Error al obtener totales de reportes:', error);
      throw error;
    }
  },

  // Obtener abonos/pagos de un reporte
  async getReportPayments(reportId: number): Promise<any[]> {
    try {
      const payments = await db.query.reportPayments.findMany({
        where: eq(reportPayments.reportId, reportId),
        orderBy: desc(reportPayments.paymentDate)
      });
      return payments;
    } catch (error) {
      console.error(`Error al obtener abonos del reporte con ID ${reportId}:`, error);
      throw error;
    }
  },

  // Crear un nuevo abono/pago para un reporte
  async createReportPayment(paymentData: any): Promise<any> {
    try {
      const [newPayment] = await db.insert(reportPayments).values({
        ...paymentData,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      return newPayment;
    } catch (error) {
      console.error('Error al crear abono:', error);
      throw error;
    }
  },

  // Eliminar un abono/pago
  async deleteReportPayment(paymentId: number): Promise<boolean> {
    try {
      await db.delete(reportPayments).where(eq(reportPayments.id, paymentId));
      return true;
    } catch (error) {
      console.error(`Error al eliminar abono con ID ${paymentId}:`, error);
      return false;
    }
  },

  // ================ FUNCIONES OPTIMIZADAS PARA RENDIMIENTO ================

  // Obtener cliente por ID OPTIMIZADO (sin cargar items de cotizaciones)
  async getClientByIdOptimized(id: number): Promise<Client | null> {
    const result = await db.query.clients.findFirst({
      where: eq(clients.id, id),
      with: {
        projects: true,
      },
    });
    return result || null;
  },

  // Obtener reportes por cliente con items y pagos en UNA SOLA query
  async getReportsByClientIdWithDetails(clientId: number): Promise<any[]> {
    try {
      const clientReports = await db.query.reports.findMany({
        where: eq(reports.clientId, clientId),
        orderBy: desc(reports.createdAt),
        with: {
          items: true,
          payments: true
        }
      });
      return clientReports;
    } catch (error) {
      console.error(`Error al obtener reportes del cliente con ID ${clientId}:`, error);
      throw error;
    }
  },
};
