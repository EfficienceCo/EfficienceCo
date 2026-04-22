import express from 'express';

const router = express.Router();

// POST /webhook/stripe
router.post('/stripe', (req, res) => {
  res.json({ message: 'webhook stripe — a implementar' });
});

export default router;
