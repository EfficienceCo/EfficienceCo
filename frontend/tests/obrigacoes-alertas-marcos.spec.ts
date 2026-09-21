import { test, expect, Page } from '@playwright/test';

// #529 — os alertas de vencimento de obrigação passam a vir do job diário
// (backend/src/jobs/obrigacoes-alertas.job.js), nos marcos 60/30/7/3/0, e não
// mais de um limiar fixo de <= 3 dias disparado por quem abre o dashboard.
// Aqui o que se verifica é a ponta de UI: as notificações que o job grava
// aparecem na Central de notificações e no widget da Home, e o widget de
// próximas obrigações continua íntegro depois que o efeito colateral saiu do
// GET /obrigacoes/proximas. Backend mockado via page.route, mesmo padrão de
// obrigacoes-calendario.spec.ts / certificados.spec.ts.

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

function emDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function horasAtras(n: number) {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

/** Uma notificação por marco, como o job grava em `notificacoes`. */
const NOTIFICACOES_DO_JOB = [
  {
    id: 'ntf-60',
    cliente_id: 'cliente-teste',
    tipo: 'obrigacao_vencendo',
    mensagem: 'Obrigação "DEFIS" [obg-60] vence em 60 dia(s).',
    lida: false,
    criado_em: horasAtras(5),
  },
  {
    id: 'ntf-30',
    cliente_id: 'cliente-teste',
    tipo: 'obrigacao_vencendo',
    mensagem: 'Obrigação "DCTFWeb" [obg-30] vence em 30 dia(s).',
    lida: false,
    criado_em: horasAtras(4),
  },
  {
    id: 'ntf-7',
    cliente_id: 'cliente-teste',
    tipo: 'obrigacao_vencendo',
    mensagem: 'Obrigação "DAS Simples Nacional" [obg-7] vence em 7 dia(s).',
    lida: false,
    criado_em: horasAtras(3),
  },
  {
    id: 'ntf-3',
    cliente_id: 'cliente-teste',
    tipo: 'obrigacao_vencendo',
    mensagem: 'Obrigação "FGTS Digital" [obg-3] vence em 3 dia(s).',
    lida: false,
    criado_em: horasAtras(2),
  },
  {
    id: 'ntf-0',
    cliente_id: 'cliente-teste',
    tipo: 'obrigacao_vencendo',
    mensagem: 'Obrigação "eSocial folha" [obg-0] vence hoje.',
    lida: false,
    criado_em: horasAtras(1),
  },
];

const PROXIMAS_OBRIGACOES = [
  {
    id: 'obg-0',
    cliente_id: 'cliente-teste',
    nome: 'eSocial folha',
    tipo: 'mensal',
    data_vencimento: emDias(0),
    status: 'pendente',
    recorrente: true,
  },
  {
    id: 'obg-3',
    cliente_id: 'cliente-teste',
    nome: 'FGTS Digital',
    tipo: 'mensal',
    data_vencimento: emDias(3),
    status: 'pendente',
    recorrente: true,
  },
  {
    id: 'obg-7',
    cliente_id: 'cliente-teste',
    nome: 'DAS Simples Nacional',
    tipo: 'mensal',
    data_vencimento: emDias(7),
    status: 'pendente',
    recorrente: true,
  },
];

async function instalarBackend(page: Page) {
  const daApi = (url: URL) => url.port !== '3000';
  const marcadasComoLidas: string[] = [];

  await page.route(
    (url) => daApi(url) && /^\/notificacoes\/[^/]+\/lida$/.test(url.pathname),
    (route) => {
      marcadasComoLidas.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    },
  );

  await page.route(
    (url) => daApi(url) && url.pathname === '/notificacoes',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(NOTIFICACOES_DO_JOB),
      }),
  );

  await page.route(
    (url) => daApi(url) && url.pathname.startsWith('/obrigacoes'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROXIMAS_OBRIGACOES),
      }),
  );

  // Demais widgets da Home: respostas vazias, para não poluir a tela com erro.
  await page.route(
    (url) =>
      daApi(url) &&
      ['/processos', '/eventos', '/licenca', '/folha', '/certificados'].some((prefixo) =>
        url.pathname.startsWith(prefixo),
      ),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
  );

  return marcadasComoLidas;
}

test.describe('#529 — alertas de vencimento nos marcos 60/30/7/3/0 na UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      (valor) => window.localStorage.setItem('token', valor),
      tokenFrontendDeTeste(),
    );
  });

  test('Central de notificações lista um alerta por marco, todos como Obrigação', async ({
    page,
  }) => {
    await instalarBackend(page);
    await page.goto('/dashboard/comunicacao');

    await expect(page.getByRole('heading', { name: 'Central de notificações' })).toBeVisible();

    for (const trecho of [
      'vence em 60 dia(s)',
      'vence em 30 dia(s)',
      'vence em 7 dia(s)',
      'vence em 3 dia(s)',
      'vence hoje',
    ]) {
      // .first(): a tela repete a mensagem em título e descrição (defeito
      // pré-existente da Central, alheio ao #529) — aqui basta que o marco apareça.
      await expect(page.getByText(trecho, { exact: false }).first()).toBeVisible();
    }

    // Todas classificadas como obrigação e nenhuma duplicada por marco.
    await expect(page.getByText('Obrigação', { exact: true })).toHaveCount(
      NOTIFICACOES_DO_JOB.length,
    );
    await expect(page.getByText('Não lida', { exact: true })).toHaveCount(
      NOTIFICACOES_DO_JOB.length,
    );
  });

  test('marcar um alerta como lido atualiza contadores sem sumir com o item', async ({ page }) => {
    const marcadasComoLidas = await instalarBackend(page);
    await page.goto('/dashboard/comunicacao');

    const cartaoDoMarco7 = page.locator('article', {
      hasText: 'DAS Simples Nacional',
    });
    await cartaoDoMarco7.getByRole('button', { name: 'Marcar como lida' }).click();

    await expect(cartaoDoMarco7.getByText('Lida', { exact: true })).toBeVisible();
    await expect(page.getByText('Não lida', { exact: true })).toHaveCount(
      NOTIFICACOES_DO_JOB.length - 1,
    );
    expect(marcadasComoLidas.some((url) => url.includes('ntf-7'))).toBeTruthy();
  });

  test('Home: widget de notificações conta os alertas e o de obrigações segue listando', async ({
    page,
  }) => {
    await instalarBackend(page);
    await page.goto('/dashboard');

    const widgetNotificacoes = page.locator('article, section, div').filter({
      hasText: 'Resumo das mensagens pendentes.',
    });
    await expect(widgetNotificacoes.first()).toContainText(String(NOTIFICACOES_DO_JOB.length));

    // Regressão: o GET /obrigacoes/proximas perdeu o efeito colateral de criar
    // notificação, mas continua alimentando o widget normalmente.
    const widgetObrigacoes = page
      .locator('article, section, div')
      .filter({ hasText: 'Vencimentos dos próximos 7 dias.' })
      .first();
    await expect(widgetObrigacoes).toContainText('DAS Simples Nacional');
    await expect(widgetObrigacoes).toContainText('FGTS Digital');
    await expect(widgetObrigacoes).not.toContainText('Nenhuma obrigação para os próximos dias.');
  });
});
