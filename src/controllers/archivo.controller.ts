import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = 'uploads/historias';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB límite por archivo
    files: 5 // Máximo 5 archivos
  },
  fileFilter: (_req, file, cb) => {
    // Permitir solo ciertos tipos de archivos
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});

export const uploadMiddleware = upload.array('archivos', 5); // Máximo 5 archivos

export class ArchivoController {
  // Subir archivos (múltiples)
  static async uploadArchivo(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'No se proporcionaron archivos' }
        });
        return;
      }

      if (files.length > 5) {
        res.status(400).json({
          success: false,
          error: { message: 'Máximo 5 archivos permitidos' }
        });
        return;
      }

      const { historia_id, descripciones } = req.body;

      if (!historia_id) {
        res.status(400).json({
          success: false,
          error: { message: 'historia_id es requerido' }
        });
        return;
      }

      // Parsear descripciones si vienen como JSON string
      let descripcionesArray: string[] = [];
      if (descripciones) {
        try {
          descripcionesArray = typeof descripciones === 'string' 
            ? JSON.parse(descripciones) 
            : descripciones;
        } catch (e) {
          descripcionesArray = [descripciones];
        }
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Verificar que la historia existe
        const historiaCheck = await client.query(
          'SELECT id FROM historico_pacientes WHERE id = $1',
          [parseInt(historia_id)]
        );

        if (historiaCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({
            success: false,
            error: { message: 'Historia no encontrada' }
          });
          return;
        }

        // Insertar todos los archivos en la base de datos
        const insertQuery = `
          INSERT INTO archivos_anexos (
            historia_id, nombre_original, nombre_archivo, ruta_archivo,
            tipo_mime, tamano_bytes, descripcion, activo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `;

        const insertedFiles = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) {
            console.warn(`⚠️ Archivo en índice ${i} es undefined, omitiendo...`);
            continue;
          }
          const result = await client.query(insertQuery, [
            parseInt(historia_id),
            file.originalname,
            file.filename,
            file.path,
            file.mimetype,
            file.size,
            descripcionesArray[i] || null,
            true
          ]);
          insertedFiles.push(result.rows[0]);
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          data: insertedFiles,
          message: `${files.length} archivo(s) subido(s) exitosamente`
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error inserting archivos:', error);
        res.status(500).json({
          success: false,
          error: { message: 'Error al guardar los archivos en la base de datos' }
        });
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error uploading archivos:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener archivos por historia
  static async getArchivosByHistoria(req: Request, res: Response): Promise<void> {
    try {
      const { historiaId } = req.params;

      if (!historiaId || isNaN(parseInt(historiaId))) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de historia inválido' }
        });
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT * 
          FROM archivos_anexos 
          WHERE historia_id = $1 AND activo = true
          ORDER BY fecha_subida DESC
        `;
        
        const result = await client.query(query, [parseInt(historiaId)]);
        
        res.json({
          success: true,
          data: result.rows || []
        });
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error getting archivos:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Obtener archivo por ID
  static async getArchivoById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de archivo inválido' }
        });
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT * 
          FROM archivos_anexos 
          WHERE id = $1 AND activo = true
        `;
        
        const result = await client.query(query, [parseInt(id)]);
        
        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Archivo no encontrado' }
          });
          return;
        }

        res.json({
          success: true,
          data: result.rows[0]
        });
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error getting archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Actualizar archivo
  static async updateArchivo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { descripcion } = req.body;

      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de archivo inválido' }
        });
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const updateQuery = `
          UPDATE archivos_anexos 
          SET descripcion = $1, fecha_actualizacion = NOW()
          WHERE id = $2 AND activo = true
          RETURNING *
        `;
        
        const result = await client.query(updateQuery, [descripcion || null, parseInt(id)]);
        
        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Archivo no encontrado' }
          });
          return;
        }

        res.json({
          success: true,
          data: result.rows[0]
        });
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error updating archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Eliminar archivo (marcar como inactivo)
  static async deleteArchivo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de archivo inválido' }
        });
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const updateQuery = `
          UPDATE archivos_anexos 
          SET activo = false, fecha_actualizacion = NOW()
          WHERE id = $1
          RETURNING id
        `;
        
        const result = await client.query(updateQuery, [parseInt(id)]);
        
        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Archivo no encontrado' }
          });
          return;
        }

        res.json({
          success: true
        });
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error deleting archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }

  // Descargar archivo
  static async downloadArchivo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de archivo inválido' }
        });
        return;
      }

      let archivo: any;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT * 
          FROM archivos_anexos 
          WHERE id = $1 AND activo = true
        `;
        
        const result = await client.query(query, [parseInt(id)]);
        
        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Archivo no encontrado' }
          });
          return;
        }

        archivo = result.rows[0];
      } finally {
        client.release();
      }

      // Verificar que el archivo existe en el sistema de archivos
      if (!fs.existsSync(archivo.ruta_archivo)) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo no encontrado en el servidor' }
        });
        return;
      }

      // Configurar headers para descarga
      res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre_original}"`);
      res.setHeader('Content-Type', archivo.tipo_mime);

      // Enviar archivo
      const fileStream = fs.createReadStream(archivo.ruta_archivo);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Error downloading archivo:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      });
    }
  }
}
