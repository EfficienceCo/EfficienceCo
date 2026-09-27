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

    // A tabela (desktop) e os cards (mobile) renderizam os mesmos badges; filtra
    // pelo visível pra evitar strict mode violation com o dual-render responsivo.
    const entrada = page.getByText('Entrada', { exact: true }).filter({ visible: true });
    const saida = page.getByText('Saída', { exact: true }).filter({ visible: true });

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

test.describe('Fiscal — card de IPI não fica órfão no grid de resumo (issue #573)', () => {
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
            ipi: 50,
            entradas: 1,
            saidas: 1,
          },
        });
        return;
      }

      await route.fulfill({ json: [] });
    });

    await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));
  });

  async function contarColunasDoGrid(page) {
    return page.evaluate(() => {
      const titulo = [...document.querySelectorAll('p')].find(
        (p) => p.textContent === 'Total de NFes processadas',
      );
      const grid = titulo?.closest('section');
      if (!grid) return null;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    });
  }

  test('em 768px (md, faixa testada no QA), com IPI > 0, o grid fica em 1 coluna — nenhum card sozinho numa linha', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard/fiscal/escrituracao');

    await expect(page.getByText('IPI total')).toBeVisible();
    expect(await contarColunasDoGrid(page)).toBe(1);
  });

  test('em 1440px (xl), com IPI > 0, os 5 cards ficam numa única linha de 5 colunas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard/fiscal/escrituracao');

    await expect(page.getByText('IPI total')).toBeVisible();
    expect(await contarColunasDoGrid(page)).toBe(5);
  });
});
