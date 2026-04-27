import express from 'express';
import { exigirPerfil } from '../middlewares/permissao.middleware.js';

const router = express.Router();

router.get('/', exigirPerfil('admin_efficience'), (req, res) =>
  res.json({ message: 'listar clientes — a implementar' })
);

router.post('/', exigirPerfil('admin_efficience'), (req, res) =>
  res.json({ message: 'criar cliente — a implementar' })
);

console.log('[clientes.routes] Rotas de clientes registradas');

export default router;
