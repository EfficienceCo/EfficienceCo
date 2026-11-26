import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';

const STATUS = '/dashboard/folha/status';
const UPLOAD = '/dashboard/folha/upload';
const PLANILHA = path.join(__dirname, 'fixtures/folha-437.xlsx');
const ID = '78100000-0000-4000-8000-000000000001';
const ID_ANTERIOR = '78100000-0000-4000-8000-000000000002';
const EMPRESA_A = 'Escritório de Teste Alfa';
const EMPRESA_B = 'Escritório de Teste Beta';
const MES = '2026-09';

type Arquivo = {
  id: string;
  nome: string;
  tipo: 'holerite' | 'relatorio';
  empresa: string;
  funcionario: string | null;
};

function holerite(numero: number, empresa = EMPRESA_A): Arquivo {
  return {
    id: `78100000-0000-4000-9000-${String(numero).padStart(12, '0')}`,
    nome: `holerite_funcionario_${numero}.pdf`,
    tipo: 'holerite',
    empresa,
    funcionario: `Funcionário Exemplo ${numero}`,
  };
}

function arquivosDoLote(holerites: Arquivo[]): Arquivo[] {
  const empresas = [...new Set(holerites.map(({ empresa }) => empresa))];
  return [...holerites, ...empresas.map((empresa, indice): Arquivo => ({
    id: `78100000-0000-4000-9100-${String(indice + 1).padStart(12, '0')}`,
    nome: `relatorio_fechamento_${indice + 1}.pdf`,
    tipo: 'relatorio',
    empresa,
    funcionario: null,
  }))];
}

function detalhe(arquivos: Arquivo[]) {
  const totalEmpresas = new Set(arquivos.map(({ empresa }) => empresa)).size;
  const totalFuncionarios = arquivos.filter(({ tipo }) => tipo === 'holerite').length;
  return {
    processamento_id: ID,
    status: 'concluido',
    saida_status: 'ok',
    mes_referencia: `${MES}-01`,
    motivo_erro: null as string | null,
    erros_planilha: [] as { linha: number; motivos: string[] }[],
    total_empresas: totalEmpresas,
    total_funcionarios: totalFuncionarios,
    total_arquivos_esperado: totalFuncionarios + totalEmpresas,
    arquivos_gerados: arquivos.length,
    arquivos,
  };
}

function resumo(id: string, data: string, vigente: boolean, origem: 'web' | 'agente') {
  return {
    id,
    status: 'concluido',
    saida_status: 'ok',
    mes_referencia: `${MES}-01`,
    criado_em: data,
    enviado_por_nome: origem === 'web' ? 'Contadora de Teste' : null,
    origem,
    vigente,
  };
}

async function prepararFolha(page: Page, dados: {
  lista?: ReturnType<typeof resumo>[];
  buscarDetalhe?: (id: string) => ReturnType<typeof detalhe> | undefined;
} = {}) {
  const usuario = {
    id: 'roteiro-folha-781',
    perfil: 'admin_cliente',
    cliente_id: '78100000-0000-4000-8000-000000000010',
    exp: 4_102_444_800,
  };
  const token = `fixture.${Buffer.from(JSON.stringify(usuario)).toString('base64url')}.fixture`;
  await page.addInitScript((sessao) => localStorage.setItem('token', sessao), token);
  await page.route((url) => url.pathname === '/notificacoes', (route) => route.fulfill({ json: [] }));

  const consultas = { listas: 0, detalhes: 0 };
  await page.route((url) => /^\/folha(?:\/|$)/.test(url.pathname), async (route) => {
    const { pathname } = new URL(route.request().url());
    const metodo = route.request().method();
    if (metodo === 'GET' && pathname === '/folha') {
      consultas.listas += 1;
      return route.fulfill({ json: { processamentos: dados.lista ?? [] } });
    }
    const sufixo = pathname.match(/^\/folha\/([^/]+)$/);
    if (metodo === 'GET' && sufixo) {
      consultas.detalhes += 1;
      const resposta = dados.buscarDetalhe?.(sufixo[1]);
      return resposta
        ? route.fulfill({ json: resposta })
        : route.fulfill({ status: 404, json: { erro: 'Processamento não encontrado' } });
    }
    return route.fulfill({ status: 405, json: { erro: 'Operação fora deste cenário de tela' } });
  });

  return consultas;
}

const linha = (page: Page) => page.locator('tbody tr').first();
const abrirDetalhe = (page: Page) => page.goto(`${STATUS}?processamento_id=${ID}`);
const baixar = (page: Page) => page.getByRole('button', { name: 'Baixar', exact: true });

test.describe('Folha — status da planilha e dos PDFs', () => {
  test.fixme('BUG (FRONT-FOLHA-1) exibe a linha, o campo e o motivo dos erros da planilha', async ({ page }) => {
    await prepararFolha(page, { buscarDetalhe: () => ({
      ...detalhe([]),
      status: 'erro',
      saida_status: 'pendente',
      motivo_erro: 'Planilha com 3 linha(s) inválida(s)',
      erros_planilha: [
        {
          linha: 3,
          motivos: ['vale_transporte inválido; valores aceitos: SIM, NAO, TRUE, FALSE, VERDADEIRO, FALSO, 1, 0 (também boolean nativo e fórmula com esses resultados)'],
        },
        { linha: 5, motivos: ['cpf duplicado nas linhas 5, 6'] },
        { linha: 6, motivos: ['cpf duplicado nas linhas 5, 6'] },
      ],
    }) });
    await abrirDetalhe(page);

    const processamento = linha(page);
    const valeInvalido = /\blinha\s+3\b[^.!?;]*vale[ _-]+transporte\b[^.!?;]*inv[áa]lid[oa][^.!?]*\bSIM\s*(?:,|\/|ou|e)\s*N[ÃA]O\b/i;
    await expect(processamento.getByText(valeInvalido).filter({ visible: true }).first())
      .toHaveText(valeInvalido, { useInnerText: true });

    const cpf = /(?:CPF\s+(?:duplicado|repetido)|duplicidade\s+(?:de|do)\s+CPF)/i;
    const linhasDuplicadas = /linhas\s+(?:5\s*(?:,|\/|e)\s*6|6\s*(?:,|\/|e)\s*5)\b/i;
    for (const numero of [5, 6]) {
      const linhaCpf = String.raw`(?:\blinha\s+${numero}\b|\b${linhasDuplicadas.source})`;
      const diagnostico = new RegExp(
        String.raw`${linhaCpf}\s*[:–—-]?\s*${cpf.source}|${cpf.source}\s*(?:nas?\s+)?[:–—-]?\s*${linhaCpf}`,
        'i',
      );
      await expect(processamento.getByText(diagnostico).filter({ visible: true }).first())
        .toHaveText(diagnostico, { useInnerText: true });
    }
  });

  test.fixme('BUG (FRONT-FOLHA-1) mantém o polling e só conclui com os 17 PDFs', async ({ page }) => {
    await page.clock.install();
    const holerites = Array.from({ length: 15 }, (_, indice) =>
      holerite(indice + 1, indice < 8 ? EMPRESA_A : EMPRESA_B));
    const arquivos = arquivosDoLote(holerites);
    const pronto = detalhe(arquivos);
    let resposta = { ...pronto, status: 'processando', saida_status: 'pendente', arquivos_gerados: 1, arquivos: arquivos.slice(0, 1) };
    const consultas = await prepararFolha(page, { buscarDetalhe: () => resposta });
    await abrirDetalhe(page);
    await expect(linha(page).getByText('Processando', { exact: true })).toBeVisible();
    await expect(baixar(page)).toHaveCount(0);

    // O GET serializa o status gravado e conta os vínculos de arquivo separadamente.
    // O lote ainda está incompleto se o status chegar antes do último PDF.
    resposta = { ...pronto, arquivos_gerados: 16, arquivos: arquivos.slice(0, 16) };
    const antesDaRespostaParcial = consultas.detalhes;
    await page.clock.runFor(5_100);
    await expect.poll(() => consultas.detalhes).toBeGreaterThan(antesDaRespostaParcial);
    await expect(linha(page).getByText('Processando', { exact: true })).toBeVisible();
    await expect(linha(page).getByText('Concluído', { exact: true })).toHaveCount(0);
    await expect(baixar(page)).toHaveCount(0);

    resposta = pronto;
    await page.clock.runFor(5_100);
    await expect(linha(page).getByText('Concluído', { exact: true })).toBeVisible();
    await expect(baixar(page)).toHaveCount(17);
    const consultasAoConcluir = consultas.detalhes;
    await page.clock.runFor(10_200);
    expect(consultas.detalhes).toBe(consultasAoConcluir);
  });

  test.fixme('BUG (FRONT-FOLHA-1) apresenta um único estado para a falha dos PDFs', async ({ page }) => {
    await prepararFolha(page, { buscarDetalhe: () => ({
      ...detalhe(arquivosDoLote([holerite(1)])),
      status: 'erro',
      saida_status: 'erro',
      motivo_erro: 'Storage de teste indisponível',
      arquivos_gerados: 1,
      arquivos: [holerite(1)],
    }) });
    await abrirDetalhe(page);

    const estado = linha(page).getByText(/^(?:Falha ao gerar arquivos|Concluído com falha nos arquivos)$/i);
    await expect(estado).toHaveCount(1);
    await expect(estado).toBeVisible();
    await expect(linha(page).getByText(/^(?:Concluído|Erro)$/)).toHaveCount(0);
    await expect(linha(page).getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    await expect(page.getByRole('article').filter({ hasText: /^Concluído\s*0$/ })).toBeVisible();
    await expect(page.getByRole('article').filter({ hasText: /^(?:Erro|Pendência)\s*1$/ })).toBeVisible();
  });

  test.fixme('BUG (FRONT-FOLHA-1) descarta a linha de outro escritório e interrompe o polling', async ({ page }) => {
    await page.clock.install();
    const consultas = await prepararFolha(page);
    await abrirDetalhe(page);
    await expect(page.getByText('Processamento não encontrado', { exact: true }).first()).toBeVisible();
    await expect.poll(() => consultas.detalhes).toBeGreaterThan(0);

    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByRole('article').filter({ hasText: /^Pendente\s*0$/ })).toBeVisible();
    const consultasApos404 = consultas.detalhes;
    await page.clock.runFor(10_200);
    expect(consultas.detalhes).toBe(consultasApos404);

    await page.goto(STATUS);
    await expect(page.getByText('Nenhum processamento de folha encontrado.', { exact: true })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });
});

test.describe('Folha — listagem e layout', () => {
  test.fixme('BUG (FRONT-FOLHA-2) carrega do servidor em navegador limpo e inclui o envio do agente', async ({ page }) => {
    const consultas = await prepararFolha(page, {
      lista: [
        resumo(ID, '2026-09-18T12:00:00Z', true, 'agente'),
        resumo(ID_ANTERIOR, '2026-09-09T12:00:00Z', false, 'web'),
      ],
      buscarDetalhe: (id) => ({
        ...detalhe(arquivosDoLote([holerite(1, id === ID ? EMPRESA_A : EMPRESA_B)])),
        processamento_id: id,
      }),
    });
    await page.goto(STATUS);

    await expect.poll(() => consultas.listas).toBeGreaterThan(0);
    const linhas = page.locator('tbody tr');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.first()).toBeVisible();
    await expect(linhas.last()).toBeVisible();
    await expect(linhas.first().getByText(/\bagente\b/i).filter({ visible: true }).first()).toBeVisible();
    await expect(linhas.last().getByText(/\bweb\b|Contadora de Teste/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/nenhum processamento de folha encontrado/i).filter({ visible: true })).toHaveCount(0);
  });

  test.fixme('BUG (FRONT-FOLHA-2) identifica as empresas no processamento e o funcionário em cada holerite', async ({ page }) => {
    const arquivos = [holerite(1), holerite(2, EMPRESA_B)];
    await prepararFolha(page, { buscarDetalhe: () => detalhe(arquivosDoLote(arquivos)) });
    await abrirDetalhe(page);

    const colunaEmpresa = linha(page).getByRole('cell').first();
    const empresaNaoInformada = /empresa n[aã]o informada/i;
    await expect(colunaEmpresa.getByText(empresaNaoInformada).filter({ visible: true })).toHaveCount(0);
    for (const empresa of [EMPRESA_A, EMPRESA_B]) {
      await expect(colunaEmpresa.getByText(empresa).filter({ visible: true }).first()).toBeVisible();
    }

    const identificacaoAusente = /funcion[áa]rio n[aã]o informado|^Holerite\s*[·•:–—-]\s*[-–—]\s*$|^[-–—]$/i;
    for (const arquivo of arquivos) {
      const item = linha(page).getByRole('listitem').filter({ hasText: arquivo.nome });
      await expect(item.getByText(identificacaoAusente).filter({ visible: true })).toHaveCount(0);
      await expect(item.getByText(empresaNaoInformada).filter({ visible: true })).toHaveCount(0);
      await expect(item.getByText(arquivo.funcionario!).filter({ visible: true }).first()).toBeVisible();
      await expect(item.getByText(arquivo.empresa).filter({ visible: true }).first()).toBeVisible();
    }
  });

  test.fixme('BUG (FRONT-FOLHA-2) mantém Baixar acessível sem rolagem horizontal em 390 e 768 px', async ({ page }) => {
    const arquivo = {
      ...holerite(1),
      funcionario: 'FuncionarioComNomeLongo'.repeat(10),
      nome: `holerite_${'nome_muito_longo_de_funcionario_'.repeat(8)}.pdf`,
    };
    await prepararFolha(page, { buscarDetalhe: () => detalhe(arquivosDoLote([arquivo])) });

    for (const { width, height } of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
      await test.step(`viewport de ${width} × ${height}`, async () => {
        await page.setViewportSize({ width, height });
        await abrirDetalhe(page);
        const acao = page.getByRole('listitem').filter({ hasText: arquivo.nome })
          .getByRole('button', { name: 'Baixar', exact: true });
        await expect(acao).toBeVisible();
        await acao.evaluate((botao) => {
          const area = botao.getBoundingClientRect();
          window.scrollBy(0, area.top - (window.innerHeight - area.height) / 2);
        });
        await expect.soft(acao).toBeInViewport({ ratio: 1 });
        const medidas = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          documento: document.documentElement.scrollWidth,
        }));
        expect.soft(medidas.documento).toBeLessThanOrEqual(medidas.viewport);
        const area = await acao.boundingBox();
        expect.soft(area?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect.soft(area ? area.x + area.width : Infinity).toBeLessThanOrEqual(medidas.viewport);
      });
    }
  });
});

test.describe('Folha — orientações de upload', () => {
  test.fixme('BUG (FRONT-FOLHA-3) avisa sobre o reenvio da competência e identifica a folha vigente', async ({ page }) => {
    const vigente = resumo(ID, '2026-09-18T12:00:00Z', true, 'agente');
    const historica = resumo(ID_ANTERIOR, '2026-09-09T12:00:00Z', false, 'web');
    const consultas = await prepararFolha(page, { lista: [vigente, historica] });
    await page.goto(UPLOAD);
    await page.getByLabel('Mês de referência').fill(MES);
    await page.getByLabel('Planilha preenchida').setInputFiles(PLANILHA);
    await expect(page.getByText('folha-437.xlsx', { exact: true })).toBeVisible();

    const tela = page.getByRole('main');
    const reenvio = /(?:já (?:existe|há)|já (?:foi )?processad[ao]).*(?:folha|competência)|(?:folha|competência).*já .*(?:processad[ao]|enviad[ao])/i;
    await expect(tela.getByText(reenvio).filter({ visible: true }).first())
      .toHaveText(reenvio, { useInnerText: true });
    const link = tela.getByRole('link', { name: /(?:folha|processamento) vigente/i });
    await expect(link).toBeVisible();
    await expect.poll(() => link.evaluate((elemento) => {
      const href = elemento.getAttribute('href');
      if (!href) return null;

      const url = new URL(href, elemento.baseURI);
      return {
        origem: url.origin,
        caminho: url.pathname,
        id: (url.searchParams.get('processamento_id') || url.searchParams.get('id') || '').trim(),
      };
    })).toEqual({ origem: new URL(page.url()).origin, caminho: STATUS, id: vigente.id });
    await expect.poll(() => consultas.listas).toBeGreaterThan(0);
  });

  test.fixme('BUG (FRONT-FOLHA-3) explica o cálculo do sócio antes de enviar a planilha', async ({ page }) => {
    await prepararFolha(page);
    await page.goto(UPLOAD);
    await expect(page.getByRole('heading', { name: 'Upload da folha' })).toBeVisible();

    const tela = page.getByRole('main');
    const campos = [/horas?\s+extras?|HE/i, /faltas?/i, /vale[ _-]+transporte|VT/i];
    const campo = String.raw`\b(?:${campos.map(({ source }) => source).join('|')})\b`;
    const separador = /(?:\s*[,/]\s*(?:e\s+)?|\s+e\s+)/.source;
    const presenca = campos.map(({ source }) =>
      String.raw`(?=(?:${campo}${separador}){0,2}\b(?:${source})\b)`,
    ).join('');
    const grupo = String.raw`${presenca}${campo}(?:${separador}${campo}){2}`;
    const ignorados = /(?:ignorad[ao]s|desconsiderad[ao]s)/.source;
    const predicado = String.raw`(?:(?:s[aã]o|ser[aã]o)\s+)?${ignorados}|n[aã]o\s+(?:entram|s[aã]o\s+considerad[ao]s)`;
    const exclusao = String.raw`${grupo}\s+(?:${predicado})|(?:ignora|desconsidera|n[aã]o\s+(?:considera|inclui))\s+${grupo}`;
    const inss = /(?:INSS[^.!?;]*11\s*%|11\s*%[^.!?;]*INSS)[^.!?;]*teto/i;
    const orientacao = new RegExp(
      String.raw`(?=[\s\S]*(?:sócio|pró-labore))(?=[\s\S]*(?:${exclusao}))(?=[\s\S]*${inss.source})`,
      'i',
    );
    await expect(tela).toHaveText(orientacao, { useInnerText: true });
  });

  test.fixme('BUG (FRONT-FOLHA-3) apresenta “até 10 MB” com acento no formulário', async ({ page }) => {
    await prepararFolha(page);
    await page.goto(UPLOAD);

    const formulario = page.locator('form');
    await expect(formulario.getByText(/\baté 10 MB\b/i)).toBeVisible();
    await expect(formulario.getByText(/\bate 10 MB\b/i)).toHaveCount(0);
  });
});
