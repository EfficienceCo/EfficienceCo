import express from "express";
import multer from "multer";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  criarConciliacaoExtrato,
  listarTransacoesExtrato,
  criarConciliacao,
  listarConciliacoes,
  buscarConciliacao,
  confirmarPar,
  rejeitarPar,
  concluirConciliacao,
} from "../controllers/conciliacoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.ofx$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Envie um arquivo .ofx."));
    }
  },
});

function uploadExtrato(req, res, next) {
  upload.single("arquivo")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    next();
  });
}

router.post("/extrato", todos, uploadExtrato, criarConciliacaoExtrato);
router.get("/extrato/:id/transacoes", todos, listarTransacoesExtrato);
router.post("/", todos, criarConciliacao);
router.get("/", todos, listarConciliacoes);
router.patch("/:id/pares/:pareId/confirmar", todos, confirmarPar);
router.patch("/:id/pares/:pareId/rejeitar", todos, rejeitarPar);
router.post("/:id/concluir", todos, concluirConciliacao);
router.get("/:id", todos, buscarConciliacao);

console.log("[conciliacoes.routes] Rotas de conciliação bancária registradas");

export default router;
