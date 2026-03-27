const express = require('express');
const router = express.Router();

// GET /licenca/validar — chamado pelo agente local
router.get('/validar', (req, res) => {
  res.json({ ativa: false, message: 'validação de licença — a implementar' });
});

module.exports = router;
