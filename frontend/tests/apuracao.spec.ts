import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Competência pseudo-única por execução: a apuração é uma entidade natural
// (cliente + mês + ano, sem texto livre pra tornar única como em outros
// testes) e, uma vez aprovada, o card de edição some — rodar duas vezes sobre
// o mesmo período faria a segunda execução pular a etapa de edição. Variar a
// competência a cada execução evita colidir com o resultado de uma rodada
// anterior.
// O seletor de Ano só oferece o ano atual e os 4 anteriores (ver
// obterAnosDisponiveis em page.jsx) — a competência pseudo-única precisa
// cair dentro dessa janela (60 combinações possíveis de mês×ano).
// `Date.now() % 12` sozinho colide fácil entre dois testes do mesmo arquivo
// rodando a poucos segundos de distância — por isso soma um índice que avança
// a cada chamada, garantindo competências distintas dentro do mesmo run.
let indiceCompetencia = 0;

function proximaCompetencia() {
  const anoAtual = new Date().getFullYear();
  const slot = (Date.now() + indiceCompetencia) % 60;
  indiceCompetencia += 1;

  return {
    ano: anoAtual - Math.floor(slot / 12),
    mes: (slot % 12) + 1,
  };
}

function tokenFrontendDeTeste() {
  const payload = Buffer.from(JSON.stringify({
    sub: 'usuario-playwright',
    id: 'usuario-playwright',
    email: 'contador@teste.local',
    perfil: 'admin_cliente',
    cliente_id: 'cliente-teste',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  return `e30.${payload}.assinatura`;
}

function apuracaoDetalhada(overrides = {}) {
  return {
    id: 'apuracao-fluxo',
    cliente_id: 'cliente-teste',
    periodo_mes: 8,
    periodo_ano: 2026,
    regime: 'simples_nacional',
    status: 'rascunho',
    anexo_original: 'I',
    anexo_efetivo: 'I',
    rbt12: 250000,
    rbt12_usado: 250000,
    receita_mes: 20000,
    faixa_limite: 360000,
    aliquota_nominal: 0.073,
    parcela_deduzir: 5940,
    aliquota_efetiva: 0.04924,
    valor_calculado: 984.8,
    fator_r: null,
    historico_edicoes: [],
    rbt12_mensal: Array.from({ length: 12 }, (_, indice) => ({
      referencia: `2025-${String(indice + 1).padStart(2, '0')}`,
      mes: indice + 1,
      ano: 2025,
      receita_nfes: indice === 0 ? 250000 : 0,
      receita_historico: 0,
      total: indice === 0 ? 250000 : 0,
    })),
    notas_fiscais: {
      consideradas: [{
        id: 'nfe-1',
        chave_nfe: '35260800000000000000550010000000011000000010',
        data_emissao: '2026-08-10',
        valor_total: 20000,
        motivo: 'Nota fiscal de saída incluída na receita da competência.',
      }],
      excluidas: [],
    },
    ...overrides,
  };
}

test.describe('Apuração Fiscal — página /dashboard/apuracoes (issue #356)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (/reabre|traduz os códigos|fluxo completo isolado/.test(testInfo.title)) {
      const token = tokenFrontendDeTeste();
      await page.addInitScript((valorToken) => window.localStorage.setItem('token', valorToken), token);
      await page.goto('/dashboard/apuracoes');
      return;
    }

    await login(page);
    await page.goto('/dashboard/apuracoes');
  });

  test('tela carrega com título e filtros', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
    await expect(page.getByText('Mês')).toBeVisible();
    await expect(page.getByText('Ano')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeVisible();
  });

  test('calcula o DAS e exibe o breakdown completo (RBT12, Anexo, alíquota, valor)', async ({ page }) => {
    const { ano, mes } = proximaCompetencia();
    await page.getByLabel('Mês').selectOption(String(mes));
    await page.getByLabel('Ano').selectOption(String(ano));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();

    const resultado = page.locator('section', { hasText: 'Resultado do cálculo' }).first();
    await expect(resultado.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });
    await expect(resultado.getByText('Simples Nacional', { exact: true })).toBeVisible();
    await expect(resultado.getByText(/^Anexo [IVX]+$/)).toBeVisible();
    await expect(resultado.getByText('RBT12', { exact: true }).locator('..')).toContainText(/R\$\s[\d.]+,\d{2}/);
    await expect(resultado.getByText('Faixa de receita', { exact: true }).locator('..')).toContainText(/R\$/);
    await expect(resultado.getByText('Alíquota nominal', { exact: true }).locator('..')).toContainText(/\d+,\d{2}%/);
    await expect(resultado.getByText('Alíquota efetiva', { exact: true }).locator('..')).toContainText(/\d+,\d{2}%/);
    await expect(resultado.getByText('Valor do DAS', { exact: true }).locator('..')).toContainText(/R\$/);

    const composicao = page.locator('section', { hasText: 'Composição da RBT12' }).first();
    await expect(composicao.getByRole('heading', { name: 'Composição da RBT12' })).toBeVisible();
    await expect(composicao.locator('tbody tr')).toHaveCount(12);
    await expect(page.getByRole('heading', { name: 'Notas fiscais auditadas' })).toBeVisible();
  });

  test('reabre uma apuração existente sem tentar criar uma duplicata', async ({ page }) => {
    let chamadasPost = 0;
    const apuracaoExistente = {
      id: 'apuracao-existente',
      cliente_id: 'cliente-teste',
      periodo_mes: 8,
      periodo_ano: 2026,
      regime: 'simples_nacional',
      status: 'rascunho',
      anexo_original: 'I',
      anexo_efetivo: 'I',
      rbt12: 250000,
      rbt12_usado: 250000,
      receita_mes: 20000,
      faixa_limite: 360000,
      aliquota_nominal: 0.073,
      parcela_deduzir: 5940,
      aliquota_efetiva: 0.04924,
      valor_calculado: 984.8,
      fator_r: null,
      historico_edicoes: [],
      rbt12_mensal: Array.from({ length: 12 }, (_, indice) => ({
        referencia: `2025-${String(indice + 1).padStart(2, '0')}`,
        mes: indice + 1,
        ano: 2025,
        receita_nfes: 0,
        receita_historico: 0,
        total: 0,
      })),
      notas_fiscais: { consideradas: [], excluidas: [] },
    };

    await page.route('**/apuracoes**', async (route) => {
      const requisicao = route.request();
      const url = new URL(requisicao.url());

      if (url.pathname === '/apuracoes' && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: apuracaoExistente.id, regime: 'simples_nacional' },
        ]) });
        return;
      }

      if (url.pathname === `/apuracoes/${apuracaoExistente.id}` && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apuracaoExistente) });
        return;
      }

      if (url.pathname === '/apuracoes' && requisicao.method() === 'POST') {
        chamadasPost += 1;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByLabel('Mês').selectOption('8');
    await page.getByLabel('Ano').selectOption('2026');
    await page.getByRole('button', { name: 'Calcular DAS' }).click();

    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
    await expect(page.getByText('R$ 984,80')).toBeVisible();
    expect(chamadasPost).toBe(0);
  });

  test('traduz os códigos de regime não suportado e ausência de folha em orientações claras', async ({ page }) => {
    let codigoErro = 'REGIME_NAO_SUPORTADO';

    await page.route('**/apuracoes**', async (route) => {
      const requisicao = route.request();
      const url = new URL(requisicao.url());

      if (url.pathname === '/apuracoes' && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/apuracoes' && requisicao.method() === 'POST') {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ erro: codigoErro }),
        });
        return;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByText('Regime não suportado', { exact: true })).toBeVisible();
    await expect(page.getByText('REGIME_NAO_SUPORTADO')).not.toBeVisible();

    codigoErro = 'FATOR_R_SEM_FOLHA';
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByText('Não foi possível calcular o Fator R')).toBeVisible();
    await expect(page.getByText(/Importe as folhas de pagamento dos 12 meses anteriores/)).toBeVisible();
  });

  test('fluxo completo isolado: calcula, audita, edita com histórico e aprova', async ({ page }) => {
    const apuracaoInicial = apuracaoDetalhada();

    await page.route('**/apuracoes**', async (route) => {
      const requisicao = route.request();
      const url = new URL(requisicao.url());

      if (url.pathname === '/apuracoes' && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/apuracoes' && requisicao.method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(apuracaoInicial),
        });
        return;
      }

      if (url.pathname === `/apuracoes/${apuracaoInicial.id}` && requisicao.method() === 'PATCH') {
        const payload = requisicao.postDataJSON();
        expect(payload).toEqual({
          valor_editado: 999.99,
          motivo: 'Ajuste combinado com o cliente',
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: apuracaoInicial.id,
            valor_editado: 999.99,
            historico_edicoes: [{
              valor_anterior: 984.8,
              valor_novo: 999.99,
              motivo: payload.motivo,
              editado_por: 'contador@teste.local',
              editado_em: '2026-08-21T18:00:00.000Z',
            }],
          }),
        });
        return;
      }

      if (url.pathname === `/apuracoes/${apuracaoInicial.id}/aprovar` && requisicao.method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: apuracaoInicial.id,
            status: 'aprovado',
            aprovado_por: 'contador@teste.local',
            aprovado_em: '2026-08-21T18:05:00.000Z',
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByRole('button', { name: 'Calcular DAS' }).click();

    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
    await expect(page.locator('section', { hasText: 'Composição da RBT12' }).first().locator('tbody tr')).toHaveCount(12);
    await expect(page.getByText('Consideradas (1)')).toBeVisible();

    const secaoEditar = page.locator('section', { hasText: 'Editar valor' }).first();
    await secaoEditar.locator('input[type="number"]').fill('999.99');
    await secaoEditar.locator('textarea').fill('Ajuste combinado com o cliente');
    await secaoEditar.getByRole('button', { name: 'Salvar edição' }).click();

    const historico = page.locator('section', { hasText: 'Histórico de edições' }).first();
    await expect(historico.getByText('Ajuste combinado com o cliente')).toBeVisible();
    await expect(historico.getByText('por contador@teste.local')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Composição da RBT12' })).toBeVisible();

    await page.getByRole('button', { name: 'Aprovar DAS' }).click();
    await page.getByRole('button', { name: 'Confirmar aprovação' }).click();
    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    await expect(page.getByText(/Aprovado por contador@teste.local em/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar valor' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Composição da RBT12' })).toBeVisible();
  });

  test('edita o valor com motivo e o histórico de edições aparece na tela', async ({ page }) => {
    const { ano, mes } = proximaCompetencia();
    await page.getByLabel('Mês').selectOption(String(mes));
    await page.getByLabel('Ano').selectOption(String(ano));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });

    const secaoEditar = page.locator('section', { hasText: 'Editar valor' }).first();
    await expect(secaoEditar).toBeVisible();

    const campoValor = secaoEditar.locator('input[type="number"]');
    await campoValor.fill('999.99');
    await secaoEditar.locator('textarea').fill('Ajuste combinado com o cliente');
    await secaoEditar.getByRole('button', { name: 'Salvar edição' }).click();

    const secaoHistorico = page.locator('section', { hasText: 'Histórico de edições' }).first();
    await expect(secaoHistorico).toBeVisible();
    await expect(secaoHistorico.getByText('Ajuste combinado com o cliente')).toBeVisible();
    await expect(secaoHistorico.getByText('R$ 999,99')).toBeVisible();
  });

  test('aprova o DAS via modal de confirmação e o status muda visualmente', async ({ page }) => {
    const { ano, mes } = proximaCompetencia();
    await page.getByLabel('Mês').selectOption(String(mes));
    await page.getByLabel('Ano').selectOption(String(ano));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText('Rascunho')).toBeVisible();

    await page.getByRole('button', { name: 'Aprovar DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Confirmar aprovação' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar aprovação' }).click();

    await expect(page.getByRole('heading', { name: 'Confirmar aprovação' })).not.toBeVisible();
    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    await expect(page.getByText(/Aprovado por .+ em/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar DAS' })).toBeDisabled();

    // Após aprovado, a apuração é imutável — o card de edição some.
    await expect(page.getByRole('heading', { name: 'Editar valor' })).not.toBeVisible();
  });
});

test.describe('Sidebar — link de Apuração Fiscal (issue #356)', () => {
  test('link aparece na sidebar e aponta para /dashboard/apuracoes', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Apuração Fiscal' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/dashboard/apuracoes');
  });

  test('highlight ativo em /dashboard/apuracoes', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/apuracoes');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Apuração Fiscal' });
    await expect(link).toHaveClass(/bg-sky-400\/10/);

    const outroLink = sidebar.getByRole('link', { name: 'Conciliação' });
    await expect(outroLink).not.toHaveClass(/bg-sky-400\/10/);
  });
});
