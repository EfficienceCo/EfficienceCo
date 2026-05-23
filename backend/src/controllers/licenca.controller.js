import supabase from "../config/database.js";
import { PERFIS } from "../middlewares/permissao.middleware.js";

function calcularLicencaAtiva({ ativa, validade }) {
  return Boolean(ativa && (!validade || new Date(validade) > new Date()));
}

function resolverStatusLicenca({ ativa, validade }) {
  if (ativa) {
    return "active";
  }

  if (validade && new Date(validade) <= new Date()) {
    return "expired";
  }

  return "suspended";
}

function montarRespostaLicenca(licenca, clienteId) {
  const ativa = calcularLicencaAtiva(licenca || {});

  return {
    ativa,
    validade: licenca?.validade || null,
    clienteId: clienteId || licenca?.cliente_id || null,
    status: resolverStatusLicenca({ ativa, validade: licenca?.validade }),
  };
}

async function consultarLicencaPorClienteId(clienteId) {
  return supabase
    .from("licencas")
    .select("cliente_id, ativa, validade")
    .eq("cliente_id", clienteId)
    .single();
}

async function consultarLicencaPorToken(token) {
  return supabase
    .from("licencas")
    .select("cliente_id, ativa, validade")
    .eq("token", token)
    .single();
}

export async function buscarLicencaCliente(req, res) {
  const { clienteId } = req.params;
  const { perfil, cliente_id } = req.usuario;

  if (perfil === PERFIS.ADMIN_CLIENTE && cliente_id !== clienteId) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const { data, error } = await consultarLicencaPorClienteId(clienteId);

  if (error || !data) {
    return res.status(404).json({ erro: "Licenca nao encontrada" });
  }

  return res.status(200).json(montarRespostaLicenca(data, clienteId));
}

export async function validarLicenca(req, res) {
  const token = req.headers["x-licenca-token"];
  const usuario = req.usuario;

  // Fluxo do frontend: JWT presente (req.usuario preenchido por autenticarOpcional)
  if (usuario) {
    if (!usuario.cliente_id) {
      return res.status(400).json({
        ativa: false,
        erro: "Usuario sem cliente vinculado no token.",
      });
    }

    const { data, error } = await consultarLicencaPorClienteId(usuario.cliente_id);

    if (error || !data) {
      return res
        .status(404)
        .json({ ativa: false, erro: "Licenca nao encontrada" });
    }

    return res
      .status(200)
      .json(montarRespostaLicenca(data, usuario.cliente_id));
  }

  // Fluxo do agente: validacao por x-licenca-token
  if (!token) {
    return res.status(400).json({ ativa: false, message: "Token ausente" });
  }

  const { data, error } = await consultarLicencaPorToken(token);

  if (error || !data) {
    return res
      .status(404)
      .json({ ativa: false, message: "Licenca nao encontrada" });
  }

  return res.status(200).json(montarRespostaLicenca(data));
}
