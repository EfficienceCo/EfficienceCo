import express from "express";
import {
  validarLicenca,
  buscarLicencaCliente,
} from "../controllers/licenca.controller.js";
import { autenticar, autenticarOpcional } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Rota do agente e frontend:
// - agente autentica via x-licenca-token
// - frontend autentica via JWT (opcional nesta rota, lido no controller)
router.get("/validar", autenticarOpcional, validarLicenca);

// Rota do frontend com clienteId explicito no path (legado)
router.get("/:clienteId", autenticar, buscarLicencaCliente);

export default router;
