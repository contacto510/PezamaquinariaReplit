import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Report } from "@shared/schema";
import { formatCurrency, savePDFMobile } from "./utils";
import { addSocialIconsToPDF } from "./pdf-social-icons";
import { addPezaLogo } from "./logo-base64";
import { authenticatedFetch } from "./queryClient";

/**
 * Generate a consolidated account statement PDF for a client
 */
export async function generateAccountStatementPDF(
  clientId: number, 
  clientName: string, 
  reports: Report[] = []
): Promise<jsPDF> {
  // Create a new PDF document
  const doc = new jsPDF();

  try {
    // SECCIÓN 1: ENCABEZADO CON LOGO
    // Agregar el logo de Péza Maquinaria en la esquina superior izquierda
    addPezaLogo(doc, 14, 10, 45, 15);
    
    // SECCIÓN 2: TÍTULO Y FECHA EN LA PARTE SUPERIOR DERECHA
    
    // Título "ESTADO DE CUENTA" en la esquina superior derecha
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ESTADO DE CUENTA", 105, 18, { align: "center" });
    
    // Fecha de generación
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const currentDate = new Date();
    const dateOptions = { year: "numeric" as const, month: "long" as const, day: "numeric" as const };
    const dateStr = currentDate.toLocaleDateString("es-MX", dateOptions);
    doc.text(`Fecha: ${dateStr}`, 195, 22, { align: "right" });
    
    // SECCIÓN 3: INFORMACIÓN DE LA DIRECCIÓN CENTRADA
    
    // Información de la dirección, RFC y web en el centro
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("CALLE GRAL. CARLOS SALAZAR PTE. 1961, OBRERA,", 105, 40, { align: "center" });
    doc.text("64010 MONTERREY, N.L.", 105, 45, { align: "center" });
    doc.text("MCP180724A95", 105, 50, { align: "center" });
    doc.text("https://pezamaquinaria.com.mx/", 105, 55, { align: "center" });
    
    // SECCIÓN 4: INFORMACIÓN DEL CLIENTE
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("CLIENTE:", 14, 70);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Nombre: ${clientName}`, 14, 77);
    doc.text(`Número de Cliente: ${clientId}`, 14, 83);
    
    // SECCIÓN 5: RESUMEN EJECUTIVO - Calcular primero los valores reales
    let totalGeneral = 0;
    let totalAbonos = 0;
    
    if (reports.length > 0) {
      // Calcular totales reales usando la misma lógica que la tabla
      reports.forEach((report: any) => {
        let reportImporteTotal = 0;
        
        if (report.items && report.items.length > 0) {
          // Calcular IMPORTE real desde los items (fuente de verdad para facturación)
          const itemsSubtotalSum = report.items.reduce((sum: number, item: any) => 
            sum + parseFloat(item.subtotal || "0"), 0);
          
          reportImporteTotal = itemsSubtotalSum; // Subtotal de todos los items
          
          // Si tiene IVA, agregarlo al importe
          const reportHasIva = report.includeIva && parseFloat(report.iva || "0") > 0;
          if (reportHasIva) {
            const reportIva = parseFloat(report.iva || "0");
            reportImporteTotal += reportIva;
          }
        } else {
          // Fallback: usar total del reporte si no hay items
          reportImporteTotal = parseFloat(report.total || "0");
        }
        
        // Sumar al total general (MONTO TOTAL FACTURADO)
        totalGeneral += reportImporteTotal;
        
        // SINCRONIZACIÓN: Calcular abonos considerando estado manual
        let reportAbonos = 0;
        
        if ((report as any).paymentStatus === "pagado") {
          // Si está marcado como "Pagado" manualmente = 100% abonado
          reportAbonos = reportImporteTotal;
        } else {
          // Si está "Pendiente", usar abonos reales
          reportAbonos = report.paymentSummary ? parseFloat(report.paymentSummary.totalPaid) || 0 : 0;
        }
        
        totalAbonos += reportAbonos;
      });

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("RESUMEN EJECUTIVO:", 14, 95);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      
      // Total de Reportes: valor
      doc.text(`Total de Reportes: ${reports.length}`, 14, 102);
      
      // Calcular valores basados en abonos reales (clamp para evitar negativos)
      const totalPendientePago = Math.max(0, totalGeneral - totalAbonos);
      
      // Log de resumen (opcional para depuración)
      // console.log('Estado de Cuenta - Resumen:', { totalGeneral, totalAbonos, totalPendientePago });
      
      // Monto Total Facturado: valor (ahora usa cálculos reales)
      doc.setTextColor(22, 163, 74);
      doc.text(`Monto Total Facturado: ${formatCurrency(totalGeneral)}`, 14, 108);
      
      // Pendiente de Pago: valor (Total - Abonos)
      doc.setTextColor(220, 38, 38);
      doc.text(`Pendiente de Pago: ${formatCurrency(totalPendientePago)}`, 14, 114);
      
      // Pagado: valor (Total de Abonos)
      doc.setTextColor(22, 163, 74);
      doc.text(`Pagado: ${formatCurrency(totalAbonos)}`, 14, 120);
      
      // Total Abonos: valor
      doc.setTextColor(59, 130, 246);
      doc.text(`Total Abonos: ${formatCurrency(totalAbonos)}`, 14, 126);
      
      // Resetear color y fuente para el resto del documento
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    }
    
    // SECCIÓN 6: TABLA DETALLADA DE CONCEPTOS Y PERÍODOS DE RENTA
    
    if (reports.length > 0) {
      // Preparar datos para la tabla detallada con conceptos
      const tableData: any[] = [];
      let cumulativeSubtotal = 0; // Para calcular el total real de subtotales
      let cumulativeImporte = 0;  // Para calcular el total real de importes
      
      reports.forEach((report: any) => {
        const statusMap = {
          'pendiente': 'Pendiente',
          'facturado': 'Facturado', 
          'pagado': 'Pagado',
          'vencido': 'Vencido'
        };
        
        const reportDate = new Date(report.fechaReporte || report.createdAt);
        const formattedDate = reportDate.toLocaleDateString("es-MX", { 
          day: "2-digit", 
          month: "2-digit", 
          year: "numeric" 
        });
        
        // Mostrar una sola fila por reporte con resumen de conceptos
        const reportHasIva = report.includeIva && parseFloat(report.iva || "0") > 0;
        const reportSubtotal = parseFloat(report.subtotal || "0");
        const reportTotal = parseFloat(report.total || "0");
        const reportIva = parseFloat(report.iva || "0");
        
        // Calcular totales reales del reporte
        let actualSubtotal = 0;
        let actualImporte = 0;
        
        if (report.items && report.items.length > 0) {
          // Calcular suma real de items (fuente de verdad)
          actualSubtotal = report.items.reduce((sum: number, item: any) => 
            sum + parseFloat(item.subtotal || "0"), 0);
        } else {
          // Si no tiene items, usar el valor del reporte
          actualSubtotal = reportSubtotal;
        }
        
        // Para el IMPORTE, usar siempre el total del reporte (ya incluye IVA si corresponde)
        actualImporte = reportTotal;
        
        // Sumar a los totales acumulativos
        cumulativeSubtotal += actualSubtotal;
        cumulativeImporte += actualImporte;
        
        // Determinar el texto de conceptos y el período de renta actualizado
        let conceptosText = 'Sin conceptos registrados';
        let periodoRentaText = report.diasUso || 'N/A';
        
        if (report.items && report.items.length > 0) {
          const cantidadConceptos = report.items.length;
          conceptosText = cantidadConceptos === 1 
            ? '1 CONCEPTO' 
            : `${cantidadConceptos} CONCEPTOS`;
            
          // Usar el diasUso del primer item (que está actualizado) si existe
          if (report.items[0].diasUso) {
            periodoRentaText = report.items[0].diasUso;
          }
        }
        
        // SINCRONIZACIÓN: Calcular abonos para la tabla (misma lógica que resumen)
        let reportAbonos = 0;
        
        if ((report as any).paymentStatus === "pagado") {
          // Si está marcado como "Pagado" manualmente = 100% abonado
          reportAbonos = actualImporte;
        } else {
          // Si está "Pendiente", usar abonos reales
          reportAbonos = report.paymentSummary ? parseFloat(report.paymentSummary.totalPaid) || 0 : 0;
        }
        
        // Agregar una sola fila por reporte (ahora con ABONOS)
        tableData.push([
          report.folioReporte || report.reportNumber || '',
          formattedDate,
          periodoRentaText, // PERÍODO DE RENTA - Ahora usa datos actualizados de los items
          report.nombreObra || 'N/A', // OBRA
          conceptosText, // CONCEPTO: cantidad de conceptos
          formatCurrency(actualSubtotal), // SUBTOTAL: suma de todos los conceptos
          formatCurrency(actualImporte), // IMPORTE: suma total con IVA
          formatCurrency(reportAbonos) // ABONOS: cantidad abonada en pesos
        ]);
      });

      // Agregar fila de totales usando los valores acumulativos calculados
      const totalSubtotal = cumulativeSubtotal;
      const totalImporte = cumulativeImporte;
      
      tableData.push([
        "", "", "", "", 
        "TOTAL:", 
        formatCurrency(totalSubtotal),
        formatCurrency(totalImporte),
        formatCurrency(totalAbonos) // Total de abonos
      ]);

      // Configuración de la tabla detallada
      const startY = 133; // Movido hacia arriba para evitar colisión con iconos de redes sociales
      
      autoTable(doc, {
        startY,
        head: [["FOLIO", "FECHA", "PERÍODO DE RENTA", "OBRA", "CONCEPTO", "SUBTOT.", "IMPORTE", "ABONOS"]],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [255, 193, 7], // Color amarillo corporativo
          textColor: [0, 0, 0],
          fontSize: 8,
          fontStyle: "bold",
          halign: "center",
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [0, 0, 0],
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 18, halign: "center" }, // FOLIO (compactado: 20mm → 18mm)
          1: { cellWidth: 18, halign: "center" }, // FECHA
          2: { cellWidth: 25, halign: "center" }, // PERÍODO DE RENTA
          3: { cellWidth: 25, halign: "center" }, // OBRA (reducido: 35mm → 25mm)
          4: { cellWidth: 25, halign: "center" }, // CONCEPTO (reducido: 35mm → 25mm)
          5: { cellWidth: 18, halign: "center" }, // SUBTOTAL (reducido: 22mm → 18mm)
          6: { cellWidth: 18, halign: "center" }, // IMPORTE (reducido: 22mm → 18mm)
          7: { cellWidth: 20, halign: "center" }, // ABONOS (nueva columna en pesos)
        },
        margin: { left: 14, right: 14 },
        tableWidth: "auto",
        styles: {
          lineColor: [0, 0, 0],
          lineWidth: 0.1,
        },
        didParseCell: function(data) {
          // Aplicar estilos especiales a la fila de totales
          const rowIndex = data.row.index;
          const isLastRow = rowIndex === tableData.length - 1;
          
          if (isLastRow) {
            // Es la fila de TOTAL final
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [255, 193, 7]; // Fondo amarillo
            data.cell.styles.fontSize = 6;
          }
          
          // Ya no hay columna ESTADO para colorear
        }
      });
    } else {
      // Si no hay reportes, mostrar mensaje
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("No hay reportes registrados para este cliente.", 105, 140, { align: "center" });
    }

    // Obtener la posición Y donde terminó la tabla para continuar
    const finalY = (doc as any).lastAutoTable?.finalY || 140;

    // SECCIÓN 7: TÉRMINOS Y CONDICIONES / INFORMACIÓN ADICIONAL
    
    let termsY = finalY + 20;
    
    // Si no hay suficiente espacio, agregar nueva página
    if (termsY > 240) {
      doc.addPage();
      termsY = 20;
    }
    
    // Información adicional del estado de cuenta
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMACIÓN IMPORTANTE:", 14, termsY);
    
    termsY += 8;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    
    const additionalInfo = [
      "• Este estado de cuenta refleja todas las transacciones registradas hasta la fecha de emisión.",
      "• Los montos pendientes deben ser liquidados según los términos acordados.",
      "• Para cualquier aclaración sobre este estado de cuenta, favor de contactar a nuestras oficinas.",
      "• Conserve este documento para sus registros contables y fiscales.",
      "• Los pagos realizados pueden tardar hasta 24 horas en reflejarse en el sistema.",
    ];
    
    additionalInfo.forEach((info) => {
      doc.text(info, 14, termsY);
      termsY += 5;
    });

    // SECCIÓN 8: PIE DE PÁGINA
    
    // Dirección General (25 puntos antes del final de la página)
    const pageHeight = 297; // A4 height in mm
    const footerY = pageHeight - 25;
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Dirección General", 105, footerY, { align: "center" });
    
    // Línea debajo de "Dirección General"
    doc.setLineWidth(0.5);
    doc.line(70, footerY + 2, 140, footerY + 2);
    
    // SECCIÓN 9: PIE DE PÁGINA CON ICONOS DE REDES SOCIALES
    
    // Agregar pie de página con iconos de redes sociales en todas las páginas
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Número de página
      const pageFooterY = doc.internal.pageSize.height - 10;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.text(`Página ${i} de ${pageCount}`, 105, pageFooterY, { align: "center" });
      
      // Añadir iconos de redes sociales alineados a la derecha
      addSocialIconsToPDF(doc, doc.internal.pageSize.width, doc.internal.pageSize.height);
    }
    
    return doc;
    
  } catch (error) {
    console.error("Error generating account statement PDF:", error);
    throw error;
  }
}


/**
 * Download account statement PDF for a client
 */
export async function downloadAccountStatementPDF(clientId: number, clientName: string): Promise<void> {
  try {
    console.log(`Descargando Estado de Cuenta para cliente #${clientId}`);
    
    // Fetch reports for the client - Forzar obtener datos frescos del servidor
    const response = await authenticatedFetch(`/api/clients/${clientId}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch client reports');
    }
    
    const clientData = await response.json();
    
    // Verificar que hay reportes
    if (!clientData.reports || clientData.reports.length === 0) {
      throw new Error('Este cliente no tiene reportes para generar el estado de cuenta');
    }
    
    // Generate PDF
    const pdf = await generateAccountStatementPDF(clientId, clientName, clientData.reports);
    
    // Generate filename
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const filename = `Estado_Cuenta_${clientName.replace(/\s+/g, '_')}_${currentDate}.pdf`;
    
    // Save PDF (cross-platform: iOS opens in new tab, Android/Desktop downloads)
    savePDFMobile(pdf, filename);
    
  } catch (error) {
    console.error('Error generating account statement PDF:', error);
    throw error;
  }
}