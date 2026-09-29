import { test, expect, Page } from '@playwright/test';

// Tela /admin/clientes — cadastro do regime tributário (issue #496).
//
// Todos os casos são isolados com page.route: o QA-F mostrou que o Supabase de
// dev tem clientes com regime nulo e anexo preenchido (e o inverso), então
// depender do estado real tornaria o resultado do teste função do banco. O
// backend tem cobertura própria em backend/tests/clientes-tributario.test.js.

function tokenAdminEfficience() {
  const payload = Buffer.from(JSON.stringify({
    sub: 'admin-playwright',
    id: 'admin-playwright',
    email: 'admin@teste.local',
    perfil: 'admin_efficience',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  return `e30.${payload}.assinatura`;
}

const CLIENTE_SIMPLES = {
  id: 'cliente-simples',
  nome: 'Padaria Aurora',
  cnpj: '11222333000181',
  status: 'ativo',
  esocial_configurado: false,
  criado_em: '2026-01-10T12:00:00.000Z',
  regime_tributario: 'simples_nacional',
  anexo_simples: 'III',
  historico_receita: [
    { mes: 7, ano: 2025, receita: 50000 },
    { mes: 8, ano: 2025, receita: 60000 },
  ],
};

const CLIENTE_SEM_REGIME = {
  id: 'cliente-sem-regime',
  nome: 'Mercearia Bonfim',
  cnpj: '44555666000199',
  status: 'ativo',
  esocial_configurado: false,
  criado_em: '2026-02-20T12:00:00.000Z',
  regime_tributario: null,
  anexo_simples: null,
  historico_receita: [],
};

// Escopo do stub: a URL da API, não um glob solto. `**/clientes**` também
// casaria com a navegação para http://localhost:3000/admin/clientes e o teste
// receberia o JSON no lugar da página.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Chamadas = { posts: any[]; patches: any[] };

/**
 * Stub de /clientes. Devolve a lista fixa, ecoa o PATCH sobre o cliente e
 * registra os payloads para as asserções. `erroPatch` simula a recusa do
 * backend sem precisar de um cadastro inválido de verdade.
 */
async function stubClientes(page: Page, opcoes: { erroPatch?: { status: number; erro: string } } = {}) {
  const chamadas: Chamadas = { posts: [], patches: [] };
  const clientes = [CLIENTE_SIMPLES, CLIENTE_SEM_REGIME];

  await page.route(`${API}/clientes**`, async (route) => {
    const requisicao = route.request();
    const metodo = requisicao.method();

    if (metodo === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clientes) });
      return;
    }

    if (metodo === 'POST') {
      const corpo = requisicao.postDataJSON();
      chamadas.posts.push(corpo);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'cliente-novo',
          status: 'ativo',
          criado_em: new Date().toISOString(),
          historico_receita: [],
          ...corpo,
        }),
      });
      return;
    }

    if (metodo === 'PATCH') {
      const corpo = requisicao.postDataJSON();
      chamadas.patches.push(corpo);

      if (opcoes.erroPatch) {
        await route.fulfill({
          status: opcoes.erroPatch.status,
          contentType: 'application/json',
          body: JSON.stringify({ erro: opcoes.erroPatch.erro }),
        });
        return;
      }

      const id = new URL(requisicao.url()).pathname.split('/').pop();
      const original = clientes.find((cliente) => cliente.id === id) ?? CLIENTE_SIMPLES;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...original, ...corpo }),
      });
      return;
    }

    await route.continue();
  });

  return chamadas;
}

async function abrirTela(page: Page) {
  await page.addInitScript((token) => window.localStorage.setItem('token', token), tokenAdminEfficience());
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
}

test.describe('Clientes — regime tributário (issue #496)', () => {
  test('a lista mostra o regime com anexo e sinaliza quem ainda não tem', async ({ page }) => {
    await stubClientes(page);
    await abrirTela(page);

    const linhaSimples = page.getByRole('row', { name: /Padaria Aurora/ });
    await expect(linhaSimples.getByText('Simples Nacional')).toBeVisible();
    await expect(linhaSimples.getByText('Anexo III · 2 meses')).toBeVisible();

    const linhaSemRegime = page.getByRole('row', { name: /Mercearia Bonfim/ });
    await expect(linhaSemRegime.getByText('Não informado')).toBeVisible();
    await expect(linhaSemRegime.getByText('sem histórico')).toBeVisible();
  });

  test('cadastra um cliente já no Simples Nacional com anexo', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByLabel('Nome').fill('Serralheria Horizonte');
    await page.getByLabel('CNPJ').fill('12345678000190');
    await page.getByLabel('Regime tributário', { exact: true }).first().selectOption('simples_nacional');
    await page.getByLabel('Anexo do Simples').first().selectOption('II');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();

    await expect(page.getByText('Cliente criado com sucesso.')).toBeVisible();
    expect(chamadas.posts).toHaveLength(1);
    expect(chamadas.posts[0]).toMatchObject({
      nome: 'Serralheria Horizonte',
      regime_tributario: 'simples_nacional',
      anexo_simples: 'II',
    });
  });

  test('o anexo só é editável no Simples Nacional', async ({ page }) => {
    await stubClientes(page);
    await abrirTela(page);

    const anexo = page.getByLabel('Anexo do Simples').first();
    await expect(anexo).toBeDisabled();

    await page.getByLabel('Regime tributário', { exact: true }).first().selectOption('simples_nacional');
    await expect(anexo).toBeEnabled();

    // Voltar para outro regime limpa o anexo em vez de deixá-lo pendurado.
    await page.getByLabel('Anexo do Simples').first().selectOption('IV');
    await page.getByLabel('Regime tributário', { exact: true }).first().selectOption('lucro_presumido');
    await expect(anexo).toBeDisabled();
    await expect(anexo).toHaveValue('');
  });

  test('recusa o cadastro no Simples Nacional sem anexo, antes de chamar a API', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByLabel('Nome').fill('Sem Anexo ME');
    await page.getByLabel('Regime tributário', { exact: true }).first().selectOption('simples_nacional');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();

    await expect(page.getByText(/Escolha o anexo do Simples/)).toBeVisible();
    expect(chamadas.posts).toHaveLength(0);
  });

  test('o editor abre com o histórico já gravado e salva um mês novo', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Padaria Aurora' }).click();

    await expect(page.getByLabel('Regime tributário', { exact: true }).last()).toHaveValue('simples_nacional');
    await expect(page.getByLabel('Anexo do Simples').last()).toHaveValue('III');
    await expect(page.getByLabel('Mês da linha 1')).toHaveValue('7');
    await expect(page.getByLabel('Receita da linha 2')).toHaveValue('60000');
    await expect(page.getByText(/Total informado/)).toContainText('110.000,00');

    await page.getByRole('button', { name: 'Adicionar mês' }).click();
    await page.getByLabel('Mês da linha 3').selectOption('9');
    await page.getByLabel('Ano da linha 3').fill('2025');
    await page.getByLabel('Receita da linha 3').fill('70000');
    await page.getByRole('button', { name: 'Salvar regime' }).click();

    await expect(page.getByText('Regime tributário de Padaria Aurora atualizado.')).toBeVisible();
    expect(chamadas.patches).toHaveLength(1);
    expect(chamadas.patches[0]).toEqual({
      regime_tributario: 'simples_nacional',
      anexo_simples: 'III',
      historico_receita: [
        { mes: 7, ano: 2025, receita: 50000 },
        { mes: 8, ano: 2025, receita: 60000 },
        { mes: 9, ano: 2025, receita: 70000 },
      ],
    });
  });

  test('marca um cliente sem regime como Simples Nacional e a lista reflete na hora', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Mercearia Bonfim' }).click();
    await page.getByLabel('Regime tributário', { exact: true }).last().selectOption('simples_nacional');
    await page.getByLabel('Anexo do Simples').last().selectOption('I');
    await page.getByRole('button', { name: 'Salvar regime' }).click();

    expect(chamadas.patches[0]).toMatchObject({
      regime_tributario: 'simples_nacional',
      anexo_simples: 'I',
      historico_receita: [],
    });

    const linha = page.getByRole('row', { name: /Mercearia Bonfim/ });
    await expect(linha.getByText('Simples Nacional')).toBeVisible();
    await expect(linha.getByText('Anexo I · sem histórico')).toBeVisible();
  });

  test('recusa competência repetida no histórico sem chamar a API', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Padaria Aurora' }).click();
    await page.getByRole('button', { name: 'Adicionar mês' }).click();
    await page.getByLabel('Mês da linha 3').selectOption('8');
    await page.getByLabel('Ano da linha 3').fill('2025');
    await page.getByLabel('Receita da linha 3').fill('1000');
    await page.getByRole('button', { name: 'Salvar regime' }).click();

    await expect(page.getByText('A competência 08/2025 aparece mais de uma vez no histórico.')).toBeVisible();
    expect(chamadas.patches).toHaveLength(0);
  });

  test('recusa linha de histórico incompleta', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Padaria Aurora' }).click();
    await page.getByRole('button', { name: 'Adicionar mês' }).click();
    await page.getByRole('button', { name: 'Salvar regime' }).click();

    await expect(page.getByText('Linha 3 do histórico: escolha o mês.')).toBeVisible();
    expect(chamadas.patches).toHaveLength(0);
  });

  test('remover uma linha do histórico tira o mês do payload', async ({ page }) => {
    const chamadas = await stubClientes(page);
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Padaria Aurora' }).click();
    await page.getByRole('button', { name: 'Remover a linha 1 do histórico' }).click();
    await page.getByRole('button', { name: 'Salvar regime' }).click();

    expect(chamadas.patches[0].historico_receita).toEqual([{ mes: 8, ano: 2025, receita: 60000 }]);
  });

  test('avisa que outros regimes não geram DAS', async ({ page }) => {
    await stubClientes(page);
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Padaria Aurora' }).click();
    await page.getByLabel('Regime tributário', { exact: true }).last().selectOption('lucro_presumido');

    await expect(page.getByText(/apuração automática hoje cobre apenas o Simples Nacional/)).toBeVisible();
    await expect(page.getByLabel('Anexo do Simples').last()).toHaveValue('');
  });

  test('mostra o erro do backend quando o PATCH é recusado', async ({ page }) => {
    await stubClientes(page, {
      erroPatch: { status: 400, erro: 'Cliente no Simples Nacional exige o anexo. Use: I, II, III, IV, V' },
    });
    await abrirTela(page);

    await page.getByRole('button', { name: 'Editar regime tributário de Padaria Aurora' }).click();
    await page.getByRole('button', { name: 'Salvar regime' }).click();

    await expect(page.getByText(/Cliente no Simples Nacional exige o anexo/)).toBeVisible();
    // O editor continua aberto para o contador corrigir sem perder o que digitou.
    await expect(page.getByRole('button', { name: 'Salvar regime' })).toBeVisible();
  });
});
