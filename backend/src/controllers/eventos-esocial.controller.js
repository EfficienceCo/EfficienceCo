// #376 (ES-7) — Fluxo do evento eSocial: gerar rascunho -> revisar -> aprovar -> baixar.
//
// Conecta o formulário do wizard (front) ao gerador de XML (#ES-6), grava em
// `eventos_esocial` (#ES-2) como rascunho, expõe o XML para a tela de revisão,
// registra a aprovação humana (obrigatória, sempre) e só então libera o
// download. A revisão humana é o ponto mais repetido da reunião: NENHUM evento
// em `rascunho` pode ser baixado ou transmitido.

import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";
import { CATALOGO_ESOCIAL } from "../utils/esocial-catalogo.util.js";
import {
  gerarXmlEvento,
  eventoSuportado,
  ErroXmlESocial,
} from "../utils/esocial-xml.util.js";
import {
  criarFuncionarioDeS2200,
  desligarFuncionarioDeS2299,
} from "../services/esocial-funcionario.service.js";

// Colunas seguras para listagem/timeline — sem o XML nem o formulário, que só
// vão no detalhe (GET /:id).
const COLUNAS_RESUMO =
  "id, cliente_id, funcionario_id, tipo_evento, status, numero_recibo, erro_rejeicao, aprovado_por, aprovado_em, data_envio, criado_em, atualizado_em";

// Só 'rascunho' bloqueia download/transmissão. 'aprovado' e qualquer estado
// posterior (transmitido/aceito/rejeitado) já passaram pela revisão humana.
function downloadLiberado(status) {
  return status !== "rascunho";
}

function ehAdminEfficience(req) {
  return req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE;
}

// admin_efficience (staff) opera em nome de um cliente e informa clienteId no
// body/query; os demais perfis ficam presos ao cliente do próprio token.
function resolverClienteId(req, valorInformado) {
  return ehAdminEfficience(req) ? valorInformado : req.usuario?.cliente_id;
}

// ---------------------------------------------------------------------------
// POST /eventos-esocial — cria o rascunho
// body: { clienteId, funcionarioId?, tipoEvento, dadosFormulario }
// ---------------------------------------------------------------------------
export async function criarRascunho(req, res) {
  const { clienteId: clienteIdBody, funcionarioId, tipoEvento, dadosFormulario } = req.body ?? {};

  const clienteId = resolverClienteId(req, clienteIdBody);
  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  if (!tipoEvento || !CATALOGO_ESOCIAL[tipoEvento]) {
    return res.status(400).json({ erro: `tipoEvento inválido ou não catalogado: ${tipoEvento ?? "(vazio)"}` });
  }

  if (!dadosFormulario || typeof dadosFormulario !== "object") {
    return res.status(400).json({ erro: "dadosFormulario é obrigatório" });
  }

  if (CATALOGO_ESOCIAL[tipoEvento].requerFuncionario && !funcionarioId) {
    return res.status(400).json({ erro: `${tipoEvento} (${CATALOGO_ESOCIAL[tipoEvento].nome}) exige funcionarioId` });
  }

  // --- Pré-requisito de cliente novo (Decisão 6 da reunião) --------------
  const { data: cliente, error: erroCliente } = await supabase
    .from("clientes")
    .select("esocial_configurado")
    .eq("id", clienteId)
    .maybeSingle();

  if (erroCliente) {
    console.error("[eventos-esocial.controller] Erro ao buscar cliente:", erroCliente.message);
    return res.status(500).json({ erro: "Erro ao verificar o cliente" });
  }
  if (!cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  if (!cliente.esocial_configurado) {
    const { count, error: erroCount } = await supabase
      .from("eventos_esocial")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteId);

    if (erroCount) {
      console.error("[eventos-esocial.controller] Erro ao contar eventos:", erroCount.message);
      return res.status(500).json({ erro: "Erro ao verificar histórico do cliente" });
    }

    if ((count ?? 0) === 0) {
      return res.status(409).json({
        erro:
          "Cliente ainda não tem o eSocial configurado (Grupo 1). Confirme a configuração inicial antes de enviar o primeiro evento.",
        codigo: "ESOCIAL_NAO_CONFIGURADO",
      });
    }
  }

  // --- Geração do XML (#ES-6) ------------------------------------------
  if (!eventoSuportado(tipoEvento)) {
    return res.status(422).json({
      erro: `Evento ${tipoEvento} (${CATALOGO_ESOCIAL[tipoEvento].nome}) ainda não tem gerador de XML implementado`,
      codigo: "EVENTO_NAO_SUPORTADO",
    });
  }

  let xml;
  try {
    const args = dadosFormulario.dadosAdmissao
      ? [dadosFormulario.funcionario, dadosFormulario.dadosAdmissao]
      : [dadosFormulario];
    xml = gerarXmlEvento(tipoEvento, ...args);
  } catch (err) {
    if (err instanceof ErroXmlESocial) {
      return res.status(422).json({ erro: err.message, camposFaltando: err.camposFaltando ?? [] });
    }
    console.error("[eventos-esocial.controller] Erro inesperado ao gerar XML:", err);
    return res.status(500).json({ erro: "Erro ao gerar o XML do evento" });
  }

  const { data, error } = await supabase
    .from("eventos_esocial")
    .insert({
      cliente_id: clienteId,
      funcionario_id: funcionarioId ?? null,
      tipo_evento: tipoEvento,
      xml_gerado: xml,
      dados_formulario: dadosFormulario,
      status: "rascunho",
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[eventos-esocial.controller] Erro ao gravar rascunho:", error.message);
    return res.status(500).json({ erro: "Erro ao gravar o rascunho do evento" });
  }

  console.log(
    `[eventos-esocial.controller] Rascunho criado — evento: ${data.id} | tipo: ${tipoEvento} | cliente: ${clienteId}`,
  );
  return res.status(201).json(data);
}

// ---------------------------------------------------------------------------
// GET /eventos-esocial?clienteId=&funcionarioId= — histórico / timeline
// ---------------------------------------------------------------------------
export async function listarEventos(req, res) {
  const clienteId = resolverClienteId(req, req.query.clienteId);
  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  // Mesma convenção de eventos.controller.js — timeline não devolve tudo de uma vez.
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  let query = supabase
    .from("eventos_esocial")
    .select(COLUNAS_RESUMO, { count: "exact" })
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.funcionarioId) {
    query = query.eq("funcionario_id", req.query.funcionarioId);
  }

  const { data, count, error } = await query;

  if (error) {
    if (error.message === "Requested range not satisfiable") {
      return res.status(200).json({ data: [], total: count ?? 0, limit, offset });
    }
    console.error("[eventos-esocial.controller] Erro ao listar eventos:", error.message);
    return res.status(500).json({ erro: "Erro ao listar eventos" });
  }

  return res.status(200).json({ data: data ?? [], total: count ?? 0, limit, offset });
}

// ---------------------------------------------------------------------------
// GET /eventos-esocial/:id — detalhe (inclui o XML para a tela de revisão)
// ---------------------------------------------------------------------------
async function buscarEventoDoUsuario(req) {
  const { data, error } = await supabase
    .from("eventos_esocial")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error) {
    return { erro: { status: 500, corpo: { erro: "Erro ao buscar o evento" } } };
  }
  if (!data || (!ehAdminEfficience(req) && data.cliente_id !== req.usuario?.cliente_id)) {
    return { erro: { status: 404, corpo: { erro: "Evento não encontrado" } } };
  }
  return { evento: data };
}

export async function detalharEvento(req, res) {
  const { evento, erro } = await buscarEventoDoUsuario(req);
  if (erro) return res.status(erro.status).json(erro.corpo);
  return res.status(200).json(evento);
}

// ---------------------------------------------------------------------------
// PATCH /eventos-esocial/:id/aprovar — registra a aprovação humana
// ---------------------------------------------------------------------------
export async function aprovarEvento(req, res) {
  const { evento, erro } = await buscarEventoDoUsuario(req);
  if (erro) return res.status(erro.status).json(erro.corpo);

  // Não sobrescrever aprovação já existente.
  if (evento.status !== "rascunho") {
    return res.status(409).json({ erro: `Evento já está em '${evento.status}' — aprovação não sobrescreve` });
  }

  const { data: atualizado, error } = await supabase
    .from("eventos_esocial")
    .update({
      status: "aprovado",
      aprovado_por: req.usuario?.email || req.usuario?.id,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", evento.id)
    .eq("status", "rascunho") // trava contra corrida: só aprova quem ainda é rascunho
    .select()
    .maybeSingle();

  if (error) {
    console.error("[eventos-esocial.controller] Erro ao aprovar evento:", error.message);
    return res.status(500).json({ erro: "Erro ao aprovar o evento" });
  }
  if (!atualizado) {
    return res.status(409).json({ erro: "Evento já está aprovado" });
  }

  // --- Efeitos colaterais da aprovação (via #ES-5, hoje service interno) ---
  // Uma falha aqui NÃO desfaz a aprovação: o registro humano já está gravado.
  // Devolve `aviso` para o front tratar a pendência de sincronização.
  const resposta = { ...atualizado };

  if (evento.tipo_evento === "S-2200") {
    const { funcionario, erro: erroFunc } = await criarFuncionarioDeS2200({
      clienteId: evento.cliente_id,
      dadosFormulario: evento.dados_formulario,
    });
    if (funcionario) {
      resposta.funcionarioCriado = funcionario;
      if (!evento.funcionario_id) {
        await supabase
          .from("eventos_esocial")
          .update({ funcionario_id: funcionario.id })
          .eq("id", evento.id);
        resposta.funcionario_id = funcionario.id;
      }
    }
    if (erroFunc) resposta.aviso = erroFunc;
  }

  if (evento.tipo_evento === "S-2299") {
    const { funcionario, erro: erroDeslig } = await desligarFuncionarioDeS2299({
      funcionarioId: evento.funcionario_id,
      dadosFormulario: evento.dados_formulario,
    });
    if (funcionario) resposta.funcionarioDesligado = funcionario;
    if (erroDeslig) resposta.aviso = erroDeslig;
  }

  console.log(
    `[eventos-esocial.controller] Evento aprovado — ${evento.id} | por: ${resposta.aprovado_por}`,
  );
  return res.status(200).json(resposta);
}

// ---------------------------------------------------------------------------
// GET /eventos-esocial/:id/xml — download do XML (só se já aprovado)
// ---------------------------------------------------------------------------
export async function baixarXml(req, res) {
  const { evento, erro } = await buscarEventoDoUsuario(req);
  if (erro) return res.status(erro.status).json(erro.corpo);

  if (!downloadLiberado(evento.status)) {
    return res.status(409).json({
      erro: "Evento em rascunho — revisão e aprovação humana são obrigatórias antes do download",
      codigo: "EVENTO_NAO_APROVADO",
    });
  }

  if (!evento.xml_gerado) {
    return res.status(404).json({ erro: "Evento sem XML gerado" });
  }

  const nomeArquivo = `${evento.tipo_evento}-${evento.id}.xml`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
  return res.status(200).send(evento.xml_gerado);
}
