import { Request, Response } from 'express';
import { PDFService } from '../services/pdf.service';
import { EmailService } from '../services/email.service.js';
import { config } from '../config/environment.js';

interface AuthReq extends Request {
  user?: { userId: number; username: string; rol: string; medico_id?: number };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RecetaParsed = {
  tipo: 'recipe' | 'indicaciones' | 'ambos';
  contenido: string;
  pdfPacienteId: number | null;
  fechaEmision: string | undefined;
  piesClinicaIds: number[];
};

function parseRecetaBody(body: {
  tipo?: string;
  contenido?: string;
  paciente_id?: number | null;
  fecha_emision?: string | null;
  pies_clinica_ids?: number[];
}): RecetaParsed {
  const tipoRaw = (body.tipo || 'recipe').toLowerCase();
  const tipo: 'recipe' | 'indicaciones' | 'ambos' =
    tipoRaw === 'indicaciones' ? 'indicaciones' : tipoRaw === 'ambos' ? 'ambos' : 'recipe';
  const contenido = typeof body.contenido === 'string' ? body.contenido : '';
  const pacienteId = body.paciente_id != null ? Number(body.paciente_id) : undefined;
  const fechaEmision = body.fecha_emision || undefined;
  const piesClinicaIds = Array.isArray(body.pies_clinica_ids)
    ? body.pies_clinica_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const pdfPacienteId =
    pacienteId != null && !Number.isNaN(pacienteId) ? pacienteId : null;
  return { tipo, contenido, pdfPacienteId, fechaEmision, piesClinicaIds };
}

export class PDFController {
  private pdfService: PDFService;
  private emailService: EmailService;

  constructor() {
    this.pdfService = new PDFService();
    this.emailService = new EmailService();
  }

  /**
   * Genera y devuelve un PDF de un informe médico
   */
  async generarPDFInforme(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const informeId = parseInt(id || '0');

      if (!informeId || isNaN(informeId)) {
        res.status(400).json({
          success: false,
          message: 'ID de informe inválido'
        });
        return;
      }

      console.log(`🔄 Generando PDF para informe ${informeId}`);
      console.log('📋 Parámetros recibidos:', { id, informeId });

      // Generar el PDF
      const pdfBuffer = await this.pdfService.generarPDFInforme(informeId);

      // Configurar headers para descarga
      const timestamp = new Date().getTime();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="informe-${informeId}-${timestamp}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Enviar el PDF
      res.send(pdfBuffer);

      console.log(`✅ PDF enviado exitosamente para informe ${informeId}`);

    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Error generando el PDF del informe',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  /**
   * POST /api/v1/pdf/receta-medico
   * Body: { tipo: 'recipe' | 'indicaciones' | 'ambos', contenido: string, paciente_id?, fecha_emision?, pies_clinica_ids?: number[] }
   * Requiere JWT con rol médico y medico_id.
   */
  async generarPDFRecetaMedico(req: AuthReq, res: Response): Promise<void> {
    try {
      const user = req.user;
      const medicoIdJwt = user?.medico_id != null ? Number(user.medico_id) : NaN;
      if (!user || user.rol !== 'medico' || !Number.isFinite(medicoIdJwt) || medicoIdJwt <= 0) {
        res.status(403).json({ success: false, message: 'Solo médicos pueden generar el récipe' });
        return;
      }

      const body = req.body as Parameters<typeof parseRecetaBody>[0];
      const { tipo, contenido, pdfPacienteId, fechaEmision, piesClinicaIds } = parseRecetaBody(body);

      console.log(
        '[PDF récipe] Solicitud · medicoId=%s tipo=%s contenidoChars=%d pacienteId=%s pies=%s',
        String(medicoIdJwt),
        tipo,
        contenido.length,
        pdfPacienteId != null ? String(pdfPacienteId) : 'null',
        JSON.stringify(piesClinicaIds)
      );
      const t0 = Date.now();

      const pdfBuffer = await this.pdfService.generarPDFRecetaMedico({
        medicoId: medicoIdJwt,
        tipo,
        contenido,
        pacienteId: pdfPacienteId,
        fechaEmision: fechaEmision || null,
        piesClinicaIds
      });

      console.log('[PDF récipe] Listo · bytes=%d · ms=%d', pdfBuffer.length, Date.now() - t0);

      const label =
        tipo === 'indicaciones' ? 'indicaciones' : tipo === 'ambos' ? 'ambos' : 'recipe';
      const ts = new Date().getTime();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receta-${label}-${ts}.pdf"`);
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.setHeader('Cache-Control', 'no-cache');
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error('❌ [PDF récipe] Error:', error?.message || error);
      if (error?.stack) console.error(error.stack);
      const msg = error?.message || 'Error generando el PDF';
      const status = msg.includes('obligatorio') || msg.includes('no encontrado') ? 400 : 500;
      res.status(status).json({
        success: false,
        message: msg
      });
    }
  }

  /**
   * POST /api/v1/pdf/receta-medico/enviar-email
   * Mismo cuerpo que receta-medico + email (destinatario).
   */
  async enviarRecetaMedicoPorEmail(req: AuthReq, res: Response): Promise<void> {
    try {
      const user = req.user;
      const medicoIdJwt = user?.medico_id != null ? Number(user.medico_id) : NaN;
      if (!user || user.rol !== 'medico' || !Number.isFinite(medicoIdJwt) || medicoIdJwt <= 0) {
        res.status(403).json({ success: false, message: 'Solo médicos pueden enviar el récipe' });
        return;
      }

      const raw = req.body as Parameters<typeof parseRecetaBody>[0] & { email?: string };
      const email = typeof raw.email === 'string' ? raw.email.trim() : '';
      if (!email || !EMAIL_RE.test(email)) {
        res.status(400).json({
          success: false,
          message: 'Indique un correo electrónico válido para el destinatario.'
        });
        return;
      }

      if (!String(config.email.user || '').trim() || !String(config.email.password || '').trim()) {
        res.status(503).json({
          success: false,
          message:
            'El envío por correo no está configurado en el servidor (EMAIL_USER / EMAIL_PASSWORD o SMTP).'
        });
        return;
      }

      const { tipo, contenido, pdfPacienteId, fechaEmision, piesClinicaIds } = parseRecetaBody(raw);

      console.log(
        '[PDF récipe email] medicoId=%s → %s · tipo=%s · pacienteId=%s',
        String(medicoIdJwt),
        email,
        tipo,
        pdfPacienteId != null ? String(pdfPacienteId) : 'null'
      );

      const t0 = Date.now();
      const pdfBuffer = await this.pdfService.generarPDFRecetaMedico({
        medicoId: medicoIdJwt,
        tipo,
        contenido,
        pacienteId: pdfPacienteId,
        fechaEmision: fechaEmision || null,
        piesClinicaIds
      });

      const label =
        tipo === 'indicaciones' ? 'indicaciones' : tipo === 'ambos' ? 'ambos' : 'recipe';
      const ts = new Date().getTime();
      const filename = `receta-${label}-${ts}.pdf`;
      const nombreSistema = config.sistema?.nombre || 'Sistema de Gestión Médica';

      const ok = await this.emailService.sendEmail({
        to: email,
        subject: `${nombreSistema} — Récipe médico (PDF adjunto)`,
        html: `<p>Adjunto encontrará el documento de <strong>récipe médico</strong> generado desde ${nombreSistema}.</p>
<p>Este mensaje fue enviado por un profesional de la salud que utiliza la plataforma. Si no es el destinatario esperado, ignore el archivo adjunto.</p>`,
        text: `Adjunto: récipe médico (PDF). Enviado desde ${nombreSistema}.`,
        attachments: [
          {
            filename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      });

      if (!ok) {
        res.status(500).json({
          success: false,
          message: 'No se pudo enviar el correo. Revise la configuración SMTP del servidor o intente más tarde.'
        });
        return;
      }

      console.log('[PDF récipe email] Enviado · bytes=%d · ms=%d', pdfBuffer.length, Date.now() - t0);
      res.status(200).json({
        success: true,
        message: `El récipe se envió correctamente a ${email}.`
      });
    } catch (error: any) {
      console.error('❌ [PDF récipe email] Error:', error?.message || error);
      if (error?.stack) console.error(error.stack);
      const msg = error?.message || 'Error al enviar el récipe por correo';
      const status = msg.includes('obligatorio') || msg.includes('no encontrado') ? 400 : 500;
      res.status(status).json({
        success: false,
        message: msg
      });
    }
  }
}
