import express from 'express';

const router = express.Router();

router.post('/', (req, res) => res.json({ message: 'registrar evento — a implementar' }));

export default router;
