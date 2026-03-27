const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ message: 'listar clientes — a implementar' }));
router.post('/', (req, res) => res.json({ message: 'criar cliente — a implementar' }));

module.exports = router;
