import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';

const CLIENTE_ID = '11111111-1111-1111-1111-111111111111';
const AREAS = ['Fiscal', 'Contábil', 'DP', 'Societário', 'Financeiro', 'Atendimento'];

function criarTokenTeste() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: 'efficience-sidebar-test',
    nome: 'Teste Efficience',
    perfil: 'admin_cliente',
    cliente_id: CLIENTE_ID,
    exp: 4_102_444_800,
  })}.`;
}

test.describe('Sidebar por área e páginas de automação (issue #358)', () => {
  test('sidebar exibe os 6 itens de área', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    for (const area of AREAS) {
      await expect(sidebar.getByRole('link', { name: area, exact: true })).toBeVisible();
    }
  });

  const casosArea: Array<{ nome: string; rota: string; automacaoDisponivel?: string }> = [
    { nome: 'Fiscal', rota: '/dashboard/fiscal', automacaoDisponivel: 'Escrituração fiscal (NF-e XML)' },
    { nome: 'Contábil', rota: '/dashboard/contabil', automacaoDisponivel: 'Conciliação Bancária' },
    { nome: 'DP', rota: '/dashboard/dp', automacaoDisponivel: 'Folha de pagamento mensal' },
    { nome: 'Societário', rota: '/dashboard/societario' },
    { nome: 'Financeiro', rota: '/dashboard/financeiro' },
    { nome: 'Atendimento', rota: '/dashboard/atendimento' },
  ];

  for (const caso of casosArea) {
    test(`área ${caso.nome} carrega e exibe os cards de automação`, async ({ page }) => {
      await login(page);
      await page.goto(caso.rota);

      await expect(page.getByRole('heading', { name: caso.nome, exact: true })).toBeVisible();

      if (caso.automacaoDisponivel) {
        await expect(page.getByText(caso.automacaoDisponivel)).toBeVisible();
        await expect(page.getByText('Disponível').first()).toBeVisible();
      } else {
        await expect(page.getByText('Planejado').first()).toBeVisible();
      }
    });
  }

  test('clicar em automação disponível navega para a página da automação', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/contabil');

    await page.getByText('Conciliação Bancária').click();
    await expect(page).toHaveURL(/\/dashboard\/contabil\/conciliacao$/);
    await expect(page.getByRole('heading', { name: 'Conciliação Bancária' })).toBeVisible();
  });

  test('automações "Em desenvolvimento" e "Planejado" não são clicáveis', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/societario');

    await expect(page.locator('a', { hasText: 'Abertura de empresa' })).toHaveCount(0);
    await expect(page.locator('a', { hasText: 'Alteração contratual' })).toHaveCount(0);
    await expect(page.getByText('Em breve').first()).toBeVisible();
  });
});

test.describe('Tela Efficience (issue #358)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => localStorage.setItem('token', token), criarTokenTeste());

    await page.route('**/eficiencia**', async (route) => {
      const { searchParams } = new URL(route.request().url());
      expect(searchParams.get('cliente_id')).toBe(CLIENTE_ID);

      const periodo = searchParams.get('periodo') || '30';
      const totalExecucoes = periodo === '7' ? 3 : 9;
      const totalHoras = (totalExecucoes * 30) / 60;

      await route.fulfill({
        json: {
          total_horas: totalHoras,
          total_execucoes: totalExecucoes,
          breakdown: [{ tipo: 'Automações do agente', quantidade: totalExecucoes, horas: totalHoras }],
        },
      });
    });

    await page.route('**/licenca/validar**', (route) =>
      route.fulfill({ json: { ativa: true, validade: '2026-12-31', status: 'active' } }),
    );
    await page.route('**/notificacoes**', (route) => route.fulfill({ json: [] }));
  });

  test('carrega e exibe as métricas, o breakdown e a seção de licença', async ({ page }) => {
    await page.goto('/dashboard/efficience');

    await expect(
      page.getByRole('heading', { name: 'Efficience — seu escritório em números' }),
    ).toBeVisible();

    await expect(page.getByText('Horas economizadas').first()).toBeVisible();
    await expect(page.getByText('Automações executadas')).toBeVisible();
    await expect(page.getByText('Equivalente em R$')).toBeVisible();
    await expect(page.getByText('Automações do agente')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Licença' })).toBeVisible();
    await expect(page.getByText('Ativa')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pagar licença' })).toBeVisible();
  });

  test('seletor de período recarrega os dados ao trocar', async ({ page }) => {
    await page.goto('/dashboard/efficience');

    await expect(page.getByRole('row', { name: /Automações do agente/ }).getByText('9')).toBeVisible();

    await page.getByRole('button', { name: '7 dias' }).click();

    await expect(page.getByRole('row', { name: /Automações do agente/ }).getByText('3')).toBeVisible();
  });

  test('CTA de pagamento é apenas visual (MVP) e mostra mensagem ao clicar', async ({ page }) => {
    await page.goto('/dashboard/efficience');

    await page.getByRole('button', { name: 'Pagar licença' }).click();
    await expect(page.getByText(/Pagamento online chega em breve/)).toBeVisible();
  });
});
