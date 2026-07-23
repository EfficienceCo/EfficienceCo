import supabase from "../config/database.js";
import {
  gerarTemplateFolha,
  validarColunasPlanilha,
  lerLinhasPlanilha,
  calcularFolhaFuncionario,
} from "../services/folha.service.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";
import { PERFIS } from "../config/perfis.js";

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

// Lê a planilha salva em BK-FOLHA-UPLOAD, calcula INSS/FGTS/IR/líquido por funcionário
// e persiste um registro por funcionário vinculado ao processamento.
export async function calcularFolha(req, res) {
  const { processamento_id: processamentoId } = req.params;

  const { data: processamento, error: erroBusca } = await supabase
    .from("processamentos_folha")
    .select("id, cliente_id, status, arquivo_origem_path")
    .eq("id", processamentoId)
    .maybeSingle();

  if (erroBusca) {
    console.error("[folha.controller] Erro ao buscar processamento:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar processamento" });
  }

  if (!processamento) {
    return res.status(404).json({ erro: "Processamento não encontrado" });
  }

  if (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && processamento.cliente_id !== resolverClienteId(req)) {
    return res.status(403).json({ erro: "Acesso negado: processamento não pertence a este cliente" });
  }

  // Reivindica o processamento de forma atômica: o UPDATE só afeta a linha se o status
  // ainda for pendente/erro no momento exato da escrita. Evita a corrida entre duas
  // chamadas simultâneas — sem isso, ambas podiam ler "pendente" antes de qualquer uma
  // escrever "processando" e o cálculo rodava em duplicidade.
  const { data: reivindicado, error: erroReivindicar } = await supabase
    .from("processamentos_folha")
    .update({ status: "processando" })
    .eq("id", processamentoId)
    .in("status", ["pendente", "erro"])
    .select("id");

  if (erroReivindicar) {
    console.error("[folha.controller] Erro ao reivindicar processamento:", erroReivindicar.message);
    return res.status(500).json({ erro: "Erro ao iniciar cálculo da folha" });
  }

  if (!reivindicado || reivindicado.length === 0) {
    return res.status(409).json({ erro: "Processamento já está em andamento ou já foi concluído" });
  }

  try {
    const { data: arquivo, error: erroDownload } = await supabase.storage
      .from("folhas-pagamento")
      .download(processamento.arquivo_origem_path);

    if (erroDownload) {
      console.error("[folha.controller] Erro ao baixar planilha do storage:", erroDownload.message);
      await marcarErro(processamentoId, "Erro ao ler planilha salva");
      return res.status(500).json({ erro: "Erro ao ler planilha da folha" });
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const { linhas, erros } = await lerLinhasPlanilha(buffer);

    if (erros.length > 0) {
      console.error("[folha.controller] Planilha com linhas inválidas:", JSON.stringify(erros));
      await marcarErro(processamentoId, `Planilha com ${erros.length} linha(s) inválida(s)`);
      return res.status(422).json({ erro: "Planilha com linhas inválidas", detalhes: erros });
    }

    const calculos = linhas.map((linha) => ({
      processamento_id: processamentoId,
      ...calcularFolhaFuncionario(linha),
    }));

    const { error: erroInsert } = await supabase.from("folha_calculos").insert(calculos);

    if (erroInsert) {
      console.error("[folha.controller] Erro ao salvar cálculos:", erroInsert.message);
      await marcarErro(processamentoId, "Erro ao salvar cálculos da folha");
      return res.status(500).json({ erro: "Erro ao salvar cálculos da folha" });
    }

    await supabase.from("processamentos_folha").update({ status: "concluido" }).eq("id", processamentoId);

    const totais = calculos.reduce(
      (acc, calculo) => ({
        bruto: acc.bruto + calculo.salario_bruto,
        inss: acc.inss + calculo.inss,
        fgts: acc.fgts + calculo.fgts,
        ir: acc.ir + calculo.ir,
        liquido: acc.liquido + calculo.liquido,
      }),
      { bruto: 0, inss: 0, fgts: 0, ir: 0, liquido: 0 },
    );

    return res.status(200).json({
      processamento_id: processamentoId,
      funcionarios: calculos.length,
      totais,
    });
  } catch (err) {
    console.error("[folha.controller] Erro inesperado ao calcular folha:", err.message);
    await marcarErro(processamentoId, "Erro inesperado ao calcular folha");
    return res.status(500).json({ erro: "Erro ao calcular folha" });
  }
}

async function marcarErro(processamentoId, motivo) {
  const { error } = await supabase
    .from("processamentos_folha")
    .update({ status: "erro", motivo_erro: motivo })
    .eq("id", processamentoId);

  if (error) {
    console.error("[folha.controller] Falha ao marcar processamento como erro:", error.message);
  }
}
