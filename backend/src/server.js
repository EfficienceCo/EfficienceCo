console.log('[server.js] Arquivo server.js foi carregado');

console.log('[server.js] Carregando dotenv...');
require('dotenv').config();
console.log('[server.js] dotenv carregado com sucesso');

console.log('[server.js] Importando app.js...');
const app = require('./app');
console.log('[server.js] app.js importado com sucesso');

const PORT = process.env.PORT;
console.log(`[server.js] PORT lida do .env: ${PORT}`);

console.log('[server.js] Iniciando app.listen()...');
app.listen(PORT, () => {
  console.log(`[server.js] Servidor rodando na porta ${PORT}`);
  console.log(`[server.js] Teste em: http://localhost:${PORT}/health`);
});
