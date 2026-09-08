import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Report, ReportItem, ReportPayment } from "@shared/schema";
import { formatCurrency } from "./utils";
import { addSocialIconsToPDF } from "./pdf-social-icons";
import { addPezaLogo } from "./logo-base64";

/**
 * Generate a PDF for a report with social media icons
 */
export async function generateReportPDF(
  report: Report, 
  items: ReportItem[],
  payments: ReportPayment[] = []
): Promise<jsPDF> {
  // Create a new PDF document
  const doc = new jsPDF();

  try {
    // SECCIÓN 1: ENCABEZADO CON LOGO
    // Agregar el logo de Péza Maquinaria en la esquina superior izquierda
    addPezaLogo(doc, 14, 10, 45, 15);
    
    // SECCIÓN 2: TÍTULO Y FOLIO EN LA PARTE SUPERIOR DERECHA
    
    // Título "REPORTE" en la esquina superior derecha
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REPORTE", 195, 15, { align: "right" });
    
    // Folio en la parte superior derecha
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const folioText = `Folio: ${report.folioReporte}`;
    doc.text(folioText, 195, 22, { align: "right" });
    
    // Fecha debajo del folio (parte superior derecha)
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const dateObj = new Date(report.fechaReporte);
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
    
    // SECCIÓN 4: INFORMACIÓN DEL CLIENTE Y REPORTE
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("CLIENTE:", 14, 70);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Nombre: ${report.clientName}`, 14, 77);
    
    // Obra
    doc.text(`Obra: ${report.nombreObra}`, 14, 83);
    
    // Período de Renta (usar las fechas de inicio y fin del reporte)
    if (report.periodoRentaInicio && report.periodoRentaFin) {
      const fechaInicio = new Date(report.periodoRentaInicio).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
      const fechaFin = new Date(report.periodoRentaFin).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
      doc.text(`Período de Renta: ${fechaInicio} - ${fechaFin}`, 14, 89);
    } else {
      // Si no hay fechas específicas, usar el período de renta del primer item
      const periodoRenta = items.length > 0 ? items[0].periodoRenta : "";
      if (periodoRenta && periodoRenta.trim() !== "") {
        doc.text(`Período de Renta: ${periodoRenta}`, 14, 89);
      } else {
        // Mostrar un período por defecto para asegurar que siempre aparezca
        doc.text(`Período de Renta: Por definir`, 14, 89);
      }
    }

    // SECCIÓN 5: TABLA DE CONCEPTOS CON TOTALES INTEGRADOS
    
    // Calcular totales
    const subtotal = parseFloat(report.subtotal);
    const iva = parseFloat(report.iva);
    const total = parseFloat(report.total);

    // Calcular total de abonos y saldo pendiente (necesarios para el encabezado y la tabla)
    const totalAbonosHeader = payments.reduce(
      (sum, p) => sum + parseFloat((p as any).amount || "0"),
      0
    );
    const saldoPendienteHeader = total - totalAbonosHeader;

    // Mostrar Abonos y Saldo Pendiente debajo del Período de Renta si hay abonos
    let headerEndY = 89;
    if (totalAbonosHeader > 0) {
      // Línea de "Abonos:" — etiqueta en negritas, valor en normal
      doc.setFont("helvetica", "bold");
      doc.text("Abonos:", 14, 95);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(34, 139, 34); // verde para destacar lo abonado
      doc.text(formatCurrency(totalAbonosHeader), 32, 95);

      // Línea de "Saldo Pendiente:"
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Saldo Pendiente:", 14, 101);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 0, 0); // rojo para resaltar lo que aún se debe
      doc.text(formatCurrency(saldoPendienteHeader), 47, 101);

      // Reset color y fuente para lo que sigue
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      headerEndY = 101;
    }
    
    // Preparar datos para la tabla (solo conceptos; los totales van en recuadro aparte)
    const tableData = items.map((item) => {
      return [
        item.numero || "",
        item.concepto || "",
        item.obra || "",
        item.diasUso || "",
        item.unidad || "",
        item.cantidad || "",
        formatCurrency(parseFloat(item.precioUnitario || "0")),
        formatCurrency(parseFloat(item.subtotal || "0"))
      ];
    });

    // Calcular total de abonos y saldo pendiente
    const totalAbonos = payments.reduce(
      (sum, p) => sum + parseFloat((p as any).amount || "0"),
      0
    );
    const saldoPendiente = total - totalAbonos;

    // Configuración de la tabla con ancho ajustado - siempre dejar espacio para Período de Renta
    // Empujamos startY hacia abajo si el encabezado creció por mostrar Abonos/Saldo Pendiente
    const startY = Math.max(100, headerEndY + 6);

    // Tabla de conceptos con estilo moderno (igual que cotizaciones):
    // líneas grises finas, encabezado amarillo, filas alternadas
    autoTable(doc, {
      startY,
      head: [["#", "CONCEPTO", "OBRA", "DÍAS DE USO", "UNIDAD", "CANT.", "PRECIO UNIT.", "SUBTOTAL"]],
      body: tableData,
      theme: "grid",
      styles: {
        lineColor: [210, 210, 210],
        lineWidth: 0.15,
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        textColor: [40, 40, 40],
        valign: "middle",
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [255, 193, 7], // Color amarillo corporativo
        textColor: [0, 0, 0],
        fontSize: 8,
        fontStyle: "bold",
        halign: "center",
        cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 },
        lineColor: [230, 175, 0],
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },   // #
        1: { halign: "left" },                    // CONCEPTO - ancho automático
        2: { cellWidth: 22, halign: "center" },  // OBRA
        3: { cellWidth: 24, halign: "center" },  // DÍAS DE USO
        4: { cellWidth: 16, halign: "center" },  // UNIDAD
        5: { cellWidth: 13, halign: "center" },  // CANT.
        6: { cellWidth: 24, halign: "right" },   // PRECIO UNIT.
        7: { cellWidth: 24, halign: "right" },   // SUBTOTAL
      },
      pageBreak: 'auto',
      rowPageBreak: 'avoid', // no partir una fila entre dos páginas
      margin: { top: 10, left: 14, right: 14 },
    });

    // RECUADRO DE TOTALES (estilo Estado de Cuenta / cotizaciones)
    // Si la tabla terminó muy abajo, pasar el recuadro completo a la siguiente
    // página para que nunca se parta entre páginas.
    const totalsRows: string[][] = [];
    totalsRows.push(["Subtotal:", formatCurrency(subtotal)]);
    if (report.includeIva && iva > 0) {
      totalsRows.push(["IVA (16%):", formatCurrency(iva)]);
    }
    totalsRows.push(["TOTAL:", formatCurrency(total)]);
    if (totalAbonos > 0) {
      totalsRows.push(["Abonos:", `-${formatCurrency(totalAbonos)}`]);
      totalsRows.push(["Saldo Pendiente:", formatCurrency(saldoPendiente)]);
    }

    let totalsBoxY = (doc as any).lastAutoTable.finalY + 4;
    const pageHeightMm = doc.internal.pageSize.height;
    if (totalsBoxY > pageHeightMm - 60) {
      doc.addPage();
      totalsBoxY = 20;
    }
    autoTable(doc, {
      startY: totalsBoxY,
      pageBreak: "avoid",
      body: totalsRows,
      theme: "grid",
      styles: {
        lineColor: [210, 210, 210],
        lineWidth: 0.15,
        fontSize: 9,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
      columnStyles: {
        0: { halign: "right", fontStyle: "bold", cellWidth: 36, fillColor: [245, 245, 245], textColor: [70, 70, 70] },
        1: { halign: "right", cellWidth: 30, textColor: [40, 40, 40] },
      },
      margin: { left: 130 },
      didParseCell: function (data) {
        const label = String((data.row.raw as any)?.[0] ?? "");
        if (label.startsWith("TOTAL")) {
          // Fila de TOTAL resaltada en amarillo corporativo
          data.cell.styles.fillColor = [255, 193, 7];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 10;
          data.cell.styles.lineColor = [230, 175, 0];
        } else if (label.startsWith("Abonos")) {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        } else if (label.startsWith("Saldo")) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    // Obtener la posición Y donde terminó el recuadro de totales
    const finalY = (doc as any).lastAutoTable.finalY || startY + 40;

    // SECCIÓN 6: TÉRMINOS Y CONDICIONES CON PAGINACIÓN POR ESPACIO REAL
    // El bloque de términos + firma mide ~80mm; si no cabe antes del pie
    // de página, se pasa completo a la siguiente página.
    let termsY = finalY + 15;

    if (termsY > pageHeightMm - 95) {
      doc.addPage();
      termsY = 20; // Reset Y position para la nueva página
    }
    
    // Términos y Condiciones
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TÉRMINOS Y CONDICIONES:", 14, termsY);
    
    termsY += 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    
    const terms = [
      "• Es obligación del cliente el suministro del combustible libre de purezas y/o recarga de batería según el equipo que lo requiera.",
      "• Los equipos se entregan en óptimas condiciones mecánicas y estéticas.",
      "• Se debe regresar el equipo limpio y sin material adherido para evitar un cargo extra por limpieza.",
      "• Se realizará cargo al cliente en los siguientes casos:",
      "• Robo o extravío del equipo.",
      "• Pérdida de refacciones y/o accesorios propios del equipo.",
      "• Daños ocasionados al equipo por mala operación o negligencia.",
    ];
    
    terms.forEach((term) => {
      doc.text(term, 14, termsY);
      termsY += 5;
    });

    // SECCIÓN 8: PIE DE PÁGINA
    
    // Dirección General (35 puntos antes del final de la página)
    const pageHeight = 297; // A4 height in mm
    const footerY = pageHeight - 35;
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Dirección General", 105, footerY, { align: "center" });
    
    // Línea debajo de "Dirección General"
    doc.setLineWidth(0.5);
    doc.line(70, footerY + 2, 140, footerY + 2);
    
    // SECCIÓN 9: PIE DE PÁGINA CON ICONOS DE REDES SOCIALES (igual que cotizaciones)
    
    // Agregar pie de página con iconos de redes sociales en todas las páginas
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Número de página (exactamente igual que cotizaciones)
      const footerY = doc.internal.pageSize.height - 10;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.text(`Página ${i} de ${pageCount}`, 105, footerY, { align: "center" });
      
      // Añadir iconos de redes sociales alineados a la derecha (exactamente igual que cotizaciones)
      addSocialIconsToPDF(doc, doc.internal.pageSize.width, doc.internal.pageSize.height);
    }
    
    return doc;
    
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}