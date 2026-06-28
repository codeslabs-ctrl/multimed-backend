import { Request, Response } from 'express';
import multer from 'multer';
import { ApiResponse } from '../types/index.js';
import { WordParserService } from '../services/word-parser.service.js';
import { postgresPool } from '../config/database.js';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    rol: string;
    medico_id?: number;
  };
}

// Configurar multer para archivos temporales
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB límite
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.mimetype === 'application/msword') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Word (.docx, .doc)'));
    }
  }
});

export class ImportacionController {
  private parserService: WordParserService;

  constructor() {
    this.parserService = new WordParserService();
  }

  /**
   * Capitaliza nombres y apellidos (primera letra mayúscula, resto minúsculas)
   */
  private capitalizeName(name: string): string {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Procesa un solo archivo Word y crea/actualiza paciente con su historia médica
   */
  async importarDocumento(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const file = req.file as Express.Multer.File;
      if (!file) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se proporcionó ningún archivo' }
        };
        res.status(400).json(response);
        return;
      }

      const user = (req as any).user;
      const medicoId = user?.medico_id || null;

      // Si no hay medico_id en el token, requerirlo como parámetro
      let medicoIdToUse = medicoId;
      if (!medicoIdToUse && req.body.medico_id) {
        medicoIdToUse = parseInt(req.body.medico_id);
      }

      if (!medicoIdToUse) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del médico es requerido para asociar la historia médica' }
        };
        res.status(400).json(response);
        return;
      }

      // Extraer texto del documento Word
      const text = await this.parserService.extractTextFromWord(file.buffer);
      
      // Dividir el documento en hojas usando "INFORME MEDICO:" como delimitador
      const pages = this.parserService.splitDocumentIntoPages(text);
      
      console.log(`📄 Documento dividido en ${pages.length} hoja(s)`);

      if (pages.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se encontraron hojas en el documento' }
        };
        res.status(400).json(response);
        return;
      }

      // Parsear la primera página para obtener datos del paciente
      const firstPage = pages[0];
      if (!firstPage) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo obtener la primera página del documento' }
        };
        res.status(400).json(response);
        return;
      }
      const firstPageData = this.parserService.parseDocument(firstPage, file.originalname);

      // Validar datos mínimos del paciente
      if (!firstPageData.paciente.nombres || !firstPageData.paciente.apellidos) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo extraer el nombre completo del paciente del documento' }
        };
        res.status(400).json(response);
        return;
      }

      // IMPORTANTE: Buscar o crear paciente SOLO UNA VEZ (usando datos de la primera página)
      // Todas las hojas del documento pertenecen al mismo paciente
      // Cada hoja creará un registro separado en historico_pacientes, pero el paciente es único
      let pacienteId: number | undefined;
      const historiasCreadas: number[] = [];

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Intentar buscar por cédula primero
        if (firstPageData.paciente.cedula) {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE cedula = $1 LIMIT 1',
            [firstPageData.paciente.cedula]
          );

          if (result.rows.length > 0) {
            pacienteId = result.rows[0].id;
          }
        }

        // Si no se encontró por cédula, buscar por email
        if (!pacienteId && firstPageData.paciente.email) {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE email = $1 LIMIT 1',
            [firstPageData.paciente.email]
          );

          if (result.rows.length > 0) {
            pacienteId = result.rows[0].id;
          }
        }

        // Si no existe el paciente, crearlo
        if (!pacienteId) {
          // Determinar sexo por defecto si no está especificado
          const sexo = firstPageData.paciente.sexo || 'Femenino'; // Por defecto Femenino para ginecología

          // Capitalizar nombres y apellidos
          const nombresCapitalizados = this.capitalizeName(firstPageData.paciente.nombres);
          const apellidosCapitalizados = this.capitalizeName(firstPageData.paciente.apellidos);

          // Validar y ajustar edad: debe estar en rango válido (1-150) para cumplir con constraint
          let edadFinal = firstPageData.paciente.edad;
          if (!edadFinal || edadFinal < 1 || edadFinal > 150) {
            console.warn(`⚠️ Edad inválida o no encontrada (${edadFinal}), usando valor por defecto: 1`);
            edadFinal = 1; // Valor mínimo válido para constraint
          }

          const insertResult = await client.query(
            `INSERT INTO pacientes (
              nombres, apellidos, cedula, email, telefono, edad, sexo, activo, clinica_alias
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
            RETURNING id`,
            [
              nombresCapitalizados,
              apellidosCapitalizados,
              firstPageData.paciente.cedula || null,
              firstPageData.paciente.email || null,
              firstPageData.paciente.telefono || null,
              edadFinal,
              sexo,
              process.env['CLINICA_ALIAS'] || 'femimed'
            ]
          );

          pacienteId = insertResult.rows[0].id;
          console.log(`✅ Paciente creado con ID: ${pacienteId}`);
        } else {
          // Actualizar paciente existente si hay datos nuevos
          console.log(`✅ Paciente existente encontrado con ID: ${pacienteId}`);
          const updateData: any = {};
          
          // Capitalizar nombres y apellidos si están presentes
          if (firstPageData.paciente.nombres) {
            updateData.nombres = this.capitalizeName(firstPageData.paciente.nombres);
          }
          if (firstPageData.paciente.apellidos) {
            updateData.apellidos = this.capitalizeName(firstPageData.paciente.apellidos);
          }
          if (firstPageData.paciente.email) updateData.email = firstPageData.paciente.email;
          if (firstPageData.paciente.telefono) updateData.telefono = firstPageData.paciente.telefono;
          if (firstPageData.paciente.edad) updateData.edad = firstPageData.paciente.edad;
          
          // Siempre actualizar clinica_alias
          updateData.clinica_alias = process.env['CLINICA_ALIAS'] || 'femimed';

          if (Object.keys(updateData).length > 0) {
            const updateFields = Object.keys(updateData).map((key, index) => `${key} = $${index + 1}`).join(', ');
            const updateValues = Object.values(updateData);
            updateValues.push(pacienteId);
            
            await client.query(
              `UPDATE pacientes SET ${updateFields} WHERE id = $${updateValues.length}`,
              updateValues
            );
          }
        }

        // Procesar cada hoja como un registro separado en historico_pacientes
        // IMPORTANTE: Todas las hojas usan el mismo pacienteId (paciente único)
        for (let i = 0; i < pages.length; i++) {
          const pageText = pages[i];
          if (!pageText) {
            console.warn(`⚠️ Hoja ${i + 1} está vacía, saltando...`);
            continue;
          }
          console.log(`📋 Procesando hoja ${i + 1} de ${pages.length} para paciente ID: ${pacienteId}`);
          
          try {
            // Parsear cada hoja
            const parsedData = this.parserService.parseDocument(pageText, file.originalname);
            
            console.log(`📝 Datos parseados para hoja ${i + 1}:`, {
              motivo_consulta: parsedData.historia.motivo_consulta ? 'Sí' : 'No',
              diagnostico: parsedData.historia.diagnostico ? 'Sí' : 'No',
              examenes_medico: parsedData.historia.examenes_medico ? 'Sí' : 'No',
              antecedentes_otros: parsedData.historia.antecedentes_otros ? 'Sí' : 'No',
              plan: parsedData.historia.plan ? 'Sí' : 'No',
              conclusiones: parsedData.historia.conclusiones ? 'Sí' : 'No'
            });

            // Extraer campos individuales
            let motivoConsulta = parsedData.historia.motivo_consulta || 'Consulta médica';
            // diagnostico ahora contiene solo la sección DIAGNÓSTICO (no los exámenes)
            let diagnostico = parsedData.historia.diagnostico || '';
            // examenes_medico contiene Examen Físico, Ultrasonido, etc.
            let examenesMedico = parsedData.historia.examenes_medico || '';
            let conclusiones = parsedData.historia.conclusiones || '';
            let plan = parsedData.historia.plan || '';
            // antecedentes_otros ahora contiene TODOS los antecedentes consolidados
            let antecedentesOtros = parsedData.historia.antecedentes_otros || '';

            // motivo_consulta debe contener SOLO el motivo de consulta
            const motivoConsultaFormateado = motivoConsulta ? `<p>${motivoConsulta}</p>` : '<p>Consulta médica</p>';

            // Formatear diagnostico (puede contener múltiples líneas)
            const diagnosticoFormateado = diagnostico ? diagnostico.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<p>${line}</p>`).join('') : null;

            // Formatear examenes_medico (puede contener múltiples líneas)
            const examenesMedicoFormateado = examenesMedico ? examenesMedico.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<p>${line}</p>`).join('') : null;

            // Usar la fecha extraída de la hoja, o la fecha actual si no se encontró
            const fechaConsulta = parsedData.historia.fecha_consulta || new Date().toISOString().split('T')[0];
            console.log(`📅 Fecha de consulta para hoja ${i + 1}: ${fechaConsulta}`);

            console.log(`💾 Insertando historia para paciente ID: ${pacienteId}, médico ID: ${medicoIdToUse}`);

            // antecedentes_otros pasó a pacientes (005_antecedentes_otros_paciente.sql); actualizar paciente si hay datos
            if (antecedentesOtros && antecedentesOtros.trim()) {
              const otrosFormateado = antecedentesOtros.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<p>${line}</p>`).join('');
              await client.query('UPDATE pacientes SET antecedentes_otros = $1, fecha_actualizacion = NOW() WHERE id = $2', [otrosFormateado, pacienteId]);
            }
            const historiaResult = await client.query(
              `INSERT INTO historico_pacientes (
                paciente_id, medico_id, motivo_consulta, diagnostico, conclusiones, plan, fecha_consulta, clinica_alias,
                examenes_medico
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              RETURNING id`,
              [
                pacienteId,
                medicoIdToUse,
                motivoConsultaFormateado,
                diagnosticoFormateado,
                conclusiones ? `<p>${conclusiones}</p>` : null,
                plan ? `<p>${plan}</p>` : null,
                fechaConsulta,
                process.env['CLINICA_ALIAS'] || 'multimed',
                examenesMedicoFormateado
              ]
            );
            
            const historiaId = historiaResult.rows[0]?.id;
            if (historiaId) {
              historiasCreadas.push(historiaId);
              console.log(`✅ Historia creada con ID: ${historiaId} para hoja ${i + 1}`);
            } else {
              console.error(`❌ Error: No se pudo obtener el ID de la historia creada para hoja ${i + 1}`);
              console.error(`   Resultado del INSERT:`, historiaResult);
            }
          } catch (historiaError: any) {
            console.error(`❌ Error procesando hoja ${i + 1} para paciente ID ${pacienteId}:`, historiaError);
            console.error(`   Mensaje:`, historiaError.message);
            console.error(`   Stack:`, historiaError.stack);
            // Continuar con la siguiente hoja en lugar de fallar completamente
          }
        }
      } finally {
        client.release();
      }

      const response: ApiResponse = {
        success: true,
        data: {
          paciente_id: pacienteId,
          historia_id: historiasCreadas[0],
          historias_creadas: historiasCreadas.length,
          paciente: {
            nombres: firstPageData.paciente.nombres,
            apellidos: firstPageData.paciente.apellidos
          },
          message: `Documento importado exitosamente. ${historiasCreadas.length} hoja(s) procesada(s)`
        }
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('❌ Error en importación:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  /**
   * Procesa múltiples archivos Word y devuelve un resumen
   */
  async importarMultiplesDocumentos(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se proporcionaron archivos' }
        };
        res.status(400).json(response);
        return;
      }

      const user = (req as any).user;
      const medicoId = user?.medico_id || null;

      let medicoIdToUse = medicoId;
      if (!medicoIdToUse && req.body.medico_id) {
        medicoIdToUse = parseInt(req.body.medico_id);
      }

      if (!medicoIdToUse) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del médico es requerido para asociar las historias médicas' }
        };
        res.status(400).json(response);
        return;
      }

      const results = {
        total: files.length,
        exitosos: 0,
        fallidos: 0,
        errores: [] as Array<{ archivo: string; error: string }>,
        pacientes_creados: 0,
        pacientes_actualizados: 0,
        historias_creadas: 0
      };

      // PostgreSQL implementation - usar un solo cliente para todas las operaciones
      const client = await postgresPool.connect();
      try {
        // Procesar cada archivo
        for (const file of files) {
          try {
            const text = await this.parserService.extractTextFromWord(file.buffer);
            
            // Dividir el documento en hojas usando "INFORME MEDICO:" como delimitador
            const pages = this.parserService.splitDocumentIntoPages(text);
            
            if (pages.length === 0) {
              results.fallidos++;
              results.errores.push({
                archivo: file.originalname,
                error: 'No se encontraron hojas en el documento'
              });
              continue;
            }

            // Parsear la primera página para obtener datos del paciente
            const firstPage = pages[0];
            if (!firstPage) {
              results.fallidos++;
              results.errores.push({
                archivo: file.originalname,
                error: 'No se pudo obtener la primera página del documento'
              });
              continue;
            }
            const firstPageData = this.parserService.parseDocument(firstPage, file.originalname);

            if (!firstPageData.paciente.nombres || !firstPageData.paciente.apellidos) {
              results.fallidos++;
              results.errores.push({
                archivo: file.originalname,
                error: 'No se pudo extraer el nombre completo del paciente'
              });
              continue;
            }

            // Buscar o crear paciente (solo una vez por archivo)
            let pacienteId: number | undefined;
            if (firstPageData.paciente.cedula) {
              const result = await client.query(
                'SELECT id FROM pacientes WHERE cedula = $1 LIMIT 1',
                [firstPageData.paciente.cedula]
              );

              if (result.rows.length > 0) {
                pacienteId = result.rows[0].id;
              }
            }

            if (!pacienteId && firstPageData.paciente.email) {
              const result = await client.query(
                'SELECT id FROM pacientes WHERE email = $1 LIMIT 1',
                [firstPageData.paciente.email]
              );

              if (result.rows.length > 0) {
                pacienteId = result.rows[0].id;
              }
            }

            if (!pacienteId) {
              const sexo = firstPageData.paciente.sexo || 'Femenino';

              // Capitalizar nombres y apellidos
              const nombresCapitalizados = this.capitalizeName(firstPageData.paciente.nombres);
              const apellidosCapitalizados = this.capitalizeName(firstPageData.paciente.apellidos);

              // Validar y ajustar edad: debe estar en rango válido (1-150) para cumplir con constraint
              let edadFinal = firstPageData.paciente.edad;
              if (!edadFinal || edadFinal < 1 || edadFinal > 150) {
                console.warn(`⚠️ Edad inválida o no encontrada (${edadFinal}), usando valor por defecto: 1`);
                edadFinal = 1; // Valor mínimo válido para constraint
              }

              const insertResult = await client.query(
                `INSERT INTO pacientes (
                  nombres, apellidos, cedula, email, telefono, edad, sexo, activo, clinica_alias
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
                RETURNING id`,
                [
                  nombresCapitalizados,
                  apellidosCapitalizados,
                  firstPageData.paciente.cedula || null,
                  firstPageData.paciente.email || null,
                  firstPageData.paciente.telefono || null,
                  edadFinal,
                  sexo,
                  process.env['CLINICA_ALIAS'] || 'femimed'
                ]
              );

              pacienteId = insertResult.rows[0].id;
              results.pacientes_creados++;
            } else {
              // Actualizar paciente existente si hay datos nuevos
              const updateData: any = {};
              
              // Capitalizar nombres y apellidos si están presentes
              if (firstPageData.paciente.nombres) {
                updateData.nombres = this.capitalizeName(firstPageData.paciente.nombres);
              }
              if (firstPageData.paciente.apellidos) {
                updateData.apellidos = this.capitalizeName(firstPageData.paciente.apellidos);
              }
              if (firstPageData.paciente.email) updateData.email = firstPageData.paciente.email;
              if (firstPageData.paciente.telefono) updateData.telefono = firstPageData.paciente.telefono;
              if (firstPageData.paciente.edad) updateData.edad = firstPageData.paciente.edad;
              
              // Siempre actualizar clinica_alias
              updateData.clinica_alias = process.env['CLINICA_ALIAS'] || 'femimed';

              if (Object.keys(updateData).length > 0) {
                const updateFields = Object.keys(updateData).map((key, index) => `${key} = $${index + 1}`).join(', ');
                const updateValues = Object.values(updateData);
                updateValues.push(pacienteId);
                
                await client.query(
                  `UPDATE pacientes SET ${updateFields} WHERE id = $${updateValues.length}`,
                  updateValues
                );
              }
              
              results.pacientes_actualizados++;
            }

            // Procesar cada hoja como un registro separado
            for (let i = 0; i < pages.length; i++) {
              const pageText = pages[i];
              if (!pageText) {
                console.warn(`⚠️ Hoja ${i + 1} del archivo ${file.originalname} está vacía, saltando...`);
                continue;
              }
              
              // Parsear cada hoja
              const parsedData = this.parserService.parseDocument(pageText, file.originalname);

              // Extraer campos individuales
              let motivoConsulta = parsedData.historia.motivo_consulta || 'Consulta médica';
              // diagnostico ahora contiene solo la sección DIAGNÓSTICO (no los exámenes)
              let diagnostico = parsedData.historia.diagnostico || '';
              // examenes_medico contiene Examen Físico, Ultrasonido, etc.
              let examenesMedico = parsedData.historia.examenes_medico || '';
              let conclusiones = parsedData.historia.conclusiones || '';
              let plan = parsedData.historia.plan || '';
              // antecedentes_otros ahora contiene TODOS los antecedentes consolidados
              let antecedentesOtros = parsedData.historia.antecedentes_otros || '';

              // motivo_consulta debe contener SOLO el motivo de consulta
              const motivoConsultaFormateado = motivoConsulta ? `<p>${motivoConsulta}</p>` : '<p>Consulta médica</p>';

              // Formatear diagnostico (puede contener múltiples líneas)
              const diagnosticoFormateado = diagnostico ? diagnostico.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<p>${line}</p>`).join('') : null;

              // Formatear examenes_medico (puede contener múltiples líneas)
              const examenesMedicoFormateado = examenesMedico ? examenesMedico.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<p>${line}</p>`).join('') : null;

              // Usar la fecha extraída de la hoja, o la fecha actual si no se encontró
              const fechaConsulta = parsedData.historia.fecha_consulta || new Date().toISOString().split('T')[0];

              if (antecedentesOtros && antecedentesOtros.trim()) {
                const otrosFormateado = antecedentesOtros.split('\n').map(line => line.trim()).filter(line => line.length > 0).map(line => `<p>${line}</p>`).join('');
                await client.query('UPDATE pacientes SET antecedentes_otros = $1, fecha_actualizacion = NOW() WHERE id = $2', [otrosFormateado, pacienteId]);
              }
              await client.query(
                `INSERT INTO historico_pacientes (
                  paciente_id, medico_id, motivo_consulta, diagnostico, conclusiones, plan, fecha_consulta, clinica_alias,
                  examenes_medico
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  pacienteId,
                  medicoIdToUse,
                  motivoConsultaFormateado,
                  diagnosticoFormateado,
                  conclusiones ? `<p>${conclusiones}</p>` : null,
                  plan ? `<p>${plan}</p>` : null,
                  fechaConsulta,
                  process.env['CLINICA_ALIAS'] || 'multimed',
                  examenesMedicoFormateado
                ]
              );

              results.historias_creadas++;
            }

            results.exitosos++;
        } catch (error) {
          results.fallidos++;
          results.errores.push({
            archivo: file.originalname,
            error: (error as Error).message
          });
        }
      }
    } finally {
      client.release();
    }

      const response: ApiResponse = {
        success: true,
        data: results
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Error en importación masiva:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }
}

// Exportar el middleware de multer para usar en las rutas
export const uploadWordFiles = upload.array('archivos', 100); // Máximo 100 archivos
export const uploadSingleWordFile = upload.single('archivo'); // Un solo archivo

