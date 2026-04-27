console.log('[app.js] Arquivo app.js foi carregado');

console.log('[app.js] Importando express...');
import express from 'express';
console.log('[app.js] Express importado com sucesso');

import authRoutes from './routes/auth.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import licencaRoutes from './routes/licenca.routes.js';
import regrasRoutes from './routes/regras.routes.js';
import eventosRoutes from './routes/eventos.routes.js';

console.log('[app.js] Criando instancia do app...');
const app = express();
console.log('[app.js] Instancia do app criada');

console.log('[app.js] Registrando middleware express.json()...');
app.use(express.json());
console.log('[app.js] Middleware express.json() registrado');

console.log('[app.js] Registrando rota GET /health...');
app.get('/health', (req, res) => {
  console.log(`[app.js] Requisicao recebida: ${req.method} ${req.url}`);
  console.log('[app.js] Enviando resposta { status: "ok" }');
  res.json({ status: 'ok' });
  console.log('[app.js] Resposta enviada com sucesso');
});
console.log('[app.js] Rota GET /health registrada');

console.log('[app.js] Registrando rotas de autenticacao...');
app.use('/auth', authRoutes);
console.log('[app.js] Rota /auth registrada');

app.use('/clientes', clientesRoutes);
console.log('[app.js] Rota /clientes registrada');

console.log('[app.js] Registrando rotas de usuarios...');
app.use('/usuarios', usuariosRoutes);
console.log('[app.js] Rota /usuarios registrada');

app.use('/licenca', licencaRoutes);
console.log('[app.js] Rota /licenca registrada');

app.use('/regras', regrasRoutes);
console.log('[app.js] Rota /regras registrada');

app.use('/eventos', eventosRoutes);
console.log('[app.js] Rota /eventos registrada');

console.log('[app.js] Exportando app...');
export default app;
