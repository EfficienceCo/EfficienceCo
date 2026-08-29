import { test, expect, Page } from '@playwright/test';

// Backend mockado via page.route — mesmo padrão de apuracao.spec.ts. A tabela
// `eventos_esocial` / migration 82 pode não estar aplicada no Supabase de dev,
// então o fluxo do wizard (#ES-10) é exercido contra respostas controladas.

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

const XML_FALSO = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00">
  <evtAdmissao Id="ID1123456780001992026020100000000001">
    <ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb></ideEvento>
    <trabalhador><cpfTrab>52998224725</cpfTrab><nmTrab>MARIA DE TESTE</nmTrab></trabalhador>
  </evtAdmissao>
</eSocial>`;

// Estado do "banco" mockado, compartilhado entre as rotas.
function criarBackendMock() {
  const eventos: any[] = [];

  return {
    eventos,
    async instalar(page: Page) {
      // ES-5 ainda não existe — devolve lista vazia em vez de deixar vazar pro backend.
      await page.route('**/funcionarios**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );
      await page.route('**/eventos-esocial**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const metodo = req.method();
        const partes = url.pathname.split('/').filter(Boolean); // ['eventos-esocial', ':id', 'xml'?]
        const id = partes[1];
        const sub = partes[2];

        // POST /eventos-esocial — cria o rascunho + XML
        if (metodo === 'POST' && partes.length === 1) {
          const corpo = req.postDataJSON();
          const evento = {
            id: `evt-${eventos.length + 1}`,
            cliente_id: 'cliente-teste',
            funcionario_id: corpo.funcionarioId ?? null,
            tipo_evento: corpo.tipoEvento,
            status: 'rascunho',
            xml_gerado: XML_FALSO,
            dados_formulario: corpo.dadosFormulario,
            aprovado_por: null,
            aprovado_em: null,
            criado_em: new Date().toISOString(),
          };
          eventos.push(evento);
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(evento) });
          return;
        }

        // GET /eventos-esocial — histórico
        if (metodo === 'GET' && partes.length === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [...eventos].reverse(), total: eventos.length, limit: 20, offset: 0 }),
          });
          return;
        }

        const evento = eventos.find((e) => e.id === id);

        // GET /eventos-esocial/:id/xml — download (só se aprovado)
        if (metodo === 'GET' && sub === 'xml') {
          if (!evento || evento.status === 'rascunho') {
            await route.fulfill({
              status: 409,
              contentType: 'application/json',
              body: JSON.stringify({ erro: 'Evento em rascunho', codigo: 'EVENTO_NAO_APROVADO' }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            headers: {
              'content-type': 'application/xml; charset=utf-8',
              'content-disposition': `attachment; filename="${evento.tipo_evento}-${evento.id}.xml"`,
            },
            body: evento.xml_gerado,
          });
          return;
        }

        // PATCH /eventos-esocial/:id/aprovar
        if (metodo === 'PATCH' && sub === 'aprovar') {
          if (evento) {
            evento.status = 'aprovado';
            evento.aprovado_por = 'contador@teste.local';
            evento.aprovado_em = new Date().toISOString();
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evento) });
          return;
        }

        // GET /eventos-esocial/:id — detalhe
        if (metodo === 'GET' && partes.length === 2) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evento ?? {}) });
          return;
        }

        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      });
    },
  };
}

const grupo = (page: Page, nome: string) => page.getByRole('group', { name: nome });

async function preencherFormularioS2200(page: Page) {
  const g = (nome: string) => grupo(page, nome);

  // Os <label> obrigatórios têm o texto "Campo *" (o "*" é aria-hidden mas
  // continua no textContent), então casamos por substring/regex, com o escopo
  // do fieldset (role=group) evitando ambiguidade.
  const trab = g('Trabalhador');
  await trab.getByLabel('CPF').fill('52998224725');
  await trab.getByLabel('Nome completo').fill('MARIA DE TESTE');
  await trab.getByLabel('Sexo').selectOption('F');
  await trab.getByLabel('Raça/cor').selectOption('1');
  await trab.getByLabel('Grau de instrução').selectOption('07');
  await trab.getByLabel('Data de nascimento').fill('15/03/1992');
  await trab.getByLabel('Naturalidade — código do município (IBGE)').fill('3550308');
  await trab.getByLabel('Naturalidade — UF').selectOption('SP');

  const end = g('Endereço');
  await end.getByLabel(/^Logradouro/).fill('Avenida Paulista');
  await end.getByLabel(/^Número/).fill('1000');
  await end.getByLabel('CEP').fill('01310100');
  await end.getByLabel(/^Código do munic/).fill('3550308');
  await end.getByLabel(/^UF/).selectOption('SP');

  const vinc = g('Vínculo');
  await vinc.getByLabel('Empregador — número de inscrição').fill('12345678000199');
  await vinc.getByLabel('Matrícula').fill('MAT-001');
  await vinc.getByLabel('Categoria do trabalhador').selectOption('101');
  await vinc.getByLabel('Data de admissão').fill('02/02/2026');

  const clt = g('Regime CLT (infoCeletista)');
  await clt.getByLabel('Regime de jornada').selectOption('1');
  await clt.getByLabel('Natureza da atividade').selectOption('1');

  const cargo = g('Cargo');
  await cargo.getByLabel('Nome do cargo').fill('Analista');
  await cargo.getByLabel('CBO do cargo').fill('252105');

  await g('Remuneração').getByLabel(/^Salário fixo/).fill('3500,00');

  await g('Local de trabalho').getByLabel(/^Número de inscrição/).fill('12345678000199');

  const hor = g('Horário contratual');
  await hor.getByLabel('Tipo de jornada').selectOption('1');
  await hor.getByLabel('Descrição da jornada').fill('Segunda a sexta, 08h às 17h');
}

test.describe('eSocial — wizard /dashboard/dp/esocial (issue #379)', () => {
  test.beforeEach(async ({ page }) => {
    const token = tokenFrontendDeTeste();
    await page.addInitScript((valor) => window.localStorage.setItem('token', valor), token);
    const backend = criarBackendMock();
    await backend.instalar(page);
    (page as any)._backend = backend;
    await page.goto('/dashboard/dp/esocial');
  });

  test('passo 1: lista os 12 eventos por grupo; só o S-2200 permite avançar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'eSocial' })).toBeVisible();
    await expect(page.getByText('Grupo 2 — Eventos não periódicos')).toBeVisible();
    await expect(page.getByText('Grupo 3 — Saúde e Segurança do Trabalho (SST)')).toBeVisible();
    await expect(page.getByText('Grupo 4 — Eventos periódicos')).toBeVisible();

    // Todos os 12 são selecionáveis; escolher um sem gerador bloqueia "Avançar".
    await page.getByRole('button', { name: /^S-2230/ }).click();
    await expect(page.getByText(/O gerador de XML de S-2230 ainda não está disponível/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Avançar para o formulário' })).toBeDisabled();

    await page.getByRole('button', { name: /^S-2200/ }).click();
    await expect(page.getByRole('button', { name: 'Avançar para o formulário' })).toBeEnabled();
  });

  test('fluxo completo: selecionar evento → preencher → revisar XML → aprovar → baixar', async ({ page }) => {
    await page.getByRole('button', { name: 'Avançar para o formulário' }).click();

    await expect(page.getByText('Formulário — S-2200 (Admissão)')).toBeVisible();

    // Revisar com o formulário vazio: lista as pendências e não sai do passo 2.
    await page.getByRole('button', { name: 'Revisar' }).click();
    await expect(page.getByText(/pendência\(s\) antes de revisar/)).toBeVisible();
    await expect(page.getByText('Revisão do evento')).toHaveCount(0);

    await preencherFormularioS2200(page);

    await page.getByRole('button', { name: 'Revisar' }).click();

    // Passo 3 — revisão
    await expect(page.getByText('Revisão do evento')).toBeVisible();
    await expect(page.getByText('Responsabilidade pelo conteúdo')).toBeVisible();
    await expect(page.getByText('<evtAdmissao', { exact: false })).toBeVisible();

    // não dá pra pular a revisão: sem aprovar, não existe botão de download
    await expect(page.getByRole('button', { name: 'Baixar XML' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Aprovar' }).click();

    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    const baixar = page.getByRole('button', { name: 'Baixar XML' });
    await expect(baixar).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await baixar.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^S-2200-.*\.xml$/);
  });

  test('histórico é atualizado após aprovar um evento', async ({ page }) => {
    await page.getByRole('button', { name: 'Avançar para o formulário' }).click();
    await preencherFormularioS2200(page);
    await page.getByRole('button', { name: 'Revisar' }).click();
    await page.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Novo evento' }).click();

    const historico = page.getByRole('table');
    await expect(historico.getByText('S-2200').first()).toBeVisible();
    await expect(historico.getByText('Aprovado', { exact: true })).toBeVisible();
  });

  test('a revisão não pode ser pulada mesmo para quem só quer o XML', async ({ page }) => {
    await page.getByRole('button', { name: 'Avançar para o formulário' }).click();
    await preencherFormularioS2200(page);
    await page.getByRole('button', { name: 'Revisar' }).click();

    // Só há o botão Aprovar; o aviso de responsabilidade está visível e destacado.
    await expect(page.getByRole('button', { name: 'Aprovar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Baixar XML' })).toHaveCount(0);
    await expect(page.getByText('A revisão e a aprovação humana são obrigatórias', { exact: false })).toBeVisible();
  });

  test('validação em tempo real barra salário ambíguo e data de nascimento inválida', async ({ page }) => {
    await page.getByRole('button', { name: 'Avançar para o formulário' }).click();
    await preencherFormularioS2200(page);

    // "2.500" é ambíguo (2500 ou 2,5?) — o gerador rejeitaria; o wizard barra antes.
    await grupo(page, 'Remuneração').getByLabel(/^Salário fixo/).fill('2.500');
    await grupo(page, 'Trabalhador').getByLabel('Data de nascimento').fill('31/02/1990');

    await page.getByRole('button', { name: 'Revisar' }).click();
    const pendencias = page.getByText(/pendência\(s\) antes de revisar/).locator('..');
    await expect(pendencias).toContainText('salário fixo');
    await expect(pendencias).toContainText('Data de nascimento');
    await expect(page.getByText('Revisão do evento')).toHaveCount(0);
  });

  test('reabre um evento aprovado a partir do histórico com XML e download', async ({ page }) => {
    await page.getByRole('button', { name: 'Avançar para o formulário' }).click();
    await preencherFormularioS2200(page);
    await page.getByRole('button', { name: 'Revisar' }).click();
    await page.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Novo evento' }).click();

    // Volta ao passo 1 e reabre a linha do histórico (GET /eventos-esocial/:id).
    await page.getByRole('table').getByRole('button', { name: 'Abrir' }).first().click();

    await expect(page.getByText('Revisão do evento')).toBeVisible();
    await expect(page.getByText('Responsabilidade pelo conteúdo')).toBeVisible();
    await expect(page.getByText('<evtAdmissao', { exact: false })).toBeVisible();
    // Já aprovado: mostra download, não o botão Aprovar.
    await expect(page.getByRole('button', { name: 'Baixar XML' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  });
});
