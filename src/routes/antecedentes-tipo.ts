import express from 'express';
import { AntecedenteTipoController } from '../controllers/antecedente-tipo.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const controller = new AntecedenteTipoController();

router.use(authenticateToken);

router.get('/categoria-labels', (req, res) => controller.getCategoriaLabels(req, res));
router.get('/tipo-labels', (req, res) => controller.listTipoLabels(req, res));
router.post('/tipo-labels', (req, res) => controller.createTipoLabel(req, res));
router.put('/tipo-labels/:id', (req, res) => controller.updateTipoLabel(req, res));
router.delete('/tipo-labels/:id', (req, res) => controller.deleteTipoLabel(req, res));
router.get('/', (req, res) => controller.getAll(req, res));
router.get('/por-tipo', (req, res) => controller.getByTipo(req, res));
router.get('/:id', (req, res) => controller.getById(req, res));
router.post('/', (req, res) => controller.create(req, res));
router.put('/:id', (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
