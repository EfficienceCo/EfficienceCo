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

function checklistDe(tipo: string) {
  const itens: any[] = [
    { id: 'confirmar_dados', titulo: 'Confirmar dados do titular e do certificado', concluido: false },
  ];
  if (tipo === 'A3') {
    itens.push({
      id: 'agendar_presencial',
      titulo: 'Agendar comparecimento presencial',
      concluido: false,
      tipo: 'agendamento',
      dados: { data: '' },
    });
  }
  itens.push({
    id: 'gerar_novo',
    titulo:
      tipo === 'A3'
        ? 'Emitir o novo certificado no comparecimento e atualizar validade e serial'
        : 'Gerar o novo certificado e atualizar validade e serial',
    concluido: false,
  });
  return { itens };
}

function comCalculo(cert: any) {
  const dias = diasRestantes(cert.validade);
  return { ...cert, dias_restantes: dias, faixa: faixaDe(dias) };
}

function criarBackendMock(seedInicial: any[] = []) {
  const certificados: any[] = seedInicial.map((c, i) => ({
    id: c.id || `cert-${i + 1}`,
    cliente_id: 'cliente-teste',
    tipo: c.tipo || 'A1',
    titular: c.titular || `Cliente ${i + 1}`,
    serial: c.serial || null,
    validade: c.validade,
    caminho_local: c.caminho_local || null,
    status: c.status || 'ativo',
    renovacao_checklist: c.renovacao_checklist || null,
  }));

  return {
    certificados,
    seed(lista: any[]) {
      lista.forEach((c, i) => {
        certificados.push({
          id: c.id || `cert-seed-${certificados.length + i + 1}`,
          cliente_id: 'cliente-teste',
          tipo: c.tipo || 'A1',
          titular: c.titular || `Cliente ${certificados.length + i + 1}`,
          serial: c.serial || null,
          validade: c.validade,
          caminho_local: c.caminho_local || null,
          status: c.status || 'ativo',
          renovacao_checklist: c.renovacao_checklist || null,
        });
      });
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
            id: `cert-${certificados.length + 1}`,
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

        // PATCH /certificados/:id/renovacao — conclui / atualiza um item
        if (metodo === 'PATCH' && sub === 'renovacao') {
          const corpo = req.postDataJSON();
          if (cert?.renovacao_checklist?.itens) {
            cert.renovacao_checklist.itens = cert.renovacao_checklist.itens.map((item: any) =>
              item.id === corpo.itemId
                ? {
                    ...item,
                    ...(corpo.concluido !== undefined ? { concluido: corpo.concluido } : {}),
                    ...(corpo.dados !== undefined ? { dados: corpo.dados } : {}),
                  }
                : item,
            );
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

    // 1º passo
    await card.getByRole('listitem').first().getByRole('checkbox').check();
    await expect(card.getByText('1/3')).toBeVisible();

    // passo de agendamento: só habilita depois de escolher a data
    const agendamento = card
      .getByRole('listitem')
      .filter({ hasText: 'Agendar comparecimento presencial' });
    await expect(agendamento.getByRole('checkbox')).toBeDisabled();
    await agendamento.locator('input[type="date"]').fill(emDias(10));
    await expect(agendamento.getByRole('checkbox')).toBeEnabled();
    await agendamento.getByRole('checkbox').check();
    await expect(card.getByText('2/3')).toBeVisible();

    // último passo
    await card.getByRole('listitem').last().getByRole('checkbox').check();
    await expect(card.getByText('3/3')).toBeVisible();
    await expect(card.getByText(/Renovação concluída/)).toBeVisible();
  });
});
