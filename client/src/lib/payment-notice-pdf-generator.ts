import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Report } from "@shared/schema";
import { formatCurrency, savePDFMobile } from "./utils";
import { addSocialIconsToPDF } from "./pdf-social-icons";
import { addPezaLogo } from "./logo-base64";
import { authenticatedFetch } from "./queryClient";
import {
  getRepairAccountAmounts,
  getReportAccountAmounts,
  isBillableRepair,
  isRepairReport,
} from "@shared/account-statement";
import { repairLiquidationDate, reportLiquidationDate } from "@shared/liquidation-date";

// Colores corporativos Péza Maquinaria
const PEZA_YELLOW: [number, number, number] = [255, 193, 7];
const GREEN: [number, number, number] = [22, 163, 74];
const RED: [number, number, number] = [220, 38, 38];
const LIGHT_GRAY: [number, number, number] = [245, 245, 245];
const DARK_GRAY: [number, number, number] = [90, 90, 90];

interface ProcessedReport {
  folio: string;
  fecha: string;
  obra: string;
  periodo: string;
  importe: number;
  abono: number;
  saldo: number;
  liquidadoEl: string;
}

/**
 * Calcula el importe facturado y abonos de un reporte usando la misma
 * lógica que el Estado de Cuenta completo (sincronización con estado manual).
 */
function processReport(report: Report): ProcessedReport {
  const { total: importe, paid: abono, pending: saldo } =
    getReportAccountAmounts(report);

  // Período de Renta: misma lógica que el PDF individual del reporte.
  // 1) rango de fechas del reporte; 2) campo periodoRenta del primer concepto; 3) "Por definir"
  let periodo = "Por definir";
  if (report.periodoRentaInicio && report.periodoRentaFin) {
    const fechaInicio = new Date(report.periodoRentaInicio).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const fechaFin = new Date(report.periodoRentaFin).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    periodo = `${fechaInicio} - ${fechaFin}`;
  } else if (
    report.items &&
    report.items.length > 0 &&
    report.items[0].periodoRenta &&
    report.items[0].periodoRenta.trim() !== ""
  ) {
    periodo = report.items[0].periodoRenta;
  }

  const reportDate = new Date(report.fechaReporte || report.createdAt);
  const fecha = reportDate.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return {
    folio: report.folioReporte || report.reportNumber || "",
    fecha,
    obra: report.nombreObra || "Sin obra",
    periodo,
    importe,
    abono,
    saldo,
    liquidadoEl: reportLiquidationDate(report),
  };
}

/**
 * Convierte una reparación al mismo formato que los reportes para el
 * estado de cuenta. Las reparaciones no manejan abonos parciales:
 * "Pagada" = liquidada al 100%, cualquier otro estado = saldo completo.
 */
function processRepair(repair: any): ProcessedReport {
  const { total: importe, paid: abono, pending: saldo } =
    getRepairAccountAmounts(repair);

  // Se formatea en UTC porque la fecha se guarda como fecha "de negocio"
  // (medianoche UTC); convertir a hora local de México la recorrería un día.
  const repairDate = new Date(repair.receivedDate || repair.createdAt);
  const formatRepairDate = (date: Date) => date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const fecha = formatRepairDate(repairDate);
  const periodo = repair.deliveryDate
    ? `${fecha} - ${formatRepairDate(new Date(repair.deliveryDate))}`
    : `${fecha} - En proceso`;

  const equipo = (repair.equipment || "").trim();
  return {
    folio: repair.repairNumber || "",
    fecha,
    obra: equipo ? `Reparación: ${equipo}` : "Reparación",
    periodo,
    importe,
    abono,
    saldo,
    liquidadoEl: repairLiquidationDate(repair.liquidatedAt),
  };
}

/**
 * Genera un Estado de Cuenta Resumido (Aviso de Pago Pendiente) enfocado en
 * mostrar primero lo pendiente y luego lo ya liquidado.
 * Incluye tanto reportes de renta como reparaciones del mismo cliente.
 */
export async function generatePaymentNoticePDF(
  clientId: number,
  clientName: string,
  reports: Report[] = [],
  repairs: any[] = []
): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const marginLeft = 14;
  const marginRight = 14;
  const contentRight = pageWidth - marginRight;

  try {
    // ENCABEZADO: Logo + título
    addPezaLogo(doc, marginLeft, 10, 45, 15);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("ESTADO DE CUENTA RESUMIDO", contentRight, 16, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK_GRAY);
    doc.text("Aviso de pago pendiente", contentRight, 21, { align: "right" });

    // Línea separadora amarilla
    doc.setDrawColor(...PEZA_YELLOW);
    doc.setLineWidth(1);
    doc.line(marginLeft, 28, contentRight, 28);

    // INFO DEL CLIENTE
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK_GRAY);
    doc.text("CLIENTE", marginLeft, 36);
    doc.text("FECHA", contentRight, 36, { align: "right" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(clientName.trim(), marginLeft, 43);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, contentRight, 43, { align: "right" });

    doc.setFontSize(8);
    doc.setTextColor(...DARK_GRAY);
    doc.text(`No. de Cliente: ${clientId}`, marginLeft, 48);

    // Procesar reportes y reparaciones, y separar pendientes vs liquidados.
    // Se excluyen reparaciones "No autorizado" (trabajo no autorizado no se cobra)
    // y las que no tienen importe.
    // Solo reparaciones confirmadas: se excluyen las "No autorizado", las que
    // siguen en cotización (paymentStatus "Cotización") y las que aún están en
    // "Espera de confirmación" o "Diagnóstico" (trabajo no confirmado).
    const billableRepairs = repairs.filter(isBillableRepair);
    // Excluir reportes de renta capturados como "REPARACION": esas reparaciones
    // ya vienen del panel de Reparaciones (folios R-XX) y se duplicarían.
    const rentalReports = reports.filter((rep) => !isRepairReport(rep));
    const processed = [
      ...rentalReports.map(processReport),
      ...billableRepairs.map(processRepair),
    ];
    const pendientes = processed.filter((r) => r.saldo > 0.005);
    const liquidados = processed.filter((r) => r.saldo <= 0.005);
    const parciales = pendientes.filter((r) => r.abono > 0.005);
    const totalPendiente = pendientes.reduce((sum, r) => sum + r.saldo, 0);

    // CAJA: TOTAL PENDIENTE DE PAGO
    const boxY = 54;
    const boxHeight = 24;
    doc.setFillColor(...PEZA_YELLOW);
    doc.roundedRect(marginLeft, boxY, contentRight - marginLeft, boxHeight, 2, 2, "F");

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL PENDIENTE DE PAGO", marginLeft + 6, boxY + 10);

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(
      `${formatCurrency(totalPendiente)} MXN`,
      contentRight - 6,
      boxY + 16,
      { align: "right" }
    );

    let cursorY = boxY + boxHeight + 12;

    // SECCIÓN: FACTURAS CON SALDO PENDIENTE
    if (pendientes.length > 0) {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURAS CON SALDO PENDIENTE", marginLeft, cursorY);

      autoTable(doc, {
        startY: cursorY + 4,
        head: [[
          "FOLIO",
          "OBRA",
          "PERÍODO RENTADO",
          "IMPORTE FACTURADO",
          "ABONO RECIBIDO",
          "SALDO PENDIENTE",
        ]],
        body: pendientes.map((r) => [
          r.folio,
          r.obra,
          r.periodo,
          formatCurrency(r.importe),
          formatCurrency(r.abono),
          formatCurrency(r.saldo),
        ]),
        foot: [[
          "", "", "", "", "TOTAL:", formatCurrency(totalPendiente),
        ]],
        theme: "grid",
        headStyles: {
          fillColor: PEZA_YELLOW,
          textColor: [0, 0, 0],
          fontSize: 8,
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [0, 0, 0],
          halign: "center",
          valign: "middle",
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: RED,
          fontStyle: "bold",
          fontSize: 9,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 22, fontStyle: "bold" },
          1: { cellWidth: 24, halign: "left", overflow: "linebreak" },
          2: { cellWidth: 42 },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 36, halign: "right", fontStyle: "bold", textColor: RED },
        },
        margin: { top: 20, left: marginLeft, right: marginRight, bottom: 36 },
        showHead: "everyPage",
        styles: { lineColor: [220, 220, 220], lineWidth: 0.1 },
        didParseCell: (data) => {
          // Resaltar columna de saldo pendiente en el cuerpo
          if (data.section === "body" && data.column.index === 5) {
            data.cell.styles.textColor = RED;
            data.cell.styles.fontStyle = "bold";
          }
          if (data.section === "foot" && data.column.index === 5) {
            data.cell.styles.textColor = RED;
          }
        },
      });

      cursorY = (doc as any).lastAutoTable.finalY + 10;

      // NOTAS DE ABONOS PARCIALES (automáticas)
      if (parciales.length > 0) {
        // Pre-calcular las líneas envueltas reales para medir la altura exacta
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const wrappedNotes = parciales.map((r) => {
          const line = `La factura ${r.folio} (${r.fecha}) por ${formatCurrency(r.importe)} recibió un abono de ${formatCurrency(r.abono)}. Saldo restante: ${formatCurrency(r.saldo)}.`;
          return doc.splitTextToSize(line, contentRight - marginLeft - 10) as string[];
        });
        const totalNoteLines = wrappedNotes.reduce((sum, w) => sum + w.length, 0);
        // título (10) + líneas (4 c/u + 1 de separación) + padding inferior (5)
        const noteHeight = 10 + totalNoteLines * 4 + parciales.length * 1 + 5;

        // Límite seguro respecto al pie de página
        const safeBottom = doc.internal.pageSize.height - 34;
        if (cursorY + noteHeight > safeBottom) {
          doc.addPage();
          cursorY = 20;
        }

        doc.setFillColor(255, 248, 225);
        doc.roundedRect(
          marginLeft,
          cursorY,
          contentRight - marginLeft,
          noteHeight,
          2,
          2,
          "F"
        );

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("NOTA SOBRE ABONOS PARCIALES", marginLeft + 5, cursorY + 6);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        let noteLineY = cursorY + 12;
        wrappedNotes.forEach((wrapped) => {
          doc.text(wrapped, marginLeft + 5, noteLineY);
          noteLineY += wrapped.length * 4 + 1;
        });

        cursorY = cursorY + noteHeight + 10;
      }
    } else {
      // Cliente al corriente
      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(marginLeft, cursorY, contentRight - marginLeft, 18, 2, 2, "F");
      doc.setTextColor(...GREEN);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(
        "Estas al corriente. No tienes saldo pendiente.",
        pageWidth / 2,
        cursorY + 11,
        { align: "center" }
      );
      cursorY += 28;
    }

    // SECCIÓN: REFERENCIA - FACTURAS YA LIQUIDADAS
    if (liquidados.length > 0) {
      if (cursorY + 30 > 270) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("REFERENCIA — FACTURAS YA LIQUIDADAS", marginLeft, cursorY);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK_GRAY);
      doc.text(
        "Los siguientes folios han sido cubiertos en su totalidad:",
        marginLeft,
        cursorY + 5
      );


      autoTable(doc, {
        startY: cursorY + 9,
        head: [["FOLIO", "OBRA", "PERÍODO", "IMPORTE", "ESTADO", "LIQUIDADO EL"]],
        body: liquidados.map((r) => [
          r.folio,
          r.obra,
          r.periodo,
          formatCurrency(r.importe),
          "PAGADO",
          r.liquidadoEl,
        ]),
        theme: "striped",
        headStyles: {
          fillColor: [80, 80, 80],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          halign: "center",
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [60, 60, 60],
          halign: "center",
        },
        alternateRowStyles: { fillColor: LIGHT_GRAY },
        columnStyles: {
          0: { cellWidth: 20, fontStyle: "bold" },
          1: { cellWidth: 42 },
          2: { cellWidth: 38 },
          3: { cellWidth: 27, halign: "right" },
          4: { cellWidth: 17, halign: "center" },
          5: { cellWidth: 38, halign: "center", overflow: "linebreak" },
        },
        margin: { top: 20, left: marginLeft, right: marginRight, bottom: 36 },
        showHead: "everyPage",
        styles: { lineColor: [225, 225, 225], lineWidth: 0.1 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
            data.cell.styles.textColor = GREEN;
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
    }

    // PIE DE PÁGINA en todas las páginas: contacto + redes + número de página
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const ph = doc.internal.pageSize.height;

      // Línea divisora
      doc.setDrawColor(...PEZA_YELLOW);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, ph - 30, contentRight, ph - 30);

      // Datos de contacto (izquierda)
      doc.setTextColor(...DARK_GRAY);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("PEZA Maquinaria", marginLeft, ph - 24);
      doc.setFont("helvetica", "normal");
      doc.text(
        "Calle Gral. Carlos Salazar Pte. 1961, Obrera, 64010 Monterrey, N.L.",
        marginLeft,
        ph - 20
      );
      doc.text("pezamaquinaria.com.mx", marginLeft, ph - 16);
      doc.text(
        "Para pagos o aclaraciones contacte a nuestras oficinas. Los pagos pueden tardar hasta 24 hrs en reflejarse.",
        marginLeft,
        ph - 12
      );

      // Número de página (centrado abajo)
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, ph - 6, {
        align: "center",
      });

      // Iconos de redes sociales (esquina inferior derecha)
      await addSocialIconsToPDF(doc, pageWidth, ph);
    }

    return doc;
  } catch (error) {
    console.error("Error generating payment notice PDF:", error);
    throw error;
  }
}

/**
 * Descarga el Estado de Cuenta Resumido (Aviso de Pago) para un cliente.
 */
export async function downloadPaymentNoticePDF(
  clientId: number,
  clientName: string
): Promise<void> {
  try {
    console.log(`Descargando Estado de Cuenta Resumido para cliente #${clientId}`);

    const noCache = {
      cache: "no-cache" as RequestCache,
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    };
    const [response, repairsResponse] = await Promise.all([
      authenticatedFetch(`/api/clients/${clientId}`, noCache),
      authenticatedFetch(`/api/clients/${clientId}/repairs`, noCache),
    ]);
    if (!response.ok) {
      throw new Error("Failed to fetch client reports");
    }
    if (!repairsResponse.ok) {
      // No generar un estado de cuenta incompleto si fallan las reparaciones
      throw new Error(
        "No se pudieron obtener las reparaciones del cliente. Intenta de nuevo."
      );
    }

    const clientData = await response.json();
    const clientRepairs: any[] = await repairsResponse.json();

    const hasReports = clientData.reports && clientData.reports.length > 0;
    if (!hasReports && clientRepairs.length === 0) {
      throw new Error(
        "Este cliente no tiene reportes ni reparaciones para generar el estado de cuenta resumido"
      );
    }

    const pdf = await generatePaymentNoticePDF(
      clientId,
      clientName,
      clientData.reports || [],
      clientRepairs
    );

    const currentDate = new Date().toISOString().split("T")[0];
    const filename = `Estado_Cuenta_Resumido_${clientName.trim().replace(/\s+/g, "_")}_${currentDate}.pdf`;

    savePDFMobile(pdf, filename);
  } catch (error) {
    console.error("Error generating payment notice PDF:", error);
    throw error;
  }
}
