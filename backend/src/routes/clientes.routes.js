import express from 'express';
import { exigirPerfil } from '../middlewares/permissao.middleware.js';
import { listarClientes, buscarCliente, criarCliente, iniciarPagamento } from '../controllers/clientes.controller.js';

const router = express.Router();

router.get('/', exigirPerfil('admin_efficience'), listarClientes);
router.get('/:id', exigirPerfil('admin_efficience'), buscarCliente);
router.post('/', exigirPerfil('admin_efficience'), criarCliente);
router.post('/:id/sessao-pagamento', exigirPerfil('admin_efficience'), iniciarPagamento);

console.log('[clientes.routes] Rotas de clientes registradas');

export default router;
