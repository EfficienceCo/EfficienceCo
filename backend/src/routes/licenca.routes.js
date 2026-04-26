import express from 'express';
import { validarLicenca } from '../controllers/licenca.controller.js';

const router = express.Router();

router.get('/validar', validarLicenca);

export default router;
