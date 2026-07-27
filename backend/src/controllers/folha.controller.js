import supabase from "../config/database.js";
import {
  gerarTemplateFolha,
  validarColunasPlanilha,
  lerLinhasPlanilha,
  calcularFolhaFuncionario,
  gerarHoleritePDF,
  gerarRelatorioFechamentoPDF,
  calcularTotaisEmpresa,
} from "../services/folha.service.js";
import {
  montarListaArquivos,
  arquivosParaResposta,
  resolverPathDownload,
  calcularTotaisProcessamento,
  registrarEventoConclusaoFolha,
} from "../services/folha-status.service.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
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

async function processarUploadFolha(req, res, clienteId) {
  if (!req.file) {
    return res.status(400).json({ erro: "Planilha é obrigatória" });
  }

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

// Upload via web/dashboard — JWT + perfil.
export async function uploadFolha(req, res) {
  const clienteId = resolverClienteId(req);
  return processarUploadFolha(req, res, clienteId);
}

// Upload via agente local — x-licenca-token.
export async function uploadFolhaAgente(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  return processarUploadFolha(req, res, licenca.cliente_id);
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

function formatarMesReferencia(mesReferencia) {
  const [ano, mes] = mesReferencia.split("-");
  return `${mes}/${ano}`;
}

// Gera holerite por funcionário + relatório de fechamento por empresa a partir dos
// cálculos já persistidos (BK-FOLHA-CALC). Idempotente por item: só gera o que ainda
// não existe (holerite_path nulo / linha ausente em folha_relatorios) — uma tentativa
// anterior parcialmente falha (ex: caiu no meio do loop de funcionários) é retomada sem
// duplicar upload, em vez de bloquear a chamada inteira.
export async function gerarSaidaFolha(req, res) {
  const { processamento_id: processamentoId } = req.params;

  const { data: processamento, error: erroBusca } = await supabase
    .from("processamentos_folha")
    .select("id, cliente_id, status, mes_referencia")
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

  if (processamento.status !== "concluido") {
    return res.status(409).json({ erro: "Cálculo da folha ainda não foi concluído para este processamento" });
  }

  const { data: calculos, error: erroCalculos } = await supabase
    .from("folha_calculos")
    .select("*")
    .eq("processamento_id", processamentoId);

  if (erroCalculos) {
    console.error("[folha.controller] Erro ao buscar cálculos:", erroCalculos.message);
    return res.status(500).json({ erro: "Erro ao buscar cálculos da folha" });
  }

  if (!calculos || calculos.length === 0) {
    return res.status(404).json({ erro: "Nenhum cálculo encontrado para este processamento" });
  }

  try {
    // Formatação de mes_referencia fica dentro do try: mesmo padrão já corrigido em
    // BK-FOLHA-TEMPLATE/BK-FOLHA-UPLOAD — uma exceção síncrona fora do try, dentro de
    // uma rota async do Express 4 sem handler global de unhandledRejection, derruba
    // o processo inteiro, não só a request.
    const mesReferenciaArquivo = processamento.mes_referencia.slice(0, 7);
    const mesReferenciaFormatado = formatarMesReferencia(processamento.mes_referencia);

    let holeritesGerados = 0;

    for (const calculo of calculos) {
      if (calculo.holerite_path) continue;

      const buffer = await gerarHoleritePDF(calculo, mesReferenciaFormatado);
      // CPF no nome, não só o nome do funcionário — dois funcionários com o mesmo nome
      // na mesma empresa (comum: "Maria Silva", "João Santos") colidiriam no path e o
      // segundo upload falharia (upsert:false). CPF é o identificador que garante unicidade.
      const nomeArquivo = `holerite_${sanitizarNomeArquivo(calculo.empresa)}_${sanitizarNomeArquivo(calculo.funcionario)}_${sanitizarNomeArquivo(calculo.cpf)}_${mesReferenciaArquivo}.pdf`;
      // processamento_id no caminho evita colisão entre processamentos diferentes do
      // mesmo cliente/mês (ex: planilha reenviada e recalculada após correção).
      const caminhoStorage = `clientes/${processamento.cliente_id}/${mesReferenciaArquivo}/${processamentoId}/holerites/${nomeArquivo}`;

      const { error: erroUpload } = await supabase.storage
        .from("folhas-pagamento")
        .upload(caminhoStorage, buffer, { contentType: "application/pdf", upsert: false });

      if (erroUpload) {
        console.error("[folha.controller] Erro ao salvar holerite:", erroUpload.message);
        return res.status(500).json({ erro: `Erro ao gerar holerite de ${calculo.funcionario}` });
      }

      const { error: erroUpdate } = await supabase
        .from("folha_calculos")
        .update({ holerite_path: caminhoStorage })
        .eq("id", calculo.id);

      if (erroUpdate) {
        console.error("[folha.controller] Erro ao registrar holerite gerado:", erroUpdate.message);
        return res.status(500).json({ erro: "Erro ao registrar holerite gerado" });
      }

      holeritesGerados++;
    }

    const calculosPorEmpresa = new Map();
    calculos.forEach((calculo) => {
      const lista = calculosPorEmpresa.get(calculo.empresa) || [];
      lista.push(calculo);
      calculosPorEmpresa.set(calculo.empresa, lista);
    });

    let relatoriosGerados = 0;

    for (const [empresa, calculosDaEmpresa] of calculosPorEmpresa) {
      const { data: relatorioExistente, error: erroExistente } = await supabase
        .from("folha_relatorios")
        .select("id")
        .eq("processamento_id", processamentoId)
        .eq("empresa", empresa)
        .maybeSingle();

      if (erroExistente) {
        console.error("[folha.controller] Erro ao checar relatório existente:", erroExistente.message);
        return res.status(500).json({ erro: "Erro ao verificar relatório existente" });
      }
      if (relatorioExistente) continue;

      const totais = calcularTotaisEmpresa(calculosDaEmpresa);
      const buffer = await gerarRelatorioFechamentoPDF({
        empresa,
        mesReferenciaFormatado,
        calculos: calculosDaEmpresa,
        totais,
      });

      const nomeArquivo = `relatorio_fechamento_${sanitizarNomeArquivo(empresa)}_${mesReferenciaArquivo}.pdf`;
      const caminhoStorage = `clientes/${processamento.cliente_id}/${mesReferenciaArquivo}/${processamentoId}/relatorios/${nomeArquivo}`;

      const { error: erroUpload } = await supabase.storage
        .from("folhas-pagamento")
        .upload(caminhoStorage, buffer, { contentType: "application/pdf", upsert: false });

      if (erroUpload) {
        console.error("[folha.controller] Erro ao salvar relatório:", erroUpload.message);
        return res.status(500).json({ erro: `Erro ao gerar relatório de ${empresa}` });
      }

      const { error: erroInsert } = await supabase.from("folha_relatorios").insert({
        processamento_id: processamentoId,
        empresa,
        total_funcionarios: totais.totalFuncionarios,
        total_bruto: totais.totalBruto,
        total_encargos: totais.totalEncargos,
        total_liquido: totais.totalLiquido,
        arquivo_path: caminhoStorage,
      });

      if (erroInsert) {
        console.error("[folha.controller] Erro ao registrar relatório gerado:", erroInsert.message);
        return res.status(500).json({ erro: "Erro ao registrar relatório gerado" });
      }

      relatoriosGerados++;
    }

    const empresas = Array.from(calculosPorEmpresa.keys());

    try {
      await registrarEventoConclusaoFolha(supabase, {
        processamentoId,
        clienteId: processamento.cliente_id,
        totalFuncionarios: calculos.length,
        totalEmpresas: empresas.length,
      });
    } catch (erroEvento) {
      // Arquivos já foram gerados — falha de notificação não deve quebrar a resposta.
      console.error(
        "[folha.controller] Erro ao registrar evento de conclusão da folha:",
        erroEvento.message,
      );
    }

    return res.status(200).json({
      processamento_id: processamentoId,
      holerites_gerados: holeritesGerados,
      relatorios_gerados: relatoriosGerados,
      empresas,
    });
  } catch (err) {
    console.error("[folha.controller] Erro inesperado ao gerar saída da folha:", err.message);
    return res.status(500).json({ erro: "Erro ao gerar arquivos de saída da folha" });
  }
}

// Status do processamento + lista de arquivos gerados (holerites e relatórios).
export async function consultarStatusFolha(req, res) {
  const { processamento_id: processamentoId } = req.params;

  const { data: processamento, error: erroBusca } = await supabase
    .from("processamentos_folha")
    .select("id, cliente_id, status, mes_referencia, motivo_erro")
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

  const { data: calculos, error: erroCalculos } = await supabase
    .from("folha_calculos")
    .select("empresa, holerite_path")
    .eq("processamento_id", processamentoId);

  if (erroCalculos) {
    console.error("[folha.controller] Erro ao buscar cálculos:", erroCalculos.message);
    return res.status(500).json({ erro: "Erro ao buscar arquivos do processamento" });
  }

  const { data: relatorios, error: erroRelatorios } = await supabase
    .from("folha_relatorios")
    .select("arquivo_path")
    .eq("processamento_id", processamentoId);

  if (erroRelatorios) {
    console.error("[folha.controller] Erro ao buscar relatórios:", erroRelatorios.message);
    return res.status(500).json({ erro: "Erro ao buscar arquivos do processamento" });
  }

  const arquivos = montarListaArquivos(calculos || [], relatorios || []);
  const totais = calcularTotaisProcessamento(calculos || []);

  return res.status(200).json({
    processamento_id: processamento.id,
    status: processamento.status,
    mes_referencia: processamento.mes_referencia,
    motivo_erro: processamento.motivo_erro,
    total_funcionarios: totais.total_funcionarios,
    total_empresas: totais.total_empresas,
    arquivos: arquivosParaResposta(arquivos),
  });
}

// Download de um arquivo gerado — somente quando status === concluido.
export async function baixarArquivoFolha(req, res) {
  const { processamento_id: processamentoId, arquivo: nomeArquivo } = req.params;

  const { data: processamento, error: erroBusca } = await supabase
    .from("processamentos_folha")
    .select("id, cliente_id, status")
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

  if (processamento.status !== "concluido") {
    return res.status(409).json({
      erro: "Download disponível apenas quando o processamento estiver concluído",
    });
  }

  const { data: calculos, error: erroCalculos } = await supabase
    .from("folha_calculos")
    .select("holerite_path")
    .eq("processamento_id", processamentoId);

  if (erroCalculos) {
    console.error("[folha.controller] Erro ao buscar holerites:", erroCalculos.message);
    return res.status(500).json({ erro: "Erro ao buscar arquivo" });
  }

  const { data: relatorios, error: erroRelatorios } = await supabase
    .from("folha_relatorios")
    .select("arquivo_path")
    .eq("processamento_id", processamentoId);

  if (erroRelatorios) {
    console.error("[folha.controller] Erro ao buscar relatórios:", erroRelatorios.message);
    return res.status(500).json({ erro: "Erro ao buscar arquivo" });
  }

  const arquivos = montarListaArquivos(calculos || [], relatorios || []);
  const caminhoStorage = resolverPathDownload(nomeArquivo, arquivos);

  if (!caminhoStorage) {
    return res.status(404).json({ erro: "Arquivo não encontrado para este processamento" });
  }

  try {
    const { data: arquivo, error: erroDownload } = await supabase.storage
      .from("folhas-pagamento")
      .download(caminhoStorage);

    if (erroDownload) {
      console.error("[folha.controller] Erro ao baixar arquivo do storage:", erroDownload.message);
      return res.status(500).json({ erro: "Erro ao baixar arquivo" });
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${nomeArquivo}"`,
    );

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[folha.controller] Erro inesperado no download da folha:", err.message);
    return res.status(500).json({ erro: "Erro ao baixar arquivo" });
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
