import express from 'express';
import { exigirPerfil } from '../middlewares/permissao.middleware.js';
import { listarClientes, buscarCliente, criarCliente } from '../controllers/clientes.controller.js';

const router = express.Router();

router.get('/', exigirPerfil('admin_efficience'), listarClientes);
router.get('/:id', exigirPerfil('admin_efficience'), buscarCliente);
router.post('/', exigirPerfil('admin_efficience'), criarCliente);

console.log('[clientes.routes] Rotas de clientes registradas');

export default router;
