import express from "express";
import multer from "multer";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import { validarUuidParams } from "../middlewares/uuid.middleware.js";
import {
  criarConciliacaoExtrato,
  listarTransacoesExtrato,
  buscarExtratoAtual,
  criarConciliacao,
  listarConciliacoes,
  buscarConciliacao,
  confirmarPar,
  rejeitarPar,
  concluirConciliacao,
  gerarRelatorioConciliacao,
} from "../controllers/conciliacoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
const validarId = validarUuidParams("id");
const validarIdEParId = validarUuidParams("id", "pareId");

const LIMITE_OFX_MB = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_OFX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.ofx$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Envie um arquivo .ofx."));
    }
  },
});

const MENSAGENS_ERRO_MULTER = {
  LIMIT_FILE_SIZE: `O arquivo excede o tamanho máximo permitido (${LIMITE_OFX_MB} MB).`,
};

function uploadExtrato(req, res, next) {
  upload.single("arquivo")(req, res, (err) => {
    if (err) {
      const mensagem = MENSAGENS_ERRO_MULTER[err.code] || err.message;
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ erro: mensagem });
    }
    next();
  });
}

router.post("/extrato", todos, uploadExtrato, criarConciliacaoExtrato);
router.get("/extrato", todos, buscarExtratoAtual);
router.get("/extrato/:id/transacoes", todos, validarId, listarTransacoesExtrato);
router.post("/", todos, criarConciliacao);
router.get("/", todos, listarConciliacoes);
router.patch("/:id/pares/:pareId/confirmar", todos, validarIdEParId, confirmarPar);
router.patch("/:id/pares/:pareId/rejeitar", todos, validarIdEParId, rejeitarPar);
router.post("/:id/concluir", todos, validarId, concluirConciliacao);
router.get("/:id/relatorio", todos, validarId, gerarRelatorioConciliacao);
router.get("/:id", todos, validarId, buscarConciliacao);

console.log("[conciliacoes.routes] Rotas de conciliação bancária registradas");

export default router;
