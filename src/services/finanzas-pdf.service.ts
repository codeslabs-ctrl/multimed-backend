import puppeteer from 'puppeteer';
import { config } from '../config/environment.js';

export class FinanzasPDFService {
  /**
   * Genera un PDF de reporte financiero
   * @param consultas Datos de las consultas financieras
   * @param filtros Filtros aplicados
   * @param opciones Opciones de exportación
   * @returns Buffer del PDF generado
   */
  async generarPDFReporteFinanciero(
    consultas: any[], 
    filtros: any, 
    opciones?: any
  ): Promise<Buffer> {
    try {
      console.log('📄 Generando PDF para reporte financiero');
      
      // Generar HTML para el PDF
      const htmlContent = this.generarHTMLParaPDF(consultas, filtros, opciones);
      
      // Configurar Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      const page = await browser.newPage();
      
      // Establecer el contenido HTML
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Generar PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        }
      });
      
      await browser.close();
      
      console.log('✅ PDF generado exitosamente');
      return Buffer.from(pdfBuffer);
      
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      throw error;
    }
  }

  /**
   * Genera el HTML para el PDF del reporte financiero
   */
  private generarHTMLParaPDF(consultas: any[], filtros: any, opciones?: any): string {
    const fechaGeneracion = new Date().toLocaleDateString('es-VE');
    
    // Formatear fechas correctamente
    const fechaDesde = filtros?.fecha_desde ? new Date(filtros.fecha_desde).toLocaleDateString('es-VE') : 'N/A';
    const fechaHasta = filtros?.fecha_hasta ? new Date(filtros.fecha_hasta).toLocaleDateString('es-VE') : 'N/A';
    const periodo = `${fechaDesde} - ${fechaHasta}`;
    
    // Función auxiliar para parsear valores numéricos
    const parsearNumero = (valor: any): number => {
      if (valor === null || valor === undefined) return 0;
      if (typeof valor === 'number') return valor;
      if (typeof valor === 'string') {
        const limpio = valor.trim().replace(/[^\d.,-]/g, '');
        return parseFloat(limpio.replace(',', '.')) || 0;
      }
      return Number(valor) || 0;
    };

    // Calcular totales por moneda (solo de las consultas ya filtradas)
    const totalesPorMoneda: { [key: string]: number } = {};
    const consultasPorMoneda: { [key: string]: number } = {};
    
    consultas.forEach((consulta: any) => {
      consulta.servicios_consulta?.forEach((servicio: any) => {
        const moneda = (servicio.moneda_pago || 'VES').toUpperCase().trim();
        const monto = parsearNumero(servicio.monto_pagado);
        
        if (!totalesPorMoneda[moneda]) {
          totalesPorMoneda[moneda] = 0;
          consultasPorMoneda[moneda] = 0;
        }
        
        totalesPorMoneda[moneda] += monto;
      });
      
      // Contar consultas por moneda (cada consulta cuenta una vez por moneda si tiene servicios de esa moneda)
      const monedasEnConsulta = new Set<string>(
        consulta.servicios_consulta?.map((s: any) => (s.moneda_pago || 'VES').toUpperCase().trim()) || []
      );
      monedasEnConsulta.forEach((moneda: string) => {
        if (!consultasPorMoneda[moneda]) {
          consultasPorMoneda[moneda] = 0;
        }
        consultasPorMoneda[moneda]++;
      });
    });

    // Si hay filtro de moneda específico, mostrar solo esa moneda en el resumen
    if (opciones?.moneda && opciones.moneda !== 'TODAS') {
      const totalesFiltrados: any = {};
      if (totalesPorMoneda[opciones.moneda]) {
        totalesFiltrados[opciones.moneda] = totalesPorMoneda[opciones.moneda];
      }
      // Reemplazar totalesPorMoneda con solo la moneda filtrada
      Object.keys(totalesPorMoneda).forEach(moneda => {
        if (moneda !== opciones.moneda) {
          delete totalesPorMoneda[moneda];
        }
      });
    }

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reporte Financiero</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 8px;
            color: #333;
            font-size: 9pt;
          }
          .header {
            text-align: center;
            margin-bottom: 12px;
            border-bottom: 2px solid #366092;
            padding-bottom: 8px;
          }
          .header h1 {
            color: #366092;
            margin: 0;
            font-size: 18px;
          }
          .header h2 {
            color: #666;
            margin: 3px 0 0 0;
            font-size: 12px;
            font-weight: normal;
          }
          .info-section {
            margin-bottom: 10px;
            background-color: #f8f9fa;
            padding: 8px;
            border-radius: 3px;
            font-size: 8pt;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .info-label {
            font-weight: bold;
            color: #366092;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 8pt;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 4px;
            text-align: left;
          }
          th {
            background-color: #366092;
            color: white;
            font-weight: bold;
            font-size: 8pt;
          }
          tr:nth-child(even) {
            background-color: #f2f2f2;
          }
          .totals-section {
            margin-top: 12px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 8px;
          }
          .currency-box {
            background-color: #e8f4fd;
            padding: 8px;
            border-radius: 3px;
            border: 1.5px solid #366092;
          }
          .currency-title {
            font-weight: bold;
            color: #366092;
            font-size: 12px;
            margin-bottom: 6px;
            text-align: center;
            border-bottom: 1px solid #366092;
            padding-bottom: 4px;
          }
          .currency-stat {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            padding: 2px 0;
            font-size: 8pt;
          }
          .currency-stat-label {
            font-weight: 600;
            color: #555;
          }
          .currency-stat-value {
            font-weight: bold;
            color: #366092;
            font-size: 10pt;
          }
          .totals-title {
            font-weight: bold;
            color: #366092;
            margin-bottom: 8px;
            font-size: 14px;
            grid-column: 1 / -1;
            text-align: center;
          }
          .footer {
            margin-top: 12px;
            text-align: center;
            font-size: 8pt;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reporte Financiero</h1>
          <h2>${config.sistema.clinicaNombre}</h2>
        </div>
        
        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Fecha de generación:</span>
            <span>${fechaGeneracion}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Período:</span>
            <span>${periodo}</span>
          </div>
          ${opciones?.moneda && opciones.moneda !== 'TODAS' ? `
          <div class="info-row">
            <span class="info-label">Moneda filtrada:</span>
            <span>${opciones.moneda}</span>
          </div>
          ` : ''}
          <div class="info-row">
            <span class="info-label">Total de consultas:</span>
            <span>${consultas.length}</span>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Paciente</th>
              <th>Médico</th>
              <th>Especialidad</th>
              <th>Servicios</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${consultas.map(consulta => {
              const servicios = consulta.servicios_consulta?.map((s: any) => 
                `${s.servicios?.nombre_servicio || 'N/A'} (${s.monto_pagado} ${s.moneda_pago})`
              ).join(', ') || 'Sin servicios';
              
              const totalConsulta = consulta.servicios_consulta?.reduce((sum: number, s: any) => 
                sum + (s.monto_pagado || 0), 0
              ) || 0;
              
              const monedaPrincipal = consulta.servicios_consulta?.[0]?.moneda_pago || 'N/A';
              
              return `
                <tr>
                  <td>${new Date(consulta.fecha_pautada).toLocaleDateString('es-VE')}</td>
                  <td>${(consulta.paciente as any)?.nombres || ''} ${(consulta.paciente as any)?.apellidos || ''}</td>
                  <td>${(consulta.medico as any)?.nombres || ''} ${(consulta.medico as any)?.apellidos || ''}</td>
                  <td>${(consulta.medico as any)?.especialidad?.nombre_especialidad || 'N/A'}</td>
                  <td>${servicios}</td>
                  <td>${totalConsulta} ${monedaPrincipal}</td>
                  <td>${consulta.fecha_pago ? 'Pagado' : 'Pendiente'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="totals-section">
          <div class="totals-title">Resumen por Moneda</div>
          ${Object.entries(totalesPorMoneda).map(([moneda, total]) => {
            const totalFormateado = typeof total === 'number' ? total.toFixed(2) : String(total);
            const consultasCount = consultasPorMoneda[moneda] || 0;
            const promedio = consultasCount > 0 ? (total / consultasCount) : 0;
            
            return `
              <div class="currency-box">
                <div class="currency-title">${moneda}</div>
                <div class="currency-stat">
                  <span class="currency-stat-label">Consultas:</span>
                  <span class="currency-stat-value">${consultasCount}</span>
                </div>
                <div class="currency-stat">
                  <span class="currency-stat-label">Total Ingresos:</span>
                  <span class="currency-stat-value">${totalFormateado} ${moneda}</span>
                </div>
                <div class="currency-stat">
                  <span class="currency-stat-label">Promedio:</span>
                  <span class="currency-stat-value">${promedio.toFixed(2)} ${moneda}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div class="footer">
          <p>Reporte generado automáticamente por ${config.sistema.clinicaNombre}</p>
          <p>Fecha: ${new Date().toLocaleString('es-VE')}</p>
        </div>
      </body>
      </html>
    `;
    
    return html;
  }
}
