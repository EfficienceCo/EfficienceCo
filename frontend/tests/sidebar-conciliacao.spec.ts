import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sidebar — Conciliação nested em Contábil (issue #333, atualizado pelo #358)', () => {
  test('link direto de Conciliação não existe mais — vive sob Contábil', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    await expect(sidebar.getByRole('link', { name: 'Conciliação', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Contábil' })).toBeVisible();
  });

  test('URL antiga /dashboard/conciliacao redireciona para /dashboard/contabil/conciliacao', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/conciliacao');

    await expect(page).toHaveURL(/\/dashboard\/contabil\/conciliacao$/);
    await expect(page.getByRole('heading', { name: 'Conciliação Bancária' })).toBeVisible();
  });

  test('highlight ativo em /dashboard/contabil/conciliacao', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/contabil/conciliacao');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Contábil' });
    await expect(link).toHaveClass(/bg-sky-400\/10/);

    const outroLink = sidebar.getByRole('link', { name: 'Fiscal' });
    await expect(outroLink).not.toHaveClass(/bg-sky-400\/10/);
  });

  test('highlight ativo em /dashboard/conciliacao/[id]', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/conciliacao/id-inexistente');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Contábil' });
    await expect(link).toHaveClass(/bg-sky-400\/10/);
  });

  test('demais itens da sidebar refletem a reorganização por área', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    await expect(sidebar.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Logs', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Efficience' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Fiscal' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Contábil' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'DP', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Societário' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Financeiro' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Atendimento' })).toBeVisible();

    await expect(sidebar.getByRole('link', { name: 'Obrigações' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Processos' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Folha', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Regras' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Comunicação' })).toHaveCount(0);

    await page.goto('/dashboard/fiscal');
    await expect(sidebar.getByRole('link', { name: 'Fiscal' })).toHaveClass(/bg-sky-400\/10/);
    await expect(sidebar.getByRole('link', { name: 'Contábil' })).not.toHaveClass(/bg-sky-400\/10/);
  });
});
