import express from "express";
import multer from "multer";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  criarRascunho,
  listarEventos,
  detalharEvento,
  aprovarEvento,
  baixarXml,
  transmitirEvento,
} from "../controllers/eventos-esocial.controller.js";

const router = express.Router();

const uploadCertificado = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(pfx|p12)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Envie um certificado .pfx ou .p12."));
    }
  },
});

function receberCertificado(req, res, next) {
  uploadCertificado.single("certificado")(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    next();
  });
}

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
// Criar e aprovar evento do eSocial geram/liberam uma obrigação legal —
// mesmo padrão de apuracoes.routes.js: admins, não abertas a 'funcionario'.
const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.post("/", admins, criarRascunho);
router.get("/", todos, listarEventos);
router.get("/:id", todos, detalharEvento);
router.get("/:id/xml", todos, baixarXml);
router.patch("/:id/aprovar", admins, aprovarEvento);
router.post("/:id/transmitir", admins, receberCertificado, transmitirEvento);

console.log("[eventos-esocial.routes] Rotas de eventos do eSocial registradas");

export default router;
