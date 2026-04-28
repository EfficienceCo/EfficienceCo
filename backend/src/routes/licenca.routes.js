import express from "express";
import { validarLicenca, buscarLicencaCliente } from "../controllers/licenca.controller.js";
import { autenticar } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Rota do agente — autenticada via x-licenca-token
router.get("/validar", validarLicenca);

// Rota do frontend — autenticada via JWT
router.get("/:clienteId", autenticar, buscarLicencaCliente);

export default router;
