import puppeteer from 'puppeteer';
import { postgresPool } from '../config/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { FirmaService } from './firma.service.js';
import clinicaAtencionService from './clinica-atencion.service.js';

export class PDFService {
  private firmaService: FirmaService;
  
  constructor() {
    this.firmaService = new FirmaService();
  }
  
  /**
   * Genera un PDF de un informe médico
   * @param informeId ID del informe médico
   * @returns Buffer del PDF generado
   */
  async generarPDFInforme(informeId: number): Promise<Buffer> {
    let browser: any = null;
    const client = await postgresPool.connect();
    
    try {
      console.log(`🔄 Generando PDF para informe ${informeId}`);
      
      // Obtener el informe con datos básicos del médico y paciente (PostgreSQL)
      let informe: any;
      try {
        const result = await client.query(
          `SELECT 
            i.*,
            m.nombres as medico_nombres,
            m.apellidos as medico_apellidos,
            m.cedula as medico_cedula,
            m.mpps as medico_mpps,
            m.cm as medico_cm,
            m.especialidad_id,
            e.nombre_especialidad,
            p.nombres as paciente_nombres,
            p.apellidos as paciente_apellidos,
            p.cedula as paciente_cedula,
            p.edad as paciente_edad,
            p.telefono as paciente_telefono,
            p.email as paciente_email
          FROM informes_medicos i
          LEFT JOIN medicos m ON i.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          LEFT JOIN pacientes p ON i.paciente_id = p.id
          WHERE i.id = $1
          LIMIT 1`,
          [informeId]
        );

        if (result.rows.length === 0) {
          console.error('❌ No se encontró informe con ID:', informeId);
          throw new Error('Informe no encontrado');
        }

        informe = result.rows[0];
        // Formatear para compatibilidad con el código existente
        informe.medicos = {
          nombres: informe.medico_nombres,
          apellidos: informe.medico_apellidos,
          cedula: informe.medico_cedula || '',
          mpps: informe.medico_mpps || '',
          cm: informe.medico_cm || '',
          especialidad: informe.nombre_especialidad || 'Medicina General'
        };
        
        // Obtener edad del paciente (directamente de la columna edad o calcular si no existe)
        let edad = '';
        try {
          // Primero intentar usar la columna edad directamente
          if (informe.paciente_edad !== null && informe.paciente_edad !== undefined) {
            edad = informe.paciente_edad.toString();
          }
        } catch (edadError: any) {
          console.warn('⚠️ Error obteniendo edad del paciente:', edadError.message);
          edad = '';
        }
        
        // Datos del paciente para la línea descriptiva (siempre definir, incluso si está vacío)
        informe.paciente = {
          nombres: informe.paciente_nombres || '',
          apellidos: informe.paciente_apellidos || '',
          cedula: informe.paciente_cedula || '',
          edad: edad,
          telefono: informe.paciente_telefono || '',
          email: informe.paciente_email || ''
        };
        
        console.log('👤 Datos del paciente para PDF:', {
          nombres: informe.paciente.nombres,
          apellidos: informe.paciente.apellidos,
          cedula: informe.paciente.cedula,
          edad: informe.paciente.edad
        });
      } catch (dbError: any) {
        console.error('❌ Error obteniendo informe de la base de datos:', dbError);
        throw new Error(`Error obteniendo informe: ${dbError.message}`);
      } finally {
        client.release();
      }

      console.log('✅ Informe encontrado:', {
        id: informe.id,
        numero_informe: informe.numero_informe,
        medico_id: informe.medico_id,
        titulo: informe.titulo
      });

      let firmaBase64 = '';
      let selloBase64 = '';
      try {
        firmaBase64 = await this.firmaService.obtenerFirmaBase64(informe.medico_id);
        console.log('✅ Firma obtenida:', firmaBase64 ? 'Presente' : 'No disponible');
      } catch (firmaError: any) {
        console.warn('⚠️ Error obteniendo firma (continuando sin firma):', firmaError.message);
      }
      try {
        selloBase64 = await this.firmaService.obtenerSelloBase64(informe.medico_id);
        if (selloBase64) console.log('✅ Sello húmedo obtenido');
      } catch {
        // Columna sello_humedo puede no existir
      }

      // Generar HTML para el PDF
      let htmlContent = '';
      try {
        console.log('🔄 Generando HTML para PDF...');
        console.log('📋 Informe recibido:', {
          id: informe.id,
          tienePaciente: !!informe.paciente,
          pacienteNombres: informe.paciente?.nombres,
          pacienteApellidos: informe.paciente?.apellidos,
          pacienteCedula: informe.paciente?.cedula,
          pacienteEdad: informe.paciente?.edad
        });
        htmlContent = await this.generarHTMLParaPDF(informe, firmaBase64, selloBase64);
        console.log('✅ HTML generado, tamaño:', htmlContent.length, 'caracteres');
      } catch (htmlError: any) {
        console.error('❌ Error generando HTML:', htmlError);
        console.error('❌ Stack trace:', htmlError.stack);
        throw new Error(`Error generando HTML para PDF: ${htmlError.message}`);
      }
      
      // Configurar Puppeteer
      try {
        console.log('🔄 Iniciando Puppeteer...');
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ],
          timeout: 60000
        });
        console.log('✅ Puppeteer iniciado correctamente');
      } catch (puppeteerError: any) {
        console.error('❌ Error iniciando Puppeteer:', puppeteerError);
        throw new Error(`Error iniciando navegador: ${puppeteerError.message}`);
      }
      
      let page: any = null;
      try {
        page = await browser.newPage();
        
        // Configurar timeouts más largos
        page.setDefaultNavigationTimeout(60000);
        page.setDefaultTimeout(60000);
        
        // Establecer el contenido HTML
        console.log('🔄 Estableciendo contenido HTML...');
        await page.setContent(htmlContent, {
          waitUntil: 'load',
          timeout: 60000
        });
        console.log('✅ Contenido HTML establecido');
        
        // Esperar un poco más para asegurar que todo esté renderizado
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ Espera adicional completada');
        
        // Verificar que la página sigue conectada
        if (page.isClosed()) {
          throw new Error('La página se cerró antes de generar el PDF');
        }
        
        // Generar PDF
        let pdfBuffer: Buffer;
        console.log('🔄 Generando PDF...');
        const pdf = await Promise.race([
          page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              // Márgenes más compactos para minimizar páginas extra
              top: '12mm',
              right: '12mm',
              bottom: '12mm',
              left: '12mm'
            },
            preferCSSPageSize: false
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout generando PDF')), 60000)
          )
        ]) as Buffer;
        
        pdfBuffer = Buffer.from(pdf);
        console.log('✅ PDF generado, tamaño:', pdfBuffer.length, 'bytes');
        
        // Cerrar la página antes de cerrar el navegador
        await page.close();
        page = null;
        
        // Cerrar el navegador después de generar el PDF
        await browser.close();
        browser = null;
        console.log('✅ Navegador cerrado correctamente');
        
        console.log(`✅ PDF generado exitosamente para informe ${informeId}`);
        return pdfBuffer;
      } catch (contentError: any) {
        console.error('❌ Error en proceso de generación:', contentError);
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (e) {
            console.warn('⚠️ Error cerrando página:', e);
          }
        }
        throw new Error(`Error generando PDF: ${contentError.message}`);
      }
      
      
    } catch (error: any) {
      console.error('❌ Error generando PDF:', error);
      console.error('Stack trace:', error.stack);
      
      // Asegurar que el navegador se cierre en caso de error
      if (browser) {
        try {
          const pages = await browser.pages();
          for (const p of pages) {
            if (!p.isClosed()) {
              await p.close();
            }
          }
          await browser.close();
          console.log('✅ Navegador cerrado correctamente después del error');
        } catch (closeError) {
          console.error('⚠️ Error cerrando navegador:', closeError);
        }
      }
      
      throw error;
    }
  }


  /**
   * Quita del HTML los bloques de firma del médico (firma-sistema, firma-personalizada y textos sueltos).
   */
  private stripBloqueFirma(html: string): string {
    if (!html || !html.trim()) return html;
    let out = html;
    out = out.replace(/<div[^>]*class="[^"]*firma-sistema[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
    out = out.replace(/<div[^>]*class="[^"]*firma-personalizada[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
    out = out.replace(/<p[^>]*>\s*Firma Digital del Sistema\s*<\/p>/gi, '');
    out = out.replace(/<p[^>]*>\s*Documento generado electrónicamente\s*<\/p>/gi, '');
    out = out.replace(/<p[^>]*>\s*Fecha:\s*[^<]*<\/p>/gi, '');
    // Quitar nombre del médico al final del contenido (ya aparece en el bloque de firma)
    out = out.replace(/\s*<p[^>]*>\s*(<strong>\s*)?Dr\.\s+[\w\sáéíóúñÁÉÍÓÚÑ]+(\s*<\/strong>)?\s*<\/p>\s*$/gi, '');
    // Quitar " Dr. Nombre Apellido" cuando está al final de un párrafo (mismo <p> que el texto)
    out = out.replace(/([."])\s*Dr\.\s+[\w\sáéíóúñÁÉÍÓÚÑ]+\s*<\/p>/gi, '$1</p>');
    return out.trim();
  }

  /**
   * Parsea el contenido del informe en bloque intro (antecedentes) y bloques por control (fecha + contenido).
   */
  private parseContenidoParaPaginas(contenido: string): { introHtml: string; controls: { date: string; html: string }[] } {
    if (!contenido || !contenido.trim()) {
      return { introHtml: '', controls: [] };
    }
    contenido = this.stripBloqueFirma(contenido);
    const regex = /<p><strong>(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})<\/strong><\/p>/gi;
    const matches = [...contenido.matchAll(regex)];
    if (matches.length === 0) {
      let intro = contenido
        .replace(/<h3><strong>Historial de consultas:\s*<\/strong><\/h3>/gi, '')
        .trim();
      return { introHtml: intro, controls: [] };
    }
    const firstMatch = matches[0];
    if (firstMatch === undefined) return { introHtml: contenido.trim(), controls: [] };
    const firstIndex = firstMatch.index ?? 0;
    let introHtml = contenido.substring(0, firstIndex).replace(/\s*<hr>\s*$/i, '').trim();
    introHtml = introHtml.replace(/<h3><strong>Historial de consultas:\s*<\/strong><\/h3>/gi, '').trim();
    const controls: { date: string; html: string }[] = [];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m === undefined) continue;
      const date = m[1];
      if (date === undefined) continue;
      const start = (m.index ?? 0) + m[0].length;
      const nextMatch = matches[i + 1];
      const end = nextMatch !== undefined ? (nextMatch.index ?? contenido.length) : contenido.length;
      let html = contenido.substring(start, end).replace(/^\s*<hr>\s*/i, '').trim();
      controls.push({ date, html });
    }
    return { introHtml, controls };
  }

  /**
   * Genera el HTML para el PDF
   */
  private async generarHTMLParaPDF(informe: any, firmaBase64: string = '', selloBase64: string = ''): Promise<string> {
      // Obtener configuración de la clínica: si el informe tiene clinica_atencion_id, usar esa sede
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'default';
      let clinicaConfig = await this.obtenerConfiguracionClinica(clinicaAlias);
      const capId = (informe as { clinica_atencion_id?: number }).clinica_atencion_id;
      if (capId) {
        const clinicaAtencion = await clinicaAtencionService.getById(capId);
        if (clinicaAtencion) {
          clinicaConfig = {
            ...clinicaConfig,
            nombre: clinicaAtencion.nombre_clinica,
            direccion: clinicaAtencion.direccion_clinica || clinicaConfig.direccion || '',
            logoPath: clinicaAtencion.logo_path || clinicaConfig.logoPath
          };
        }
      }
      
      // Convertir logo a base64
      const logoBase64 = await this.obtenerLogoBase64(clinicaConfig.logoPath);
      clinicaConfig.logo = logoBase64;
      
      console.log('🔧 Configuración de clínica:', {
        alias: clinicaAlias,
        logoPath: clinicaConfig.logoPath,
        logoBase64: logoBase64 ? '✅ Cargado' : '❌ No encontrado',
        nombre: clinicaConfig.nombre,
        logoSize: logoBase64 ? `${Math.round(logoBase64.length / 1024)}KB` : 'N/A'
      });

    const parsed = this.parseContenidoParaPaginas(informe.contenido || '');
    const tieneControles = parsed.controls.length > 0;

    const renderHeader = (controlDate?: string) => {
      return `
          <div class="header">
            <div class="logo-section">
                     ${clinicaConfig.logo ? 
                       `<img src="${clinicaConfig.logo}" alt="${clinicaConfig.nombre} Logo" class="logo">` :
                       `<div class="logo-fallback" style="width: 140px; height: 140px; background: ${clinicaConfig.color}; border-radius: 6px; margin: 0 0 3px 0; display: flex; align-items: center; justify-content: center; color: white; font-size: 42px; font-weight: bold; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">${clinicaConfig.nombre.charAt(0)}</div>`
                     }
            </div>
            <div class="header-content${controlDate ? ' header-content-with-date' : ''}">
              <div class="document-title">Informe Médico</div>
              ${controlDate ? `<div class="header-control-date">${controlDate}</div>` : ''}
            </div>
          </div>`;
    };

    const renderFirmaSection = () => {
      const nombreMedico = `${informe.medicos?.nombres || ''} ${informe.medicos?.apellidos || ''}`.trim();
      if (!nombreMedico && !firmaBase64 && !selloBase64) return '';
      const partes: string[] = [];
      if (nombreMedico) partes.push(`<p class="firma-nombre"><strong>Dr. ${nombreMedico}</strong></p>`);
      const med = informe.medicos || {};
      if (med.especialidad && String(med.especialidad).trim()) partes.push(`<p class="firma-dato">Especialidad: ${this.escapeHtmlPdf(med.especialidad)}</p>`);
      if (med.mpps && String(med.mpps).trim()) partes.push(`<p class="firma-dato">${this.escapeHtmlPdf(med.mpps)}</p>`);
      if (med.cm && String(med.cm).trim()) partes.push(`<p class="firma-dato">${this.escapeHtmlPdf(med.cm)}</p>`);
      if (firmaBase64 || selloBase64) {
        partes.push('<div class="firma-imagenes">');
        if (firmaBase64) partes.push(`<img src="${firmaBase64}" alt="Firma digital" class="firma-img">`);
        if (selloBase64) partes.push(`<img src="${selloBase64}" alt="Sello húmedo" class="sello-img">`);
        partes.push('</div>');
      }
      return `<div class="firma-pdf">${partes.join('')}</div>`;
    };

    const renderFooter = () => `
          <div class="footer">
            ${clinicaConfig.direccion ? `<p>${clinicaConfig.direccion}</p>` : ''}
          </div>`;

    /** Bloque compacto solo de paciente para repetir en cada página del PDF (ej. Paciente: Sandra Romero | Cédula: V13892514 | Edad: 40 años) */
    const renderDatosPacienteEnPagina = () => {
      const p = informe.paciente || {};
      const partesPaciente: string[] = [];
      const nombrePaciente = `${p.nombres || ''} ${p.apellidos || ''}`.trim();
      if (nombrePaciente) partesPaciente.push(this.escapeHtmlPdf(nombrePaciente));
      if (p.cedula) partesPaciente.push(`Cédula: ${this.escapeHtmlPdf(p.cedula)}`);
      if (p.edad) partesPaciente.push(`Edad: ${this.escapeHtmlPdf(String(p.edad))} años`);
      if (partesPaciente.length === 0) return '';
      const lineaPaciente = `<strong>Paciente:</strong> ${partesPaciente.join(' | ')}`;
      return `
          <div class="page-datos-paciente-medico">
            <div class="page-datos-linea">${lineaPaciente}</div>
          </div>`;
    };

    let bodyContent: string;
    const stripInformeContentWrapper = (html: string): string => {
      const match = html.match(/^<div class="informe-content">([\s\S]*)<\/div>$/);
      const inner = match?.[1];
      return inner !== undefined ? inner : html;
    };

    if (tieneControles) {
      const introProcessed = parsed.introHtml
        ? this.procesarContenidoInforme(parsed.introHtml)
        : '';
      const introInner = introProcessed ? stripInformeContentWrapper(introProcessed) : '';
      const pages: string[] = [];
      for (let i = 0; i < parsed.controls.length; i++) {
        const control = parsed.controls[i];
        if (!control) continue;
        const isFirst = i === 0;
        const pageClass = isFirst ? 'page' : 'page control-page';
        let content = '';
        if (isFirst) {
          content += `<div class="informe-content">${introInner}${control.html}</div>`;
        } else {
          content += `<div class="informe-content">${control.html}</div>`;
        }
        pages.push(`
        <div class="${pageClass}">
          ${renderHeader(control.date)}
          ${renderDatosPacienteEnPagina()}
          <div class="content">
            ${content}
          </div>
          ${renderFirmaSection()}
          ${renderFooter()}
        </div>`);
      }
      bodyContent = pages.join('\n');
    } else {
      const contenidoProcesado = this.procesarContenidoInforme(
        parsed.introHtml || informe.contenido || ''
      );
      bodyContent = `
        <div class="page">
          ${renderHeader()}
          ${renderDatosPacienteEnPagina()}
          <div class="content">
            ${contenidoProcesado}
          </div>
          ${renderFirmaSection()}
          ${renderFooter()}
        </div>`;
    }

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Informe Médico - ${informe.numero_informe}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.3;
            color: #333;
            background: white;
            font-size: 10pt;
          }
          
                 .page {
                   max-width: 210mm;
                   margin: 0 auto;
                   /* Evitar doble-espaciado (márgenes PDF + padding HTML) que fuerza páginas extra */
                   padding: 0;
                   background: white;
                 }
                 
                 .header {
                   display: flex;
                   align-items: flex-start;
                   margin-bottom: 2px;
                   border-bottom: none;
                   padding-bottom: 2px;
                   break-inside: avoid;
                   gap: 12px;
                 }
          
                 .logo-section {
                   flex-shrink: 0;
                 }
          
                 .logo {
                   /* Misma lógica que réticula (receta-logo-fit): acota logos muy grandes, mantiene proporción */
                   display: block;
                   margin: 0 0 3px 0;
                   break-inside: avoid;
                   max-width: 120px;
                   max-height: 72px;
                   width: auto;
                   height: auto;
                   object-fit: contain;
                 }
          
          .clinic-info {
            font-size: 8pt;
            color: #666;
            margin-bottom: 3px;
            line-height: 1.2;
            white-space: nowrap;
            text-align: left;
          }
          
          .header-content {
            flex: 1;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          
          .document-title {
            font-size: 12pt;
            font-weight: bold;
            color: #1976D2;
            margin-bottom: 2px;
          }
          
          .document-number {
            font-size: 9pt;
            color: #666;
            margin-bottom: 3px;
          }
          
          .header-content-with-date {
            align-items: flex-end;
            text-align: right;
          }
          .header-control-date {
            font-size: 9pt;
            color: #1976D2;
            font-weight: bold;
            margin-top: 2px;
          }
          
          .page-datos-paciente-medico {
            font-size: 8pt;
            color: #444;
            margin-bottom: 6px;
            padding: 4px 0;
            border-bottom: 1px solid #e0e0e0;
            break-inside: avoid;
          }
          .page-datos-paciente-medico .page-datos-linea {
            margin-bottom: 2px;
          }
          .page-datos-paciente-medico .page-datos-linea:last-child {
            margin-bottom: 0;
          }
          
          .control-page {
            page-break-before: always;
          }
          
          .content {
            margin: 6px 0;
            text-align: justify;
          }
          
          .content h2 {
            color: #1976D2;
            margin: 8px 0 4px 0;
            font-size: 11pt;
            font-weight: bold;
            border-bottom: 1px solid #1976D2;
            padding-bottom: 2px;
            break-after: avoid;
            break-inside: avoid;
          }
          
          .content h3 {
            color: #333;
            margin: 6px 0 4px 0;
            font-size: 9pt;
            font-weight: bold;
            break-after: avoid;
            break-inside: avoid;
          }
          
          .content p {
            margin-bottom: 4px;
            text-indent: 12px;
            line-height: 1.3;
            orphans: 3;
            widows: 3;
          }
          
          .patient-data {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 18px;
            margin: 6px 0 12px 0;
            padding: 0;
            font-size: 9pt;
          }
          
          .patient-data h2 {
            grid-column: 1 / -1;
            margin-bottom: 6px;
            font-size: 11pt;
          }
          
          .patient-data-item {
            display: flex;
            flex-direction: column;
          }
          
          .patient-data-label {
            font-weight: bold;
            color: #1976D2;
            font-size: 8pt;
            margin-bottom: 1px;
          }
          
          .patient-data-value {
            color: #333;
            font-size: 9pt;
          }
          
          .informe-content {
            display: block;
            margin: 6px 0;
            padding: 8px;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-left: 3px solid #1976D2;
            font-size: 9pt;
            line-height: 1.3;
          }
          .firma-pdf {
            margin-top: 14px;
            break-inside: avoid;
          }
          .firma-pdf .firma-nombre {
            margin-bottom: 6px;
            font-size: 9pt;
          }
          .firma-pdf .firma-dato {
            margin: 2px 0;
            font-size: 8pt;
          }
          .firma-imagenes {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
          }
          .firma-img, .sello-img {
            max-width: 120px;
            max-height: 60px;
            object-fit: contain;
          }
          
          .signature-section {
            margin-top: 12px;
            text-align: center;
            break-inside: avoid;
          }
          
          .signature-line {
            border-bottom: 1px solid #333;
            width: 150px;
            margin: 12px auto 4px;
            height: 1px;
          }
          
          .signature-image-container {
            margin: 12px auto;
            text-align: center;
          }
          
          .signature-image {
            max-width: 200px;
            max-height: 100px;
            border: none;
            background: transparent;
            padding: 0;
            border-radius: 0;
            box-shadow: none;
          }
          
          .signature-text {
            font-size: 8pt;
            color: #666;
            margin-top: 2px;
          }
          
          .date-section {
            text-align: right;
            margin-top: 8px;
            font-size: 8pt;
            color: #666;
          }
          
          .footer {
            margin-top: 10px;
            text-align: center;
            font-size: 7.5pt;
            color: #999;
            border-top: 1px solid #eee;
            padding-top: 6px;
            break-inside: avoid;
          }
          
          @media print {
            .page {
              margin: 0;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        ${bodyContent}
      </body>
      </html>
    `;
  }

  private escapeHtmlPdf(text: string): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Modo receta "ambos": negrita en Récipe:/Indicaciones: al inicio de línea (incl. "Recipe"). */
  private formatRecetaLineaAmbos(line: string): string {
    const lead = line.match(/^\s*/)?.[0] ?? '';
    const trimmed = line.trim();
    const recipe = /^(r[ée]cipe|recipe)(\s*:)(.*)$/i.exec(trimmed);
    if (recipe) {
      const label = `${recipe[1] ?? ''}${recipe[2] ?? ''}`;
      const rest = recipe[3] ?? '';
      return `${lead}<strong>${this.escapeHtmlPdf(label)}</strong>${this.escapeHtmlPdf(rest)}`;
    }
    const ind = /^(indicaciones)(\s*:)(.*)$/i.exec(trimmed);
    if (ind) {
      const label = `${ind[1] ?? ''}${ind[2] ?? ''}`;
      const rest = ind[3] ?? '';
      return `${lead}<strong>${this.escapeHtmlPdf(label)}</strong>${this.escapeHtmlPdf(rest)}`;
    }
    return this.escapeHtmlPdf(line);
  }

  /**
   * Modo "Ambos": divide por la primera línea que empiece por "Indicaciones:".
   * Quita las líneas guía Récipe:/Indicaciones: del cuerpo (el título va en el encabezado de cada mitad).
   */
  private splitContenidoRecetaAmbos(texto: string): { recipe: string; indicaciones: string; ok: boolean } {
    const normalized = (texto || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (/^\s*indicaciones\s*:/i.test(line)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return { recipe: normalized.trim(), indicaciones: '', ok: false };
    }
    let recipe = lines.slice(0, idx).join('\n').trim();
    let indicaciones = lines.slice(idx).join('\n').trim();
    recipe = recipe.replace(/^\s*(r[ée]cipe|recipe)\s*:\s*/i, '').trim();
    indicaciones = indicaciones.replace(/^\s*indicaciones\s*:\s*/i, '').trim();
    return { recipe, indicaciones, ok: true };
  }

  private htmlRecetaCuerpoPlanoLineas(texto: string): string {
    const t = (texto || '').trim();
    if (!t) {
      return '<span class="receta-vacio" style="color:#94a3b8;font-style:italic;">—</span>';
    }
    return t
      .split(/\n/)
      .map((line) => this.escapeHtmlPdf(line))
      .join('<br/>');
  }

  private buildRecetaMedicoEncabezadoFragment(params: {
    tituloDoc: string;
    logoHeaderHtml: string;
    tituloMed: string;
    nombreCompleto: string;
    lineasTitulacion: string[];
    medico: any;
  }): string {
    const { tituloDoc, logoHeaderHtml, tituloMed, nombreCompleto, lineasTitulacion, medico } = params;
    return `<div class="receta-header">
    <div class="receta-header-row">
      <div class="receta-logo-cell">${logoHeaderHtml}</div>
      <div class="receta-header-main">
        ${tituloDoc ? `<div class="receta-tipo">${this.escapeHtmlPdf(tituloDoc)}</div>` : ''}
        <div class="receta-med-nombre">${this.escapeHtmlPdf(tituloMed)} ${this.escapeHtmlPdf(nombreCompleto)}</div>
        ${lineasTitulacion.map((t: string) => `<div class="receta-titulacion">${this.escapeHtmlPdf(t)}</div>`).join('')}
        ${!lineasTitulacion.length && medico.nombre_especialidad ? `<div class="receta-titulacion">${this.escapeHtmlPdf(medico.nombre_especialidad)}</div>` : ''}
        <div class="receta-meta">
          ${medico.cedula ? `RIF / Cédula: ${this.escapeHtmlPdf(medico.cedula)} · ` : ''}
          ${medico.email ? `${this.escapeHtmlPdf(medico.email)} · ` : ''}
          ${medico.telefono ? `${this.escapeHtmlPdf(medico.telefono)}` : ''}
          ${medico.contacto_redes ? `<br/>${this.escapeHtmlPdf(String(medico.contacto_redes))}` : ''}
        </div>
      </div>
    </div>
  </div>`;
  }

  /** Encabezado compacto por mitad: logo a la izquierda, fecha de emisión a la derecha (referencia formulario impreso). */
  private buildRecetaAmbosMitadHeader(logoHeaderHtml: string, fechaStr: string): string {
    return `<div class="receta-header receta-header--ambos-mitad">
    <div class="receta-header-row receta-header-row--ambos">
      <div class="receta-logo-cell">${logoHeaderHtml}</div>
      <div class="receta-fecha-emision">
        <div class="receta-fecha-emision-lbl">Fecha de emisión</div>
        <div class="receta-fecha-emision-val">${this.escapeHtmlPdf(fechaStr)}</div>
      </div>
    </div>
  </div>`;
  }

  /** Pie de cada mitad: médico y credenciales (firma/sello van al final del cuerpo). */
  private buildRecetaMedicoPieProfesionalMitad(params: {
    tituloMed: string;
    nombreCompleto: string;
    lineasTitulacion: string[];
    medico: any;
  }): string {
    const m = params.medico;
    const creds: string[] = [];
    if (m.mpps) creds.push(`MPPS: ${this.escapeHtmlPdf(String(m.mpps))}`);
    if (m.cm) creds.push(`C.M.: ${this.escapeHtmlPdf(String(m.cm))}`);
    const credLine = creds.length ? `<div class="receta-pie-creds">${creds.join(' · ')}</div>` : '';
    return `<div class="receta-pie-doc">
    <div class="receta-med-nombre">${this.escapeHtmlPdf(params.tituloMed)} ${this.escapeHtmlPdf(params.nombreCompleto)}</div>
    ${params.lineasTitulacion.map((t: string) => `<div class="receta-titulacion">${this.escapeHtmlPdf(t)}</div>`).join('')}
    ${!params.lineasTitulacion.length && m.nombre_especialidad ? `<div class="receta-titulacion">${this.escapeHtmlPdf(m.nombre_especialidad)}</div>` : ''}
    ${credLine}
    <div class="receta-meta receta-meta--pie">
      ${m.cedula ? `RIF / Cédula: ${this.escapeHtmlPdf(m.cedula)} · ` : ''}
      ${m.email ? `${this.escapeHtmlPdf(m.email)} · ` : ''}
      ${m.telefono ? `${this.escapeHtmlPdf(m.telefono)}` : ''}
      ${m.contacto_redes ? `<br/>${this.escapeHtmlPdf(String(m.contacto_redes))}` : ''}
    </div>
  </div>`;
  }

  private buildRecetaMedicoMitadVertical(params: {
    tituloPanel: string;
    innerHtml: string;
    fechaStr: string;
    bloquePaciente: string;
    footerRow: string;
    bloqueFirmaEnContenido: string;
    tituloMed: string;
    logoHeaderHtml: string;
    nombreCompleto: string;
    lineasTitulacion: string[];
    medico: any;
    watermarkDataUrl: string;
  }): string {
    const header = this.buildRecetaAmbosMitadHeader(params.logoHeaderHtml, params.fechaStr);
    const pieDoc = this.buildRecetaMedicoPieProfesionalMitad({
      tituloMed: params.tituloMed,
      nombreCompleto: params.nombreCompleto,
      lineasTitulacion: params.lineasTitulacion,
      medico: params.medico
    });
    const wmUrl = params.watermarkDataUrl.replace(/'/g, '%27');
    const wm = params.watermarkDataUrl
      ? `<div class="receta-body-wm-logo" style="background-image:url('${wmUrl}')"></div>`
      : `<div class="receta-watermark">${params.tituloMed.charAt(0)}</div>`;
    const tp = params.tituloPanel;
    const etiqueta =
      tp === 'Rp.'
        ? `<div class="receta-seccion-etiqueta"><strong>Rp.</strong></div>`
        : `<div class="receta-seccion-etiqueta"><strong>${this.escapeHtmlPdf(tp)}:</strong></div>`;
    return `<div class="receta-ambos-mitad">
  ${header}
  ${params.bloquePaciente}
  <div class="receta-body receta-body--mitad${params.watermarkDataUrl ? ' receta-body--con-logo-wm' : ''}">
    ${wm}
    <div class="receta-body-inner"><div class="receta-body-texto">${etiqueta}${params.innerHtml}</div>${params.bloqueFirmaEnContenido}</div>
  </div>
  ${pieDoc}
  ${params.footerRow}
</div>`;
  }

  /**
   * Procesa el contenido del informe para aplicar estilos
   * Mantiene el orden original del contenido sin duplicar datos
   */
  private procesarContenidoInforme(contenido: string): string {
    try {
      if (!contenido) {
        console.warn('⚠️ Contenido vacío recibido en procesarContenidoInforme');
        return '<div class="informe-content"><p>No hay contenido disponible.</p></div>';
      }
      
      let contenidoProcesado = contenido;
    
    // Remover secciones "Datos del Paciente" y "Datos del Médico" si existen
    // ya que estos datos no deben aparecer en el PDF (solo la firma del médico)
    // Quitar título "Historial de consultas" del PDF
    contenidoProcesado = contenidoProcesado.replace(
      /<h3><strong>Historial de consultas:\s*<\/strong><\/h3>/gi,
      ''
    );

    // Quitar bloques de firma del médico (vienen en el contenido al aplicar firma en frontend)
    contenidoProcesado = contenidoProcesado.replace(
      /<div class="firma-sistema">[\s\S]*?<\/div>\s*(?=<|$)/gi,
      ''
    );
    contenidoProcesado = contenidoProcesado.replace(
      /<div class="firma-personalizada">[\s\S]*?<\/div>\s*(?=<|$)/gi,
      ''
    );

    // Mantener el resto del contenido en su orden original
    
    // Remover "Datos del Paciente" (desde el h2 hasta el siguiente h2, h3, hr o div)
    contenidoProcesado = contenidoProcesado.replace(
      /<h2>Datos del Paciente<\/h2>[\s\S]*?(?=<h2>Datos del Médico|<h2>|<h3>|<hr>|<div class="historia-seccion">|<div class="antecedentes-seccion">|$)/gi,
      ''
    );

    // Remover "Datos del Médico" (desde el h2 hasta el siguiente h2, h3, hr o div)
    contenidoProcesado = contenidoProcesado.replace(
      /<h2>Datos del Médico<\/h2>[\s\S]*?(?=<h2>|<h3>|<hr>|<div class="historia-seccion">|<div class="antecedentes-seccion">|$)/gi,
      ''
    );
    
    // Quitar todos los separadores <hr> del contenido (no usar separador entre bloques ni dentro del contenido)
    contenidoProcesado = contenidoProcesado.replace(/<hr\s*\/?>\s*/gi, '');
    
    // Quitar nombre del médico al final del contenido (ya está en el bloque de firma)
    contenidoProcesado = contenidoProcesado.replace(/\s*<p[^>]*>\s*(<strong>\s*)?Dr\.\s+[\w\sáéíóúñÁÉÍÓÚÑ]+(\s*<\/strong>)?\s*<\/p>\s*$/gi, '').trim();
    // Quitar " Dr. Nombre Apellido" cuando está al final de un párrafo (mismo <p> que el texto)
    contenidoProcesado = contenidoProcesado.replace(/([."])\s*Dr\.\s+[\w\sáéíóúñÁÉÍÓÚÑ]+\s*<\/p>/gi, '$1</p>');
    
    // Limpiar espacios en blanco excesivos
    contenidoProcesado = contenidoProcesado.replace(/\n{3,}/g, '\n\n');
    
    // Envolver TODO el contenido del informe en un solo contenedor
    contenidoProcesado = `<div class="informe-content">${contenidoProcesado}</div>`;
    
    return contenidoProcesado;
    } catch (error: any) {
      console.error('❌ Error en procesarContenidoInforme:', error);
      console.error('❌ Stack trace:', error.stack);
      // Retornar contenido mínimo en caso de error
      return '<div class="informe-content"><p>Error procesando el contenido del informe.</p></div>';
    }
  }

  // Eliminado: formatearDatosPaciente (ya no se usa)


  // Eliminado: extraerValor (ya no se usa)

  /**
   * Convierte el logo a base64
   */
  private async obtenerLogoBase64(logoPath: string): Promise<string> {
    try {
      if (!logoPath) {
        console.warn('⚠️ No se proporcionó ruta de logo');
        return '';
      }
      const pathForResolve = logoPath.replace(/^\/+/, '');

      // Resolver rutas relativas desde la raíz del backend.
      // En runtime compilado, __dirname apunta a dist/services/, por eso subimos 2 niveles para llegar a dist/
      const distRoot = path.join(__dirname, '..', '..'); // dist/ cuando está compilado
      const projectRoot = path.join(distRoot, '..'); // raíz del proyecto
      const cwd = process.cwd();

      const resolveFromRoot = (p: string, root: string): string => {
        if (path.isAbsolute(p)) return p;
        return path.resolve(root, p);
      };

      // Candidatos (fallback): primero dist/assets/ (cuando está compilado), luego assets/ (desarrollo)
      const candidates: string[] = [];

      const normalized = pathForResolve.replace(/\\/g, '/');
      // distRoot = raíz del paquete backend (carpeta que contiene dist/ y opcionalmente assets/).
      // projectRoot = carpeta padre (p. ej. .../backend); no confundir con la raíz del API.
      if (normalized.startsWith('./assets/')) {
        // Misma carpeta assets/ en el backend; luego dist/assets/ (build); luego padre legacy
        candidates.push(resolveFromRoot(normalized.replace(/^\.\//, ''), distRoot));
        candidates.push(resolveFromRoot(normalized.replace('./assets/', './dist/assets/'), distRoot));
        candidates.push(resolveFromRoot(pathForResolve, projectRoot));
      } else if (normalized.startsWith('assets/')) {
        // /assets/... en BD → assets/... respecto al backend (donde suele ir el PNG del PDF)
        candidates.push(resolveFromRoot(pathForResolve, distRoot));
        candidates.push(resolveFromRoot('dist/' + pathForResolve, distRoot));
        candidates.push(resolveFromRoot(pathForResolve, projectRoot));
        // Si el proceso se lanzó con cwd = raíz del API (común en deploy)
        candidates.push(resolveFromRoot(pathForResolve, cwd));
        candidates.push(resolveFromRoot(path.join('dist', pathForResolve), cwd));
      } else {
        candidates.push(resolveFromRoot(pathForResolve, distRoot));
        candidates.push(resolveFromRoot(pathForResolve, projectRoot));
        candidates.push(resolveFromRoot(pathForResolve, cwd));
      }

      for (const candidate of candidates) {
        console.log('🔍 Buscando logo en:', candidate);
        if (!fs.existsSync(candidate)) continue;

        const logoBuffer = fs.readFileSync(candidate);
        const base64 = logoBuffer.toString('base64');
        const ext = path.extname(candidate).toLowerCase();
        const mimeType =
          ext === '.svg' ? 'image/svg+xml' :
          ext === '.webp' ? 'image/webp' :
          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
          'image/png';

        console.log('✅ Logo cargado correctamente, tipo:', mimeType);
        return `data:${mimeType};base64,${base64}`;
      }

      console.warn('⚠️ Logo no encontrado. Se intentó:', candidates);
      console.warn('⚠️ Continuando sin logo');
    } catch (error: any) {
      console.warn('⚠️ Error leyendo logo (continuando sin logo):', error.message);
    }
    return '';
  }

  /**
   * Obtiene la configuración específica de la clínica
   */
  private async obtenerConfiguracionClinica(clinicaAlias: string): Promise<any> {
    const configuraciones: { [key: string]: any } = {
      'demomed': {
        nombre: process.env['CLINICA_NOMBRE'] || 'DemoMed',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Centro Médico de Demostración',
        direccion: process.env['CLINICA_DIRECCION'] || '',
        especialidad: 'Medicina General',
        color: '#2196F3',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/clinica/logo.webp',
        logo: '' // Se llenará con base64
      },
      'multimed': {
        nombre: process.env['CLINICA_NOMBRE'] || 'MultiMed',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Plataforma multi-clínica',
        direccion: process.env['CLINICA_DIRECCION'] || '',
        especialidad: 'Medicina General',
        color: '#1565C0',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/clinica/logo.webp',
        logo: ''
      },
      'femimed': {
        nombre: process.env['CLINICA_NOMBRE'] || 'FemiMed',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Centro Médico Especializado',
        direccion: process.env['CLINICA_DIRECCION'] || '',
        especialidad: 'Ginecología y Obstetricia',
        color: '#1976D2',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/femimed/logo.svg',
        logo: '' // Se llenará con base64
      },
      'FemiMed': {
        nombre: process.env['CLINICA_NOMBRE'] || 'FemiMed',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Centro Médico de Demostración',
        direccion: process.env['CLINICA_DIRECCION'] || '',
        especialidad: 'Medicina General',
        color: '#2196F3',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/clinica/logo.webp',
        logo: '' // Se llenará con base64
      },
      'clinica2': {
        nombre: 'Clínica San José',
        descripcion: 'Centro de Salud Integral',
        direccion: process.env['CLINICA_DIRECCION'] || '',
        especialidad: 'Medicina General',
        color: '#2196F3',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/clinica2/logo.svg',
        logo: '' // Se llenará con base64
      },
      'default': {
        nombre: process.env['CLINICA_NOMBRE'] || 'Centro Médico',
        descripcion: process.env['CLINICA_DESCRIPCION'] || 'Servicios de Salud',
        direccion: process.env['CLINICA_DIRECCION'] || '',
        especialidad: 'Medicina General',
        color: '#666666',
        logoPath: process.env['LOGO_PATH'] || './assets/logos/clinica/logo.png',
        logo: '' // Se llenará con base64
      }
    };

    return configuraciones[clinicaAlias] || configuraciones['default'];
  }

  /**
   * Genera PDF de récipe médico o indicaciones (médico logueado).
   * Tipo "ambos" con sección "Indicaciones:": hoja apaisada, dos columnas (Rp. | Indicación) como formulario impreso, cada una con encabezado, cuerpo y pie.
   * Sin "Indicaciones:": un solo bloque como antes (etiquetas en negrita en el cuerpo).
   */
  async generarPDFRecetaMedico(params: {
    medicoId: number;
    tipo: 'recipe' | 'indicaciones' | 'ambos';
    contenido: string;
    pacienteId?: number | null;
    fechaEmision?: string | null;
    piesClinicaIds?: number[];
  }): Promise<Buffer> {
    const { medicoId, tipo, contenido, pacienteId, fechaEmision, piesClinicaIds } = params;
    console.log(
      '[PDF récipe service] Inicio · medicoId=%d tipo=%s contenidoChars=%d',
      medicoId,
      tipo,
      (contenido || '').length
    );
    let texto = (contenido || '').trim();
    if (!texto) {
      throw new Error('El contenido del récipe es obligatorio');
    }

    const client = await postgresPool.connect();
    let medico: any;
    let paciente: { nombres?: string; apellidos?: string; cedula?: string; edad?: number | string } | null = null;
    try {
      const r = await client.query(
        `SELECT m.id, m.nombres, m.apellidos, m.cedula, m.email, m.telefono, m.sexo,
                m.mpps, m.cm, m.titulacion, m.contacto_redes,
                e.nombre_especialidad
         FROM medicos m
         LEFT JOIN especialidades e ON m.especialidad_id = e.id
         WHERE m.id = $1`,
        [medicoId]
      );
      if (r.rows.length === 0) throw new Error('Médico no encontrado');
      medico = r.rows[0];

      if (pacienteId) {
        const pr = await client.query(
          'SELECT nombres, apellidos, cedula, edad FROM pacientes WHERE id = $1',
          [pacienteId]
        );
        if (pr.rows.length) paciente = pr.rows[0];
      }
    } finally {
      client.release();
    }
    console.log(
      '[PDF récipe service] DB ok · médico id=%d · paciente=%s',
      medico.id,
      paciente ? 'sí' : 'no'
    );

    let firmaBase64 = '';
    let selloBase64 = '';
    try {
      firmaBase64 = await this.firmaService.obtenerFirmaBase64(medicoId);
    } catch {
      /* sin firma */
    }
    try {
      selloBase64 = await this.firmaService.obtenerSelloBase64(medicoId);
    } catch {
      /* */
    }

    const tituloDoc =
      tipo === 'indicaciones' ? 'Indicaciones' : tipo === 'recipe' ? 'Récipe' : '';
    const tituloMed = medico.sexo === 'Femenino' ? 'Dra.' : 'Dr.';
    const nombreCompleto = `${medico.nombres || ''} ${medico.apellidos || ''}`.trim();
    const fechaStr = fechaEmision
      ? new Date(fechaEmision).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });

    const lineasTitulacion = medico.titulacion ? String(medico.titulacion).split(/\n/).map((l: string) => l.trim()).filter(Boolean) : [];

    // Logo al lado del médico: misma lógica que el informe (LOGO_PATH / CLINICA_ALIAS), o logo de la 1.ª clínica elegida en el pie
    const clinicaAliasRec = process.env['CLINICA_ALIAS'] || 'default';
    const clinicaBaseRec = await this.obtenerConfiguracionClinica(clinicaAliasRec);
    let nombreLogoHeader = clinicaBaseRec.nombre;
    let logoPathHeader: string = clinicaBaseRec.logoPath || '';
    /** receta-logo-recipe = archivo ya dimensionado (logo_path_recipe); receta-logo-fit = logo genérico / env */
    let headerLogoClass = 'receta-logo-fit';

    let idPieHead = (piesClinicaIds || []).map((x) => Number(x)).find((x) => Number.isFinite(x) && x > 0);
    // Sin clínicas marcadas en el pie, el PDF no enviaba pies_clinica_ids → nunca se leía logo_path_recipe del encabezado
    if (!idPieHead) {
      const fallbackId = await clinicaAtencionService.getFirstActiveId();
      if (fallbackId) idPieHead = fallbackId;
    }
    if (idPieHead) {
      const ch = await clinicaAtencionService.getById(idPieHead);
      if (ch) {
        const pathRecipe = (ch.logo_path_recipe && String(ch.logo_path_recipe).trim()) || '';
        const pathGeneral = (ch.logo_path && String(ch.logo_path).trim()) || '';
        if (pathRecipe) {
          logoPathHeader = pathRecipe;
          nombreLogoHeader = ch.nombre_clinica;
          headerLogoClass = 'receta-logo-recipe';
        } else if (pathGeneral) {
          logoPathHeader = pathGeneral;
          nombreLogoHeader = ch.nombre_clinica;
          headerLogoClass = 'receta-logo-fit';
        }
      }
    }

    const headerLogoB64 = logoPathHeader ? await this.obtenerLogoBase64(logoPathHeader) : '';
    const colorFb = clinicaBaseRec.color || '#64748b';
    const inicialLogo = (nombreLogoHeader || 'C').charAt(0);
    const logoHeaderHtml = headerLogoB64
      ? `<img src="${headerLogoB64}" alt="${this.escapeHtmlPdf(nombreLogoHeader)}" class="receta-logo-img ${headerLogoClass}" />`
      : `<div class="receta-logo-fallback" style="background:${colorFb}">${this.escapeHtmlPdf(inicialLogo)}</div>`;

    const splitAmbos = tipo === 'ambos' ? this.splitContenidoRecetaAmbos(texto) : { recipe: '', indicaciones: '', ok: false };
    const usarDosMitadesVerticales = tipo === 'ambos' && splitAmbos.ok;

    const htmlContenido = usarDosMitadesVerticales
      ? ''
      : texto
          .split(/\n/)
          .map((line) =>
            tipo === 'ambos' ? this.formatRecetaLineaAmbos(line) : this.escapeHtmlPdf(line)
          )
          .join('<br/>');

    let bloquePaciente = '';
    if (paciente) {
      const pn = `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim();
      const partes: string[] = [];
      if (pn) partes.push(this.escapeHtmlPdf(pn));
      if (paciente.cedula) partes.push(`Cédula: ${this.escapeHtmlPdf(paciente.cedula)}`);
      if (paciente.edad != null && paciente.edad !== '') partes.push(`Edad: ${this.escapeHtmlPdf(String(paciente.edad))}`);
      if (partes.length) {
        bloquePaciente = `<div class="receta-paciente"><strong>Paciente:</strong> ${partes.join(' · ')}</div>`;
      }
    }

    const piesHtml: string[] = [];
    const ids = (piesClinicaIds || []).slice(0, 2);
    for (const cid of ids) {
      const cap = await clinicaAtencionService.getById(cid);
      if (!cap) continue;
      const logoB64 = cap.logo_path ? await this.obtenerLogoBase64(cap.logo_path) : '';
      const img = logoB64
        ? `<img src="${logoB64}" alt="" class="pie-logo" />`
        : '';
      piesHtml.push(`
        <div class="pie-col">
          ${img}
          <div class="pie-nombre">${this.escapeHtmlPdf(cap.nombre_clinica)}</div>
          ${cap.direccion_clinica ? `<div class="pie-dir">${this.escapeHtmlPdf(cap.direccion_clinica)}</div>` : ''}
        </div>`);
    }
    const footerRow = piesHtml.length
      ? `<div class="receta-footer">${piesHtml.join('')}</div>`
      : '';

    const tieneFirmaSello = !!(firmaBase64 || selloBase64);
    const bloqueFirmaEnContenido =
      tieneFirmaSello
        ? `<div class="receta-firma-contenido">
    <div class="firma-imagenes">
      ${firmaBase64 ? `<img src="${firmaBase64}" alt="" class="firma-img"/>` : ''}
      ${selloBase64 ? `<img src="${selloBase64}" alt="" class="sello-img"/>` : ''}
    </div>
  </div>`
        : '';

    const estilosRecetaBase = `
  * { box-sizing: border-box; }
  .receta-header { border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 12px; }
  .receta-header-row { display: flex; flex-direction: row; align-items: flex-start; gap: 12px; }
  .receta-logo-cell { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: flex-start; }
  .receta-header-main { flex: 1; min-width: 0; }
  .receta-logo-recipe { display: block; width: auto; height: auto; max-width: 100%; }
  .receta-logo-fit { display: block; max-width: 120px; max-height: 72px; width: auto; height: auto; object-fit: contain; }
  .receta-logo-fallback { width: 56px; height: 56px; min-width: 56px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; font-weight: 700; flex-shrink: 0; }
  .receta-tipo { font-size: 14pt; font-style: italic; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
  .receta-med-nombre { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
  .receta-titulacion { font-size: 9pt; margin-top: 4px; color: #334155; line-height: 1.35; }
  .receta-meta { font-size: 8.5pt; color: #475569; margin-top: 6px; line-height: 1.4; }
  .receta-fecha { font-size: 9pt; color: #64748b; margin: 10px 0; }
  .receta-body { min-height: 120mm; position: relative; padding: 8px 0; display: flex; flex-direction: column; }
  .receta-body--mitad { min-height: 52mm; flex: 1 1 auto; display: flex; flex-direction: column; }
  .receta-body-inner { position: relative; z-index: 1; white-space: normal; line-height: 1.5; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: stretch; }
  .receta-body-texto { flex: 1 1 auto; min-height: 0; }
  .receta-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.06; font-size: 72px; font-weight: 800; color: #64748b; pointer-events: none; z-index: 0; }
  .receta-paciente { font-size: 10pt; margin-bottom: 10px; padding: 8px; background: #f8fafc; border-radius: 6px; }
  .receta-firma-contenido {
    flex-shrink: 0;
    margin-top: auto;
    margin-bottom: 0;
    margin-left: 0;
    margin-right: 0;
    padding: 0;
    width: 100%;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    flex-wrap: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receta-firma-contenido .firma-imagenes {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 0.4rem;
    flex-wrap: nowrap;
    margin: 0;
    padding: 0;
  }
  .receta-firma-contenido .firma-img,
  .receta-firma-contenido .sello-img {
    max-width: 95px;
    max-height: 44px;
    width: auto;
    height: auto;
    object-fit: contain;
    vertical-align: bottom;
    opacity: 0.92;
  }
  .receta-header--ambos-mitad { border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 8px; }
  .receta-header-row--ambos { justify-content: space-between; align-items: flex-start; width: 100%; }
  .receta-fecha-emision { text-align: right; font-size: 8.5pt; color: #64748b; line-height: 1.35; flex-shrink: 0; max-width: 50%; }
  .receta-fecha-emision-lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 2px; }
  .receta-fecha-emision-val { font-weight: 600; color: #334155; }
  .receta-seccion-etiqueta { margin-bottom: 8px; font-size: 10.5pt; }
  .receta-body-wm-logo {
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
    background-position: center;
    background-size: 48mm auto;
    opacity: 0.09;
    pointer-events: none;
    z-index: 0;
  }
  .receta-body--con-logo-wm .receta-body-inner { position: relative; z-index: 1; }
  .receta-pie-doc { position: relative; margin-top: 4px; padding-top: 8px; border-top: 1px solid #e2e8f0; min-height: 0; }
  .receta-pie-creds { font-size: 8.5pt; color: #475569; margin-top: 4px; }
  .receta-meta--pie { margin-top: 4px; font-size: 8pt; }
  .receta-footer { display: flex; gap: 12px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #475569; }
  .pie-col { flex: 1; min-width: 0; }
  .pie-logo { max-height: 40px; max-width: 140px; object-fit: contain; display: block; margin-bottom: 4px; }
  .pie-nombre { font-weight: 600; }
  .pie-dir { line-height: 1.3; margin-top: 2px; }
  .receta-ambos-wrap {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: stretch;
    min-height: 0;
    width: 100%;
  }
  .receta-ambos-mitad {
    flex: 1 1 50%;
    max-width: 50%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    box-sizing: border-box;
    border-right: 1px dashed #94a3b8;
    padding-right: 8px;
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  .receta-ambos-mitad:last-child {
    border-right: none;
    padding-right: 0;
    padding-left: 8px;
  }
  .receta-ambos-mitad .receta-body { min-height: 0; }
  .receta-ambos-mitad .receta-body--mitad {
    flex: 1 1 auto;
    min-height: 50mm;
    display: flex;
    flex-direction: column;
  }
  .receta-ambos-mitad .receta-pie-doc { margin-top: auto; flex-shrink: 0; }
  .receta-ambos-mitad .receta-footer {
    flex-shrink: 0;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .receta-ambos-mitad .receta-logo-fit { max-width: 90px; max-height: 54px; }
  .receta-ambos-mitad .receta-logo-recipe { max-width: 100%; max-height: 56px; }
  .receta-ambos-mitad .receta-body-wm-logo { background-size: 36mm auto; }`;

    let html: string;
    if (usarDosMitadesVerticales) {
      const innerR = this.htmlRecetaCuerpoPlanoLineas(splitAmbos.recipe);
      const innerI = this.htmlRecetaCuerpoPlanoLineas(splitAmbos.indicaciones);
      const wm = headerLogoB64 || '';
      const mitadR = this.buildRecetaMedicoMitadVertical({
        tituloPanel: 'Rp.',
        innerHtml: innerR,
        fechaStr,
        bloquePaciente,
        footerRow,
        bloqueFirmaEnContenido,
        tituloMed,
        logoHeaderHtml,
        nombreCompleto,
        lineasTitulacion,
        medico,
        watermarkDataUrl: wm
      });
      const mitadI = this.buildRecetaMedicoMitadVertical({
        tituloPanel: 'Indicación',
        innerHtml: innerI,
        fechaStr,
        bloquePaciente: '',
        footerRow,
        bloqueFirmaEnContenido,
        tituloMed,
        logoHeaderHtml,
        nombreCompleto,
        lineasTitulacion,
        medico,
        watermarkDataUrl: wm
      });
      html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  html, body.receta-ambos-root { height: 100%; margin: 0; }
  body.receta-ambos-root {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 9.5pt;
    color: #1e293b;
    padding: 10mm 8mm;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }
  ${estilosRecetaBase}
</style></head><body class="receta-ambos-root">
  <div class="receta-ambos-wrap">
    ${mitadR}
    ${mitadI}
  </div>
</body></html>`;
    } else {
      const headerCompleto = this.buildRecetaMedicoEncabezadoFragment({
        tituloDoc,
        logoHeaderHtml,
        tituloMed,
        nombreCompleto,
        lineasTitulacion,
        medico
      });
      html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; margin: 0; padding: 16mm 14mm; }
  ${estilosRecetaBase}
</style></head><body>
  ${headerCompleto}
  <div class="receta-fecha">Fecha: ${this.escapeHtmlPdf(fechaStr)}</div>
  ${bloquePaciente}
  <div class="receta-body">
    <div class="receta-watermark">${tituloMed.charAt(0)}</div>
    <div class="receta-body-inner"><div class="receta-body-texto">${htmlContenido}</div>${bloqueFirmaEnContenido}</div>
  </div>
  ${footerRow}
</body></html>`;
    }

    console.log(
      '[PDF récipe service] HTML listo · length=%d · modoDosColumnasApaisado=%s',
      html.length,
      usarDosMitadesVerticales ? 'sí' : 'no'
    );
    return this.generarPdfBufferDesdeHtml(html, { landscape: usarDosMitadesVerticales });
  }

  /** Puppeteer: HTML → PDF buffer (reutilizable). */
  private async generarPdfBufferDesdeHtml(
    html: string,
    opts?: { landscape?: boolean }
  ): Promise<Buffer> {
    let browser: any = null;
    const tPup = Date.now();
    try {
      console.log('[PDF récipe Puppeteer] Lanzando Chromium…');
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
        timeout: 60000
      });
      console.log('[PDF récipe Puppeteer] Chromium listo · ms=%d', Date.now() - tPup);
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(60000);
      page.setDefaultTimeout(60000);
      console.log('[PDF récipe Puppeteer] setContent (HTML)…');
      await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
      console.log('[PDF récipe Puppeteer] setContent ok · pausa 1s (imágenes)…');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log('[PDF récipe Puppeteer] page.pdf… landscape=%s', opts?.landscape ? 'sí' : 'no');
      const pdf = await Promise.race([
        page.pdf({
          format: 'A4',
          landscape: opts?.landscape === true,
          printBackground: true,
          margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
          preferCSSPageSize: false
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout generando PDF')), 60000))
      ]) as Buffer;
      const pdfBuffer = Buffer.from(pdf);
      console.log('[PDF récipe Puppeteer] PDF buffer · bytes=%d · totalMs=%d', pdfBuffer.length, Date.now() - tPup);
      await page.close();
      await browser.close();
      browser = null;
      return pdfBuffer;
    } catch (e: any) {
      console.error('[PDF récipe Puppeteer] Fallo:', e?.message || e);
      if (browser) {
        try {
          await browser.close();
        } catch {
          /* */
        }
      }
      throw e;
    }
  }
}
