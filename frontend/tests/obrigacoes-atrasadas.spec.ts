import { test, expect, Page } from '@playwright/test';

// Bug #505 — Calendário Fiscal e o status "Atrasada".
//
// Ninguém escrevia `atrasada` na coluna `obrigacoes.status`: o filtro
// Status=Atrasada voltava vazio e o card "Total atrasadas" ficava em 0 mesmo
// com uma obrigação vencida na tabela (achado #3 do QA-I). O backend agora
// persiste o status na varredura diária e deriva o atraso pela data no filtro;
// aqui cobrimos a ponta da tela, que precisa tratar como atrasada a obrigação
// vencida que ainda chega `pendente` (janela antes da varredura).
// Backend mockado via page.route, mesmo padrão de obrigacoes-calendario.spec.ts.

function tokenFrontendDeTeste() {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'usuario-playwright',
      id: 'usuario-playwright',
      email: 'contador@teste.local',
      perfil: 'admin_cliente',
      cliente_id: 'cliente-teste',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');

  return `e30.${payload}.assinatura`;
}

function dataRelativa(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

// Venceu ontem e o banco ainda diz 'pendente' — exatamente o estado que o QA-I
// encontrou na base.
const VENCIDA = {
  id: 'obg-vencida',
  nome: 'DARF vencida',
  tipo: 'mensal',
  data_vencimento: dataRelativa(-1),
  recorrente: true,
  status: 'pendente',
};

const NO_PRAZO = {
  id: 'obg-no-prazo',
  nome: 'DAS no prazo',
  tipo: 'mensal',
  data_vencimento: dataRelativa(5),
  recorrente: true,
  status: 'pendente',
};

const statusPedidos: string[] = [];

async function instalarBackend(page: Page, obrigacoes = [VENCIDA, NO_PRAZO]) {
  await page.route(
    (url) => url.port !== '3000' && url.pathname.startsWith('/obrigacoes'),
    (route) => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get('status');
      statusPedidos.push(status || '');

      // Backend corrigido: status=atrasada devolve também as pendentes
      // vencidas; status=pendente devolve só o que está no prazo.
      const hoje = dataRelativa(0);
      let corpo = obrigacoes;
      if (status === 'atrasada') {
        corpo = obrigacoes.filter(
          (o) => o.status === 'atrasada' || (o.status === 'pendente' && o.data_vencimento < hoje),
        );
      } else if (status === 'pendente') {
        corpo = obrigacoes.filter((o) => o.status === 'pendente' && o.data_vencimento >= hoje);
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(corpo),
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

function seletorStatus(page: Page) {
  return page.locator('label', { hasText: 'Status' }).locator('select');
}

function cardTotalAtrasadas(page: Page) {
  return page.locator('article', { hasText: 'Total atrasadas' });
}

test.describe('Calendário Fiscal — status Atrasada (#505)', () => {
  test.beforeEach(async ({ page }) => {
    statusPedidos.length = 0;
    await page.addInitScript(
      (valor) => window.localStorage.setItem('token', valor),
      tokenFrontendDeTeste(),
    );
    await instalarBackend(page);
    await page.goto('/dashboard/obrigacoes');
  });

  test('obrigação vencida que chega "pendente" conta no card "Total atrasadas"', async ({
    page,
  }) => {
    const linha = page.locator('table tbody tr', { hasText: 'DARF vencida' });
    await expect(linha).toBeVisible();
    await expect(linha.getByText('Atrasada')).toBeVisible();

    await expect(cardTotalAtrasadas(page).locator('p').nth(1)).toHaveText('1');
  });

  test('obrigação no prazo continua Pendente e fica fora do card', async ({ page }) => {
    const linha = page.locator('table tbody tr', { hasText: 'DAS no prazo' });
    await expect(linha.getByText('Pendente')).toBeVisible();

    await instalarBackend(page, [NO_PRAZO]);
    await page.reload();

    await expect(cardTotalAtrasadas(page).locator('p').nth(1)).toHaveText('0');
  });

  test('filtro Status=Atrasada devolve a vencida em vez de lista vazia', async ({ page }) => {
    await seletorStatus(page).selectOption('atrasada');

    await expect(page.locator('table tbody tr', { hasText: 'DARF vencida' })).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: 'DAS no prazo' })).toHaveCount(0);
    expect(statusPedidos).toContain('atrasada');
  });

  test('filtro Status=Pendente não repete a obrigação já vencida', async ({ page }) => {
    await seletorStatus(page).selectOption('pendente');

    await expect(page.locator('table tbody tr', { hasText: 'DAS no prazo' })).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: 'DARF vencida' })).toHaveCount(0);
  });
});
