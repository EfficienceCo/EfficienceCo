import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

// QA-F (#397) 2ª passagem — camada 1 — fase 2: bateria de UI da tela de apuração.
//
// Roda contra backend + Supabase de DEV reais. Pré-condições (nesta ordem):
//   1. npx playwright test tests/qa-f2-cadastro.spec.ts   (cria os clientes QA-F2 pela UI)
//   2. cd backend && QA_API_URL=<backend> node scripts/qa/qa-f2-seed.mjs --reset
// O --reset precisa rodar antes de cada execução: U3/U4/U7 mudam estado (recalcular,
// excluir, aprovar).
//
// As asserções cobrem o comportamento correto (valores do DAS conferidos à mão).
// Os achados conhecidos da passagem de 2026-09-25 (G1..G8 em
// efficience-vault/problemas/apuracao-simples-qa-f-2026-09-25.md) são só LOGADOS,
// com o id do achado, para a suíte não ficar vermelha até a correção.

const ADMIN = { email: process.env.QA_ADMIN_EMAIL || 'admin@teste.com', senha: process.env.QA_ADMIN_SENHA || '123456' };
const SHOTS = 'test-results/qa-f2';

function monitorar(page: Page) {
  const problemas: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problemas.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problemas.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) problemas.push(`network ${r.status()} ${r.request().method()} ${r.url()}`); });
  return problemas;
}

async function abrirApuracao(page: Page, cred = ADMIN) {
  await login(page, cred.email, cred.senha);
  await page.goto('/dashboard/fiscal/apuracao');
  await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
}

const filtros = (page: Page) => page.locator('section', { hasText: 'Filtros' }).first();

async function selecionar(page: Page, cliente: string | null, mes: string, ano: string) {
  const f = filtros(page);
  if (cliente) {
    const sel = f.locator('select').first();
    await expect(sel.locator('option', { hasText: cliente })).toHaveCount(1, { timeout: 15000 });
    await sel.selectOption({ label: cliente });
  }
  const selects = f.locator('select');
  const n = await selects.count();
  await selects.nth(n - 2).selectOption({ label: mes });
  await selects.nth(n - 1).selectOption(ano);
}

async function calcular(page: Page) {
  await page.getByRole('button', { name: 'Calcular DAS' }).click();
  await expect(page.getByRole('button', { name: /Calculando/ })).toHaveCount(0, { timeout: 20000 });
}

const resultado = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Resultado do cálculo' }) });

test.describe.configure({ mode: 'serial' });

test('U1 — padrão abre na última competência fechada; mês corrente é bloqueado', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  const f = filtros(page);
  const selects = f.locator('select');
  const n = await selects.count();
  const mesPadrao = await selects.nth(n - 2).inputValue();
  const anoPadrao = await selects.nth(n - 1).inputValue();
  const anos = await selects.nth(n - 1).locator('option').allInnerTexts();
  console.log(`U1 padrão mes=${mesPadrao} ano=${anoPadrao} anos=${anos.join(',')}`);
  expect(mesPadrao).toBe('8');
  expect(anoPadrao).toBe('2026');

  await selecionar(page, 'QA-F2 Comercio Anexo I', 'Setembro', '2026');
  await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeDisabled();
  await expect(page.getByText(/ainda não fechou/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/U1-mes-aberto.png`, fullPage: true });
  await selecionar(page, null, 'Dezembro', '2026');
  await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeDisabled();
  console.log('U1 problemas:', JSON.stringify(problemas));
});

test('U2 — Anexo I aprovado (08/2026): breakdown, histórico, sem ações de rascunho', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Comercio Anexo I', 'Agosto', '2026');
  await calcular(page);
  const r = resultado(page);
  await expect(r).toBeVisible();
  const txt = (await r.innerText()).replace(/\s+/g, ' ');
  console.log('U2 resultado:', txt);
  expect(txt).toContain('R$ 240.000,00');
  expect(txt).toContain('R$ 960,50');
  await expect(r.getByText('Aprovado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recalcular' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Excluir rascunho' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Editar valor' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Histórico de edições' })).toBeVisible();
  const comp = (await page.locator('section', { has: page.getByRole('heading', { name: 'Composição da RBT12' }) }).innerText()).replace(/\s+/g, ' ');
  console.log('U2 composição:', comp);
  const notas = (await page.locator('section', { has: page.getByRole('heading', { name: 'Notas fiscais auditadas' }) }).innerText()).replace(/\s+/g, ' ');
  console.log('U2 notas:', notas.slice(0, 600));
  // Achado G3: chip "Aguardando confirmação do agente" em cliente Anexo I.
  console.log('U2 chip folha em Anexo I?', txt.includes('Aguardando confirmação do agente'));
  await page.screenshot({ path: `${SHOTS}/U2-anexo-I-aprovado.png`, fullPage: true });
  console.log('U2 problemas:', JSON.stringify(problemas));
});

test('U3 — breakdown desatualizado + editar + Recalcular (07/2026)', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Comercio Anexo I', 'Julho', '2026');
  await calcular(page);
  const aviso = page.getByTestId('aviso-breakdown-desatualizado');
  await expect(aviso).toBeVisible();
  console.log('U3 aviso:', (await aviso.innerText()).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${SHOTS}/U3a-desatualizado.png`, fullPage: true });

  // editar pela UI
  const edit = page.locator('section', { has: page.getByRole('heading', { name: 'Editar valor' }) });
  await edit.locator('input[type=number]').fill('930');
  await edit.getByRole('button', { name: 'Salvar edição' }).click();
  const erroSemMotivo = await edit.locator('p.bg-rose-50').innerText().catch(() => '(nenhum)');
  console.log('U3 salvar sem motivo ->', erroSemMotivo);
  await edit.locator('textarea').fill('QA-F2 edição via UI antes do recalcular');
  await edit.getByRole('button', { name: 'Salvar edição' }).click();
  await expect(page.getByText('QA-F2 edição via UI antes do recalcular')).toBeVisible();
  const antes = (await resultado(page).innerText()).replace(/\s+/g, ' ');
  console.log('U3 antes do recalcular:', antes);

  await page.getByRole('button', { name: 'Recalcular' }).click();
  await expect(page.getByRole('button', { name: /Recalculando/ })).toHaveCount(0, { timeout: 20000 });
  await expect(aviso).toHaveCount(0);
  await expect(resultado(page)).toContainText('R$ 943,48');
  await expect(resultado(page)).toContainText('R$ 230.000,00');
  const depois = (await resultado(page).innerText()).replace(/\s+/g, ' ');
  console.log('U3 depois do recalcular:', depois);
  const hist = await page.locator('section', { has: page.getByRole('heading', { name: 'Histórico de edições' }) }).innerText().catch(() => '(sem histórico)');
  // Achado G2: o recálculo zera a edição manual sem registrar no histórico nem avisar.
  console.log('U3 histórico depois:', hist.replace(/\s+/g, ' '));
  const valorInput = await page.locator('section', { has: page.getByRole('heading', { name: 'Editar valor' }) }).locator('input[type=number]').inputValue();
  console.log('U3 input valor final depois:', valorInput);
  console.log('U3 algum feedback de sucesso?', await page.getByText(/recalculad/i).count());
  await page.screenshot({ path: `${SHOTS}/U3b-recalculado.png`, fullPage: true });
  console.log('U3 problemas:', JSON.stringify(problemas));
});

test('U4 — Excluir rascunho: cancelar, confirmar, recriar (Anexo V FatorR 16, 08/2026)', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Servicos V FatorR 16', 'Agosto', '2026');
  await calcular(page);
  await expect(resultado(page)).toContainText('R$ 5.025,00');
  await expect(resultado(page)).toContainText('16,00%');
  await page.getByRole('button', { name: 'Excluir rascunho' }).click();
  const modal = page.locator('section', { has: page.getByRole('heading', { name: 'Excluir rascunho' }) });
  console.log('U4 modal:', (await modal.innerText()).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${SHOTS}/U4a-modal-excluir.png` });
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(resultado(page)).toBeVisible();
  await page.getByRole('button', { name: 'Excluir rascunho' }).click();
  await modal.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(resultado(page)).toHaveCount(0, { timeout: 15000 });
  const vazio = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  // Achado G8: nenhuma mensagem de sucesso depois de excluir.
  console.log('U4 após excluir (feedback?):', vazio.slice(vazio.indexOf('Calcular DAS'), vazio.indexOf('Calcular DAS') + 300));
  await page.screenshot({ path: `${SHOTS}/U4b-excluido.png`, fullPage: true });
  await calcular(page);
  await expect(resultado(page)).toContainText('5.025,00');
  console.log('U4 problemas:', JSON.stringify(problemas));
});

test('U5 — Anexo V→III (FatorR 40) e início de atividade', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Servicos V FatorR 40', 'Agosto', '2026');
  await calcular(page);
  await expect(resultado(page)).toContainText('migrou do Anexo V pelo Fator R');
  await expect(resultado(page)).toContainText('R$ 2.580,00');
  await expect(resultado(page)).toContainText('40,00%');
  await page.screenshot({ path: `${SHOTS}/U5a-fator-r.png`, fullPage: true });
  await selecionar(page, 'QA-F2 Inicio Atividade', 'Agosto', '2026');
  await calcular(page);
  const txt = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  console.log('U5 início atividade resultado:', (await resultado(page).innerText()).replace(/\s+/g, ' '));
  // Achado G1: pela CGSN 140/2018 art. 22 o DAS seria R$ 3.595,00 (RBT12 = 50.000 × 12);
  // o motor soma só 2 meses (RBT12 100.000) e dá R$ 2.000,00, sem aviso.
  console.log('U5 algum aviso de início de atividade/meses faltantes?', /in[ií]cio de atividade|meses sem receita|proporcional/i.test(txt));
  await page.screenshot({ path: `${SHOTS}/U5b-inicio-atividade.png`, fullPage: true });
  console.log('U5 problemas:', JSON.stringify(problemas));
});

test('U6 — mensagens de erro: Lucro Presumido e Anexo V sem folha', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Lucro Presumido', 'Agosto', '2026');
  await calcular(page);
  const main1 = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  console.log('U6 lucro presumido:', main1.slice(main1.indexOf('Calcular DAS') + 12, main1.indexOf('Calcular DAS') + 400));
  await page.screenshot({ path: `${SHOTS}/U6a-regime.png`, fullPage: true });
  await selecionar(page, 'QA-F Anexo V Sem Folha', 'Julho', '2026');
  await calcular(page);
  const main2 = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  console.log('U6 sem folha:', main2.slice(main2.indexOf('Calcular DAS') + 12, main2.indexOf('Calcular DAS') + 400));
  expect(main1).toContain('Regime não suportado');
  expect(main2).toContain('Não foi possível calcular o Fator R');
  expect(main1 + main2).not.toMatch(/FATOR_R_SEM_FOLHA|REGIME_NAO_SUPORTADO/);
  await page.screenshot({ path: `${SHOTS}/U6b-sem-folha.png`, fullPage: true });
  console.log('U6 problemas:', JSON.stringify(problemas));
});

test('U7 — editar + aprovar pela UI (Anexo III só histórico, 08/2026)', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Anexo III So Historico', 'Agosto', '2026');
  await calcular(page);
  await expect(resultado(page)).toContainText('R$ 180.000,00');
  await expect(resultado(page)).toContainText('R$ 600,00');
  const edit = page.locator('section', { has: page.getByRole('heading', { name: 'Editar valor' }) });
  await edit.locator('input[type=number]').fill('590');
  await edit.locator('textarea').fill('QA-F2 compensação de retenção');
  await edit.getByRole('button', { name: 'Salvar edição' }).click();
  await expect(page.getByText('QA-F2 compensação de retenção')).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar DAS' }).click();
  const modal = page.locator('section', { has: page.getByRole('heading', { name: 'Confirmar aprovação' }) });
  const txtModal = (await modal.innerText()).replace(/\s+/g, ' ');
  console.log('U7 modal aprovação:', txtModal);
  // Pendência de reunião: modal sem aviso de responsabilidade / revisão humana.
  console.log('U7 aviso de responsabilidade?', /responsab|revis(ei|ão humana)|declaro/i.test(txtModal));
  await page.screenshot({ path: `${SHOTS}/U7a-modal-aprovar.png` });
  await modal.getByRole('button', { name: 'Confirmar aprovação' }).click();
  await expect(resultado(page).getByText('Aprovado', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Aprovar DAS' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Recalcular' })).toHaveCount(0);
  console.log('U7 rodapé:', (await page.getByText(/Aprovado por/).innerText()));
  await page.screenshot({ path: `${SHOTS}/U7b-aprovado.png`, fullPage: true });
  console.log('U7 problemas:', JSON.stringify(problemas));
});

test('U8 — URL antiga /dashboard/apuracoes redireciona', async ({ page }) => {
  const problemas = monitorar(page);
  await login(page, ADMIN.email, ADMIN.senha);
  await page.goto('/dashboard/apuracoes');
  await page.waitForURL('**/dashboard/fiscal/apuracao');
  await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
  console.log('U8 problemas:', JSON.stringify(problemas));
});

test('U9 — admin_cliente (joao@teste.com) abre a tela sem seletor de cliente', async ({ page }) => {
  const problemas = monitorar(page);
  await abrirApuracao(page, { email: 'joao@teste.com', senha: 'senha123' });
  const nSelects = await filtros(page).locator('select').count();
  console.log('U9 selects nos filtros:', nSelects);
  await calcular(page);
  const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  // Achado G7: cabeçalho mostra o e-mail do usuário no lugar do nome do cliente.
  console.log('U9 08/2026 Cliente Teste:', main.slice(main.indexOf('Calcular DAS') + 12, main.indexOf('Calcular DAS') + 500));
  await page.screenshot({ path: `${SHOTS}/U9-admin-cliente.png`, fullPage: true });
  console.log('U9 problemas:', JSON.stringify(problemas));
});

test('U10 — mobile 390px: sem scroll horizontal da página', async ({ page }) => {
  const problemas = monitorar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Servicos V FatorR 40', 'Agosto', '2026');
  await calcular(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/U10-mobile.png`, fullPage: true });
  console.log('U10 problemas:', JSON.stringify(problemas));
});

// O app não tem dark mode (N/A na passagem de 2026-09-25) — só registra o fundo.
test('U11 — dark mode (prefers-color-scheme)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await abrirApuracao(page);
  await selecionar(page, 'QA-F2 Servicos V FatorR 40', 'Agosto', '2026');
  await calcular(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log('U11 body bg em dark:', bg);
  await page.screenshot({ path: `${SHOTS}/U11-dark.png`, fullPage: true });
});
