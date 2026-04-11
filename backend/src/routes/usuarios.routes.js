const express = require('express');
const router = express.Router();
const { autenticar } = require('../middlewares/auth.middleware');

router.get('/', autenticar, (req, res) => res.json({ message: 'listar usuários — a implementar' }));

module.exports = router;
