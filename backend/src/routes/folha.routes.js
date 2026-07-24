import express from "express";
import multer from "multer";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import { exigirLicencaAtiva } from "../middlewares/licenca.middleware.js";
import {
  baixarTemplate,
  uploadFolha,
  uploadFolhaAgente,
  calcularFolha,
  gerarSaidaFolha,
  consultarStatusFolha,
  baixarArquivoFolha,
} from "../controllers/folha.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === MIME_XLSX) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Envie um .xlsx."));
    }
  },
});

const MENSAGENS_ERRO_MULTER = {
  LIMIT_FILE_SIZE: "Planilha excede o tamanho máximo permitido (10MB).",
  LIMIT_UNEXPECTED_FILE: "Campo de arquivo inesperado. Envie no campo 'planilha'.",
};

function uploadPlanilha(req, res, next) {
  upload.single("planilha")(req, res, (err) => {
    if (err) {
      const mensagem = MENSAGENS_ERRO_MULTER[err.code] || err.message;
      return res.status(400).json({ erro: mensagem });
    }
    next();
  });
}

router.get("/template", todos, exigirLicencaAtiva, baixarTemplate);

// Web/dashboard — autenticado via JWT
router.post("/upload", todos, exigirLicencaAtiva, uploadPlanilha, uploadFolha);

// Agente — autenticado via x-licenca-token no controller (antes das rotas com param)
router.post("/upload/agente", uploadPlanilha, uploadFolhaAgente);

router.post("/:processamento_id/calcular", todos, exigirLicencaAtiva, calcularFolha);
router.post("/:processamento_id/gerar-saida", todos, exigirLicencaAtiva, gerarSaidaFolha);

// Status e download — depois de /template e /upload* para não sombrear rotas estáticas
router.get("/:processamento_id", todos, exigirLicencaAtiva, consultarStatusFolha);
router.get(
  "/:processamento_id/download/:arquivo",
  todos,
  exigirLicencaAtiva,
  baixarArquivoFolha,
);

console.log("[folha.routes] Rotas de folha registradas");

export default router;
