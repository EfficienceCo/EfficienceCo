const express = require('express');
const router = express.Router();

router.post('/', (req, res) => res.json({ message: 'registrar evento — a implementar' }));

module.exports = router;
