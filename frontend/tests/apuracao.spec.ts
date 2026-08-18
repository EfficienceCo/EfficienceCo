import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Competência pseudo-única por execução: a apuração é uma entidade natural
// (cliente + mês + ano, sem texto livre pra tornar única como em outros
// testes) e, uma vez aprovada, o card de edição some — rodar duas vezes sobre
// o mesmo período faria a segunda execução pular a etapa de edição. Variar a
// competência a cada execução evita colidir com o resultado de uma rodada
// anterior.
// O seletor de Ano só oferece o ano atual e os 4 anteriores (ver
// obterAnosDisponiveis em page.jsx) — a competência pseudo-única precisa
// cair dentro dessa janela.
const ANO = new Date().getFullYear() - (Date.now() % 4);
const MES = (Date.now() % 12) + 1;

test.describe('Apuração Fiscal — página /dashboard/apuracoes (issue #356)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/apuracoes');
  });

  test('tela carrega com título e filtros', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
    await expect(page.getByText('Mês')).toBeVisible();
    await expect(page.getByText('Ano')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeVisible();
  });

  test('calcula o DAS e exibe o breakdown completo (RBT12, Anexo, alíquota, valor)', async ({ page }) => {
    await page.getByLabel('Mês').selectOption(String(MES));
    await page.getByLabel('Ano').selectOption(String(ANO));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();

    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Simples Nacional')).toBeVisible();
    await expect(page.getByText('RBT12')).toBeVisible();
    await expect(page.getByText('Alíquota nominal')).toBeVisible();
    await expect(page.getByText('Alíquota efetiva')).toBeVisible();
    await expect(page.getByText('Valor do DAS')).toBeVisible();
  });

  test('edita o valor com motivo e o histórico de edições aparece na tela', async ({ page }) => {
    await page.getByLabel('Mês').selectOption(String(MES));
    await page.getByLabel('Ano').selectOption(String(ANO));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });

    const secaoEditar = page.locator('section', { hasText: 'Editar valor' }).first();
    await expect(secaoEditar).toBeVisible();

    const campoValor = secaoEditar.locator('input[type="number"]');
    await campoValor.fill('999.99');
    await secaoEditar.locator('textarea').fill('Ajuste combinado com o cliente');
    await secaoEditar.getByRole('button', { name: 'Salvar edição' }).click();

    const secaoHistorico = page.locator('section', { hasText: 'Histórico de edições' }).first();
    await expect(secaoHistorico).toBeVisible();
    await expect(secaoHistorico.getByText('Ajuste combinado com o cliente')).toBeVisible();
    await expect(secaoHistorico.getByText('R$ 999,99')).toBeVisible();
  });

  test('aprova o DAS via modal de confirmação e o status muda visualmente', async ({ page }) => {
    await page.getByLabel('Mês').selectOption(String(MES));
    await page.getByLabel('Ano').selectOption(String(ANO));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText('Rascunho')).toBeVisible();

    await page.getByRole('button', { name: 'Aprovar DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Confirmar aprovação' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar aprovação' }).click();

    await expect(page.getByRole('heading', { name: 'Confirmar aprovação' })).not.toBeVisible();
    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    await expect(page.getByText(/Aprovado por .+ em/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar DAS' })).toBeDisabled();

    // Após aprovado, a apuração é imutável — o card de edição some.
    await expect(page.getByRole('heading', { name: 'Editar valor' })).not.toBeVisible();
  });
});

test.describe('Sidebar — link de Apuração Fiscal (issue #356)', () => {
  test('link aparece na sidebar e aponta para /dashboard/apuracoes', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Apuração Fiscal' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard/apuracoes');
  });

  test('highlight ativo em /dashboard/apuracoes', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/apuracoes');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Apuração Fiscal' });
    await expect(link).toHaveClass(/bg-sky-400\/10/);

    const outroLink = sidebar.getByRole('link', { name: 'Conciliação' });
    await expect(outroLink).not.toHaveClass(/bg-sky-400\/10/);
  });
});
