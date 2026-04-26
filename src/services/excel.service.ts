import ExcelJS from 'exceljs';

export class ExcelService {
  /**
   * Genera un archivo Excel de reporte financiero
   * @param consultas Datos de las consultas financieras
   * @param filtros Filtros aplicados
   * @param opciones Opciones de exportación
   * @returns Buffer del archivo Excel
   */
  async generarExcelReporteFinanciero(
    consultas: any[], 
    filtros: any, 
    opciones?: any
  ): Promise<Buffer> {
    try {
      console.log('📊 Generando Excel para reporte financiero');
      
      // Crear nuevo workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Reporte Financiero');
      
      // Configurar columnas
      worksheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Paciente', key: 'paciente', width: 25 },
        { header: 'Médico', key: 'medico', width: 25 },
        { header: 'Especialidad', key: 'especialidad', width: 20 },
        { header: 'Servicios', key: 'servicios', width: 30 },
        { header: 'Total', key: 'total', width: 15 },
        { header: 'Moneda', key: 'moneda', width: 10 },
        { header: 'Estado Pago', key: 'estado_pago', width: 15 }
      ];
      
      // Estilo para el encabezado
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '366092' }
      };
      
      // Agregar datos de las consultas
      consultas.forEach(consulta => {
        const servicios = consulta.servicios_consulta?.map((s: any) => 
          `${s.servicios?.nombre_servicio || 'N/A'} (${s.monto_pagado} ${s.moneda_pago})`
        ).join(', ') || 'Sin servicios';
        
        const totalConsulta = consulta.servicios_consulta?.reduce((sum: number, s: any) => 
          sum + (s.monto_pagado || 0), 0
        ) || 0;
        
        const monedaPrincipal = consulta.servicios_consulta?.[0]?.moneda_pago || 'N/A';
        
        worksheet.addRow({
          fecha: new Date(consulta.fecha_pautada).toLocaleDateString('es-VE'),
          paciente: `${(consulta.paciente as any)?.nombres || ''} ${(consulta.paciente as any)?.apellidos || ''}`.trim(),
          medico: `${(consulta.medico as any)?.nombres || ''} ${(consulta.medico as any)?.apellidos || ''}`.trim(),
          especialidad: (consulta.medico as any)?.especialidad?.nombre_especialidad || 'N/A',
          servicios: servicios,
          total: totalConsulta,
          moneda: monedaPrincipal,
          estado_pago: consulta.fecha_pago ? 'Pagado' : 'Pendiente'
        });
      });
      
      // Agregar fila de totales
      const totalRow = worksheet.addRow({});
      totalRow.getCell(1).value = 'TOTALES:';
      totalRow.getCell(1).font = { bold: true };
      
      // Calcular totales por moneda
      const totalesPorMoneda = consultas.reduce((totales: any, consulta: any) => {
        consulta.servicios_consulta?.forEach((servicio: any) => {
          const moneda = servicio.moneda_pago;
          if (!totales[moneda]) {
            totales[moneda] = 0;
          }
          totales[moneda] += servicio.monto_pagado || 0;
        });
        return totales;
      }, {});
      
      // Agregar totales por moneda
      Object.entries(totalesPorMoneda).forEach(([moneda, total], index) => {
        const cell = totalRow.getCell(7 + index); // Columna G + offset
        cell.value = `${moneda}: ${total}`;
        cell.font = { bold: true };
      });
      
      // Agregar información del reporte
      const infoRow1 = worksheet.addRow({});
      infoRow1.getCell(1).value = `Reporte generado el: ${new Date().toLocaleDateString('es-VE')}`;
      
      const infoRow2 = worksheet.addRow({});
      const fechaDesde = filtros?.fecha_desde ? new Date(filtros.fecha_desde).toLocaleDateString('es-VE') : 'N/A';
      const fechaHasta = filtros?.fecha_hasta ? new Date(filtros.fecha_hasta).toLocaleDateString('es-VE') : 'N/A';
      infoRow2.getCell(1).value = `Período: ${fechaDesde} - ${fechaHasta}`;
      
      if (opciones?.moneda && opciones.moneda !== 'TODAS') {
        const infoRow3 = worksheet.addRow({});
        infoRow3.getCell(1).value = `Moneda filtrada: ${opciones.moneda}`;
      }
      
      // Aplicar bordes a todas las celdas
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });
      
      // Generar buffer directamente
      const buffer = await workbook.xlsx.writeBuffer();
      
      console.log('✅ Excel generado exitosamente');
      console.log('📊 Tipo de buffer:', typeof buffer);
      console.log('📊 Es ArrayBuffer:', buffer instanceof ArrayBuffer);
      
      // Convertir ArrayBuffer a Buffer de Node.js
      const nodeBuffer = Buffer.from(buffer);
      
      console.log('📊 Tamaño del buffer:', nodeBuffer.length);
      
      return nodeBuffer;
      
    } catch (error) {
      console.error('❌ Error generando Excel:', error);
      throw error;
    }
  }
}
