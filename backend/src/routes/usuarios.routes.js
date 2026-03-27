const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ message: 'listar usuários — a implementar' }));

module.exports = router;
