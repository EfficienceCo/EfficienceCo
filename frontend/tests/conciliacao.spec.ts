import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Conciliação bancária — página principal (/dashboard/conciliacao) (issue #331)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/conciliacao');
  });

  test('tela carrega com título, filtros e seções principais', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Conciliação Bancária' })).toBeVisible();
    await expect(page.getByText('Mês')).toBeVisible();
    await expect(page.getByText('Ano')).toBeVisible();
  });

  test('seções de lançamentos, extrato e sessões aparecem após seleção de período', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Lançamentos Internos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Extrato Bancário' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sessões de Conciliação' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload OFX' })).toBeVisible();
  });

  test('botão "Nova conciliação" não aparece sem extrato processado', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Nova conciliação' })).not.toBeVisible();
  });

  test('modal de novo lançamento abre, bloqueia submit sem campos obrigatórios e fecha ao cancelar', async ({ page }) => {
    await page.getByRole('button', { name: '+ Adicionar lançamento' }).click();
    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();

    // Campos "required" (data, descrição, valor) bloqueiam o submit via validação
    // nativa do HTML5 — o modal deve permanecer aberto em vez de chamar a API.
    await page.getByRole('button', { name: 'Adicionar lançamento', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).not.toBeVisible();
  });

  test('cria e exclui um lançamento contábil de ponta a ponta (backend do PR #338)', async ({ page }) => {
    const descricao = `Teste E2E ${Date.now()}`;

    await page.getByRole('button', { name: '+ Adicionar lançamento' }).click();
    await page.locator('#data_lancamento').fill('2026-08-05');
    await page.locator('#descricao').fill(descricao);
    await page.locator('#tipo').selectOption('debito');
    await page.locator('#valor').fill('123.45');
    await page.getByRole('button', { name: 'Adicionar lançamento', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Novo lançamento' })).not.toBeVisible();
    const linha = page.getByRole('row', { name: new RegExp(descricao) });
    await expect(linha).toBeVisible();
    await expect(linha.getByText('R$ 123,45')).toBeVisible();
    await expect(linha.getByText('Débito')).toBeVisible();

    await linha.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('heading', { name: 'Confirmar exclusão' })).toBeVisible();
    await page.getByRole('button', { name: 'Excluir lançamento' }).click();

    await expect(page.getByRole('heading', { name: 'Confirmar exclusão' })).not.toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(descricao) })).not.toBeVisible();
  });
});
