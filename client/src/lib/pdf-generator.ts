import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Quotation, QuotationItem, Repair, RepairItem } from "@shared/schema";
import { formatCurrency, saveDataURIPDF } from "./utils";
import { addPezaLogo } from "./logo-base64";
import { addSocialIconsToPDF } from "./pdf-social-icons";
import { authenticatedFetch } from "./queryClient";

/**
 * Loads an image source (URL or base64 data URI) and returns a base64 data URI.
 * jsPDF requires base64 data — plain URLs are not supported.
 */
async function resolveImageToBase64(src: string): Promise<string | null> {
  if (!src) return null;

  // Already a data URI — return as-is
  if (src.startsWith('data:')) return src;

  // It's a URL — fetch and convert to base64
  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Add signature section to PDF page
 */
function addSignatureSection(doc: jsPDF) {
  const pageHeight = doc.internal.pageSize.height;
  const signatureY = pageHeight - 26;
  
  // Add "Dirección General" label above line
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Dirección General", 105, signatureY - 3, { align: "center" });
  
  // Draw signature line
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(70, signatureY, 140, signatureY);
}

/**
 * Agrega iconos de redes sociales al PDF
 */
function addSocialIcons(doc: jsPDF, y: number) {
  // Configuración
  const baseX = 180;
  const iconSize = 4;
  const spacing = 10;

  // Dibujar icono de Facebook
  doc.setFillColor(255, 204, 0); // Amarillo
  doc.circle(baseX, y - 2, iconSize, "F");
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.circle(baseX, y - 2, iconSize, "S");
  doc.setFontSize(6);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("F", baseX, y - 0.5, { align: "center" });

  // Dibujar icono de Instagram
  doc.setFillColor(255, 204, 0);
  doc.circle(baseX - spacing, y - 2, iconSize, "F");
  doc.setDrawColor(0);
  doc.circle(baseX - spacing, y - 2, iconSize, "S");
  doc.text("I", baseX - spacing, y - 0.5, { align: "center" });

  // Dibujar icono de TikTok
  doc.setFillColor(255, 204, 0);
  doc.circle(baseX - spacing * 2, y - 2, iconSize, "F");
  doc.setDrawColor(0);
  doc.circle(baseX - spacing * 2, y - 2, iconSize, "S");
  doc.text("T", baseX - spacing * 2, y - 0.5, { align: "center" });

  // Restaurar configuración original
  doc.setTextColor(150);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
}

/**
 * Helper function to add social media icons to PDF
 */
function addSocialMediaIcons(doc: jsPDF, yPosition: number) {
  // Posición base para los iconos (alineado a la derecha)
  const baseX = 180;
  const iconsY = yPosition;
  const iconSize = 4; // tamaño del círculo
  const spacing = 10; // espacio entre iconos

  // Función para dibujar un icono circular
  const drawSocialIcon = (x: number, initial: string) => {
    // Dibujar círculo amarillo
    doc.setFillColor(255, 204, 0); // Amarillo
    doc.circle(x, iconsY - 2, iconSize, "F");

    // Dibujar borde del círculo
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.circle(x, iconsY - 2, iconSize, "S");

    // Agregar inicial en negro
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(initial, x, iconsY - 0.5, { align: "center" });

    // Restaurar color de texto
    doc.setTextColor(150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  // Dibujar iconos de redes sociales
  drawSocialIcon(baseX, "f"); // Facebook - https://www.facebook.com/pezamaquinariaoficial/
  drawSocialIcon(baseX - spacing, "i"); // Instagram - https://www.instagram.com/pezamaquinaria.mx/
  drawSocialIcon(baseX - spacing * 2, "t"); // TikTok - https://www.tiktok.com/@pezamaquinariamx
}

/**
 * Generate a PDF for a quotation
 */
export async function generateQuotationPDF(
  quotation: Quotation,
  items: QuotationItem[],
): Promise<string> {
  // Create a new PDF document
  const doc = new jsPDF();
  const drawSocialIcons = (y: number) => {
    // Configuración
    const baseX = 180;
    const iconSize = 4;
    const spacing = 10;

    // Facebook
    doc.setFillColor(255, 204, 0); // Amarillo
    doc.circle(baseX, y - 2, iconSize, "F");
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.circle(baseX, y - 2, iconSize, "S");
    doc.setFontSize(6);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("F", baseX, y - 0.5, { align: "center" });

    // Instagram
    doc.setFillColor(255, 204, 0);
    doc.circle(baseX - spacing, y - 2, iconSize, "F");
    doc.setDrawColor(0);
    doc.circle(baseX - spacing, y - 2, iconSize, "S");
    doc.text("I", baseX - spacing, y - 0.5, { align: "center" });

    // TikTok
    doc.setFillColor(255, 204, 0);
    doc.circle(baseX - spacing * 2, y - 2, iconSize, "F");
    doc.setDrawColor(0);
    doc.circle(baseX - spacing * 2, y - 2, iconSize, "S");
    doc.text("T", baseX - spacing * 2, y - 0.5, { align: "center" });

    // Restaurar configuración
    doc.setTextColor(150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  // Agregar logo de Péza Maquinaria
  addPezaLogo(doc, 14, 10, 60, 20);

  // Título "COTIZACIÓN" en la parte superior derecha
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("COTIZACIÓN", 195, 15, { align: "right" });

  // Folio en la parte superior derecha
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const folioText = `Folio: COT-${quotation.quotationNumber.toString().padStart(4, "0")}`;
  doc.text(folioText, 195, 22, { align: "right" });

  // Fecha debajo del folio (parte superior derecha)
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const date = new Date(quotation.createdAt).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Fecha: ${date}`, 195, 29, { align: "right" });

  // Información de la dirección, RFC y web centrada
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("CALLE GRAL. CARLOS SALAZAR PTE. 1961, OBRERA,", 105, 40, {
    align: "center",
  });
  doc.text("64000 MONTERREY, N.L.", 105, 45, { align: "center" });
  doc.text("RFC: MCP180724A95", 105, 50, { align: "center" });
  doc.text("WWW.PEZAMAQUINARIA.COM.MX", 105, 55, { align: "center" });

  // Información del cliente (lado izquierdo)
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("CLIENTE:", 14, 70);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Nombre: ${quotation.clientName}`, 14, 77);
  doc.text(`Email: ${quotation.clientEmail?.trim() || "N/A"}`, 14, 83);

  let clientInfoY = 89;
  if (quotation.projectName) {
    doc.text(`Proyecto: ${quotation.projectName}`, 14, clientInfoY);
    clientInfoY += 6;
  }

  if (quotation.rentalPeriod) {
    doc.text(`Periodo de renta: ${quotation.rentalPeriod}`, 14, clientInfoY);
    clientInfoY += 6;
  }

  // Información de la empresa (lado derecho, misma altura que cliente)
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("EMPRESA:", 195, 70, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Péza Maquinaria", 195, 77, { align: "right" });
  doc.text("Renta y venta de maquinaria", 195, 83, { align: "right" });
  doc.text("Teléfono: (81) 1234-5678", 195, 89, { align: "right" });

  // Add items table
  doc.setFontSize(10);

  // Calculate starting Y position (adjusted for two-column layout)
  let startY = Math.max(clientInfoY, 95) + 10; // Espacio después de la mayor altura entre cliente y empresa

  autoTable(doc, {
    startY,
    head: [
      ["#", "Concepto", "Cantidad", "Unidad", "Precio Unitario", "Subtotal"],
    ],
    body: items.map((item, index) => [
      index + 1,
      item.concept || "",
      item.quantity.toString(),
      item.unit || "",
      formatCurrency(
        typeof item.unitPrice === "number"
          ? item.unitPrice
          : Number(item.unitPrice) || 0,
      ),
      formatCurrency(
        typeof item.subtotal === "number"
          ? item.subtotal
          : Number(item.subtotal) || 0,
      ),
    ]),
    foot: [
      [
        "",
        "",
        "",
        "",
        "Subtotal:",
        formatCurrency(
          typeof quotation.subtotal === "number"
            ? quotation.subtotal
            : Number(quotation.subtotal) || 0,
        ),
      ],
      [
        "",
        "",
        "",
        "",
        "IVA (16%):",
        formatCurrency(
          typeof quotation.iva === "number"
            ? quotation.iva
            : Number(quotation.iva) || 0,
        ),
      ],
      [
        "",
        "",
        "",
        "",
        "Total:",
        formatCurrency(
          typeof quotation.total === "number"
            ? quotation.total
            : Number(quotation.total) || 0,
        ),
      ],
    ],
    theme: "grid",
    styles: {
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [255, 193, 7],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    margin: { top: 10 },
    didParseCell: function (data) {
      // Total final resaltado en amarillo (estilo Estado de Cuenta)
      if (data.section === "foot") {
        const label = String((data.row.raw as any)?.[4] ?? "");
        if (label.startsWith("Total")) {
          data.cell.styles.fillColor = [255, 193, 7];
        }
      }
    },
  });

  // Add terms and conditions
  let termsY = (doc as any).lastAutoTable.finalY + 15;

  // Detect if there are many concepts or insufficient space
  const pageHeight = doc.internal.pageSize.height;
  const availableSpace = pageHeight - termsY - 40; // 40 for footer
  const requiredSpace = 80; // Estimated space for terms
  const itemCount = items.length;

  // If more than 7-8 concepts OR insufficient space, move to new page
  if (itemCount > 7 || availableSpace < requiredSpace) {
    doc.addPage();
    termsY = 20;
  }

  // Terms and conditions title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("TÉRMINOS Y CONDICIONES:", 14, termsY);

  // Terms with bullets
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const terms = [
    "Vigencia de cotización 15 días.",
    "La Renta de los equipos deberá pagarse por anticipado.",
    "Es obligación del cliente el suministro del combustible libre de purezas y/o recarga de batería según el equipo que lo requiera.",
    "Los equipos se entregan en óptimas condiciones mecánicas y estéticas.",
    "Se debe regresar el equipo limpio y sin material adherido para evitar un cargo extra por limpieza.",
    "Se realizará cargo al cliente en los siguientes casos:",
    "   • Robo o extravío del equipo.",
    "   • Pérdida de refacciones y/o accesorios propios del equipo.",
    "   • Daños ocasionados al equipo por mala operación o negligencia.",
  ];

  let currentY = termsY + 8;
  const lineHeight = 5;

  terms.forEach((term, index) => {
    // Check if we need a new page
    if (currentY > pageHeight - 30) {
      doc.addPage();
      currentY = 20;
    }

    if (index < 6) {
      // Main bullets
      doc.text("• " + term, 14, currentY);
    } else {
      // Sub-bullets (already include indentation in text)
      doc.text(term, 14, currentY);
    }

    currentY += lineHeight;
  });

  // Add footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" },
    );
  }

  // Generate the PDF as a data URL
  return doc.output("datauristring");
}

/**
 * Download a quotation as PDF
 */
export async function downloadQuotationPDF(
  quotationNumber: number,
): Promise<void> {
  try {
    // Fetch the quotation
    const quotationResponse = await authenticatedFetch(
      `/api/quotations/number/${quotationNumber}`,
    );
    if (!quotationResponse.ok) {
      throw new Error("Failed to fetch quotation");
    }

    // La API devuelve la cotización con los items incluidos
    const quotationData = await quotationResponse.json();

    // Extraer la cotización y los items
    const { items, ...quotation } = quotationData;

    // Generate the PDF
    const pdfDataUri = await generateQuotationPDF(quotation, items);

    // Create a link and trigger download
    const link = document.createElement("a");
    link.href = pdfDataUri;
    link.download = `Cotizacion_${quotationNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error downloading PDF:", error);

    // Proporcionar un mensaje más descriptivo según el tipo de error
    if (error instanceof Error) {
      if (error.message.includes("Failed to fetch quotation")) {
        throw new Error(
          "No se pudo encontrar la cotización. Verifique que exista.",
        );
      } else if (error.message.includes("Failed to fetch quotation items")) {
        throw new Error(
          "No se pudieron obtener los artículos de la cotización.",
        );
      }
    }

    // Error genérico si no es uno de los casos específicos anteriores
    throw new Error("Error al generar el PDF. Por favor intente nuevamente.");
  }
}

/**
 * Generate a PDF for a repair
 */
export async function generateRepairPDF(
  repair: Repair,
  items: RepairItem[],
): Promise<string> {
  // Create a new PDF document
  const doc = new jsPDF();

  // Calcular subtotal, IVA y total dinámicamente desde los items
  const calculatedSubtotal = items.reduce((sum, item) => {
    const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    const unitPrice = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
    return sum + ((quantity || 0) * (unitPrice || 0));
  }, 0);

  const calculatedIva = repair.includeIVA ? calculatedSubtotal * 0.16 : 0;
  const calculatedTotal = calculatedSubtotal + calculatedIva;

  // Agregar logo de Péza Maquinaria
  addPezaLogo(doc, 14, 10, 50, 15);

  // Título "REPARACIÓN" en la parte superior derecha
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("REPARACIÓN", 195, 15, { align: "right" });

  // Folio en la parte superior derecha
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const folioText = `Folio: ${repair.repairNumber}`;
  doc.text(folioText, 195, 22, { align: "right" });

  // Fecha debajo del folio (parte superior derecha) - usa Fecha de Elaboración si existe, si no usa Fecha de Recibido
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const dateSource = repair.elaborationDate || repair.receivedDate;
  const date = new Date(dateSource).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Fecha: ${date}`, 195, 29, { align: "right" });

  // Información de la dirección, RFC y web centrada
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("CALLE GRAL. CARLOS SALAZAR PTE. 1961, OBRERA,", 105, 40, {
    align: "center",
  });
  doc.text("64000 MONTERREY, N.L.", 105, 45, { align: "center" });
  doc.text("RFC: MCP180724A95", 105, 50, { align: "center" });
  doc.text("WWW.PEZAMAQUINARIA.COM.MX", 105, 55, { align: "center" });

  // Información del cliente (lado izquierdo) - COLUMNA IZQUIERDA
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("CLIENTE:", 14, 70);

  // Información de reparación (lado derecho) - COLUMNA DERECHA
  doc.text("INFORMACIÓN DE REPARACIÓN:", 110, 70);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  // Fila 1: Nombre: (izq) | Encargado: (der)
  const nombreLines = doc.splitTextToSize(`Nombre: ${repair.client?.name || "N/A"}`, 90);
  doc.text(nombreLines, 14, 77);
  if (repair.repairManager) {
    doc.text(`Encargado: ${repair.repairManager}`, 110, 77);
  }
  const nombreExtra = (nombreLines.length - 1) * 5;

  // Espaciado vertical compacto entre filas (antes 6, ahora 5)
  const rowGap = 5;

  // Fila 2: Equipo: (izq) | Fecha de recibido: (der)
  let leftY = 82 + nombreExtra;
  let rightY = 82 + nombreExtra;
  if (repair.equipment) {
    // Dividir texto largo de equipo en múltiples líneas (ancho máximo 85 para columna izquierda)
    const equipmentLines = doc.splitTextToSize(`Equipo: ${repair.equipment}`, 85);
    doc.text(equipmentLines, 14, leftY);
    leftY += equipmentLines.length * rowGap;
  } else {
    leftY += rowGap;
  }
  if (repair.receivedDate) {
    const receivedDate = new Date(repair.receivedDate).toLocaleDateString(
      "es-MX",
      { year: "numeric", month: "long", day: "numeric" },
    );
    doc.text(`Fecha de recibido: ${receivedDate}`, 110, rightY);
    rightY += rowGap;
  }
  if (repair.deliveryDate) {
    const deliveryDate = new Date(repair.deliveryDate).toLocaleDateString(
      "es-MX",
      { year: "numeric", month: "long", day: "numeric" },
    );
    doc.text(`Fecha de Entrega: ${deliveryDate}`, 110, rightY);
    rightY += rowGap;
  }

  // Fila 3: No. Serie: (izq) | Entregado por: (der)
  if (repair.serialNumber) {
    doc.text(`No. Serie: ${repair.serialNumber}`, 14, leftY);
  }
  if (repair.deliveredBy) {
    doc.text(`Entregado por: ${repair.deliveredBy}`, 110, rightY);
    rightY += rowGap;
  }
  leftY += rowGap;

  // Fila 4: Modelo: (izq) | Orden de Reparación: (der)
  let modelLines: string[] = [];
  if (repair.model) {
    // Max width ~90mm so it doesn't overlap with right column at x=110
    modelLines = doc.splitTextToSize(`Modelo: ${repair.model}`, 90);
    doc.text(modelLines, 14, leftY);
    leftY += modelLines.length * rowGap;
  } else {
    leftY += rowGap;
  }
  doc.text(`Orden de Reparación: ${repair.repairOrder || 'N/A'}`, 110, rightY);
  rightY += rowGap;

  // Y de continuación: el mayor de ambas columnas
  let clientInfoY = Math.max(leftY, rightY) - rowGap;

  let yPos = clientInfoY;
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 20;

  // Add observations BEFORE the items table
  let currentY = yPos + 12; // Add margin to separate from "Orden de Reparación:"
  if (repair.clientReport || repair.equipmentObservations) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVACIONES:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    let obsY = currentY + 7;

    if (repair.clientReport) {
      doc.text("Reporte del cliente:", 14, obsY);
      doc.setFont("helvetica", "italic");

      // Wrap text if longer than 150 characters
      const clientReportLines = doc.splitTextToSize(repair.clientReport, 180);
      doc.text(clientReportLines, 14, obsY + 7);

      obsY += 7 + clientReportLines.length * 5;
      doc.setFont("helvetica", "normal");
    }

    if (repair.equipmentObservations) {
      doc.text("Observaciones del equipo:", 14, obsY + 5);
      doc.setFont("helvetica", "italic");

      // Wrap text if longer than 150 characters
      const equipmentObsLines = doc.splitTextToSize(
        repair.equipmentObservations,
        180,
      );
      doc.text(equipmentObsLines, 14, obsY + 12);

      currentY = obsY + 12 + equipmentObsLines.length * 5;
      doc.setFont("helvetica", "normal");
    } else {
      currentY = obsY + 5;
    }
  }

  // Add items table AFTER observations
  yPos = currentY + 4;
  doc.setFontSize(9);

  // Tabla única con paginación automática: si no caben todos los conceptos,
  // autoTable continúa en la siguiente página (sin partir filas) y repetimos
  // el encabezado de REPARACIÓN con logo y folio en cada página nueva.
  const tableStartPage = doc.getNumberOfPages();
  autoTable(doc, {
    startY: yPos,
    head: [
      ["#", "Concepto", "Cantidad", "Unidad", "Precio Unitario", "Subtotal"],
    ],
    body: items.map((item, index) => [
      index + 1,
      item.concept || "",
      item.quantity.toString(),
      item.unit || "",
      formatCurrency(
        typeof item.unitPrice === "number"
          ? item.unitPrice
          : Number(item.unitPrice) || 0,
      ),
      formatCurrency(
        typeof item.subtotal === "number"
          ? item.subtotal
          : Number(item.subtotal) || 0,
      ),
    ]),
    theme: "grid",
    styles: {
      fontSize: 9,
      lineColor: [210, 210, 210],
      lineWidth: 0.15,
      cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
      textColor: [40, 40, 40],
      valign: "middle",
    },
    headStyles: {
      fillColor: [255, 193, 7],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
      lineColor: [230, 175, 0],
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 84, halign: "left" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 26, halign: "right" },
    },
    rowPageBreak: "avoid", // no partir una fila entre dos páginas
    // bottom: reservar espacio para la firma "Dirección General" y el pie de página
    margin: { top: 30, bottom: 45 },
    didDrawPage: function (data) {
      // Encabezado con logo y folio en las páginas de continuación de la tabla
      if (data.pageNumber > tableStartPage) {
        addPezaLogo(doc, 14, 10, 50, 15);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("REPARACIÓN", 195, 15, { align: "right" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Folio: ${repair.repairNumber}`, 195, 22, { align: "right" });
      }
    },
  });

  // RECUADRO DE TOTALES (estilo Estado de Cuenta / cotizaciones)
  // Si la tabla terminó muy abajo, pasar el recuadro completo a la siguiente
  // página para que nunca se parta.
  let totalsBoxY = (doc as any).lastAutoTable.finalY + 4;
  if (totalsBoxY > pageHeight - 60) {
    doc.addPage();
    addPezaLogo(doc, 14, 10, 50, 15);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REPARACIÓN", 195, 15, { align: "right" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Folio: ${repair.repairNumber}`, 195, 22, { align: "right" });
    totalsBoxY = 30;
  }
  autoTable(doc, {
    startY: totalsBoxY,
    pageBreak: "avoid",
    body: [
      ["Subtotal:", formatCurrency(calculatedSubtotal)],
      ["IVA (16%):", formatCurrency(calculatedIva)],
      ["Total:", formatCurrency(calculatedTotal)],
    ],
    theme: "grid",
    styles: {
      halign: "right",
      fontSize: 9,
      lineColor: [210, 210, 210],
      lineWidth: 0.15,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold", fillColor: [245, 245, 245], textColor: [70, 70, 70] },
      1: { cellWidth: 30, textColor: [40, 40, 40] },
    },
    margin: { left: 136 },
    didParseCell: function (data) {
      // Total final resaltado en amarillo (estilo Estado de Cuenta)
      const label = String((data.row.raw as any)?.[0] ?? "");
      if (label.startsWith("Total")) {
        data.cell.styles.fillColor = [255, 193, 7];
        data.cell.styles.textColor = [0, 0, 0];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
        data.cell.styles.lineColor = [230, 175, 0];
      }
    },
  });

  // Calculate final Y position after table
  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Always start images and important points on a new page (Página 3 si hubo overflow)
  doc.addPage();

  // Agregar header de segunda página
  addPezaLogo(doc, 14, 10, 50, 15);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("REPARACIÓN", 195, 15, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Folio: ${repair.repairNumber}`, 195, 22, { align: "right" });

  // Add images if available — resolve URLs to base64 first (jsPDF requires base64)
  const hasImages = repair.image1 || repair.image2 || repair.image3;
  let imagesY = 30;

  if (hasImages) {
    // Pre-load all images concurrently (handles both base64 and Object Storage URLs)
    const [img1Base64, img2Base64, img3Base64] = await Promise.all([
      repair.image1 ? resolveImageToBase64(repair.image1) : Promise.resolve(null),
      repair.image2 ? resolveImageToBase64(repair.image2) : Promise.resolve(null),
      repair.image3 ? resolveImageToBase64(repair.image3) : Promise.resolve(null),
    ]);

    const loadedImages = [img1Base64, img2Base64, img3Base64].filter(Boolean);

    if (loadedImages.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("ANEXOS DE LO OBSERVADO:", 14, imagesY);

      let imageX = 14;
      const imageWidth = 50;
      const imageHeight = 50;
      const imageSpacing = 5;

      for (const imgBase64 of loadedImages) {
        if (imgBase64) {
          // Detect image format from data URI
          const format = imgBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          try {
            doc.addImage(imgBase64, format, imageX, imagesY + 7, imageWidth, imageHeight);
          } catch {
            // Skip images that fail to embed (corrupted or unsupported format)
          }
          imageX += imageWidth + imageSpacing;
        }
      }
    }
  }

  // Add important points section
  let pointsY = imagesY + 75;
  
  // Check if we need a new page for important points
  if (pointsY + 60 > pageHeight - 50) {
    doc.addPage();
    
    // Agregar header de nueva página
    addPezaLogo(doc, 14, 10, 50, 15);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REPARACIÓN", 195, 15, { align: "right" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Folio: ${repair.repairNumber}`, 195, 22, { align: "right" });
    
    pointsY = 70;
  }
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("PUNTOS IMPORTANTES:", 14, pointsY);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  const importantPoints = [
    "1- Después de 30 días de NO pasar por el equipo o no tener respuesta,\nNO NOS HACEMOS RESPONSABLES POR EL EQUIPO.",
    "2- Se requiere liquidar al momento de recoger el equipo.",
    "3- En caso de no autorizar el presupuesto, se tendrá un costo por revisión el cual varía dependiendo el equipo.",
  ];
  
  let pointY = pointsY + 7;
  importantPoints.forEach((point, index) => {
    if (pointY > pageHeight - 50) {
      doc.addPage();
      
      // Header para nueva página
      addPezaLogo(doc, 14, 10, 50, 15);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("REPARACIÓN", 195, 15, { align: "right" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Folio: ${repair.repairNumber}`, 195, 22, { align: "right" });
      
      pointY = 70;
    }
    
    // Special formatting for the first point - underline and bold the important text
    if (index === 0) {
      const firstPart = "1- Después de 30 días de NO pasar por el equipo o no tener respuesta,";
      const importantText = "NO NOS HACEMOS RESPONSABLES POR EL EQUIPO.";
      
      // Render first part normally
      const firstPartLines = doc.splitTextToSize(firstPart, 180);
      doc.setFont("helvetica", "normal");
      doc.text(firstPartLines, 14, pointY);
      
      // Render important text in bold and underlined
      let yOffset = pointY + firstPartLines.length * 5;
      doc.setFont("helvetica", "bold");
      doc.text(importantText, 14, yOffset);
      
      // Draw underline manually
      const textWidth = doc.getTextWidth(importantText);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(14, yOffset + 2, 14 + textWidth, yOffset + 2);
      
      doc.setFont("helvetica", "normal");
      
      pointY = yOffset + 5 + 3;
    } else {
      const pointLines = doc.splitTextToSize(point, 180);
      doc.setFont("helvetica", "normal");
      doc.text(pointLines, 14, pointY);
      pointY += pointLines.length * 5 + 3;
    }
  });

  // Add signature section to each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addSignatureSection(doc);
    
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: "center" },
    );
  }

  // Generate the PDF as a data URL
  return doc.output("datauristring");
}

/**
 * Download a repair as PDF
 */
export async function downloadRepairPDF(repairId: number): Promise<void> {
  try {
    // Fetch the repair
    const repairResponse = await authenticatedFetch(`/api/repairs/${repairId}`);
    if (!repairResponse.ok) {
      throw new Error("Failed to fetch repair");
    }

    // La API devuelve la reparación con los items incluidos
    const repairData = await repairResponse.json();

    // Extraer la reparación y los items
    const { items, ...repair } = repairData;

    // Generate the PDF
    const pdfDataUri = await generateRepairPDF(repair, items);

    // Cross-platform PDF save (iOS opens in new tab; Android/Desktop downloads)
    saveDataURIPDF(pdfDataUri, `Reparacion_${repair.repairNumber}.pdf`);
  } catch (error) {
    console.error("Error downloading PDF:", error);

    // Proporcionar un mensaje más descriptivo según el tipo de error
    if (error instanceof Error) {
      if (error.message.includes("Failed to fetch repair")) {
        throw new Error(
          "No se pudo encontrar la reparación. Verifique que exista.",
        );
      } else if (error.message.includes("Failed to fetch repair items")) {
        throw new Error(
          "No se pudieron obtener los artículos de la reparación.",
        );
      }
    }

    // Error genérico si no es uno de los casos específicos anteriores
    throw new Error("Error al generar el PDF. Por favor intente nuevamente.");
  }
}
