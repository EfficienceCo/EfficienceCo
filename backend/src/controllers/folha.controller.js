import supabase from "../config/database.js";
import { gerarTemplateFolha, validarColunasPlanilha } from "../services/folha.service.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";

const REGEX_MES_REFERENCIA = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;

function sanitizarNomeArquivo(nome) {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "");
}

export async function baixarTemplate(req, res) {
  console.log("[folha.controller] Gerando template de folha de pagamento");

  try {
    const buffer = await gerarTemplateFolha();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=modelo_folha_pagamento.xlsx",
    );

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[folha.controller] Erro ao gerar template:", err.message);
    return res.status(500).json({ erro: "Erro ao gerar template da folha" });
  }
}

// Ponto único de entrada da planilha preenchida — chamado pelo agente local e pela web.
export async function uploadFolha(req, res) {
  if (!req.file) {
    return res.status(400).json({ erro: "Planilha é obrigatória" });
  }

  const clienteId = resolverClienteId(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const mesReferenciaBruto = req.body.mes_referencia?.trim();

  if (!mesReferenciaBruto || !REGEX_MES_REFERENCIA.test(mesReferenciaBruto)) {
    return res.status(400).json({ erro: "mes_referencia é obrigatório no formato YYYY-MM" });
  }

  const mesReferencia = `${mesReferenciaBruto.slice(0, 7)}-01`;

  try {
    const { valido, faltando } = await validarColunasPlanilha(req.file.buffer);

    if (!valido) {
      return res.status(400).json({
        erro: "Planilha com colunas obrigatórias faltando",
        faltando,
      });
    }

    const nomeArquivo = sanitizarNomeArquivo(req.file.originalname);
    const caminhoStorage = `clientes/${clienteId}/${mesReferencia}/${Date.now()}_${nomeArquivo}`;

    const { error: erroUpload } = await supabase.storage
      .from("folhas-pagamento")
      .upload(caminhoStorage, req.file.buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });

    if (erroUpload) {
      console.error("[folha.controller] Erro ao salvar planilha no storage:", erroUpload.message);
      return res.status(500).json({ erro: "Erro ao salvar planilha" });
    }

    const { data, error: erroInsert } = await supabase
      .from("processamentos_folha")
      .insert({
        cliente_id: clienteId,
        mes_referencia: mesReferencia,
        status: "pendente",
        arquivo_origem_path: caminhoStorage,
      })
      .select("id")
      .single();

    if (erroInsert) {
      console.error("[folha.controller] Erro ao criar processamento:", erroInsert.message);

      const { error: erroRemove } = await supabase.storage
        .from("folhas-pagamento")
        .remove([caminhoStorage]);
      if (erroRemove) {
        console.error("[folha.controller] Falha ao remover planilha órfã:", erroRemove.message);
      }

      return res.status(500).json({ erro: "Erro ao registrar processamento da folha" });
    }

    return res.status(201).json({ processamento_id: data.id });
  } catch (err) {
    console.error("[folha.controller] Erro inesperado no upload da folha:", err.message);
    return res.status(500).json({ erro: "Erro ao processar upload da folha" });
  }
}
