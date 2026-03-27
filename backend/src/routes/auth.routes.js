const express = require('express');
const router = express.Router();

// POST /auth/login
router.post('/login', (req, res) => {
  res.json({ message: 'rota de login — a implementar' });
});

module.exports = router;
