import { test, expect, Page } from '@playwright/test';
import fs from 'fs';

// QA-F (#397) — Apuração do Simples / DAS. Camada 1 (bateria automatizada pela UI).
// Dataset semeado no Supabase dev por scratchpad/qaf-seed*.mjs.
// Reset das apurações QA-F: rodar scratchpad/qaf-reset.mjs ANTES de `playwright test`.
// Login: admin@teste.com (admin_efficience) — escolhe cliente no seletor.

const IDS = JSON.parse(
  fs.readFileSync(
    'C:/Users/joaor/AppData/Local/Temp/claude/c--Users-joaor-Projetos-EfficienceCo/abe592a7-f7c8-4d14-b625-e67fde50175a/scratchpad/qaf-ids.json',
    'utf8',
  ),
);

async function login(page: Page) {
  await page.goto('/');
  await page.locator('#email').fill('admin@teste.com');
  await page.locator('#password').fill('123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard**');
}

async function abrir(page: Page) {
  await page.goto('/dashboard/fiscal/apuracao');
  await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
}

function filtros(page: Page) {
  return page.locator('section').filter({ hasText: 'Filtros' }).first();
}

async function selecionarCliente(page: Page, label: string) {
  const sel = filtros(page).getByRole('combobox').first(); // 1º combobox = Cliente (admin_efficience)
  await expect(sel).toBeEnabled({ timeout: 15000 });
  await expect(sel.locator('option', { hasText: label })).toHaveCount(1, { timeout: 15000 });
  await sel.selectOption({ label });
}

async function selecionarPeriodo(page: Page, mesLabel: string, ano: string) {
  await page.getByLabel('Mês').selectOption({ label: mesLabel });
  await page.getByLabel('Ano').selectOption(ano);
}

async function calcular(page: Page) {
  await page.getByRole('button', { name: 'Calcular DAS' }).click();
}

const resultado = (page: Page) =>
  page.locator('section').filter({ hasText: 'Resultado do cálculo' }).first();

test.describe('QA-F #397 — Apuração do Simples / DAS', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ---------- Funcionalidade / correção dos números ----------

  test('A1 — happy path Anexo I: breakdown e DAS batem com o cálculo manual', async ({ page }) => {
    const erros: string[] = [];
    const netRuins: string[] = [];
    page.on('console', (m) => {
      // ignora o eco de console do 400 de /notificacoes (bug do shell — F11)
      if (m.type() === 'error' && !/Failed to load resource.*40[03]/.test(m.text())) erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(String(e)));
    // Shell do dashboard p/ admin_efficience dispara 400 em /notificacoes,
    // /processos?status=em_andamento e /obrigacoes/proximas?dias=7 (não mandam
    // cliente_id) — bug do shell, registrado à parte em F11. Aqui só asseguro
    // que a TELA DE APURAÇÃO (endpoints /apuracoes e /clientes) está limpa.
    const doShell = /\/(notificacoes|processos|obrigacoes)/;
    page.on('response', (r) => {
      const s = r.status();
      if (s >= 400 && !doShell.test(new URL(r.url()).pathname)) {
        netRuins.push(`${s} ${r.request().method()} ${r.url()}`);
      }
    });

    await abrir(page);
    await selecionarCliente(page, 'QA-F Comercio Anexo I');
    await selecionarPeriodo(page, 'Agosto', '2026');
    await calcular(page);

    const res = resultado(page);
    await expect(res.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({ timeout: 20000 });
    await expect(res.getByText('Anexo I', { exact: true })).toBeVisible();
    await expect(res.getByText('RBT12', { exact: true }).locator('..')).toContainText(/R\$\s*240\.000,00/);
    await expect(res.getByText('Receita da competência').locator('..')).toContainText(/R\$\s*20\.000,00/);
    await expect(res.getByText('Faixa de receita').locator('..')).toContainText(/R\$\s*360\.000,00/);
    await expect(res.getByText('Alíquota nominal').locator('..')).toContainText('7,30%');
    // DAS manual: 20000 * ((240000*0,073 - 5940)/240000) = 20000 * 0,04825 = R$ 965,00
    await expect(res.getByText('Valor do DAS', { exact: true }).locator('..')).toContainText(/R\$\s*965,00/);

    const comp = page.locator('section').filter({ hasText: 'Composição da RBT12' }).first();
    await expect(comp.locator('tbody tr')).toHaveCount(12);
    await expect(comp.locator('tfoot')).toContainText(/R\$\s*240\.000,00/);
    const somaLinhas = (await comp.locator('tbody tr td:last-child').allInnerTexts())
      .reduce((acc, t) => acc + Number(t.replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')), 0);
    expect(somaLinhas).toBe(240000);

    await expect(page.getByText(/^Consideradas \(13\)$/)).toBeVisible();
    await expect(page.getByText(/^Excluídas \(1\)$/)).toBeVisible();

    expect(netRuins, `network 4xx/5xx: ${netRuins.join(' | ')}`).toEqual([]);
    expect(erros, `console/pageerror: ${erros.join(' | ')}`).toEqual([]);
  });

  test('A2 — Anexo V com Fator R ≥ 28% migra para o Anexo III', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Servicos Anexo V');
    await selecionarPeriodo(page, 'Agosto', '2026');
    await calcular(page);

    const res = resultado(page);
    await expect(res.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({ timeout: 20000 });
    await expect(res.getByText('Anexo III', { exact: true })).toBeVisible();
    await expect(res).toContainText(/migrou do Anexo V pelo Fator R/);
    await expect(res.getByText('Fator R', { exact: true }).locator('..')).toContainText('40,00%');
    // DAS manual: 30000 * ((360000*0,112 - 9360)/360000) = 30000 * 0,086 = R$ 2.580,00
    await expect(res.getByText('Valor do DAS', { exact: true }).locator('..')).toContainText(/R\$\s*2\.580,00/);
  });

  test('A3 — Anexo V sem 12 meses de folha: orientação clara de Fator R (sem código cru)', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Anexo V Sem Folha');
    await selecionarPeriodo(page, 'Agosto', '2026');
    await calcular(page);
    await expect(page.getByText('Não foi possível calcular o Fator R')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Importe as folhas de pagamento dos 12 meses anteriores/)).toBeVisible();
    await expect(page.getByText('FATOR_R_SEM_FOLHA')).toHaveCount(0);
  });

  test('A4 — regime não suportado (Lucro Presumido): mensagem clara', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Lucro Presumido');
    await selecionarPeriodo(page, 'Agosto', '2026');
    await calcular(page);
    await expect(page.getByText('Regime não suportado', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Este cliente não está no Simples Nacional.')).toBeVisible();
  });

  test('A5 — competência FUTURA é aceita e gera DAS aprovável (esperado: recusar)', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Comercio Anexo I');
    await selecionarPeriodo(page, 'Dezembro', '2026'); // hoje = 09/2026 → dez ainda não fechou
    await calcular(page);
    await expect(resultado(page).getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Aprovar DAS' })).toBeEnabled();
  });

  // ---------- UX / revisão de guia pro governo ----------

  test('A6 — editar com motivo, histórico aparece, aprovar via modal', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Comercio Anexo I');
    await selecionarPeriodo(page, 'Agosto', '2026');
    await calcular(page);
    await expect(resultado(page).getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();

    const editar = page.locator('section').filter({ hasText: 'Editar valor' }).first();
    await editar.locator('input[type="number"]').fill('1000.00');
    await editar.locator('textarea').fill('Ajuste combinado com o cliente (QA-F)');
    await editar.getByRole('button', { name: 'Salvar edição' }).click();

    const hist = page.locator('section').filter({ hasText: 'Histórico de edições' }).first();
    await expect(hist).toBeVisible();
    await expect(hist.getByText('Ajuste combinado com o cliente (QA-F)')).toBeVisible();
    await expect(hist.getByText(/R\$\s*1\.000,00/)).toBeVisible();
    await expect(hist.getByText(/por .*admin@teste\.com/)).toBeVisible();

    await page.getByRole('button', { name: 'Aprovar DAS' }).click();
    const modal = page.locator('section').filter({ hasText: 'Confirmar aprovação' }).first();
    await expect(modal.getByRole('heading', { name: 'Confirmar aprovação' })).toBeVisible();
    await expect(modal).toContainText(/R\$\s*1\.000,00/);
    await expect(modal).toContainText('QA-F Comercio Anexo I');
    await expect(modal).toContainText('Agosto/2026');
    await page.getByRole('button', { name: 'Confirmar aprovação' }).click();

    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    await expect(page.getByText(/Aprovado por .*admin@teste\.com em/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar DAS' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Editar valor' })).toHaveCount(0);
  });

  test('A7 — modal de aprovação: SEM aviso de responsabilidade/revisão humana (gap vs. eSocial)', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Servicos Anexo V');
    await selecionarPeriodo(page, 'Agosto', '2026'); // reabre a apuração criada no A2
    await calcular(page);
    await expect(resultado(page).getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Aprovar DAS' }).click();
    const modal = page.locator('section').filter({ hasText: 'Confirmar aprovação' }).first();
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/referente a/);
    // FINDING: o checklist de QA (processo-qa-duas-camadas) exige, pra doc pro
    // governo, aviso de responsabilidade + revisão humana. O modal do DAS só tem
    // a pergunta de confirmação — nada de responsabilidade/declaração.
    await expect(modal).not.toContainText(/responsabilidade|revis[aã]o humana|sob sua responsabilidade|declaro/i);
  });

  // ---------- Recalcular / folha_status ----------

  test('A8 — sem "Recalcular"; segundo "Calcular DAS" não recria nem recalcula', async ({ page }) => {
    await abrir(page);
    await selecionarCliente(page, 'QA-F Comercio Anexo I');
    await selecionarPeriodo(page, 'Junho', '2026');
    await calcular(page);
    await expect(resultado(page).getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({ timeout: 20000 });

    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/apuracoes')) posts.push(r.url());
    });
    await calcular(page);
    await page.waitForTimeout(2500);
    expect(posts, 'segundo clique não deve POSTar').toEqual([]);

    await expect(page.getByRole('button', { name: /Recalcular/i })).toHaveCount(0);
    await expect(page.getByText(/folha_status|status da folha|verifica[çc][aã]o de folha/i)).toHaveCount(0);
  });

  // ---------- Navegação ----------

  test('A9 — /dashboard/apuracoes redireciona para /dashboard/fiscal/apuracao', async ({ page }) => {
    await page.goto('/dashboard/apuracoes');
    await expect(page).toHaveURL(/\/dashboard\/fiscal\/apuracao$/);
    await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
  });

  test('A10 — estado inicial: pede seleção de cliente, sem erro/breakdown', async ({ page }) => {
    await abrir(page);
    await expect(page.getByText('Selecione um cliente para calcular o DAS.')).toBeVisible();
    await expect(page.locator('section').filter({ hasText: 'Resultado do cálculo' })).toHaveCount(0);
  });
});
