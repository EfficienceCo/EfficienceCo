import { expect, test, type Page } from '@playwright/test';

const CLIENTE_ID = '11111111-1111-1111-1111-111111111111';

function criarToken(perfil: 'admin_cliente' | 'admin_efficience' | 'funcionario') {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: `sidebar-regras-${perfil}`,
    nome: 'Teste Sidebar Regras',
    perfil,
    cliente_id: CLIENTE_ID,
    exp: 4_102_444_800,
  })}.`;
}

async function autenticarComo(
  page: Page,
  perfil: 'admin_cliente' | 'admin_efficience' | 'funcionario',
) {
  await page.addInitScript((token) => localStorage.setItem('token', token), criarToken(perfil));
  await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));
  await page.route(
    (url) => url.port === '3001' && url.pathname === '/regras',
    (route) => route.fulfill({ json: [] }),
  );
}

test.describe('Sidebar — acesso a Regras (#481)', () => {
  for (const perfil of ['admin_cliente', 'admin_efficience'] as const) {
    test(`exibe e destaca Regras para ${perfil}`, async ({ page }) => {
      await autenticarComo(page, perfil);
      await page.goto('/dashboard');

      const link = page
        .locator('aside.nova-sidebar')
        .getByRole('link', { name: 'Regras', exact: true });

      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/dashboard/regras');
      await link.click();

      await expect(page).toHaveURL(/\/dashboard\/regras$/);
      await expect(link).toHaveClass(/bg-sky-400\/10/);
      await expect(page.getByRole('heading', { name: 'Regras de automação' })).toBeVisible();
    });
  }

  test('oculta Regras para funcionario', async ({ page }) => {
    await autenticarComo(page, 'funcionario');
    await page.goto('/dashboard');

    await expect(
      page.locator('aside.nova-sidebar').getByRole('link', { name: 'Regras', exact: true }),
    ).toHaveCount(0);
  });
});
