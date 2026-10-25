import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format currency in Mexican Pesos
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { 
    style: 'currency', 
    currency: 'MXN',
    minimumFractionDigits: 2 
  }).format(amount);
}

// Calculate IVA (16%)
export function calculateIVA(amount: number): number {
  return amount * 0.16;
}

// Calculate total with IVA
export function calculateTotal(subtotal: number): number {
  const iva = calculateIVA(subtotal);
  return subtotal + iva;
}

// Calculate item subtotal
export function calculateItemSubtotal(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

// Format number with commas
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num);
}

// Parse string to number safely
export function parseNumber(value: string): number {
  const parsedValue = parseFloat(value);
  return isNaN(parsedValue) ? 0 : parsedValue;
}

// Detect iOS devices (iPhone, iPad, iPod)
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream
  );
}

/**
 * iOS exige que la ventana del PDF se abra directamente durante el toque del
 * usuario. Se prepara antes de esperar guardados, fetches o generación del PDF.
 */
export function preparePDFWindowForIOS(): Window | null {
  if (!isIOS()) return null;

  const pdfWindow = window.open("", "_blank");
  if (pdfWindow) {
    pdfWindow.document.title = "Preparando PDF...";
    pdfWindow.document.body.innerHTML =
      '<p style="font-family: sans-serif; padding: 24px;">Preparando PDF...</p>';
  }
  return pdfWindow;
}

/**
 * Cross-platform PDF save compatible with Android and iOS.
 * - iOS Safari: opens the PDF in a new tab (download attribute not supported on iOS).
 * - Android / Desktop: standard download via jsPDF save().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function savePDFMobile(
  doc: any,
  filename: string,
  preparedWindow: Window | null = null,
): void {
  if (isIOS()) {
    const blob: Blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = preparedWindow && !preparedWindow.closed
      ? preparedWindow
      : window.open(url, '_blank');
    if (preparedWindow && !preparedWindow.closed) {
      preparedWindow.location.href = url;
    }
    if (!win) {
      // Popup was blocked — fallback: navigate in same tab
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    doc.save(filename);
  }
}

/**
 * Converts a base64 data URI to a Blob object.
 */
function dataURItoBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/pdf';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Cross-platform download for PDFs delivered as data URIs (base64).
 * - iOS Safari: opens a blob URL in a new tab (data URIs are blocked on iOS).
 * - Android / Desktop: creates a blob URL and triggers download via anchor.
 *   Using blob URL instead of raw data URI avoids the ~2MB Android Chrome limit.
 */
export function saveDataURIPDF(dataUri: string, filename: string): void {
  const blob = dataURItoBlob(dataUri);
  const url = URL.createObjectURL(blob);

  if (isIOS()) {
    const win = window.open(url, '_blank');
    if (!win) {
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
