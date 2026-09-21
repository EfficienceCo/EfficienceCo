import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";
import { aplicarFiltroPeriodo, hojeNoBrasil } from "../utils/periodo.util.js";

function sanitizarNome(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

const STATUS_VALIDOS = new Set(["pendente", "atrasada"]);

export const MIME_EXTENSOES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extDeMime(mimetype) {
  return MIME_EXTENSOES[mimetype] || "bin";
}

function construirNomeArquivo(nomeObrigacao, obrigacaoId, mimetype) {
  const nomeSanitizado = sanitizarNome(nomeObrigacao);
  const hoje = new Date().toISOString().slice(0, 10);
  const ext = extDeMime(mimetype);
  return `${nomeSanitizado}_${obrigacaoId}_${hoje}_comprovante.${ext}`;
}

function resolverClienteId(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.body.cliente_id || req.query.cliente_id;
  }
  return req.usuario?.cliente_id;
}

// Bug #505 — o atraso é derivado da data, não só da coluna.
//
// O job diário (obrigacoes-atraso.job.js) persiste `atrasada`, mas entre a
// virada do dia e a varredura — e para obrigações criadas já vencidas — a
// coluna ainda diz `pendente`. Filtrar só por igualdade devolvia [] para
// Status=Atrasada. Então:
//   atrasada -> já marcadas + pendentes com vencimento anterior a hoje
//   pendente -> só as que ainda estão no prazo (senão a mesma obrigação
//               apareceria nos dois filtros, com a tela rotulando "Atrasada")
// Demais status (concluida) seguem na comparação direta.
function aplicarFiltroStatus(query, status, agora = new Date()) {
  if (!status) return query;

  const hoje = hojeNoBrasil(agora);

  if (status === "atrasada") {
    return query.or(
      `status.eq.atrasada,and(status.eq.pendente,data_vencimento.lt.${hoje})`,
    );
  }

  if (status === "pendente") {
    return query.eq("status", "pendente").gte("data_vencimento", hoje);
  }

  return query.eq("status", status);
}

function aplicarIsolamentoCliente(query, req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) return query;
  return query.eq("cliente_id", req.usuario?.cliente_id);
}

function obrigacaoPertenceAoCliente(req, obrigacao) {
  return (
    req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE ||
    obrigacao?.cliente_id === req.usuario?.cliente_id
  );
}

export async function listarObrigacoes(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { status, mes, ano } = req.query;

  let query = supabase
    .from("obrigacoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("data_vencimento", { ascending: true });

  query = aplicarFiltroStatus(query, status);

  query = aplicarFiltroPeriodo(query, "data_vencimento", mes, ano);

  const { data, error } = await query;

  if (error) {
    console.error("[obrigacoes.controller] Erro ao listar:", error.message);
    return res.status(500).json({ erro: "Erro ao listar obrigações" });
  }

  return res.status(200).json(data);
}

function adicionarMeses(dataStr, meses) {
  const pura = dataStr.slice(0, 10);
  const [ano, mes, dia] = pura.split("-").map(Number);
  const totalMeses = mes - 1 + meses;
  const novoAno = ano + Math.floor(totalMeses / 12);
  const novoMes = totalMeses % 12;
  const ultimoDia = new Date(novoAno, novoMes + 1, 0).getDate();
  const novoDia = Math.min(dia, ultimoDia);
  return `${novoAno}-${String(novoMes + 1).padStart(2, "0")}-${String(novoDia).padStart(2, "0")}`;
}

function gerarOcorrencias({ clienteId, nome, tipo, data_vencimento }) {
  const limites = { mensal: 12, anual: 4 };
  const incremento = tipo === "mensal" ? 1 : 12;
  const total = limites[tipo];

  if (!total) return [];

  const ocorrencias = [];
  for (let i = 1; i <= total; i++) {
    ocorrencias.push({
      cliente_id: clienteId,
      nome,
      tipo,
      status: "pendente",
      data_vencimento: adicionarMeses(data_vencimento, i * incremento),
      recorrente: true,
    });
  }

  return ocorrencias;
}

export async function criarObrigacao(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { nome, tipo, data_vencimento, recorrente } = req.body;

  if (!nome || !tipo || !data_vencimento) {
    return res.status(400).json({ erro: "nome, tipo e data_vencimento são obrigatórios" });
  }

  if (recorrente === true && tipo === "eventual") {
    return res.status(400).json({ erro: "Obrigações eventuais não podem ser recorrentes" });
  }

  const { data, error } = await supabase
    .from("obrigacoes")
    .insert({ cliente_id: clienteId, nome, tipo, data_vencimento, recorrente: recorrente === true })
    .select()
    .single();

  if (error) {
    console.error("[obrigacoes.controller] Erro ao criar:", error.message);
    return res.status(500).json({ erro: "Erro ao criar obrigação" });
  }

  if (recorrente === true) {
    const ocorrencias = gerarOcorrencias({ clienteId, nome, tipo, data_vencimento });
    if (ocorrencias.length > 0) {
      const { error: erroOcorrencias } = await supabase
        .from("obrigacoes")
        .insert(ocorrencias);

      if (erroOcorrencias) {
        console.error("[obrigacoes.controller] Erro ao gerar ocorrências:", erroOcorrencias.message);
        const { error: erroDelete } = await supabase.from("obrigacoes").delete().eq("id", data.id);
        if (erroDelete) {
          console.error("[obrigacoes.controller] Obrigação pai orphan (id=%s) — falha no rollback: %s", data.id, erroDelete.message);
          return res.status(500).json({ erro: "Erro ao gerar ocorrências recorrentes. Contate o suporte." });
        }
        return res.status(500).json({ erro: "Erro ao gerar ocorrências recorrentes" });
      }
    }
  }

  return res.status(201).json(data);
}

export async function atualizarObrigacao(req, res) {
  const { id } = req.params;

  let query = supabase
    .from("obrigacoes")
    .select("cliente_id, tipo, status, recorrente")
    .eq("id", id);
  query = aplicarIsolamentoCliente(query, req);

  const { data: obrigacao, error: erroBusca } = await query.maybeSingle();

  if (erroBusca) {
    console.error("[obrigacoes.controller] Erro ao buscar obrigação:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar obrigação" });
  }

  // Isolamento multi-tenant: outro cliente é indistinguível de um id inexistente.
  if (!obrigacao || !obrigacaoPertenceAoCliente(req, obrigacao)) {
    return res.status(404).json({ erro: "Obrigação não encontrada" });
  }

  if (obrigacao.status === "concluida") {
    return res.status(409).json({ erro: "Obrigação já concluída não pode ser alterada" });
  }

  const { nome, tipo, data_vencimento, recorrente, status } = req.body;

  if (status !== undefined && !STATUS_VALIDOS.has(status)) {
    return res.status(400).json({ erro: "Status inválido. Use PATCH /obrigacoes/:id/concluir para concluir" });
  }

  const tipoEfetivo = tipo ?? obrigacao.tipo;
  const recorrenteEfetivo = recorrente ?? obrigacao.recorrente;
  if (recorrenteEfetivo === true && tipoEfetivo === "eventual") {
    return res.status(400).json({ erro: "Obrigações eventuais não podem ser recorrentes" });
  }

  const updates = {};
  if (nome !== undefined) updates.nome = nome;
  if (tipo !== undefined) updates.tipo = tipo;
  if (data_vencimento !== undefined) {
    updates.data_vencimento = data_vencimento;
    // Vencimento novo, ciclo de alertas novo (#529).
    updates.ultimo_marco_alertado = null;
  }
  if (recorrente !== undefined) updates.recorrente = recorrente;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar" });
  }

  const { data, error } = await supabase
    .from("obrigacoes")
    .update(updates)
    .eq("id", id)
    .eq("cliente_id", obrigacao.cliente_id)
    .select()
    .single();

  if (error) {
    console.error("[obrigacoes.controller] Erro ao atualizar:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar obrigação" });
  }

  return res.status(200).json(data);
}

export async function deletarObrigacao(req, res) {
  const { id } = req.params;

  let query = supabase
    .from("obrigacoes")
    .select("cliente_id, comprovante_path")
    .eq("id", id);
  query = aplicarIsolamentoCliente(query, req);

  const { data: obrigacao, error: erroBusca } = await query.maybeSingle();

  if (erroBusca) {
    console.error("[obrigacoes.controller] Erro ao buscar obrigação:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar obrigação" });
  }

  // Isolamento multi-tenant: outro cliente é indistinguível de um id inexistente.
  if (!obrigacao || !obrigacaoPertenceAoCliente(req, obrigacao)) {
    return res.status(404).json({ erro: "Obrigação não encontrada" });
  }

  const { error } = await supabase
    .from("obrigacoes")
    .delete()
    .eq("id", id)
    .eq("cliente_id", obrigacao.cliente_id);

  if (error) {
    console.error("[obrigacoes.controller] Erro ao deletar:", error.message);
    return res.status(500).json({ erro: "Erro ao deletar obrigação" });
  }

  if (obrigacao.comprovante_path) {
    try {
      const url = new URL(obrigacao.comprovante_path);
      const caminho = url.pathname.split("/object/public/comprovantes/")[1];
      if (caminho) {
        const { error: erroRemove } = await supabase.storage.from("comprovantes").remove([caminho]);
        if (erroRemove) {
          console.error("[obrigacoes.controller] Falha ao remover comprovante ao deletar obrigação:", erroRemove.message);
        }
      } else {
        console.error("[obrigacoes.controller] Caminho de comprovante inválido, arquivo não removido:", obrigacao.comprovante_path);
      }
    } catch (e) {
      console.error("[obrigacoes.controller] comprovante_path inválido, arquivo não removido:", obrigacao.comprovante_path);
    }
  }

  return res.status(204).send();
}

export async function proximasObrigacoes(req, res) {
  const clienteId = resolverClienteId(req);
  // Widget "Próximas obrigações" do shell chama sem cliente_id para admin_efficience.
  // Resposta vazia evita 400; GET /obrigacoes (tela) e mutações seguem exigindo cliente.
  if (!clienteId) {
    return res.status(200).json([]);
  }

  const dias = Math.max(1, parseInt(req.query.dias) || 7);
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);

  const hojeStr = hoje.toISOString().slice(0, 10);
  const limiteStr = limite.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("obrigacoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .gte("data_vencimento", hojeStr)
    .lte("data_vencimento", limiteStr)
    .order("data_vencimento", { ascending: true });

  if (error) {
    console.error("[obrigacoes.controller] Erro ao buscar próximas:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar próximas obrigações" });
  }

  // As notificações de vencimento saíram daqui (#529): o limiar fixo de <= 3 dias
  // só disparava para quem abrisse o dashboard. Agora quem alerta é o job diário
  // obrigacoes-alertas.job.js, nos marcos 60/30/7/3/0.

  return res.status(200).json(data);
}

export async function concluirObrigacao(req, res) {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ erro: "Comprovante é obrigatório" });
  }

  let query = supabase
    .from("obrigacoes")
    .select("id, cliente_id, nome, status")
    .eq("id", id);
  query = aplicarIsolamentoCliente(query, req);

  const { data: obrigacao, error: erroBusca } = await query.maybeSingle();

  if (erroBusca) {
    console.error("[obrigacoes.controller] Erro ao buscar obrigação:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar obrigação" });
  }

  // Isolamento multi-tenant: outro cliente é indistinguível de um id inexistente.
  if (!obrigacao || !obrigacaoPertenceAoCliente(req, obrigacao)) {
    return res.status(404).json({ erro: "Obrigação não encontrada" });
  }

  if (obrigacao.status === "concluida") {
    return res.status(409).json({ erro: "Obrigação já está concluída" });
  }

  const nomeArquivo = construirNomeArquivo(obrigacao.nome, obrigacao.id, req.file.mimetype);
  const caminhoStorage = `clientes/${obrigacao.cliente_id}/${nomeArquivo}`;

  const { error: erroUpload } = await supabase.storage
    .from("comprovantes")
    .upload(caminhoStorage, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: true,
    });

  if (erroUpload) {
    console.error("[obrigacoes.controller] Erro ao fazer upload do comprovante:", erroUpload.message);
    return res.status(500).json({ erro: "Erro ao salvar comprovante" });
  }

  const { data: { publicUrl } } = supabase.storage
    .from("comprovantes")
    .getPublicUrl(caminhoStorage);

  const { data, error: erroUpdate } = await supabase
    .from("obrigacoes")
    .update({ status: "concluida", comprovante_path: publicUrl })
    .eq("id", id)
    .eq("cliente_id", obrigacao.cliente_id)
    .select()
    .single();

  if (erroUpdate) {
    console.error("[obrigacoes.controller] Erro ao concluir obrigação:", erroUpdate.message);
    const { error: erroRemove } = await supabase.storage.from("comprovantes").remove([caminhoStorage]);
    if (erroRemove) {
      console.error("[obrigacoes.controller] Falha ao remover comprovante órfão:", erroRemove.message);
    }
    return res.status(500).json({ erro: "Erro ao concluir obrigação" });
  }

  const { error: erroEvento } = await supabase.from("eventos").insert({
    cliente_id: obrigacao.cliente_id,
    descricao: `Obrigação "${obrigacao.nome}" concluída. Comprovante salvo em: ${publicUrl}`,
    sucesso: true,
  });

  if (erroEvento) {
    console.error("[obrigacoes.controller] Erro ao registrar evento:", erroEvento.message);
  }

  return res.status(200).json(data);
}
