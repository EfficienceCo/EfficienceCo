import { test, expect, Page } from '@playwright/test';

// CD-6 — o Calendário Fiscal (/dashboard/obrigacoes) passa a listar também os
// vencimentos de certificado digital, na mesma fonte visual das obrigações e
// filtráveis por "Certificado Digital". Backend mockado via page.route, mesmo
// padrão de certificados.spec.ts / esocial.spec.ts.

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

// Dia 15 do mês corrente — cai sempre dentro do filtro de mês default da tela.
function diaNoMesAtual(dia: number) {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${String(dia).padStart(2, '0')}`;
}

const OBRIGACAO = {
  id: 'obg-1',
  nome: 'DAS Playwright',
  tipo: 'mensal',
  data_vencimento: diaNoMesAtual(10),
  recorrente: true,
  status: 'pendente',
};

const CERTIFICADO = {
  id: 'cert-1',
  cliente_id: 'cliente-teste',
  tipo: 'A1',
  titular: 'Padaria do Playwright',
  serial: 'ABC123',
  validade: diaNoMesAtual(15),
  caminho_local: 'C:\\clientes\\padaria\\certificado\\',
  status: 'ativo',
  renovacao_checklist: null,
};

async function instalarBackend(page: Page) {
  await page.route(
    (url) => url.port !== '3000' && url.pathname.startsWith('/obrigacoes'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([OBRIGACAO]),
      }),
  );

  await page.route(
    (url) => url.port !== '3000' && url.pathname.startsWith('/certificados'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [CERTIFICADO] }),
      }),
  );
}

test.describe('Calendário Fiscal — vencimentos de certificado (CD-6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      (valor) => window.localStorage.setItem('token', valor),
      tokenFrontendDeTeste(),
    );
    await instalarBackend(page);
    await page.goto('/dashboard/obrigacoes');
  });

  test('lista o vencimento do certificado junto das obrigações', async ({ page }) => {
    const tabela = page.locator('table');
    await expect(tabela.getByText('DAS Playwright')).toBeVisible();
    await expect(
      tabela.getByText('Certificado digital — Padaria do Playwright'),
    ).toBeVisible();
    await expect(tabela.getByText('Certificado Digital', { exact: true })).toBeVisible();
  });

  test('filtro "Tipo de prazo" isola os certificados', async ({ page }) => {
    const tabela = page.locator('table');
    const linhaCert = tabela.getByText('Certificado digital — Padaria do Playwright');
    const linhaObrigacao = tabela.getByText('DAS Playwright');

    await page.locator('label', { hasText: 'Tipo de prazo' }).locator('select').selectOption('certificado');
    await expect(linhaCert).toBeVisible();
    await expect(linhaObrigacao).toHaveCount(0);

    await page.locator('label', { hasText: 'Tipo de prazo' }).locator('select').selectOption('obrigacao');
    await expect(linhaObrigacao).toBeVisible();
    await expect(linhaCert).toHaveCount(0);
  });

  test('o certificado leva para a tela da CD-5', async ({ page }) => {
    const link = page.locator('table').getByRole('link', { name: 'Ver certificado' });
    await expect(link).toHaveAttribute('href', '/dashboard/societario/certificados');
  });

  test('o vencimento do certificado aparece no calendário do mês', async ({ page }) => {
    await page.locator('label', { hasText: 'Tipo de prazo' }).locator('select').selectOption('certificado');

    const calendario = page.locator('section', {
      has: page.getByRole('heading', { name: 'Calendário do mês' }),
    });
    await expect(calendario.getByText(/vencimento/).first()).toBeVisible();
  });
});
