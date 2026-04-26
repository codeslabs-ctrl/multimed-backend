import multer from 'multer';
import type { Request } from 'express';
import path from 'path';
import fs from 'fs';

const ALLOWED_CLINICA_LOGO_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

/** Logos de informes y récipes: assets/logo/clinica/{id}/logo_informes.* o logo_recipe.* */
function createClinicaAtencionLogoMulter(kind: 'informes' | 'recipe') {
  return multer({
    storage: multer.diskStorage({
      destination: (req: Request, _file, cb) => {
        const id = parseInt(String(req.params['id'] ?? ''), 10);
        if (!Number.isFinite(id) || id <= 0) {
          cb(new Error('ID de clínica de atención inválido'), '');
          return;
        }
        const dir = path.join(process.cwd(), 'assets', 'logo', 'clinica', String(id));
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        } else {
          const prefix = kind === 'informes' ? 'logo_informes.' : 'logo_recipe.';
          try {
            for (const f of fs.readdirSync(dir)) {
              if (f === '.' || f === '..') continue;
              if (f.startsWith(prefix)) {
                fs.unlinkSync(path.join(dir, f));
              }
            }
          } catch (e) {
            console.warn('[clinica-atencion logo] Limpieza de archivo previo:', e);
          }
        }
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext0 = path.extname(file.originalname).toLowerCase() || '.png';
        const ext = ALLOWED_CLINICA_LOGO_EXT.has(ext0) ? ext0 : '.png';
        const base = kind === 'informes' ? 'logo_informes' : 'logo_recipe';
        cb(null, `${base}${ext}`);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
        cb(new Error('Solo se permiten archivos de imagen'));
        return;
      }
      const ext0 = path.extname(file.originalname).toLowerCase() || '.png';
      if (!ALLOWED_CLINICA_LOGO_EXT.has(ext0)) {
        cb(new Error('Extensión no permitida. Use png, jpg, jpeg, gif, webp o svg.'));
        return;
      }
      cb(null, true);
    }
  });
}

export const uploadClinicaAtencionLogoInformes = createClinicaAtencionLogoMulter('informes');
export const uploadClinicaAtencionLogoReceta = createClinicaAtencionLogoMulter('recipe');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(process.cwd(), 'assets', 'firmas');
    console.log(`📤 [Multer] Destino de upload: ${uploadPath}`);
    if (!fs.existsSync(uploadPath)) {
      console.log(`📁 [Multer] Creando directorio: ${uploadPath}`);
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const medicoId = req.params['id'];
    const ext = path.extname(file.originalname);
    const filename = `medico_${medicoId}_firma${ext}`;
    console.log(`📤 [Multer] Nombre de archivo generado: ${filename}`);
    console.log(`📤 [Multer] Archivo original: ${file.originalname}, MIME: ${file.mimetype}, Tamaño: ${file.size}`);
    cb(null, filename);
  }
});

const storageSello = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = path.join(process.cwd(), 'assets', 'firmas');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const medicoId = req.params['id'];
    cb(null, `medico_${medicoId}_sello${path.extname(file.originalname)}`);
  }
});

export const uploadFirma = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen (PNG, JPG, JPEG, GIF, WEBP)'));
  }
});

export const uploadSello = multer({
  storage: storageSello,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen (PNG, JPG, JPEG, GIF, WEBP)'));
  }
});
