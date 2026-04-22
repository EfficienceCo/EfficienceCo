import express from 'express';

const router = express.Router();

router.get('/:clienteId', (req, res) => res.json({ message: 'buscar regras — a implementar' }));

export default router;
