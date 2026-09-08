import { db } from "./index";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

// Set IVA rate as a constant (16%)
const IVA_RATE = 0.16;

async function seed() {
  try {
    console.log("Starting seed process...");

    // Check if we already have quotations
    const existingQuotations = await db.select().from(schema.quotations).limit(1);
    
    if (existingQuotations.length > 0) {
      console.log("Database already has quotations, skipping seed");
      return;
    }
    
    // Sample quotation data
    const sampleQuotation = {
      quotationNumber: 1001,
      clientName: "Constructora Modelo S.A. de C.V.",
      clientEmail: "contacto@constructoramodelo.com",
      projectName: "Edificio Comercial Centro",
      rentalPeriod: "30 días (01/06/2023 - 30/06/2023)",
      subtotal: 17900,
      iva: 17900 * IVA_RATE,
      total: 17900 * (1 + IVA_RATE),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Insert sample quotation
    const [quotation] = await db.insert(schema.quotations)
      .values(sampleQuotation)
      .returning();
    
    console.log(`Created sample quotation with ID: ${quotation.id}`);
    
    // Sample quotation items
    const sampleItems = [
      {
        quotationId: quotation.id,
        concept: "Excavadora XZ200",
        quantity: 5,
        unit: "Días",
        unitPrice: 2500,
        subtotal: 5 * 2500,
      },
      {
        quotationId: quotation.id,
        concept: "Martillo Hidráulico MH5",
        quantity: 3,
        unit: "Días",
        unitPrice: 1800,
        subtotal: 3 * 1800,
      },
    ];
    
    // Insert sample quotation items
    const insertedItems = await db.insert(schema.quotationItems)
      .values(sampleItems)
      .returning();
    
    console.log(`Created ${insertedItems.length} sample quotation items`);
    
    console.log("Seed completed successfully!");
  } catch (error) {
    console.error("Error during seed process:", error);
  }
}

seed();
