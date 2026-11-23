import { eq } from "drizzle-orm";
import { db } from "@db";
import { webRequests } from "@shared/web-requests";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class WebRequestConversionError extends Error {}
export async function lockWebRequest(tx: Transaction, id: number | undefined, type: string) {
  if (id === undefined) return;
  const [request] = await tx.select().from(webRequests).where(eq(webRequests.id, id)).for("update");
  if (!request || request.type !== type || request.convertedId || request.status === "descartada") {
    throw new WebRequestConversionError("La solicitud no está disponible para convertir; actualiza la bandeja.");
  }
}
export async function finishWebRequest(tx: Transaction, id: number | undefined, recordId: number, folio: string) {
  if (id === undefined) return;
  await tx.update(webRequests).set({
    status: "convertida", convertedId: recordId, convertedFolio: folio, updatedAt: new Date(),
  }).where(eq(webRequests.id, id));
}
