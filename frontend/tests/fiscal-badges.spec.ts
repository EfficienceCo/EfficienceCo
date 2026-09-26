import { expect, test } from '@playwright/test';

const CLIENTE_ID = '11111111-1111-1111-1111-111111111111';

function criarTokenTeste() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: 'fiscal-badges-test',
    nome: 'Teste Fiscal',
    perfil: 'admin_cliente',
    cliente_id: CLIENTE_ID,
    exp: 4_102_444_800,
  })}.`;
}

test.describe('Fiscal — badges e navegação (issue #302)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('token', token), criarTokenTeste());

    await page.route('**/lancamentos-fiscais**', async (route) => {
      const { pathname } = new URL(route.request().url());

      if (pathname.endsWith('/resumo')) {
        await route.fulfill({
          json: {
            total_nfe: 2,
            valor_total: 2_500,
            icms: 180,
            pis: 20,
            cofins: 90,
            ipi: 0,
            entradas: 1,
            saidas: 1,
          },
        });
        return;
      }

      await route.fulfill({
        json: [
          {
            id: 'entrada-1',
            data_emissao: '2026-08-18',
            chave_nfe: '12345678901234567890123456789012345678901234',
            tipo: 'entrada',
            cnpj_emitente: '12345678000190',
            cnpj_destinatario: '98765432000110',
            valor_total: 1_500,
          },
          {
            id: 'saida-1',
            data_emissao: '2026-08-18',
            chave_nfe: '98765432109876543210987654321098765432109876',
            tipo: 'saida',
            cnpj_emitente: '98765432000110',
            cnpj_destinatario: '12345678000190',
            valor_total: 1_000,
          },
        ],
      });
    });

    await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));
  });

  test('mostra entrada verde, saída vermelha e destaca Fiscal na sidebar', async ({ page }) => {
    await page.goto('/dashboard/fiscal/escrituracao');

    const entrada = page.getByText('Entrada', { exact: true });
    const saida = page.getByText('Saída', { exact: true });

    await expect(entrada).toBeVisible();
    await expect(entrada).toHaveClass(/bg-emerald-100/);
    await expect(entrada).toHaveClass(/text-emerald-700/);

    await expect(saida).toBeVisible();
    await expect(saida).toHaveClass(/bg-rose-100/);
    await expect(saida).toHaveClass(/text-rose-700/);

    const sidebar = page.locator('aside.nova-sidebar');
    const fiscalLink = sidebar.getByRole('link', { name: 'Fiscal', exact: true });

    await expect(fiscalLink).toBeVisible();
    await expect(fiscalLink).toHaveAttribute('href', '/dashboard/fiscal');
    await expect(fiscalLink).toHaveClass(/bg-sky-400\/10/);
    await expect(sidebar.getByRole('link', { name: 'Home' })).not.toHaveClass(/bg-sky-400\/10/);
  });
});

test.describe('Fiscal — erro de rede em pt-BR e sem duplicação (issue #572)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('token', token), criarTokenTeste());
    await page.route('**/lancamentos-fiscais**', (route) => route.abort('failed'));
    await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));
  });

  test('mostra um único banner em pt-BR com Tentar novamente, sem duplicar em inglês', async ({
    page,
  }) => {
    await page.goto('/dashboard/fiscal/escrituracao');

    const mensagemRede = page.getByText(
      'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.',
    );

    await expect(mensagemRede).toBeVisible();
    await expect(mensagemRede).toHaveCount(1);
    await expect(page.getByText('Network Error')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });
});
