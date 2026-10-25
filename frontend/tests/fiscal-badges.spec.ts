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
            total_nfe: 3,
            entradas: { quantidade: 1, valor_total: 1_000, icms: 80, pis: 10, cofins: 40, ipi: 0 },
            saidas: { quantidade: 2, valor_total: 1_750, icms: 100, pis: 10, cofins: 50, ipi: 0 },
          },
        });
        return;
      }

      await route.fulfill({
        json: [
          {
            id: 'entrada-1',
            status: 'ativa',
            data_emissao: '2026-08-18',
            chave_nfe: '12345678901234567890123456789012345678901234',
            tipo: 'entrada',
            cnpj_emitente: '12345678000190',
            cnpj_destinatario: '98765432000110',
            valor_total: 1_500,
          },
          {
            id: 'saida-1',
            status: 'ativa',
            data_emissao: '2026-08-18',
            chave_nfe: '98765432109876543210987654321098765432109876',
            tipo: 'saida',
            cnpj_emitente: '98765432000110',
            cnpj_destinatario: '12345678000190',
            valor_total: 1_000,
          },
          {
            id: 'saida-cpf',
            status: 'ativa',
            data_emissao: '2026-08-19',
            chave_nfe: '35260712345678000199550010000000041000000044',
            tipo: 'saida',
            cnpj_emitente: '12345678000190',
            cnpj_destinatario: '12345678909',
            valor_total: 250,
          },
          {
            id: 'cancelada-1',
            status: 'cancelada',
            data_emissao: '2026-08-18',
            chave_nfe: '11111111111111111111111111111111111111111111',
            tipo: 'saida',
            cnpj_emitente: '98765432000110',
            cnpj_destinatario: '12345678000190',
            valor_total: 500,
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
    const entrada = page.getByText('Entrada', { exact: true }).filter({ visible: true }).first();
    const saida = page.getByText('Saída', { exact: true }).filter({ visible: true }).first();

    await expect(entrada).toBeVisible();
    await expect(entrada).toHaveClass(/bg-emerald-100/);
    await expect(entrada).toHaveClass(/text-emerald-700/);

    await expect(saida).toBeVisible();
    await expect(saida).toHaveClass(/bg-rose-100/);
    await expect(saida).toHaveClass(/text-rose-700/);
    await expect(page.getByText('123.456.789-09').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'CNPJ/CPF destinatário' })).toBeVisible();

    const cancelada = page.getByText('Cancelada', { exact: true }).filter({ visible: true }).first();
    await expect(cancelada).toBeVisible();
    await expect(cancelada).toHaveClass(/bg-zinc-200/);

    const sidebar = page.locator('aside.nova-sidebar');
    const fiscalLink = sidebar.getByRole('link', { name: 'Fiscal', exact: true });

    await expect(fiscalLink).toBeVisible();
    await expect(fiscalLink).toHaveAttribute('href', '/dashboard/fiscal');
    await expect(fiscalLink).toHaveClass(/bg-sky-400\/10/);
    await expect(sidebar.getByRole('link', { name: 'Home' })).not.toHaveClass(/bg-sky-400\/10/);
  });

  test('seletor de Ano inclui o ano atual e os 5 anteriores (issue #660)', async ({ page }) => {
    await page.goto('/dashboard/fiscal/escrituracao');

    const anoAtual = new Date().getFullYear();
    const seletor = page.getByLabel('Ano');

    await expect(seletor.locator('option')).toHaveCount(6);
    await expect(seletor.locator('option').first()).toHaveText(String(anoAtual));
    await expect(seletor.locator('option').last()).toHaveText(String(anoAtual - 5));

    await seletor.selectOption(String(anoAtual - 5));
    await expect(seletor).toHaveValue(String(anoAtual - 5));
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

  test('resumo falha sozinho por rede (lista ok): banner do resumo aparece com retry próprio', async ({
    page,
  }) => {
    // Cenário de review do #572: as duas chamadas rodam independentes via
    // Promise.allSettled contra endpoints diferentes — se só a do resumo
    // falhar (ex.: timeout isolado), o banner dela não pode ficar oculto
    // esperando um aviso da lista que nunca vai aparecer.
    await page.unroute('**/lancamentos-fiscais**');
    await page.route('**/lancamentos-fiscais**', async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname.endsWith('/resumo')) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({ json: [] });
    });

    await page.goto('/dashboard/fiscal/escrituracao');

    const mensagemRede = page.getByText(
      'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.',
    );

    await expect(mensagemRede).toBeVisible();
    await expect(mensagemRede).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    // A lista carregou normal (vazia) — não deve haver o banner de erro dela.
    await expect(page.getByText('Nenhum lançamento encontrado')).toBeVisible();
  });
});

test.describe('Fiscal — resumo separa entradas (crédito) de saídas (débito) (issue #654)', () => {
  test('mostra entradas e saídas em cards distintos, sem "ICMS total" misturado', async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('token', token), criarTokenTeste());
    await page.route('**/lancamentos-fiscais**', async (route) => {
      const { pathname } = new URL(route.request().url());
      await route.fulfill({
        json: pathname.endsWith('/resumo')
          ? {
              total_nfe: 2,
              entradas: { quantidade: 1, valor_total: 2_222.21, icms: 400, pis: 0, cofins: 0, ipi: 0 },
              saidas: { quantidade: 1, valor_total: 3_140, icms: 565.2, pis: 0, cofins: 0, ipi: 50 },
            }
          : [],
      });
    });
    await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));

    await page.goto('/dashboard/fiscal/escrituracao');

    const entradas = page.locator('article').filter({ has: page.getByText('Valor das entradas') });
    const saidas = page.locator('article').filter({ has: page.getByText('Valor das saídas') });

    await expect(entradas).toContainText('R$ 2.222,21');
    await expect(entradas).toContainText('ICMS (crédito) R$ 400,00');
    await expect(entradas).toContainText('IPI (crédito) R$ 0,00');
    await expect(saidas).toContainText('R$ 3.140,00');
    await expect(saidas).toContainText('ICMS (débito) R$ 565,20');
    await expect(saidas).toContainText('IPI (débito) R$ 50,00');
    await expect(entradas).not.toContainText('565,20');
    await expect(saidas).not.toContainText('400,00');
    await expect(page.getByText('ICMS total')).toHaveCount(0);

    await page.setViewportSize({ width: 768, height: 1024 });
    for (const card of [entradas, saidas]) {
      const valor = card.locator('p.text-3xl');
      expect(await valor.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth)).toBe(true);
    }
  });

  test('mês só de entradas ou só de saídas deixa o outro card zerado', async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('token', token), criarTokenTeste());
    await page.route('**/lancamentos-fiscais**', async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith('/resumo')) {
        await route.fulfill({ json: [] });
        return;
      }

      const zero = { quantidade: 0, valor_total: 0, icms: 0, pis: 0, cofins: 0, ipi: 0 };
      const mes = url.searchParams.get('mes');
      await route.fulfill({
        json: {
          total_nfe: mes === '2' || mes === '3' ? 1 : 0,
          entradas: mes === '2'
            ? { quantidade: 1, valor_total: 2_222.21, icms: 400, pis: 0, cofins: 0, ipi: 0 }
            : zero,
          saidas: mes === '3'
            ? { quantidade: 1, valor_total: 3_140, icms: 565.2, pis: 0, cofins: 0, ipi: 0 }
            : zero,
        },
      });
    });
    await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard/fiscal/escrituracao');
    await page.getByLabel('Ano').selectOption('2025');

    const entradas = page.locator('article').filter({ has: page.getByText('Valor das entradas') });
    const saidas = page.locator('article').filter({ has: page.getByText('Valor das saídas') });

    await page.getByLabel('Mês').selectOption('2');
    await expect(entradas).toContainText('R$ 2.222,21');
    await expect(saidas).toContainText('R$ 0,00');
    await expect(saidas).toContainText('ICMS (débito) R$ 0,00');

    await page.getByLabel('Mês').selectOption('3');
    await expect(saidas).toContainText('R$ 3.140,00');
    await expect(entradas).toContainText('R$ 0,00');
    await expect(entradas).toContainText('ICMS (crédito) R$ 0,00');
  });
});
