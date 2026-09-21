import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

// Competência pseudo-única por execução: a apuração é uma entidade natural
// (cliente + mês + ano, sem texto livre pra tornar única como em outros
// testes) e, uma vez aprovada, o card de edição some — rodar duas vezes sobre
// o mesmo período faria a segunda execução pular a etapa de edição. Variar a
// competência a cada execução evita colidir com o resultado de uma rodada
// anterior.
// Desde o #500 o seletor de Ano vai do ano atual até 2020, mas a competência
// pseudo-única segue restrita às 60 combinações (mês × 5 anos) — janela
// suficiente pra não colidir e que continua válida em qualquer ano corrente.
// Desde o #497 ela também
// precisa ser uma competência já fechada: o backend recusa mês corrente ou
// futuro com 422 COMPETENCIA_NAO_FECHADA, e o seletor nem oferece esses meses.
// `Date.now() % n` sozinho colide fácil entre dois testes do mesmo arquivo
// rodando a poucos segundos de distância — por isso soma um índice que avança
// a cada chamada, garantindo competências distintas dentro do mesmo run.
let indiceCompetencia = 0;

function ultimaCompetenciaFechada(hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

function proximaCompetencia() {
  const ultima = ultimaCompetenciaFechada();
  const maisRecente = ultima.ano * 12 + (ultima.mes - 1);
  const maisAntiga = (ultima.ano - 4) * 12;
  const slot = (Date.now() + indiceCompetencia) % (maisRecente - maisAntiga + 1);
  indiceCompetencia += 1;

  const total = maisRecente - slot;

  return {
    ano: Math.floor(total / 12),
    mes: (total % 12) + 1,
  };
}

// Uma competência já aprovada perde o card de edição e o botão de aprovar, e o
// Supabase de dev acumula aprovações de execuções antigas (não há DELETE de
// apuração — issue #500), então sortear uma única competência falha sempre que
// o sorteio cai numa dessas. Confirmado na main, antes do #497. Tenta
// competências diferentes até achar uma ainda em rascunho.
async function abrirCompetenciaEmRascunho(page: Page, tentativas = 12) {
  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    const { ano, mes } = proximaCompetencia();

    await page.getByLabel('Mês').selectOption(String(mes));
    await page.getByLabel('Ano').selectOption(String(ano));
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible({
      timeout: 15000,
    });

    if (await page.getByRole('heading', { name: 'Editar valor' }).isVisible()) {
      return { ano, mes };
    }
  }

  throw new Error(
    `Nenhuma competência em rascunho encontrada em ${tentativas} tentativas — o Supabase de dev está saturado de apurações aprovadas.`,
  );
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

test.describe('Apuração Fiscal — página /dashboard/fiscal/apuracao (issue #356)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (/reabre|traduz os códigos|traduz COMPETENCIA_NAO_FECHADA|fluxo completo isolado|competência em aberto/.test(testInfo.title)) {
      const token = tokenFrontendDeTeste();
      await page.addInitScript((valorToken) => window.localStorage.setItem('token', valorToken), token);
      await page.goto('/dashboard/fiscal/apuracao');
      return;
    }

    await login(page);
    await page.goto('/dashboard/fiscal/apuracao');
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

  // #497 — o seletor não pode oferecer competência em aberto, e o 422 do
  // backend precisa virar orientação legível se ela chegar por outro caminho
  // (relógio da máquina adiantado, requisição fora da tela).
  test('bloqueia o cálculo de competência em aberto e nasce no último mês fechado', async ({ page }) => {
    const ultima = ultimaCompetenciaFechada();

    await expect(page.getByLabel('Mês')).toHaveValue(String(ultima.mes));
    await expect(page.getByLabel('Ano')).toHaveValue(String(ultima.ano));

    // O ano da última competência fechada é o mais recente do seletor.
    await expect(page.getByLabel('Ano').locator('option').first()).toHaveText(String(ultima.ano));
    await expect(page.getByLabel('Ano').locator(`option[value="${ultima.ano + 1}"]`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeEnabled();

    // Dezembro fechado significa que estamos em janeiro: nenhum mês do ano
    // ofertado está em aberto, não há o que bloquear.
    if (ultima.mes < 12) {
      await page.getByLabel('Mês').selectOption(String(ultima.mes + 1));

      await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeDisabled();
      await expect(page.getByText(/ainda não fechou\. O DAS só pode ser apurado/)).toBeVisible();

      await page.getByLabel('Mês').selectOption(String(ultima.mes));
      await expect(page.getByRole('button', { name: 'Calcular DAS' })).toBeEnabled();
    }
  });

  test('traduz COMPETENCIA_NAO_FECHADA em orientação clara com a competência máxima', async ({ page }) => {
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
          body: JSON.stringify({ erro: 'COMPETENCIA_NAO_FECHADA', competencia_maxima: '2026-08' }),
        });
        return;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByRole('button', { name: 'Calcular DAS' }).click();

    await expect(page.getByText('Competência ainda não fechou', { exact: true })).toBeVisible();
    await expect(page.getByText(/Escolha uma competência até Agosto\/2026/)).toBeVisible();
    await expect(page.getByText('COMPETENCIA_NAO_FECHADA')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).not.toBeVisible();
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
    await abrirCompetenciaEmRascunho(page);

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
    await abrirCompetenciaEmRascunho(page);

    // exact: o botão 'Excluir rascunho' (#500) também casa com o texto solto.
    await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();

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

test.describe('Sidebar — Apuração Fiscal nested em Fiscal (issue #356, atualizado pelo #358)', () => {
  test('link direto de Apuração Fiscal não existe mais — vive sob Fiscal', async ({ page }) => {
    await login(page);

    const sidebar = page.locator('aside.nova-sidebar');
    await expect(sidebar.getByRole('link', { name: 'Apuração Fiscal' })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: 'Fiscal', exact: true })).toBeVisible();
  });

  test('URL antiga /dashboard/apuracoes redireciona para /dashboard/fiscal/apuracao', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/apuracoes');

    await expect(page).toHaveURL(/\/dashboard\/fiscal\/apuracao$/);
    await expect(page.getByRole('heading', { name: 'Apuração Fiscal' })).toBeVisible();
  });

  test('highlight ativo em /dashboard/fiscal/apuracao', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/fiscal/apuracao');

    const sidebar = page.locator('aside.nova-sidebar');
    const link = sidebar.getByRole('link', { name: 'Fiscal', exact: true });
    await expect(link).toHaveClass(/bg-sky-400\/10/);

    const outroLink = sidebar.getByRole('link', { name: 'Contábil' });
    await expect(outroLink).not.toHaveClass(/bg-sky-400\/10/);
  });
});

test.describe('Apuração Fiscal — excluir rascunho e janela de anos (issue #500)', () => {
  test.beforeEach(async ({ page }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valorToken) => window.localStorage.setItem('token', valorToken), token);
    await page.goto('/dashboard/fiscal/apuracao');
  });

  test('seletor de Ano vai do ano atual até 2020, sem cortar em ano atual - 4', async ({ page }) => {
    const anoAtual = new Date().getFullYear();
    const seletor = page.getByLabel('Ano');

    await expect(seletor.locator('option')).toHaveCount(anoAtual - 2020 + 1);
    await expect(seletor.locator('option').first()).toHaveText(String(anoAtual));
    await expect(seletor.locator('option').last()).toHaveText('2020');

    // O ano que a janela antiga escondia (atual - 5) agora é selecionável.
    await seletor.selectOption(String(anoAtual - 5));
    await expect(seletor).toHaveValue(String(anoAtual - 5));
  });

  test('exclui o rascunho pelo modal e a competência volta ao estado não apurado', async ({ page }) => {
    const apuracao = apuracaoDetalhada({ id: 'apuracao-excluir' });
    let excluida = false;
    let chamadasDelete = 0;

    await page.route('**/apuracoes**', async (route) => {
      const requisicao = route.request();
      const url = new URL(requisicao.url());

      if (url.pathname === '/apuracoes' && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/apuracoes' && requisicao.method() === 'POST') {
        // Depois do DELETE o registro sumiu — um novo cálculo cria outro
        // rascunho em vez de esbarrar no 409 de duplicata.
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(excluida ? { ...apuracao, id: 'apuracao-recriada' } : apuracao),
        });
        return;
      }

      if (url.pathname === `/apuracoes/${apuracao.id}` && requisicao.method() === 'DELETE') {
        chamadasDelete += 1;
        excluida = true;
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();

    // Cancelar não remove nada.
    await page.getByRole('button', { name: 'Excluir rascunho' }).click();
    await expect(page.getByRole('heading', { name: 'Excluir rascunho' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Excluir rascunho' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
    expect(chamadasDelete).toBe(0);

    await page.getByRole('button', { name: 'Excluir rascunho' }).click();
    await expect(page.getByText(/O cálculo e o histórico de edições serão perdidos/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByRole('heading', { name: 'Excluir rascunho' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar valor' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar DAS' })).toHaveCount(0);
    expect(chamadasDelete).toBe(1);

    // A mesma competência pode ser recalculada do zero.
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
  });

  test('apuração aprovada não oferece exclusão', async ({ page }) => {
    const apuracao = apuracaoDetalhada({
      id: 'apuracao-aprovada',
      status: 'aprovado',
      aprovado_por: 'contador@teste.local',
      aprovado_em: '2026-08-21T18:05:00.000Z',
    });

    await page.route('**/apuracoes**', async (route) => {
      const requisicao = route.request();
      const url = new URL(requisicao.url());

      if (url.pathname === '/apuracoes' && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/apuracoes' && requisicao.method() === 'POST') {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(apuracao) });
        return;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByRole('button', { name: 'Calcular DAS' }).click();

    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
    await expect(page.getByText(/Aprovado por contador@teste.local em/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excluir rascunho' })).toHaveCount(0);
  });

  test('erro do backend aparece no modal e o rascunho continua na tela', async ({ page }) => {
    const apuracao = apuracaoDetalhada({ id: 'apuracao-conflito' });

    await page.route('**/apuracoes**', async (route) => {
      const requisicao = route.request();
      const url = new URL(requisicao.url());

      if (url.pathname === '/apuracoes' && requisicao.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }

      if (url.pathname === '/apuracoes' && requisicao.method() === 'POST') {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(apuracao) });
        return;
      }

      if (url.pathname === `/apuracoes/${apuracao.id}` && requisicao.method() === 'DELETE') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ erro: 'Apuração já aprovada não pode ser excluída' }),
        });
        return;
      }

      await route.continue();
    });

    await page.reload();
    await page.getByRole('button', { name: 'Calcular DAS' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();

    await page.getByRole('button', { name: 'Excluir rascunho' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByText('Apuração já aprovada não pode ser excluída')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Resultado do cálculo' })).toBeVisible();
  });
});
