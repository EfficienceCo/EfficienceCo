import { expect, test } from '@playwright/test';

function criarToken() {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'sidebar-calendario-test',
      nome: 'Teste Calendário',
      perfil: 'admin_cliente',
      cliente_id: '11111111-1111-1111-1111-111111111111',
      exp: 4_102_444_800,
    }),
  ).toString('base64url');

  return `cabecalho.${payload}.assinatura`;
}

test.describe('Sidebar — Calendário Fiscal (#508)', () => {
  test('oferece navegação direta e destaca a rota de obrigações', async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('token', token), criarToken());
    await page.route('http://localhost:3001/notificacoes**', (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route('http://localhost:3001/obrigacoes**', (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route('http://localhost:3001/certificados**', (route) =>
      route.fulfill({ json: [] }),
    );

    await page.goto('/dashboard/obrigacoes');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Calendário Fiscal', exact: true });

    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard/obrigacoes');
    await expect(link).toHaveClass(/bg-sky-400\/10/);
    await expect(
      page.getByRole('heading', { name: 'Calendário Fiscal', exact: true }),
    ).toBeVisible();
  });
});
