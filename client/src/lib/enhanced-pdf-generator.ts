import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Quotation, QuotationItem } from "@shared/schema";
import { formatCurrency, savePDFMobile } from "./utils";
import { addSocialIconsToPDF } from "./pdf-social-icons";
import { addPezaLogo } from "./logo-base64";
import { authenticatedFetch } from "./queryClient";

/**
 * Generate a PDF for a quotation with social media icons
 */
export async function generateEnhancedQuotationPDF(
  quotation: Quotation, 
  items: QuotationItem[]
): Promise<jsPDF> {
  // Create a new PDF document
  const doc = new jsPDF();

  try {
    // SECCIÓN 1: ENCABEZADO CON LOGO
    // Agregar el logo de Péza Maquinaria en la esquina superior izquierda
    addPezaLogo(doc, 14, 10, 45, 15);
    
    // SECCIÓN 2: TÍTULO Y FOLIO EN LA PARTE SUPERIOR DERECHA
    
    // Título "COTIZACIÓN" en la esquina superior derecha
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("COTIZACIÓN", 195, 15, { align: "right" });
    
    // Folio en la parte superior derecha
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const folioText = `Folio: COT-${quotation.quotationNumber.toString().padStart(4, '0')}`;
    doc.text(folioText, 195, 22, { align: "right" });
    
    // Fecha debajo del folio (parte superior derecha)
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const dateObj = new Date(quotation.createdAt);
    const dateOptions = { year: "numeric" as const, month: "long" as const, day: "numeric" as const };
    const dateStr = dateObj.toLocaleDateString("es-MX", dateOptions);
    doc.text(`Fecha: ${dateStr}`, 195, 29, { align: "right" });
    
    // SECCIÓN 3: INFORMACIÓN DE LA DIRECCIÓN CENTRADA
    
    // Información de la dirección, RFC y web en el centro
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("CALLE GRAL. CARLOS SALAZAR PTE. 1961, OBRERA,", 105, 40, { align: "center" });
    doc.text("64010 MONTERREY, N.L.", 105, 45, { align: "center" });
    doc.text("MCP180724A95", 105, 50, { align: "center" });
    doc.text("https://pezamaquinaria.com.mx/", 105, 55, { align: "center" });
    
    // SECCIÓN 4: INFORMACIÓN DEL CLIENTE (lado izquierdo)
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
    
    
    // SECCIÓN 6: TABLA DE ITEMS
    
    // Calcular posición inicial Y para la tabla (ajustada para el nuevo layout)
    let startY = Math.max(clientInfoY, 95) + 10; // Espacio después de la mayor altura entre cliente y empresa
               
    // Crear tabla de items
    autoTable(doc, {
      startY,
      head: [["No.", "Concepto", "Cantidad", "Unidad", "Precio Unitario", "Subtotal"]],
      body: items.map((item, index) => [
        index + 1,
        item.concept || "",
        item.quantity.toString(),
        item.unit || "",
        formatCurrency(typeof item.unitPrice === 'number' ? item.unitPrice : Number(item.unitPrice) || 0),
        formatCurrency(typeof item.subtotal === 'number' ? item.subtotal : Number(item.subtotal) || 0)
      ]),
      theme: "grid",
      styles: {
        lineColor: [210, 210, 210],
        lineWidth: 0.15,
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
        textColor: [40, 40, 40],
        valign: "middle",
      },
      headStyles: {
        fillColor: [255, 193, 7],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
        fontSize: 9,
        cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
        lineColor: [230, 175, 0],
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 12 },  // No.
        1: { halign: "left" },                    // Concepto
        2: { halign: "center", cellWidth: 20 },  // Cantidad
        3: { halign: "center", cellWidth: 20 },  // Unidad
        4: { halign: "right", cellWidth: 29 },   // Precio Unitario
        5: { halign: "right", cellWidth: 29 },   // Subtotal
      },
      margin: { top: 10, left: 14, right: 14 },
    });

    // RECUADRO DE TOTALES (estilo Estado de Cuenta Resumido)
    // Si la tabla terminó muy abajo, pasar el recuadro completo a la siguiente
    // página para que Subtotal/IVA/TOTAL nunca se partan entre páginas.
    let totalsBoxY = (doc as any).lastAutoTable.finalY + 4;
    const pageHeight = doc.internal.pageSize.height;
    if (totalsBoxY > pageHeight - 55) {
      doc.addPage();
      totalsBoxY = 20;
    }
    autoTable(doc, {
      startY: totalsBoxY,
      pageBreak: "avoid",
      body: [
        ["Subtotal:", formatCurrency(typeof quotation.subtotal === 'number' ? quotation.subtotal : Number(quotation.subtotal) || 0)],
        ["IVA (16%):", formatCurrency(typeof quotation.iva === 'number' ? quotation.iva : Number(quotation.iva) || 0)],
        ["TOTAL:", formatCurrency(typeof quotation.total === 'number' ? quotation.total : Number(quotation.total) || 0)],
      ],
      theme: "grid",
      styles: {
        lineColor: [210, 210, 210],
        lineWidth: 0.15,
        fontSize: 9,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
      columnStyles: {
        0: { halign: "right", fontStyle: "bold", cellWidth: 30, fillColor: [245, 245, 245], textColor: [70, 70, 70] },
        1: { halign: "right", cellWidth: 30, textColor: [40, 40, 40] },
      },
      margin: { left: 136 },
      didParseCell: function (data) {
        // Fila de TOTAL resaltada en amarillo corporativo
        if (data.row.index === 2) {
          data.cell.styles.fillColor = [255, 193, 7];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 10;
          data.cell.styles.lineColor = [230, 175, 0];
        }
      },
    });
    
    // SECCIÓN 6: TÉRMINOS Y CONDICIONES CON PAGINACIÓN INTELIGENTE
    
    // Obtener la posición Y después de la tabla
    let termsY = (doc as any).lastAutoTable.finalY + 15;
    
    // Lógica de paginación basada en el espacio real disponible:
    // el bloque de términos + firma mide ~80mm; si no cabe antes del pie
    // de página, se pasa completo a la siguiente página.
    const shouldMoveToNewPage = termsY > doc.internal.pageSize.height - 95;
    
    console.log('Información de paginación:', {
      termsY,
      itemCount: items.length,
      shouldMoveToNewPage,
      rule: 'Términos y Condiciones van a segunda página solo si hay más de 6 conceptos'
    });
    
    // Si hay más de 6 conceptos, mover términos y condiciones a la siguiente página
    if (shouldMoveToNewPage) {
      console.log('Moviendo términos y condiciones a la siguiente página (más de 6 conceptos)');
      doc.addPage();
      termsY = 20;
    } else {
      console.log('Términos y condiciones permanecen en la página actual (6 o menos conceptos)');
    }
    
    // Título de términos y condiciones
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("TÉRMINOS Y CONDICIONES:", 14, termsY);
    
    // Términos con bullets
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
      "   • Daños ocasionados al equipo por mala operación o negligencia."
    ];
    
    let currentY = termsY + 8;
    const lineHeight = 5;
    
    terms.forEach((term, index) => {
      if (index < 6) {
        // Bullets principales
        doc.text("• " + term, 14, currentY);
      } else {
        // Sub-bullets alineados con los principales
        doc.text("• " + term.replace("   • ", ""), 14, currentY);
      }
      
      currentY += lineHeight;
    });
    
    // Agregar "Dirección General" centrada después de términos y condiciones
    const directionY = currentY + 25; // 25 puntos después de términos (reducido para evitar choque con pie de página)
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold"); // En negritas
    doc.setTextColor(0, 0, 0);
    doc.text("Dirección General", 105, directionY, { align: "center" });
    
    // Agregar línea de firma debajo de "Dirección General"
    const lineY = directionY + 2; // 2 puntos debajo del texto (aún más cerca)
    const lineWidth = 60; // Ancho de la línea reducido
    const lineStartX = 105 - (lineWidth / 2); // Centrada
    const lineEndX = 105 + (lineWidth / 2);
    
    doc.setLineWidth(0.3); // Grosor de 0.3px
    doc.setDrawColor(0, 0, 0); // Color negro
    doc.line(lineStartX, lineY, lineEndX, lineY);
    
    // SECCIÓN 7: PIE DE PÁGINA CON ICONOS DE REDES SOCIALES
    
    // Agregar pie de página con iconos de redes sociales en todas las páginas
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Número de página
      const footerY = doc.internal.pageSize.height - 10;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.text(`Página ${i} de ${pageCount}`, 105, footerY, { align: "center" });
      // Añadir iconos de redes sociales alineados a la derecha
      // Ajusta x (por ejemplo, 160) y el tamaño según el diseño de tu PDF
      addSocialIconsToPDF(doc, doc.internal.pageSize.width, doc.internal.pageSize.height);
    }
    
    // Retornar el documento jsPDF directamente para mejor compatibilidad
    return doc;
  } catch (err) {
    console.error("Error generando PDF:", err);
    throw new Error("Error al generar el PDF");
  }
}

/**
 * Download an enhanced quotation as PDF with social media icons
 */
export async function downloadEnhancedQuotationPDF(
  quotationNumber: number,
  preparedWindow: Window | null = null,
): Promise<void> {
  try {
    console.log(`Descargando cotización #${quotationNumber}`);
    
    // Fetch the quotation
    const quotationResponse = await authenticatedFetch(`/api/quotations/number/${quotationNumber}`);
    if (!quotationResponse.ok) {
      throw new Error("Failed to fetch quotation");
    }
    
    // La API devuelve la cotización con los items incluidos
    const quotationData = await quotationResponse.json();
    console.log("Datos de cotización recibidos:", quotationData);
    
    // Extraer la cotización y los items
    const { items, ...quotation } = quotationData;
    
    // Generate the enhanced PDF with social media icons
    const doc = await generateEnhancedQuotationPDF(quotation, items);
    
    // Verify PDF was generated successfully
    if (!doc) {
      throw new Error("PDF no se generó correctamente");
    }
    
    // Cross-platform PDF save (iOS opens in new tab; Android/Desktop downloads)
    const fileName = `Cotizacion_${quotationNumber}.pdf`;
    savePDFMobile(doc, fileName, preparedWindow);
    
    console.log("PDF descargado correctamente");
  } catch (error) {
    console.error("Error downloading PDF:", error);
    
    // Proporcionar un mensaje más descriptivo según el tipo de error
    if (error instanceof Error) {
      if (error.message.includes("Failed to fetch quotation")) {
        throw new Error("No se pudo encontrar la cotización. Verifique que exista.");
      }
    }
    
    // Error genérico si no es uno de los casos específicos anteriores
    throw new Error("Error al generar el PDF. Por favor intente nuevamente.");
  }
}