require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

// Rotas
// app.use('/auth', require('./routes/auth.routes'));
// app.use('/clientes', require('./routes/clientes.routes'));
// app.use('/licenca', require('./routes/licenca.routes'));
// app.use('/regras', require('./routes/regras.routes'));
// app.use('/eventos', require('./routes/eventos.routes'));
// app.use('/webhook', require('./routes/webhook.routes'));

module.exports = app;
