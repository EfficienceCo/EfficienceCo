console.log('[app.js] Arquivo app.js foi carregado');

console.log('[app.js] Importando express...');
const express = require('express');
console.log('[app.js] Express importado com sucesso');

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

app.use('/auth', require('./routes/auth.routes'));
app.use('/usuarios', require('./routes/usuarios.routes'));

console.log('[app.js] Exportando app...');
module.exports = app;
