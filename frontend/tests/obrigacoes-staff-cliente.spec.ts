import { test, expect, Page } from '@playwright/test';

// Bug #506 — Calendário Fiscal com admin_efficience. O staff da Efficience não
// tem cliente_id no token, então GET /obrigacoes respondia 400 e a tela
// mostrava o texto cru do backend ("cliente_id é obrigatório"), sem seletor de
// cliente. Aqui: seletor no mesmo padrão do wizard do eSocial, nenhuma chamada
// antes da escolha, clienteId na query depois dela, e erro traduzido.
// Backend mockado via page.route, igual a obrigacoes-calendario.spec.ts.

function token(perfil: string, clienteId: string | null) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'usuario-playwright',
      id: 'usuario-playwright',
      email: 'staff@teste.local',
      perfil,
      ...(clienteId ? { cliente_id: clienteId } : {}),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');

  return `e30.${payload}.assinatura`;
}

function diaNoMesAtual(dia: number) {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${String(dia).padStart(2, '0')}`;
}

const CLIENTES = [
  { id: 'cliente-b', nome: 'Zebra Contábil' },
  { id: 'cliente-a', nome: 'Açougue do Playwright' },
];

const OBRIGACAO = {
  id: 'obg-1',
  nome: 'DAS do Açougue',
  tipo: 'mensal',
  data_vencimento: diaNoMesAtual(10),
  recorrente: true,
  status: 'pendente',
};

// Registra toda chamada a /obrigacoes e reproduz o contrato do backend:
// sem clienteId na query (e sem cliente_id no token) responde 400.
async function instalarBackend(page: Page, chamadas: string[]) {
  await page.route(
    (url) => url.port !== '3000' && url.pathname === '/clientes',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CLIENTES),
      }),
  );

  await page.route(
    (url) => url.port !== '3000' && url.pathname.startsWith('/obrigacoes'),
    (route) => {
      const url = new URL(route.request().url());
      chamadas.push(url.search);

      if (!url.searchParams.get('clienteId')) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ erro: 'cliente_id é obrigatório' }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([OBRIGACAO]),
      });
    },
  );

  await page.route(
    (url) => url.port !== '3000' && url.pathname.startsWith('/certificados'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      }),
  );
}

test.describe('Calendário Fiscal — seletor de cliente do staff (#506)', () => {
  let chamadas: string[] = [];

  test.beforeEach(async ({ page }) => {
    chamadas = [];
    await page.addInitScript(
      (valor) => window.localStorage.setItem('token', valor),
      token('admin_efficience', null),
    );
    await instalarBackend(page, chamadas);
    await page.goto('/dashboard/obrigacoes');
  });

  test('abre a tela com o seletor e sem chamar o backend antes da escolha', async ({ page }) => {
    const seletor = page.locator('label', { hasText: 'Cliente' }).locator('select');
    await expect(seletor).toBeVisible();
    await expect(
      page.getByText('Selecione um cliente para ver os prazos do calendário fiscal.'),
    ).toBeVisible();

    // O erro cru do backend não aparece em lugar nenhum da tela.
    await expect(page.getByText('cliente_id é obrigatório')).toHaveCount(0);
    // Sem cliente não há o que filtrar nem contar: "Total atrasadas: 0" seria
    // um número falso.
    await expect(page.getByText('Total atrasadas')).toHaveCount(0);
    expect(chamadas).toHaveLength(0);
  });

  test('lista os clientes em ordem alfabética', async ({ page }) => {
    const opcoes = page.locator('label', { hasText: 'Cliente' }).locator('select option');
    await expect(opcoes).toHaveText([
      'Selecione um cliente',
      'Açougue do Playwright',
      'Zebra Contábil',
    ]);
  });

  test('ao escolher o cliente, manda clienteId e carrega os prazos', async ({ page }) => {
    await page
      .locator('label', { hasText: 'Cliente' })
      .locator('select')
      .selectOption('cliente-a');

    await expect(page.locator('table').getByText('DAS do Açougue')).toBeVisible();
    await expect(page.getByText('Total atrasadas')).toBeVisible();
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.every((busca) => busca.includes('clienteId=cliente-a'))).toBe(true);
  });
});

test.describe('Calendário Fiscal — erro da lista sem texto cru (#506)', () => {
  test('traduz a falha do backend e oferece tentar de novo', async ({ page }) => {
    await page.addInitScript(
      (valor) => window.localStorage.setItem('token', valor),
      token('admin_cliente', 'cliente-teste'),
    );

    await page.route(
      (url) => url.port !== '3000' && url.pathname.startsWith('/obrigacoes'),
      (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ erro: 'Erro ao listar obrigações' }),
        }),
    );

    await page.goto('/dashboard/obrigacoes');

    await expect(
      page.getByText('O servidor não respondeu ao carregar os prazos. Tente de novo em instantes.'),
    ).toBeVisible();
    await expect(page.getByText('Erro ao listar obrigações')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });
});
