import nodemailer from 'nodemailer';
import { storage } from './storage';

// Configuración del transportador SMTP de Zoho
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 587,
    secure: false, // true para puerto 465, false para otros puertos
    auth: {
      user: 'contacto@pezamaquinaria.com.mx',
      pass: 'Pezamaquinaria123'
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: '"Péza Maquinaria" <contacto@pezamaquinaria.com.mx>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email enviado exitosamente:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error enviando email:', error);
    return false;
  }
}

export async function sendQuotationEmail(quotationNumber: number, clientEmail: string, pdfContent: string): Promise<boolean> {
  try {
    // Obtener la cotización de la base de datos
    const quotation = await storage.getQuotationByNumber(quotationNumber);
    if (!quotation) {
      console.error('Cotización no encontrada:', quotationNumber);
      return false;
    }

    // Convertir el PDF base64 a Buffer
    const pdfBuffer = Buffer.from(pdfContent, 'base64');

    // Crear el email
    const emailSubject = `Cotización #${quotationNumber} - Péza Maquinaria`;
    const totalAmount = typeof quotation.total === 'string' ? parseFloat(quotation.total) : quotation.total;
    
    const emailText = `
Estimado(a) ${quotation.clientName},

Adjunto encontrará la cotización #${quotationNumber} solicitada.

Detalles de la cotización:
- Cliente: ${quotation.clientName}
- Proyecto: ${quotation.projectName || 'N/A'}
- Total: $${totalAmount?.toFixed(2)} MXN

Si tiene alguna pregunta o requiere modificaciones, no dude en contactarnos.

Atentamente,
Péza Maquinaria
contacto@pezamaquinaria.com.mx
www.pezamaquinaria.com.mx
`;

    const emailHtml = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">Péza Maquinaria</h1>
    <p style="margin: 5px 0 0 0;">Cotización #${quotationNumber}</p>
  </div>
  
  <div style="padding: 20px; background-color: #f9fafb;">
    <p>Estimado(a) <strong>${quotation.clientName}</strong>,</p>
    
    <p>Adjunto encontrará la cotización #${quotationNumber} solicitada.</p>
    
    <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1e40af; margin-top: 0;">Detalles de la cotización:</h3>
      <ul style="list-style: none; padding: 0;">
        <li><strong>Cliente:</strong> ${quotation.clientName}</li>
        <li><strong>Proyecto:</strong> ${quotation.projectName || 'N/A'}</li>
        <li><strong>Total:</strong> $${totalAmount?.toFixed(2)} MXN</li>
      </ul>
    </div>
    
    <p>Si tiene alguna pregunta o requiere modificaciones, no dude en contactarnos.</p>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0;"><strong>Atentamente,</strong></p>
      <p style="margin: 5px 0;"><strong>Péza Maquinaria</strong></p>
      <p style="margin: 0; color: #6b7280;">contacto@pezamaquinaria.com.mx</p>
      <p style="margin: 0; color: #6b7280;">www.pezamaquinaria.com.mx</p>
    </div>
  </div>
</div>
`;

    const emailOptions: EmailOptions = {
      to: clientEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
      attachments: [
        {
          filename: `Cotizacion_${quotationNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    return await sendEmail(emailOptions);
  } catch (error) {
    console.error('Error enviando cotización por email:', error);
    return false;
  }
}