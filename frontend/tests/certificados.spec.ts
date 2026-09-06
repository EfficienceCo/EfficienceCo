import { test, expect, Page } from '@playwright/test';

// Backend mockado via page.route — mesmo padrão de esocial.spec.ts. A migration
// CD-1 (`certificados_digitais`) e o CRUD CD-2 podem não estar aplicados no
// Supabase de dev, então a tela (CD-5) é exercida contra respostas controladas.

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

// Data ISO (YYYY-MM-DD) a N dias de hoje — para posicionar os certificados nas
// faixas verde / âmbar / vermelho / vencido de forma determinística.
function emDias(n: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasRestantes(validadeIso: string) {
  const ms = Date.parse(`${validadeIso}T12:00:00`) - Date.now();
  return Math.ceil(ms / 86400000);
}

function faixaDe(dias: number) {
  if (dias <= 0) return 'vencido';
  if (dias < 30) return 'vermelho';
  if (dias <= 60) return 'ambar';
  return 'verde';
}

// Espelha certificados.controller.js › montarChecklistRenovacao: wrapper
// { tipo, itens, validade_nova }, itens com `descricao`, e o passo A3
// `agendar_comparecimento` (campo plano `data`) no fim da lista.
function checklistDe(tipo: string) {
  const itens: any[] = [
    { id: 'confirmar_dados', descricao: 'Confirmar dados do titular', concluido: false },
    { id: 'gerar_novo', descricao: 'Gerar novo certificado', concluido: false },
  ];
  if (tipo === 'A3') {
    itens.push({
      id: 'agendar_comparecimento',
      descricao: 'Agendar comparecimento presencial',
      concluido: false,
      data: null,
    });
  }
  return { tipo, itens, validade_nova: null };
}

function comCalculo(cert: any) {
  const dias = diasRestantes(cert.validade);
  return { ...cert, dias_restantes: dias, faixa: faixaDe(dias) };
}

function criarBackendMock(seedInicial: any[] = []) {
  let idSeq = 0;
  const proximoId = () => `cert-${++idSeq}`;
  const montar = (c: any) => ({
    id: c.id || proximoId(),
    cliente_id: 'cliente-teste',
    tipo: c.tipo || 'A1',
    titular: c.titular || `Cliente ${idSeq}`,
    serial: c.serial || null,
    validade: c.validade,
    caminho_local: c.caminho_local || null,
    status: c.status || 'ativo',
    renovacao_checklist: c.renovacao_checklist || null,
  });
  const certificados: any[] = seedInicial.map(montar);

  return {
    certificados,
    proximoId,
    seed(lista: any[]) {
      lista.forEach((c) => certificados.push(montar(c)));
    },
    async instalar(page: Page) {
      // Casa só as chamadas de API (porta 3001) — a própria rota da página
      // (/dashboard/societario/certificados, porta 3000) também contém
      // "certificados" no path e não pode ser interceptada.
      await page.route(
        (url) => url.port !== '3000' && url.pathname.startsWith('/certificados'),
        async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const metodo = req.method();
        const partes = url.pathname.split('/').filter(Boolean); // ['certificados', ':id', 'sub'?]
        const id = partes[1];
        const sub = partes[2];

        // GET /certificados — lista
        if (metodo === 'GET' && partes.length === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: certificados.map(comCalculo) }),
          });
          return;
        }

        // POST /certificados — cadastrar
        if (metodo === 'POST' && partes.length === 1) {
          const corpo = req.postDataJSON();
          const novo = {
            id: proximoId(),
            cliente_id: 'cliente-teste',
            tipo: corpo.tipo,
            titular: corpo.titular,
            serial: corpo.serial ?? null,
            validade: corpo.validade,
            caminho_local: corpo.caminho_local ?? null,
            status: 'ativo',
            renovacao_checklist: null,
          };
          certificados.push(novo);
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify(comCalculo(novo)),
          });
          return;
        }

        const cert = certificados.find((c) => c.id === id);

        // POST /certificados/:id/iniciar-renovacao
        if (metodo === 'POST' && sub === 'iniciar-renovacao') {
          if (cert) {
            cert.status = 'renovacao_iniciada';
            cert.renovacao_checklist = checklistDe(cert.tipo);
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(comCalculo(cert ?? {})),
          });
          return;
        }

        // PATCH /certificados/:id/renovacao — conclui / atualiza um item.
        // Corpo PLANO { itemId, concluido?, data?, validade_nova?, ... }, igual
        // ao atualizarRenovacaoCertificado do certificados.controller.js.
        if (metodo === 'PATCH' && sub === 'renovacao') {
          const corpo = req.postDataJSON();
          const itensMock = cert?.renovacao_checklist?.itens;
          if (itensMock) {
            // Regra do controller: concluir 'agendar_comparecimento' exige `data`
            // (no corpo ou já persistida).
            const alvo = itensMock.find((i: any) => i.id === corpo.itemId);
            const vaiConcluir = corpo.concluido === undefined ? true : Boolean(corpo.concluido);
            if (
              alvo?.id === 'agendar_comparecimento' &&
              vaiConcluir &&
              !corpo.data &&
              !alvo.data
            ) {
              await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                  erro: 'data do comparecimento presencial é obrigatória antes de concluir este item',
                }),
              });
              return;
            }
            cert.renovacao_checklist.itens = cert.renovacao_checklist.itens.map((item: any) => {
              if (item.id !== corpo.itemId) return item;
              const atualizado = {
                ...item,
                concluido: corpo.concluido === undefined ? true : Boolean(corpo.concluido),
              };
              if (item.id === 'agendar_comparecimento' && corpo.data !== undefined) {
                atualizado.data = corpo.data;
              }
              return atualizado;
            });
            if (corpo.validade_nova !== undefined) {
              cert.renovacao_checklist.validade_nova = corpo.validade_nova;
            }

            // Todos concluídos + validade nova → cria o substituto (igual ao
            // atualizarRenovacaoCertificado do controller).
            const todos = cert.renovacao_checklist.itens.every((i: any) => i.concluido === true);
            if (todos && cert.renovacao_checklist.validade_nova) {
              const novo = {
                id: proximoId(),
                cliente_id: 'cliente-teste',
                tipo: cert.tipo,
                titular: cert.titular,
                serial: corpo.serial_novo ?? null,
                validade: cert.renovacao_checklist.validade_nova,
                caminho_local: corpo.caminho_local_novo ?? cert.caminho_local,
                status: 'ativo',
                renovacao_checklist: null,
              };
              certificados.push(novo);
              cert.status = 'substituido';
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  certificado: comCalculo(cert),
                  novo_certificado: comCalculo(novo),
                }),
              });
              return;
            }
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(comCalculo(cert ?? {})),
          });
          return;
        }

        // GET /certificados/:id — detalhe
        if (metodo === 'GET' && partes.length === 2) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(cert ? comCalculo(cert) : {}),
          });
          return;
        }

        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        },
      );
    },
  };
}

async function cadastrarCertificado(
  page: Page,
  dados: { tipo: 'A1' | 'A3'; titular: string; validade: string; serial?: string; caminho?: string },
) {
  await page.getByRole('button', { name: 'Novo certificado' }).click();
  const modal = page.getByRole('dialog', { name: 'Novo certificado' });
  await expect(modal).toBeVisible();
  await modal.getByLabel('Tipo').selectOption(dados.tipo);
  await modal.getByLabel('Titular').fill(dados.titular);
  await modal.getByLabel('Validade').fill(dados.validade);
  if (dados.serial) await modal.getByLabel('Serial').fill(dados.serial);
  if (dados.caminho) await modal.getByLabel('Caminho local do arquivo').fill(dados.caminho);
  await modal.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(modal).toBeHidden();
}

const cardDe = (page: Page, titular: string) =>
  page.getByRole('article').filter({ hasText: titular });

test.describe('Certificado Digital — /dashboard/societario/certificados (issue #412 / CD-5)', () => {
  test('cadastra um A1 e um A3 e mostra um anel de contagem para cada', async ({ page }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    await criarBackendMock().instalar(page);
    await page.goto('/dashboard/societario/certificados');

    await expect(page.getByRole('heading', { name: 'Certificado Digital' })).toBeVisible();
    await expect(page.getByText('Nenhum certificado cadastrado para este cliente ainda.')).toBeVisible();

    await cadastrarCertificado(page, {
      tipo: 'A1',
      titular: 'Padaria do João',
      validade: emDias(175),
      caminho: 'C:\\clientes\\padaria-do-joao\\certificado digital\\',
    });
    await cadastrarCertificado(page, { tipo: 'A3', titular: 'Clínica Rosa', validade: emDias(90) });

    await expect(cardDe(page, 'Padaria do João')).toBeVisible();
    await expect(cardDe(page, 'Clínica Rosa')).toBeVisible();
    await expect(cardDe(page, 'Padaria do João').getByText('e-CNPJ A1')).toBeVisible();
    await expect(cardDe(page, 'Clínica Rosa').getByText('e-CNPJ A3')).toBeVisible();
    // caminho_local copiável
    await expect(
      cardDe(page, 'Padaria do João').getByText('C:\\clientes\\padaria-do-joao\\certificado digital\\'),
    ).toBeVisible();
    await expect(
      cardDe(page, 'Padaria do João').getByRole('button', { name: 'Copiar' }),
    ).toBeVisible();
  });

  test('colore o anel de contagem por faixa de vencimento', async ({ page }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    const backend = criarBackendMock([
      { titular: 'Verde SA', tipo: 'A1', validade: emDias(200) },
      { titular: 'Ambar SA', tipo: 'A1', validade: emDias(45) },
      { titular: 'Vermelho SA', tipo: 'A1', validade: emDias(15) },
      { titular: 'Vencido SA', tipo: 'A3', validade: emDias(-5) },
    ]);
    await backend.instalar(page);
    await page.goto('/dashboard/societario/certificados');

    await expect(cardDe(page, 'Verde SA').locator('[data-faixa="verde"]')).toBeVisible();
    await expect(cardDe(page, 'Ambar SA').locator('[data-faixa="ambar"]')).toBeVisible();
    await expect(cardDe(page, 'Vermelho SA').locator('[data-faixa="vermelho"]')).toBeVisible();
    await expect(cardDe(page, 'Vencido SA').locator('[data-faixa="vencido"]')).toBeVisible();
    await expect(cardDe(page, 'Vencido SA').getByText('Vencido', { exact: true })).toBeVisible();
  });

  test('inicia a renovação e mostra o checklist certo por tipo (A1 curto, A3 com agendamento)', async ({
    page,
  }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    const backend = criarBackendMock([
      { titular: 'Oficina Silva', tipo: 'A1', validade: emDias(20) },
      { titular: 'Transportes Veloz', tipo: 'A3', validade: emDias(25) },
    ]);
    await backend.instalar(page);
    await page.goto('/dashboard/societario/certificados');

    // A1 — checklist curto de 2 passos, sem seletor de data
    const cardA1 = cardDe(page, 'Oficina Silva');
    await cardA1.getByRole('button', { name: 'Iniciar Renovação' }).click();
    await expect(cardA1.getByText('Checklist de renovação', { exact: false })).toBeVisible();
    await expect(cardA1.getByRole('listitem')).toHaveCount(2);
    await expect(cardA1.getByText('Agendar comparecimento presencial')).toHaveCount(0);
    await expect(cardA1.locator('input[type="date"]')).toHaveCount(0);

    // A3 — checklist com o passo extra de agendamento presencial + seletor de data
    const cardA3 = cardDe(page, 'Transportes Veloz');
    await cardA3.getByRole('button', { name: 'Iniciar Renovação' }).click();
    await expect(cardA3.getByRole('listitem')).toHaveCount(3);
    await expect(cardA3.getByText('Agendar comparecimento presencial')).toBeVisible();
    await expect(cardA3.locator('input[type="date"]')).toBeVisible();
  });

  test('conclui os itens do checklist de renovação (A3, com data do comparecimento)', async ({
    page,
  }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    const backend = criarBackendMock([
      { titular: 'Mercado Bom Preço', tipo: 'A3', validade: emDias(25) },
    ]);
    await backend.instalar(page);
    await page.goto('/dashboard/societario/certificados');

    const card = cardDe(page, 'Mercado Bom Preço');
    await card.getByRole('button', { name: 'Iniciar Renovação' }).click();
    await expect(card.getByText('0/3')).toBeVisible();

    // Ordem do back-end (montarChecklistRenovacao): confirmar_dados, gerar_novo,
    // agendar_comparecimento.
    await card.getByRole('listitem').nth(0).getByRole('checkbox').check();
    await expect(card.getByText('1/3')).toBeVisible();

    await card.getByRole('listitem').nth(1).getByRole('checkbox').check();
    await expect(card.getByText('2/3')).toBeVisible();

    // passo de agendamento: só habilita depois de escolher a data
    const agendamento = card
      .getByRole('listitem')
      .filter({ hasText: 'Agendar comparecimento presencial' });
    await expect(agendamento.getByRole('checkbox')).toBeDisabled();
    await agendamento.locator('input[type="date"]').fill(emDias(10));
    await expect(agendamento.getByRole('checkbox')).toBeEnabled();
    await agendamento.getByRole('checkbox').check();
    await expect(card.getByText('3/3')).toBeVisible();
    // Checklist completo → aparece o passo final de emissão do novo certificado.
    await expect(card.getByText('Emitir o novo certificado')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Concluir renovação' })).toBeVisible();
  });

  test('desfaz o check otimista quando o servidor recusa a conclusão do item', async ({ page }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    const backend = criarBackendMock([
      {
        titular: 'Falha SA',
        tipo: 'A1',
        validade: emDias(20),
        status: 'renovacao_iniciada',
        renovacao_checklist: checklistDe('A1'),
      },
    ]);
    await backend.instalar(page);
    // PATCH /certificados/:id/renovacao devolve 500 — mais específica primeiro.
    await page.route(
      (url) => url.port !== '3000' && /\/certificados\/[^/]+\/renovacao$/.test(url.pathname),
      (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ erro: 'Erro ao atualizar checklist de renovação' }),
            })
          : route.fallback(),
    );
    await page.goto('/dashboard/societario/certificados');

    const card = cardDe(page, 'Falha SA');
    const primeiro = card.getByRole('listitem').nth(0).getByRole('checkbox');
    await expect(card.getByText('0/2')).toBeVisible();
    await primeiro.check();

    // Aviso do servidor exibido e o item volta para não-concluído (nada persistido).
    await expect(card.getByText('Erro ao atualizar checklist de renovação')).toBeVisible();
    await expect(primeiro).not.toBeChecked();
    await expect(card.getByText('0/2')).toBeVisible();
  });

  test('conclui a renovação (A1): informa a nova validade e o certificado substituto entra na lista', async ({
    page,
  }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    const backend = criarBackendMock([
      {
        titular: 'Renova SA',
        tipo: 'A1',
        validade: emDias(20),
        status: 'renovacao_iniciada',
        renovacao_checklist: checklistDe('A1'),
      },
    ]);
    await backend.instalar(page);
    await page.goto('/dashboard/societario/certificados');

    const card = cardDe(page, 'Renova SA');
    await card.getByRole('listitem').nth(0).getByRole('checkbox').check();
    await expect(card.getByText('1/2')).toBeVisible();
    await card.getByRole('listitem').nth(1).getByRole('checkbox').check();
    await expect(card.getByText('2/2')).toBeVisible();

    // Passo final: nova validade obrigatória.
    const emissao = card.locator('form', { hasText: 'Emitir o novo certificado' });
    await expect(emissao.getByRole('button', { name: 'Concluir renovação' })).toBeDisabled();
    const novaValidade = emDias(400);
    await emissao.locator('input[type="date"]').fill(novaValidade);
    await emissao.getByRole('button', { name: 'Concluir renovação' }).click();

    // A lista recarrega: agora há o registro antigo + o substituto com a nova validade.
    const [ano, mes, dia] = novaValidade.split('-');
    await expect(page.getByRole('article').filter({ hasText: 'Renova SA' })).toHaveCount(2);
    await expect(page.getByText(`${dia}/${mes}/${ano}`)).toBeVisible();
  });

  test('conclui a renovação (A3): a finalização não recai sobre o passo de agendamento', async ({
    page,
  }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    // Checklist A3 já todo concluído (agendamento com data) → o passo final
    // aparece de cara. Se a finalização mandasse o PATCH no item
    // 'agendar_comparecimento' sem `data`, o mock responderia 400.
    const checklist = checklistDe('A3');
    checklist.itens = checklist.itens.map((i: any) =>
      i.id === 'agendar_comparecimento'
        ? { ...i, concluido: true, data: emDias(5) }
        : { ...i, concluido: true },
    );
    const backend = criarBackendMock([
      {
        titular: 'Presencial SA',
        tipo: 'A3',
        validade: emDias(18),
        status: 'renovacao_iniciada',
        renovacao_checklist: checklist,
      },
    ]);
    await backend.instalar(page);
    await page.goto('/dashboard/societario/certificados');

    const card = cardDe(page, 'Presencial SA');
    await expect(card.getByText('3/3')).toBeVisible();
    const emissao = card.locator('form', { hasText: 'Emitir o novo certificado' });
    await emissao.locator('input[type="date"]').fill(emDias(1000));
    await emissao.getByRole('button', { name: 'Concluir renovação' }).click();

    await expect(page.getByRole('article').filter({ hasText: 'Presencial SA' })).toHaveCount(2);
    await expect(card.getByText(/não pôde ser finalizada/)).toHaveCount(0);
  });
});
