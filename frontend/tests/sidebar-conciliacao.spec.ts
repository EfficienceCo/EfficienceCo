import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Sidebar — link de Conciliação (issue #333)', () => {
  test('link aparece na sidebar e aponta para /dashboard/conciliacao', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Conciliação' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard/conciliacao');
  });

  test('highlight ativo em /dashboard/conciliacao', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/conciliacao');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Conciliação' });
    await expect(link).toHaveClass(/bg-sky-400\/10/);

    const outroLink = sidebar.getByRole('link', { name: 'Fiscal', exact: true });
    await expect(outroLink).not.toHaveClass(/bg-sky-400\/10/);
  });

  test('highlight ativo em /dashboard/conciliacao/[id]', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/conciliacao/id-inexistente');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Conciliação' });
    await expect(link).toHaveClass(/bg-sky-400\/10/);
  });

  test('demais itens da sidebar continuam funcionando', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    await expect(sidebar.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Obrigações' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Processos' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Folha' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Fiscal', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Logs', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Regras' })).toBeVisible();

    await page.goto('/dashboard/fiscal');
    await expect(sidebar.getByRole('link', { name: 'Fiscal', exact: true })).toHaveClass(/bg-sky-400\/10/);
    await expect(sidebar.getByRole('link', { name: 'Conciliação' })).not.toHaveClass(/bg-sky-400\/10/);
  });
});
