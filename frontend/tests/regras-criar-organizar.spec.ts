import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

// Issue #480 — criar regra organizar_arquivo pela UI deve persistir e aparecer na lista.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const CORS = {
  'access-control-allow-origin': 'http://localhost:3000',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

/**
 * Intercepta /regras com fetch+fulfill e CORS explícito: route.continue() cross-origin
 * cai no bloqueio de Local Network Access do Chromium e vira "Network Error" no app.
 * `decidir` recebe o método e devolve 'passar' | 'atrasar' | { status, erro }.
 */
async function interceptarRegras(
  page: Page,
  decidir: (metodo: string) => 'passar' | 'atrasar' | { status: number; erro: string },
  { atrasoMs = 3000, aoResponder }: { atrasoMs?: number; aoResponder?: (metodo: string) => void } = {},
) {
  await page.route('**/regras', async (route) => {
    const metodo = route.request().method();
    try {
      if (metodo === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS });
        return;
      }
      const decisao = decidir(metodo);
      if (typeof decisao === 'object') {
        await route.fulfill({ status: decisao.status, headers: CORS, json: { erro: decisao.erro } });
        return;
      }
      const resposta = await route.fetch();
      aoResponder?.(metodo);
      if (decisao === 'atrasar') {
        await new Promise((r) => setTimeout(r, atrasoMs));
      }
      await route.fulfill({ response: resposta, headers: { ...resposta.headers(), ...CORS } });
    } catch {
      // Página/teste já encerrado enquanto a resposta atrasada estava em voo.
    }
  });
}

async function preencherOrganizarArquivo(page: Page, origem: string, destino: string) {
  await page.getByRole('button', { name: 'Nova regra' }).click();
  await page.locator('#acao').selectOption('organizar_arquivo');
  await page.locator('#pasta_origem').fill(origem);
  await page.locator('#pasta_destino').fill(destino);
}

test.describe('Regras — criar organizar_arquivo pela UI (issue #480)', () => {
  let origem = '';
  let destino = '';

  test.beforeEach(async ({ page }) => {
    const marcador = `QA480_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    origem = `C:\\${marcador}\\ENTRADA`;
    destino = `C:\\${marcador}\\CLIENTES\\ATIVO`;

    await login(page);
    await page.goto('/dashboard/regras');
    await expect(page.getByRole('heading', { name: 'Regras de automação' })).toBeVisible();
  });

  // Limpeza via API (independe do estado da UI/mocks): remove a regra criada pelo teste.
  test.afterEach(async ({ page, request }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const lista = await request.get(`${API_URL}/regras`, { headers });
    if (!lista.ok()) return;
    for (const regra of (await lista.json()) as Array<{ id: string; pasta_origem: string }>) {
      if (regra.pasta_origem === origem) {
        await request.delete(`${API_URL}/regras/${regra.id}`, { headers });
      }
    }
  });

  test('regra criada durante carga lenta da lista não é sobrescrita pela resposta antiga', async ({
    page,
  }) => {
    // A 1ª listagem depois de armar é atrasada: o snapshot é buscado ANTES da criação e só
    // entregue depois — uma resposta obsoleta. As demais passam direto.
    let listagens = 0;
    await interceptarRegras(page, (metodo) =>
      metodo === 'GET' && ++listagens === 1 ? 'atrasar' : 'passar',
    );

    await preencherOrganizarArquivo(page, origem, destino);
    // Dispara a listagem lenta (o modal cobre o botão, então clica via DOM) e salva em seguida.
    await page
      .getByRole('button', { name: 'Atualizar lista' })
      .evaluate((el) => (el as HTMLElement).click());
    await page.getByRole('button', { name: 'Criar regra' }).click();

    // Quando a listagem antiga terminar, a regra criada deve continuar visível
    await expect(page.getByText('Carregando regras...')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByRole('row').filter({ hasText: origem })).toBeVisible({ timeout: 5000 });
  });

  test('falha na reconciliação que substituiu a carga inicial mostra erro, não tabela vazia', async ({
    page,
  }) => {
    // Listagens ANTES do POST: lentas e válidas (ficam em voo durante a criação).
    // Listagens DEPOIS do POST (a reconciliação silenciosa): falham com 500.
    let criou = false;
    await interceptarRegras(
      page,
      (metodo) => {
        if (metodo === 'GET') return criou ? { status: 500, erro: 'lista indisponivel' } : 'atrasar';
        return 'passar';
      },
      { aoResponder: (metodo) => metodo === 'POST' && (criou = true) },
    );

    // Recarrega com o mock armado: a carga inicial (a única, sem lista prévia) fica em voo.
    await page.goto('/dashboard/regras');
    await preencherOrganizarArquivo(page, origem, destino);
    await page.getByRole('button', { name: 'Criar regra' }).click();

    await expect(page.getByText('lista indisponivel')).toBeVisible({ timeout: 15000 });
  });

  test('erro ao alternar status não esconde a lista', async ({ page }) => {
    await page.route('**/regras/*', async (route) => {
      const metodo = route.request().method();
      if (metodo === 'PATCH') {
        await route.fulfill({ status: 500, headers: CORS, json: { erro: 'falha simulada' } });
      } else if (metodo === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS });
      } else {
        await route.fallback();
      }
    });

    await page.getByRole('button', { name: /^(Ativa|Inativa)$/ }).first().click();
    await expect(page.getByText('falha simulada')).toBeVisible();
    // A tabela continua visível: o erro é da ação, não da listagem
    await expect(page.getByRole('columnheader', { name: 'Pasta origem' })).toBeVisible();
  });

  test('regra criada aparece na lista imediatamente e persiste após reload', async ({ page }) => {
    const respostaPost = page.waitForResponse(
      (r) => r.url().includes('/regras') && r.request().method() === 'POST',
    );

    await preencherOrganizarArquivo(page, origem, destino);
    await page.getByRole('button', { name: 'Criar regra' }).click();

    expect((await respostaPost).status()).toBe(201);

    // Aparece imediatamente, sem reload manual
    const linha = page.getByRole('row').filter({ hasText: origem });
    await expect(linha).toBeVisible({ timeout: 10000 });
    await expect(linha).toContainText('Organizar arquivo');

    // Persiste de fato no backend
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: origem })).toBeVisible({ timeout: 10000 });
  });
});
