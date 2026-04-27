import express from 'express';
import { exigirPerfil } from '../middlewares/permissao.middleware.js';

const router = express.Router();

router.get('/', exigirPerfil('admin_efficience', 'admin_cliente'), (req, res) => {
  console.log('[usuarios.routes] Listando usuarios — requisicao feita por:', req.usuario.id);
  res.json({ message: 'listar usuários — a implementar' });
});

console.log('[usuarios.routes] Rotas de usuarios registradas');

export default router;
