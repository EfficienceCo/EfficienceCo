import express from "express";
import multer from "multer";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  listarObrigacoes,
  criarObrigacao,
  atualizarObrigacao,
  deletarObrigacao,
  proximasObrigacoes,
  concluirObrigacao,
  MIME_EXTENSOES,
} from "../controllers/obrigacoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
const admins = exigirPerfil("admin_efficience", "admin_cliente");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(MIME_EXTENSOES, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Use PDF, JPEG, PNG ou WEBP."));
    }
  },
});

function uploadComprovante(req, res, next) {
  upload.single("comprovante")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    next();
  });
}

// /proximas deve vir antes de /:id para não ser capturado como parâmetro
router.get("/proximas", todos, proximasObrigacoes);
router.get("/", todos, listarObrigacoes);
router.post("/", admins, criarObrigacao);
router.patch("/:id/concluir", admins, uploadComprovante, concluirObrigacao);
router.patch("/:id", admins, atualizarObrigacao);
router.delete("/:id", admins, deletarObrigacao);

console.log("[obrigacoes.routes] Rotas de obrigações registradas");

export default router;
