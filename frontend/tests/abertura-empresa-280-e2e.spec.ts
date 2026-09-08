/**
 * QA-D / Issue #280 — Abertura de Empresa ponta a ponta (camada 1).
 * Roda contra next dev + backend local + Supabase real + agente local.
 * Não mocka API. Requer agente com PASTA_BASE=C:\Souza e LICENSE_TOKEN válido.
 */
import { expect, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { login } from './helpers/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PASTA_BASE = process.env.PASTA_BASE_QA || 'C:\\Souza';
const PYTHON =
  process.env.PYTHON_QA ||
  'C:\\Users\\gabri\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';

const SUFIXO = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);

const DADOS = {
  nome_empresa: `Souza Comercio QA ${SUFIXO}`,
  cenario: 'nova',
  socios: [
    { nome: 'Ana Souza', cpf: '123.456.789-09', participacao: '60' },
    { nome: 'Bruno Souza', cpf: '987.654.321-00', participacao: '40' },
  ],
  capital_social: '50000',
  endereco: 'Rua das Flores, 100, Centro, Sao Paulo - SP',
  objeto_social: 'Comercio varejista e prestacao de servicos administrativos',
};

const SUBPASTAS = [
  'Documentos',
  'Contratos',
  'Requerimentos',
  'Comprovantes',
  'Correspondencias',
  'Folha',
  'Notas Fiscais',
  'Declaracoes',
];

type Etapa = {
  id: string;
  descricao: string;
  tipo: string;
  acao: string | null;
  status: string;
  concluida: boolean;
  arquivo_gerado?: string | null;
  erro_execucao?: string | null;
};

type Processo = {
  id: string;
  nome_empresa: string;
  status: string;
  tipo: string;
  etapas: Etapa[];
  percentual_conclusao?: number;
};

const resultados: Record<string, { ok: boolean; detalhe: string }> = {};

async function tokenDaPagina(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem('token'));
  if (!token) throw new Error('Token ausente no localStorage após login');
  return token;
}

async function apiJson(page: Page, caminho: string, init?: RequestInit) {
  const token = await tokenDaPagina(page);
  const resposta = await page.request.fetch(`${API_URL}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const corpo = await resposta.json();
  return { status: resposta.status(), corpo };
}

async function buscarProcessoPorNome(page: Page, nome: string): Promise<Processo | null> {
  const { status, corpo } = await apiJson(page, '/processos?tipo=abertura_empresa');
  expect(status).toBe(200);
  const lista = Array.isArray(corpo) ? corpo : [];
  return lista.find((p: Processo) => p.nome_empresa === nome) || null;
}

async function aguardarEtapaConcluida(
  page: Page,
  nomeEmpresa: string,
  acao: string,
  timeoutMs = 180_000,
) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const processo = await buscarProcessoPorNome(page, nomeEmpresa);
    const etapa = processo?.etapas?.find((e) => e.acao === acao);
    if (etapa?.concluida || etapa?.status === 'concluida') {
      return { processo: processo!, etapa: etapa! };
    }
    if (etapa?.status === 'erro' || etapa?.erro_execucao) {
      throw new Error(
        `Etapa ${acao} falhou: ${etapa.erro_execucao || etapa.status}`,
      );
    }
    await page.getByRole('button', { name: /Atualizar lista/i }).click();
    await page.waitForTimeout(5_000);
  }
  throw new Error(`Timeout aguardando etapa ${acao} concluir`);
}

function lerTextoDocx(caminhoDocx: string) {
  const script = `
from docx import Document
import sys
doc = Document(sys.argv[1])
parts = [p.text for p in doc.paragraphs]
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            parts.append(cell.text)
print("\\n".join(parts))
`;
  return execFileSync(PYTHON, ['-c', script, caminhoDocx], {
    encoding: 'utf-8',
  });
}

test.describe.configure({ mode: 'serial', timeout: 600_000 });

test.describe('QA-D Abertura de Empresa (#280)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('fluxo completo — 6 verificações do roteiro', async ({ page }) => {
    const achados: string[] = [];

    // --- 1. Criar processo pela UI ---
    await page.goto('/dashboard/processos');
    await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible();

    await page.getByRole('button', { name: 'Novo processo' }).click();
    const modal = page.getByRole('heading', { name: 'Novo processo' });
    await expect(modal).toBeVisible();

    const selectTipo = page.locator('form select').first();
    const opcoes = await selectTipo.locator('option').allTextContents();
    const temAbertura = opcoes.some((o) => /abertura de empresa/i.test(o));
    expect(temAbertura, 'Dropdown deve listar Abertura de empresa').toBeTruthy();
    await selectTipo.selectOption('abertura_empresa');

    await page.locator('#modal-novo-processo-nome-empresa').fill(DADOS.nome_empresa);
    await page.locator('#modal-novo-processo-cenario').selectOption(DADOS.cenario);

    await page.getByRole('button', { name: 'Adicionar sócio' }).click();
    await page.getByLabel('Nome do sócio 1').fill(DADOS.socios[0].nome);
    await page.getByLabel('CPF do sócio 1').fill(DADOS.socios[0].cpf);
    await page.getByLabel('Participação (%) do sócio 1').fill(DADOS.socios[0].participacao);
    await page.getByLabel('Nome do sócio 2').fill(DADOS.socios[1].nome);
    await page.getByLabel('CPF do sócio 2').fill(DADOS.socios[1].cpf);
    await page.getByLabel('Participação (%) do sócio 2').fill(DADOS.socios[1].participacao);

    await page.locator('#modal-novo-processo-capital-social').fill(DADOS.capital_social);
    await page.locator('#modal-novo-processo-endereco').fill(DADOS.endereco);
    await page.locator('#modal-novo-processo-objeto-social').fill(DADOS.objeto_social);

    await page.getByRole('button', { name: 'Criar processo' }).click();
    await expect(modal).toBeHidden({ timeout: 30_000 });

    let processo = await buscarProcessoPorNome(page, DADOS.nome_empresa);
    if (!processo) {
      resultados['1_criar'] = { ok: false, detalhe: 'Processo não persistiu no banco' };
      throw new Error('Processo não encontrado após criação');
    }

    const tituloUi = tituloProcessoBug(processo);
    if (!tituloUi.includes(DADOS.nome_empresa)) {
      achados.push(
        `[frontend] MÉDIO — card do processo não exibe nome_empresa (mostra "${tituloUi}" via tituloProcesso sem fallback para nome_empresa).`,
      );
    }

    const etapasAuto = processo.etapas.filter((e) => e.tipo === 'automatizada');
    const temPastas = etapasAuto.some((e) => e.acao === 'criar_pastas');
    const temContrato = etapasAuto.some((e) => e.acao === 'gerar_contrato_social');
    expect(temPastas && temContrato).toBeTruthy();
    resultados['1_criar'] = {
      ok: true,
      detalhe: `processo ${processo.id} criado com ${processo.etapas.length} etapas (cenario=${processo.status ? 'ok' : '?'})`,
    };

    // Filtrar abertura_empresa — cards não mostram nome_empresa (achado UX);
    // o mais recente vem primeiro (order criado_em desc).
    await page.locator('select').nth(0).selectOption('abertura_empresa');
    await page.waitForTimeout(1_000);
    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    await page.waitForTimeout(1_000);

    const cardProcesso = page
      .locator('article')
      .filter({ hasText: /Status:\s*Em andamento/i })
      .filter({ has: page.getByRole('button', { name: /Ver etapas|Ocultar etapas/ }) })
      .first();
    await expect(cardProcesso).toBeVisible();
    if (await cardProcesso.getByRole('button', { name: 'Ver etapas' }).isVisible()) {
      await cardProcesso.getByRole('button', { name: 'Ver etapas' }).click();
    }

    // --- 2. Criação de pasta ---
    const formPastas = page.getByRole('form', { name: /Executar Criar estrutura de pastas/i });
    await expect(formPastas).toBeVisible();
    await formPastas.getByRole('button', { name: 'Concluir' }).click();
    // Ao enviar, o <form> é trocado pelo estado "Processando..." (fora do form).
    await expect(cardProcesso.getByText(/Processando/i)).toBeVisible({ timeout: 20_000 });

    let etapaPastas;
    try {
      ({ processo, etapa: etapaPastas } = await aguardarEtapaConcluida(
        page,
        DADOS.nome_empresa,
        'criar_pastas',
      ));
    } catch (erro) {
      resultados['2_pastas'] = { ok: false, detalhe: String(erro) };
      throw erro;
    }

    const pastaEmpresa = path.join(PASTA_BASE, DADOS.nome_empresa);
    const subOk = SUBPASTAS.every((s) => fs.existsSync(path.join(pastaEmpresa, s)));
    const caminhoAbsOk =
      path.isAbsolute(pastaEmpresa) &&
      pastaEmpresa.toLowerCase().startsWith(PASTA_BASE.toLowerCase());

    if (!fs.existsSync(pastaEmpresa) || !subOk || !caminhoAbsOk) {
      resultados['2_pastas'] = {
        ok: false,
        detalhe: `pasta=${pastaEmpresa} existe=${fs.existsSync(pastaEmpresa)} subOk=${subOk}`,
      };
      achados.push(
        `[agente] CRÍTICO — pasta não criada corretamente em ${pastaEmpresa} (subpastas=${subOk}).`,
      );
    } else {
      resultados['2_pastas'] = {
        ok: true,
        detalhe: `${pastaEmpresa} + ${SUBPASTAS.length} subpastas; etapa=${etapaPastas.status}`,
      };
    }

    // Reabrir etapas após refresh
    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    await page.waitForTimeout(1_500);
    const cardAposPastas = page
      .locator('article')
      .filter({ hasText: /Status:\s*Em andamento/i })
      .filter({ has: page.getByRole('button', { name: /Ver etapas|Ocultar etapas/ }) })
      .first();
    if (await cardAposPastas.getByRole('button', { name: 'Ver etapas' }).isVisible()) {
      await cardAposPastas.getByRole('button', { name: 'Ver etapas' }).click();
    }

    // --- 3 + 4. Contrato social ---
    const formContrato = page.getByRole('form', { name: /Executar Gerar contrato social/i });
    await expect(formContrato).toBeVisible();

    // Formulário deve vir pré-preenchido do processo
    await expect(formContrato.getByLabel('Nome do sócio 1')).toHaveValue(DADOS.socios[0].nome);
    await formContrato.getByRole('button', { name: 'Concluir' }).click();
    await expect(cardAposPastas.getByText(/Processando/i)).toBeVisible({ timeout: 20_000 });

    let etapaContrato;
    try {
      ({ processo, etapa: etapaContrato } = await aguardarEtapaConcluida(
        page,
        DADOS.nome_empresa,
        'gerar_contrato_social',
      ));
    } catch (erro) {
      resultados['3_contrato'] = { ok: false, detalhe: String(erro) };
      resultados['4_docx'] = { ok: false, detalhe: 'não gerado — etapa falhou' };
      throw erro;
    }

    const caminhoDocx = path.join(pastaEmpresa, 'Contratos', 'contrato_social_v1.docx');
    const docxExiste = fs.existsSync(caminhoDocx);
    resultados['3_contrato'] = {
      ok: docxExiste && Boolean(etapaContrato.concluida),
      detalhe: `arquivo_gerado=${etapaContrato.arquivo_gerado || caminhoDocx}; existe=${docxExiste}`,
    };

    if (!docxExiste) {
      resultados['4_docx'] = { ok: false, detalhe: `arquivo ausente: ${caminhoDocx}` };
      achados.push(`[agente] CRÍTICO — .docx não gerado em Contratos/.`);
    } else {
      const texto = lerTextoDocx(caminhoDocx);
      const checks = {
        nome: texto.includes(DADOS.nome_empresa),
        socio1: texto.includes(DADOS.socios[0].nome),
        socio2: texto.includes(DADOS.socios[1].nome),
        capital: /50\.?000|50000/.test(texto),
        endereco: texto.includes('Rua das Flores'),
        data: /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}/.test(texto),
      };
      const falhas = Object.entries(checks)
        .filter(([, ok]) => !ok)
        .map(([k]) => k);
      resultados['4_docx'] = {
        ok: falhas.length === 0,
        detalhe:
          falhas.length === 0
            ? 'nome/sócios/capital/endereço/data presentes no .docx'
            : `faltando no docx: ${falhas.join(', ')}`,
      };
      if (falhas.length) {
        achados.push(`[agente] ALTO — placeholders não preenchidos: ${falhas.join(', ')}`);
      }
    }

    // --- 5. Marcar manuais + status ---
    // data-testid=etapa-{uuid} existe no DOM — evita ambiguidade entre vários
    // processos "Em andamento" com 9 etapas (ex.: legado "Souza").
    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    await page.waitForTimeout(1_000);

    processo = await buscarProcessoPorNome(page, DADOS.nome_empresa);
    expect(processo).toBeTruthy();

    // Garante que o card do nosso processo está expandido: abre todos "Ver etapas"
    // em andamento até o testid da primeira manual pendente aparecer.
    const manuais = (processo!.etapas || [])
      .filter((e) => e.tipo === 'manual' && !e.concluida)
      .sort((a, b) => String(a.descricao).localeCompare(String(b.descricao)));

    for (const etapa of manuais) {
      const testId = `etapa-${etapa.id}`;
      let alvo = page.getByTestId(testId);
      if ((await alvo.count()) === 0) {
        const botoes = page.getByRole('button', { name: 'Ver etapas' });
        const n = await botoes.count();
        for (let i = 0; i < n; i++) {
          await botoes.nth(i).click();
          await page.waitForTimeout(400);
          if ((await page.getByTestId(testId).count()) > 0) break;
        }
        alvo = page.getByTestId(testId);
      }
      await expect(alvo).toBeVisible({ timeout: 15_000 });
      const checkbox = alvo.locator('input[type="checkbox"]');
      if (await checkbox.isChecked()) continue;
      if (await checkbox.isDisabled()) {
        await expect(checkbox).toBeEnabled({ timeout: 15_000 });
      }
      await checkbox.check();
      await expect
        .poll(
          async () => {
            const atual = await buscarProcessoPorNome(page, DADOS.nome_empresa);
            return Boolean(atual?.etapas?.find((e) => e.id === etapa.id)?.concluida);
          },
          { timeout: 20_000 },
        )
        .toBeTruthy();
    }

    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    await page.waitForTimeout(2_000);
    processo = await buscarProcessoPorNome(page, DADOS.nome_empresa);
    const todasConcluidas = processo?.etapas?.every((e) => e.concluida) ?? false;
    const statusFinal = processo?.status;
    resultados['5_status'] = {
      ok: todasConcluidas && statusFinal === 'concluido',
      detalhe: `status=${statusFinal}; etapas_concluidas=${processo?.etapas?.filter((e) => e.concluida).length}/${processo?.etapas?.length}`,
    };
    if (!(todasConcluidas && statusFinal === 'concluido')) {
      achados.push(
        `[backend/frontend] ALTO — processo não ficou concluido após marcar manuais (status=${statusFinal}).`,
      );
    }

    // --- 6. Eventos no banco + painel de logs ---
    const { status: stEv, corpo: evCorpo } = await apiJson(page, '/eventos?limit=20');
    expect(stEv).toBe(200);
    const eventos = Array.isArray(evCorpo?.data) ? evCorpo.data : [];
    const msgPastas = eventos.find((e: { descricao?: string }) =>
      String(e.descricao || '').includes(`Estrutura de pastas criada para ${DADOS.nome_empresa}`),
    );
    const msgContrato = eventos.find((e: { descricao?: string }) =>
      String(e.descricao || '').includes(`Contrato social gerado para ${DADOS.nome_empresa}`),
    );

    await page.goto('/dashboard/logs');
    await expect(page.getByRole('heading', { name: /Logs/i })).toBeVisible();
    await page.getByRole('button', { name: /Atualizar logs/i }).click();
    await page.waitForTimeout(1_500);

    const logsVisiveisPastas = await page
      .getByText(new RegExp(`Estrutura de pastas criada para ${DADOS.nome_empresa}`))
      .count();
    const logsVisiveisContrato = await page
      .getByText(new RegExp(`Contrato social gerado para ${DADOS.nome_empresa}`))
      .count();

    const evOk = Boolean(msgPastas && msgContrato && logsVisiveisPastas && logsVisiveisContrato);
    resultados['6_eventos'] = {
      ok: evOk,
      detalhe: `banco pastas=${Boolean(msgPastas)} contrato=${Boolean(msgContrato)}; UI pastas=${logsVisiveisPastas} contrato=${logsVisiveisContrato}`,
    };
    if (!evOk) {
      achados.push(
        `[agente/frontend] ALTO — eventos ausentes no banco e/ou painel de logs (${resultados['6_eventos'].detalhe}).`,
      );
    }

    // Persistência do relatório da rodada (working tree)
    const relatorio = {
      data: new Date().toISOString(),
      nome_empresa: DADOS.nome_empresa,
      processo_id: processo?.id,
      pasta_empresa: pastaEmpresa,
      resultados,
      achados,
    };
    const outDir = path.join(__dirname, '..', 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'qa-d-abertura-empresa-280.json'),
      JSON.stringify(relatorio, null, 2),
      'utf-8',
    );

    const falhasRoteiro = Object.entries(resultados).filter(([, v]) => !v.ok);
    console.log('\n===== QA-D RESULTADOS =====');
    console.log(JSON.stringify(relatorio, null, 2));

    // Critério do roteiro: 6/6. Achados colaterais (ex.: título sem nome) não
    // derrubam o expect principal se as 6 verificações passaram — mas vão no relatório.
    expect(
      falhasRoteiro,
      `Verificações falharam: ${falhasRoteiro.map(([k, v]) => `${k}: ${v.detalhe}`).join(' | ')}`,
    ).toEqual([]);
  });
});

function tituloProcessoBug(processo: Processo) {
  // Replica a lógica atual da UI (sem nome_empresa) para detectar o gap.
  const any = processo as Processo & { titulo?: string; nome?: string; descricao?: string };
  return any.titulo || any.nome || any.descricao || 'Processo N';
}
