const express = require('express');
const router = express.Router();

// POST /webhook/stripe
router.post('/stripe', (req, res) => {
  res.json({ message: 'webhook stripe — a implementar' });
});

module.exports = router;
