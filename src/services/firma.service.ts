import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { postgresPool } from '../config/database.js';

export class FirmaService {
  /** Ruta en BD → archivo en disco (varias raíces por distinto cwd al arrancar Node). */
  private resolveStoredFilePath(storedPath: string): string | null {
    if (!storedPath || typeof storedPath !== 'string') return null;
    const trimmed = storedPath.trim();
    if (!trimmed) return null;
    if (path.isAbsolute(trimmed)) {
      const abs = path.normalize(trimmed);
      if (fs.existsSync(abs)) return abs;
      return null;
    }
    const normalized = trimmed.replace(/^\/+/, '').replace(/\\/g, '/');
    const packageRoot = path.join(__dirname, '..', '..');
    const candidates = [
      path.join(process.cwd(), normalized),
      path.join(process.cwd(), 'backend', normalized),
      path.join(packageRoot, normalized),
      path.join(packageRoot, 'dist', normalized),
      path.join(packageRoot, '..', normalized)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private findFirmaSelloByConvention(medicoId: number, kind: 'firma' | 'sello'): string | null {
    const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const base = `assets/firmas/medico_${medicoId}_${kind}`;
    for (const ext of exts) {
      const resolved = this.resolveStoredFilePath(`${base}${ext}`);
      if (resolved) return resolved;
    }
    return null;
  }

  /**
   * Guarda la firma digital de un médico
   * @param medicoId ID del médico
   * @param archivo Archivo de firma subido
   * @returns Ruta relativa de la firma guardada
   */
  async guardarFirma(medicoId: number, archivo: Express.Multer.File): Promise<string> {
    try {
      const filename = `medico_${medicoId}_firma${path.extname(archivo.originalname)}`;
      const rutaCompleta = path.join(process.cwd(), 'assets', 'firmas', filename);
      
      console.log(`📤 [FirmaService] Guardando firma para médico ${medicoId}`);
      console.log(`📤 [FirmaService] Nombre de archivo: ${filename}`);
      console.log(`📤 [FirmaService] Ruta completa esperada: ${rutaCompleta}`);
      console.log(`📤 [FirmaService] Ruta de multer (archivo.path): ${archivo.path}`);
      console.log(`📤 [FirmaService] Archivo existe en archivo.path: ${fs.existsSync(archivo.path)}`);
      
      // Crear directorio si no existe
      const dir = path.dirname(rutaCompleta);
      if (!fs.existsSync(dir)) {
        console.log(`📁 [FirmaService] Creando directorio: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Multer ya guarda el archivo en la ubicación correcta con el nombre correcto
      // Solo necesitamos verificar que el archivo existe donde multer lo guardó
      const archivoExiste = fs.existsSync(archivo.path);
      const rutaCompletaExiste = fs.existsSync(rutaCompleta);
      
      console.log(`📤 [FirmaService] Archivo existe en archivo.path: ${archivoExiste}`);
      console.log(`📤 [FirmaService] Archivo existe en rutaCompleta: ${rutaCompletaExiste}`);
      
      // Si multer guardó el archivo en una ubicación diferente, moverlo
      if (archivo.path !== rutaCompleta && archivoExiste) {
        console.log(`📤 [FirmaService] Moviendo archivo de ${archivo.path} a ${rutaCompleta}`);
        if (rutaCompletaExiste) {
          console.log(`📤 [FirmaService] Eliminando archivo existente en rutaCompleta`);
          fs.unlinkSync(rutaCompleta);
        }
        fs.renameSync(archivo.path, rutaCompleta);
      }
      
      // Verificar que el archivo existe en la ubicación final
      // Primero verificar en archivo.path (donde multer lo guardó)
      let archivoFinal = archivo.path;
      if (fs.existsSync(rutaCompleta)) {
        archivoFinal = rutaCompleta;
      } else if (!fs.existsSync(archivo.path)) {
        // Error simplificado para el usuario, detalles técnicos en logs
        console.error(`❌ [FirmaService] Archivo no encontrado después de multer:`);
        console.error(`   - archivo.path: ${archivo.path}`);
        console.error(`   - rutaCompleta: ${rutaCompleta}`);
        throw new Error('No se pudo guardar el archivo');
      }
      
      console.log(`✅ [FirmaService] Archivo encontrado en: ${archivoFinal}`);
      
      // Calcular hash para verificar integridad
      const hash = crypto.createHash('sha256');
      hash.update(fs.readFileSync(archivoFinal));
      const hashValue = hash.digest('hex');
      
      console.log(`✅ Firma guardada para médico ${medicoId}: ${filename}`);
      console.log(`📁 Ruta completa: ${archivoFinal}`);
      console.log(`🔐 Hash de integridad: ${hashValue}`);
      
      // Retornar ruta relativa sin el / inicial para compatibilidad multiplataforma
      // Normalizar la ruta para que siempre sea relativa desde process.cwd()
      const rutaRelativa = path.relative(process.cwd(), archivoFinal).replace(/\\/g, '/');
      console.log(`📤 [FirmaService] Ruta relativa retornada: ${rutaRelativa}`);
      return rutaRelativa;
    } catch (error) {
      console.error('❌ Error guardando firma:', error);
      throw new Error(`Error guardando firma: ${(error as Error).message}`);
    }
  }

  /**
   * Guarda el sello húmedo de un médico en la misma carpeta que la firma (assets/firmas)
   */
  async guardarSello(medicoId: number, archivo: Express.Multer.File): Promise<string> {
    try {
      const filename = `medico_${medicoId}_sello${path.extname(archivo.originalname)}`;
      const rutaCompleta = path.join(process.cwd(), 'assets', 'firmas', filename);
      const dir = path.dirname(rutaCompleta);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (archivo.path !== rutaCompleta && fs.existsSync(archivo.path)) {
        if (fs.existsSync(rutaCompleta)) fs.unlinkSync(rutaCompleta);
        fs.renameSync(archivo.path, rutaCompleta);
      }
      const archivoFinal = fs.existsSync(rutaCompleta) ? rutaCompleta : archivo.path;
      if (!fs.existsSync(archivoFinal)) throw new Error('No se pudo guardar el archivo del sello');
      return path.relative(process.cwd(), archivoFinal).replace(/\\/g, '/');
    } catch (error) {
      console.error('❌ Error guardando sello:', error);
      throw new Error(`Error guardando sello: ${(error as Error).message}`);
    }
  }
  
  /**
   * Obtiene la ruta de la firma digital de un médico
   * @param medicoId ID del médico
   * @returns Ruta de la firma o null si no existe
   */
  async obtenerFirma(medicoId: number): Promise<string | null> {
    try {
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT firma_digital FROM medicos WHERE id = $1 LIMIT 1',
          [medicoId]
        );
        
        if (result.rows.length === 0) {
          return null;
        }
        
        return result.rows[0].firma_digital || null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en obtenerFirma:', error);
      return null;
    }
  }
  
  /**
   * Elimina la firma digital de un médico
   * @param medicoId ID del médico
   */
  async eliminarFirma(medicoId: number): Promise<void> {
    try {
      const firmaPath = await this.obtenerFirma(medicoId);
      if (firmaPath) {
        const fullPath = this.resolveStoredFilePath(firmaPath);
        if (fullPath && fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log(`✅ Firma eliminada para médico ${medicoId}`);
          console.log(`📁 Archivo eliminado: ${fullPath}`);
        } else {
          console.warn(`⚠️ Archivo de firma no encontrado para eliminar: ${fullPath}`);
        }
      }
    } catch (error) {
      console.error('❌ Error eliminando firma:', error);
      throw new Error(`Error eliminando firma: ${(error as Error).message}`);
    }
  }
  
  /**
   * Convierte la firma a base64 para incluir en PDF
   * @param medicoId ID del médico
   * @returns Base64 de la firma o string vacío si no existe
   */
  async obtenerFirmaBase64(medicoId: number): Promise<string> {
    try {
      const firmaPath = await this.obtenerFirma(medicoId);
      if (!firmaPath) {
        return '';
      }
      
      const fullPath = this.resolveStoredFilePath(firmaPath);
      if (!fullPath) {
        console.warn(`⚠️ Archivo de firma no encontrado. Ruta en BD: ${firmaPath}`);
        console.warn(`   cwd: ${process.cwd()}`);
        return '';
      }

      const firmaBuffer = fs.readFileSync(fullPath);
      const base64 = firmaBuffer.toString('base64');
      const ext = path.extname(fullPath).toLowerCase();
      
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('❌ Error obteniendo firma base64:', error);
      return '';
    }
  }

  async obtenerSello(medicoId: number): Promise<string | null> {
    try {
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT sello_humedo FROM medicos WHERE id = $1 LIMIT 1',
          [medicoId]
        );
        if (result.rows.length === 0) return null;
        return result.rows[0].sello_humedo ?? null;
      } finally {
        client.release();
      }
    } catch {
      return null;
    }
  }

  async obtenerSelloBase64(medicoId: number): Promise<string> {
    try {
      const selloPath = await this.obtenerSello(medicoId);
      let fullPath =
        selloPath && typeof selloPath === 'string' ? this.resolveStoredFilePath(selloPath) : null;
      if (!fullPath) {
        fullPath = this.findFirmaSelloByConvention(medicoId, 'sello');
      }
      if (!fullPath) return '';
      const buf = fs.readFileSync(fullPath);
      const base64 = buf.toString('base64');
      const ext = path.extname(fullPath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      return `data:${mimeType};base64,${base64}`;
    } catch {
      return '';
    }
  }
}
