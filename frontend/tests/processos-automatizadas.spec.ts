import { expect, Page, test } from '@playwright/test';

type Etapa = {
  id: string;
  descricao: string;
  tipo: string;
  acao: string | null;
  status: string;
  concluida: boolean;
  payload_execucao?: Record<string, unknown> | null;
  arquivo_gerado?: string | null;
  erro_execucao?: string | null;
};

type EstadoApi = {
  processo: {
    id: string;
    cliente_id: string;
    titulo: string;
    tipo: string;
    status: string;
    etapas: Etapa[];
  };
  posts: Array<Record<string, unknown>>;
  patches: Array<Record<string, unknown>>;
  erroProximoPost: string;
};

const API_URL = 'http://localhost:3001';

function criarToken() {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'usuario-teste',
      perfil: 'admin_cliente',
      cliente_id: 'cliente-1',
      nome: 'Patrícia',
      exp: 4_102_444_800,
    }),
  ).toString('base64url');

  return `cabecalho.${payload}.assinatura`;
}

function criarEstadoApi(): EstadoApi {
  return {
    processo: {
      id: 'processo-1',
      cliente_id: 'cliente-1',
      titulo: 'Abertura da Empresa Exemplo',
      tipo: 'abertura_empresa',
      status: 'em_andamento',
      etapas: [
        {
          id: 'etapa-manual',
          descricao: 'Verificar viabilidade do nome empresarial',
          tipo: 'manual',
          acao: null,
          status: 'pendente',
          concluida: false,
        },
        {
          id: 'etapa-contrato',
          descricao: 'Gerar contrato social',
          tipo: 'automatizada',
          acao: 'gerar_contrato_social',
          status: 'pendente',
          concluida: false,
          payload_execucao: null,
          arquivo_gerado: null,
          erro_execucao: null,
        },
        {
          id: 'etapa-pastas',
          descricao: 'Criar estrutura de pastas',
          tipo: 'automatizada',
          acao: 'criar_pastas',
          status: 'pendente',
          concluida: false,
          payload_execucao: null,
          arquivo_gerado: null,
          erro_execucao: null,
        },
      ],
    },
    posts: [],
    patches: [],
    erroProximoPost: '',
  };
}

function localizarEtapa(estado: EstadoApi, etapaId: string) {
  const etapa = estado.processo.etapas.find((item) => item.id === etapaId);
  if (!etapa) {
    throw new Error(`Etapa ${etapaId} não encontrada no fixture.`);
  }
  return etapa;
}

async function prepararPagina(page: Page, estado = criarEstadoApi()) {
  await page.addInitScript((token) => {
    window.localStorage.setItem('token', token);
  }, criarToken());

  await page.route(`${API_URL}/notificacoes**`, async (route) => {
    await route.fulfill({ status: 200, json: [] });
  });

  await page.route(`${API_URL}/processos**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/processos') {
      await route.fulfill({ status: 200, json: [estado.processo] });
      return;
    }

    const executarMatch = url.pathname.match(
      /^\/processos\/([^/]+)\/etapas\/([^/]+)\/executar-acao$/,
    );
    if (method === 'POST' && executarMatch) {
      const etapaId = executarMatch[2];
      const dados = request.postDataJSON() as Record<string, unknown>;
      estado.posts.push(dados);

      if (estado.erroProximoPost) {
        const mensagem = estado.erroProximoPost;
        estado.erroProximoPost = '';
        await route.fulfill({ status: 500, json: { erro: mensagem } });
        return;
      }

      const etapa = localizarEtapa(estado, etapaId);
      etapa.status = 'pronta_para_execucao';
      etapa.payload_execucao = dados;
      etapa.erro_execucao = null;
      await route.fulfill({ status: 200, json: etapa });
      return;
    }

    const patchMatch = url.pathname.match(/^\/processos\/([^/]+)\/etapas\/([^/]+)$/);
    if (method === 'PATCH' && patchMatch) {
      const etapa = localizarEtapa(estado, patchMatch[2]);
      const dados = request.postDataJSON() as Record<string, unknown>;
      estado.patches.push(dados);
      etapa.concluida = Boolean(dados.concluida);
      etapa.status = etapa.concluida ? 'concluida' : 'pendente';
      await route.fulfill({ status: 200, json: etapa });
      return;
    }

    await route.fulfill({ status: 404, json: { erro: 'Rota não simulada' } });
  });

  await page.goto('/dashboard/processos');
  await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver etapas' }).click();

  return estado;
}

function etapaPorTexto(page: Page, texto: string) {
  return page.getByRole('listitem').filter({ hasText: texto });
}

async function preencherContrato(page: Page, participacao = '100') {
  await page.getByLabel('Nome do sócio 1').fill('Maria da Silva');
  await page.getByLabel('CPF do sócio 1').fill('01234567890');
  await page.getByLabel('Participação (%) do sócio 1').fill(participacao);
  await page.getByLabel('Capital social (R$)').fill('25000.50');
  await page.getByLabel('Endereço').fill('Rua das Flores, 100, São Paulo - SP');
  await page.getByLabel('Objeto social').fill('Prestação de serviços de tecnologia.');
}

test.describe('Processos — etapas manuais e automatizadas', () => {
  test('renderiza checkbox apenas para etapa manual e formulário conforme a ação', async ({
    page,
  }) => {
    await prepararPagina(page);

    const manual = etapaPorTexto(page, 'Verificar viabilidade do nome empresarial');
    const contrato = etapaPorTexto(page, 'Gerar contrato social');
    const pastas = etapaPorTexto(page, 'Criar estrutura de pastas');

    await expect(manual.getByRole('checkbox')).toBeVisible();
    await expect(contrato.getByRole('checkbox')).toHaveCount(0);
    await expect(contrato.getByLabel('Nome do sócio 1')).toBeVisible();
    await expect(contrato.getByLabel('Capital social (R$)')).toBeVisible();
    await expect(contrato.getByLabel('Objeto social')).toBeVisible();
    await expect(contrato.getByLabel('Endereço')).toBeVisible();

    await expect(pastas.getByRole('checkbox')).toHaveCount(0);
    await expect(pastas.locator('input, textarea')).toHaveCount(0);
    await expect(pastas.getByText(/Nenhum dado adicional é necessário/i)).toBeVisible();
    await expect(pastas.getByRole('button', { name: 'Concluir' })).toBeVisible();
  });

  test('mantém o fluxo manual existente com PATCH', async ({ page }) => {
    const estado = await prepararPagina(page);
    const manual = etapaPorTexto(page, 'Verificar viabilidade do nome empresarial');

    await manual.getByRole('checkbox').check();

    await expect.poll(() => estado.patches.length).toBe(1);
    expect(estado.patches[0]).toEqual({ concluida: true });
  });

  test('adiciona sócios, envia o payload tipado e entra em processamento', async ({ page }) => {
    const estado = await prepararPagina(page);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');

    await preencherContrato(page, '60');
    await contrato.getByRole('button', { name: 'Adicionar sócio' }).click();
    await page.getByLabel('Nome do sócio 2').fill('João Souza');
    await page.getByLabel('CPF do sócio 2').fill('00123456789');
    await page.getByLabel('Participação (%) do sócio 2').fill('40');
    await contrato.getByRole('button', { name: 'Concluir' }).click();

    await expect.poll(() => estado.posts.length).toBe(1);
    const { cliente_id: _clienteId, ...payloadContrato } = estado.posts[0];
    expect(payloadContrato).toEqual({
      socios: [
        { nome: 'Maria da Silva', cpf: '01234567890', participacao: 60 },
        { nome: 'João Souza', cpf: '00123456789', participacao: 40 },
      ],
      capital_social: 25000.5,
      objeto_social: 'Prestação de serviços de tecnologia.',
      endereco: 'Rua das Flores, 100, São Paulo - SP',
    });
    await expect(contrato.getByRole('status')).toContainText('Processando');
  });

  test('não envia contrato quando as participações não totalizam 100%', async ({ page }) => {
    const estado = await prepararPagina(page);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');

    await preencherContrato(page, '60');
    await contrato.getByRole('button', { name: 'Concluir' }).click();

    await expect(contrato.getByRole('alert')).toContainText(
      'A soma das participações dos sócios deve ser 100%',
    );
    expect(estado.posts).toHaveLength(0);
  });

  test('erro HTTP aparece na etapa e preserva o formulário para nova tentativa', async ({ page }) => {
    const estado = await prepararPagina(page);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');
    estado.erroProximoPost = 'Serviço temporariamente indisponível';

    await preencherContrato(page);
    await contrato.getByRole('button', { name: 'Concluir' }).click();

    await expect(contrato.getByRole('alert')).toContainText(
      'Serviço temporariamente indisponível',
    );
    await expect(page.getByLabel('Nome do sócio 1')).toHaveValue('Maria da Silva');
    await expect(contrato.getByRole('button', { name: 'Concluir' })).toBeEnabled();
    await contrato.getByRole('button', { name: 'Concluir' }).click();
    await expect.poll(() => estado.posts.length).toBe(2);
    await expect(contrato.getByRole('status')).toContainText('Processando');
  });

  test('erro do agente no polling reabre o form e permite tentar novamente', async ({ page }) => {
    const estado = await prepararPagina(page);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');
    await page.clock.install();

    await preencherContrato(page);
    await contrato.getByRole('button', { name: 'Concluir' }).click();
    await expect(contrato.getByRole('status')).toContainText('Processando');

    const etapa = localizarEtapa(estado, 'etapa-contrato');
    etapa.status = 'pronta_para_execucao';
    etapa.erro_execucao = 'Template do contrato não encontrado';
    await page.clock.runFor(3_100);

    await expect(contrato.getByRole('alert')).toContainText('Template do contrato não encontrado');
    await expect(page.getByLabel('Nome do sócio 1')).toHaveValue('Maria da Silva');
    await contrato.getByRole('button', { name: 'Concluir' }).click();
    await expect.poll(() => estado.posts.length).toBe(2);
    await expect(contrato.getByRole('alert')).toHaveCount(0);
    await expect(contrato.getByRole('status')).toContainText('Processando');
  });

  test('hidrata o retry com payload e erro recebidos do backend', async ({ page }) => {
    const estado = criarEstadoApi();
    const etapa = localizarEtapa(estado, 'etapa-contrato');
    etapa.status = 'pronta_para_execucao';
    etapa.erro_execucao = 'Falha ao preencher o modelo';
    etapa.payload_execucao = {
      socios: [{ nome: 'Ana Lima', cpf: '00011122233', participacao: 100 }],
      capital_social: 15000,
      objeto_social: 'Comércio varejista.',
      endereco: 'Avenida Central, 20',
    };

    await prepararPagina(page, estado);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');

    await expect(contrato.getByRole('alert')).toContainText('Falha ao preencher o modelo');
    await expect(page.getByLabel('Nome do sócio 1')).toHaveValue('Ana Lima');
    await expect(page.getByLabel('Capital social (R$)')).toHaveValue('15000');
    await contrato.getByRole('button', { name: 'Concluir' }).click();
    await expect.poll(() => estado.posts.length).toBe(1);
    await expect(contrato.getByRole('status')).toContainText('Processando');
  });

  test('sucesso do polling conclui a etapa e mostra o arquivo sem recarregar', async ({ page }) => {
    const estado = await prepararPagina(page);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');
    await page.clock.install();

    await preencherContrato(page);
    await contrato.getByRole('button', { name: 'Concluir' }).click();
    await expect(contrato.getByRole('status')).toContainText('Processando');

    const etapa = localizarEtapa(estado, 'etapa-contrato');
    etapa.status = 'concluida';
    etapa.concluida = true;
    etapa.arquivo_gerado = 'https://arquivos.exemplo.test/contrato-social.docx';
    await page.clock.runFor(3_100);

    await expect(contrato.getByText('Execução concluída com sucesso.')).toBeVisible();
    await expect(
      contrato.getByRole('link', { name: 'contrato-social.docx' }),
    ).toHaveAttribute('href', 'https://arquivos.exemplo.test/contrato-social.docx');
    await expect(page.getByText('1 de 3 etapas')).toBeVisible();
  });

  test('arquivo em caminho local exibe somente o nome, sem link quebrado', async ({ page }) => {
    const estado = criarEstadoApi();
    const etapa = localizarEtapa(estado, 'etapa-contrato');
    etapa.status = 'concluida';
    etapa.concluida = true;
    etapa.arquivo_gerado = 'C:\\Clientes\\Empresa\\contrato-social-v1.docx';

    await prepararPagina(page, estado);
    const contrato = etapaPorTexto(page, 'Gerar contrato social');

    await expect(contrato.getByText('contrato-social-v1.docx')).toBeVisible();
    await expect(contrato.getByRole('link')).toHaveCount(0);
  });

  test('criar pastas confirma sem campos e envia objeto vazio', async ({ page }) => {
    const estado = await prepararPagina(page);
    const pastas = etapaPorTexto(page, 'Criar estrutura de pastas');

    await pastas.getByRole('button', { name: 'Concluir' }).click();

    await expect.poll(() => estado.posts.length).toBe(1);
    const { cliente_id: _clienteId, ...payloadPastas } = estado.posts[0];
    expect(payloadPastas).toEqual({});
    await expect(pastas.getByRole('status')).toContainText('Processando');
  });
});
