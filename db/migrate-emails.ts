/**
 * One-time data migration script: limpia correos vacíos o "N/A" de la tabla de clientes.
 * Ejecutar UNA SOLA VEZ con: npx tsx db/migrate-emails.ts
 */
import { db } from "./index";
import { clients } from "../shared/schema";
import { eq } from "drizzle-orm";

async function migrateEmails() {
  console.log("Iniciando migración de correos...");

  try {
    const r1 = await db.update(clients).set({ email: null }).where(eq(clients.email, "")).returning({ id: clients.id });
    console.log(`Correos vacíos ("") actualizados: ${r1.length}`);

    const r2 = await db.update(clients).set({ email: null }).where(eq(clients.email, "N/A")).returning({ id: clients.id });
    console.log(`Correos "N/A" actualizados: ${r2.length}`);

    const r3 = await db.update(clients).set({ email: null }).where(eq(clients.email, "n/a")).returning({ id: clients.id });
    console.log(`Correos "n/a" actualizados: ${r3.length}`);

    console.log("Migración completada exitosamente.");
  } catch (error) {
    console.error("Error durante la migración:", error);
    process.exit(1);
  }

  process.exit(0);
}

migrateEmails();
