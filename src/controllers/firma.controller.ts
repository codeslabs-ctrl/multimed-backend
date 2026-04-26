import { Request, Response } from 'express';
import { FirmaService } from '../services/firma.service.js';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import fs from 'fs';
import path from 'path';

export class FirmaController {
  private firmaService: FirmaService;
  
  constructor() {
    this.firmaService = new FirmaService();
  }
  
  /**
   * Sube la firma digital de un médico
   */
  async subirFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      if (!req.file) {
        console.error('❌ [FirmaController] No se recibió archivo en req.file');
        res.status(400).json({
          success: false,
          error: { message: 'No se proporcionó archivo de firma' }
        } as ApiResponse<null>);
        return;
      }
      
      console.log(`📤 [FirmaController] Archivo recibido:`);
      console.log(`   - originalname: ${req.file.originalname}`);
      console.log(`   - filename: ${req.file.filename}`);
      console.log(`   - path: ${req.file.path}`);
      console.log(`   - size: ${req.file.size}`);
      console.log(`   - mimetype: ${req.file.mimetype}`);
      console.log(`   - Archivo existe físicamente: ${fs.existsSync(req.file.path)}`);
      
      // Verificar que el médico existe (PostgreSQL)
      const client = await postgresPool.connect();
      let medico: any;
      let firmaAnterior: string | null = null;
      try {
        const result = await client.query(
          'SELECT id, nombres, apellidos, firma_digital FROM medicos WHERE id = $1 LIMIT 1',
          [medicoId]
        );
        
        if (result.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { message: 'Médico no encontrado' }
          } as ApiResponse<null>);
          return;
        }
        
        medico = result.rows[0];
        firmaAnterior = medico.firma_digital || null;
      } finally {
        client.release();
      }
      
      // Guardar nueva firma PRIMERO (antes de eliminar la anterior)
      const rutaFirma = await this.firmaService.guardarFirma(medicoId, req.file);
      
      // Eliminar archivo de firma anterior solo si existe y es diferente a la nueva
      if (firmaAnterior && firmaAnterior !== rutaFirma) {
        try {
          // Normalizar la ruta: si comienza con /, removerlo; si no, usar tal cual
          const normalizedPath = firmaAnterior.startsWith('/') ? firmaAnterior.substring(1) : firmaAnterior;
          const fullPath = path.join(process.cwd(), normalizedPath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`✅ Archivo de firma anterior eliminado: ${fullPath}`);
          }
        } catch (error) {
          console.error('⚠️ Error eliminando firma anterior (no crítico):', error);
          // No fallar la operación si no se puede eliminar la firma anterior
        }
      }
      
      // Actualizar en base de datos (PostgreSQL)
      const updateClient = await postgresPool.connect();
      try {
        const updateResult = await updateClient.query(
          'UPDATE medicos SET firma_digital = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, firma_digital',
          [rutaFirma, medicoId]
        );
        
        if (updateResult.rows.length === 0) {
          throw new Error('No se pudo actualizar el campo firma_digital en la base de datos');
        }
        
        console.log(`✅ Campo firma_digital actualizado en BD para médico ${medicoId}: ${updateResult.rows[0].firma_digital}`);
      } finally {
        updateClient.release();
      }
      
      res.json({
        success: true,
        data: { 
          firma_digital: rutaFirma,
          medico: {
            id: medico.id,
            nombres: medico.nombres,
            apellidos: medico.apellidos
          }
        },
        message: 'Firma digital subida exitosamente'
      } as ApiResponse<any>);
      
    } catch (error) {
      console.error('❌ Error en subirFirma:', error);
      // Mensaje amigable para el usuario, sin detalles técnicos
      const errorMessage = (error as Error).message.includes('No se pudo guardar el archivo') 
        ? 'No se pudo guardar la firma digital. Por favor, intente nuevamente.'
        : 'Error al subir la firma digital. Por favor, intente nuevamente.';
      
      res.status(500).json({
        success: false,
        error: { message: errorMessage }
      } as ApiResponse<null>);
    }
  }

  async subirSello(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'ID de médico requerido' } } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({ success: false, error: { message: 'ID de médico inválido' } } as ApiResponse<null>);
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: { message: 'No se proporcionó archivo de sello' } } as ApiResponse<null>);
        return;
      }
      const client = await postgresPool.connect();
      let selloAnterior: string | null = null;
      try {
        const result = await client.query('SELECT id, sello_humedo FROM medicos WHERE id = $1 LIMIT 1', [medicoId]);
        if (result.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Médico no encontrado' } } as ApiResponse<null>);
          return;
        }
        selloAnterior = result.rows[0].sello_humedo ?? null;
      } finally {
        client.release();
      }
      const rutaSello = await this.firmaService.guardarSello(medicoId, req.file);
      if (selloAnterior && selloAnterior !== rutaSello) {
        try {
          const normalizedPath = selloAnterior.startsWith('/') ? selloAnterior.substring(1) : selloAnterior;
          const fullPath = path.join(process.cwd(), normalizedPath);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (_) {}
      }
      const updateClient = await postgresPool.connect();
      try {
        await updateClient.query(
          'UPDATE medicos SET sello_humedo = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2',
          [rutaSello, medicoId]
        );
      } finally {
        updateClient.release();
      }
      res.json({
        success: true,
        data: { sello_humedo: rutaSello },
        message: 'Sello húmedo subido exitosamente'
      } as ApiResponse<any>);
    } catch (error) {
      console.error('❌ Error en subirSello:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      } as ApiResponse<null>);
    }
  }

  async servirSello(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'ID de médico requerido' } } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({ success: false, error: { message: 'ID de médico inválido' } } as ApiResponse<null>);
        return;
      }
      const rutaSello = await this.firmaService.obtenerSello(medicoId);
      if (!rutaSello) {
        res.status(404).json({ success: false, error: { message: 'Sello no encontrado' } } as ApiResponse<null>);
        return;
      }
      const normalizedPath = rutaSello.startsWith('/') ? rutaSello.substring(1) : rutaSello;
      const fullPath = path.join(process.cwd(), normalizedPath);
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ success: false, error: { message: 'Archivo de sello no encontrado' } } as ApiResponse<null>);
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      const ext = path.extname(fullPath).toLowerCase();
      const contentTypeMap: { [key: string]: string } = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'
      };
      res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
      res.sendFile(fullPath);
    } catch (error) {
      console.error('❌ Error en servirSello:', error);
      res.status(500).json({ success: false, error: { message: (error as Error).message } } as ApiResponse<null>);
    }
  }
  
  /**
   * Obtiene la firma digital de un médico
   */
  async obtenerFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      const rutaFirma = await this.firmaService.obtenerFirma(medicoId);
      
      if (!rutaFirma) {
        res.status(404).json({
          success: false,
          error: { message: 'Firma digital no encontrada' }
        } as ApiResponse<null>);
        return;
      }
      
      res.json({
        success: true,
        data: { firma_digital: rutaFirma }
      } as ApiResponse<any>);
      
    } catch (error) {
      console.error('❌ Error en obtenerFirma:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      } as ApiResponse<null>);
    }
  }
  
  /**
   * Sirve la imagen de la firma digital de un médico
   */
  async servirFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      const rutaFirma = await this.firmaService.obtenerFirma(medicoId);
      
      if (!rutaFirma) {
        res.status(404).json({
          success: false,
          error: { message: 'Firma digital no encontrada' }
        } as ApiResponse<null>);
        return;
      }
      
      // Normalizar la ruta y construir la ruta completa
      const normalizedPath = rutaFirma.startsWith('/') ? rutaFirma.substring(1) : rutaFirma;
      const fullPath = require('path').join(process.cwd(), normalizedPath);
      
      if (!require('fs').existsSync(fullPath)) {
        res.status(404).json({
          success: false,
          error: { message: 'Archivo de firma no encontrado' }
        } as ApiResponse<null>);
        return;
      }
      
      // Establecer headers CORS y CORP
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      // Determinar el tipo de contenido
      const ext = require('path').extname(fullPath).toLowerCase();
      const contentTypeMap: { [key: string]: string } = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';
      
      res.setHeader('Content-Type', contentType);
      res.sendFile(fullPath);
      
    } catch (error) {
      console.error('❌ Error en servirFirma:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al servir la firma digital' }
      } as ApiResponse<null>);
    }
  }
  
  /**
   * Elimina la firma digital de un médico
   */
  async eliminarFirma(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico requerido' }
        } as ApiResponse<null>);
        return;
      }
      const medicoId = parseInt(id);
      
      if (isNaN(medicoId) || medicoId <= 0) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de médico inválido' }
        } as ApiResponse<null>);
        return;
      }
      
      // Eliminar archivo físico
      await this.firmaService.eliminarFirma(medicoId);
      
      // Actualizar en base de datos (PostgreSQL)
      const client = await postgresPool.connect();
      try {
        await client.query(
          'UPDATE medicos SET firma_digital = NULL WHERE id = $1',
          [medicoId]
        );
      } finally {
        client.release();
      }
      
      res.json({
        success: true,
        message: 'Firma digital eliminada exitosamente'
      } as ApiResponse<null>);
      
    } catch (error) {
      console.error('❌ Error en eliminarFirma:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      } as ApiResponse<null>);
    }
  }
}
