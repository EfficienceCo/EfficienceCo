import { test, expect } from '@playwright/test';
import api from '../src/services/api';
import {
  atualizarItemRenovacao,
  buscarCertificado,
  criarCertificado,
  editarCertificado,
  iniciarRenovacao,
  listarCertificados,
} from '../src/services/certificados.service';

const apiMutavel = api as any;
const originais = { get: apiMutavel.get, post: apiMutavel.post, patch: apiMutavel.patch };
let chamadas: any[][];

test.beforeEach(() => {
  chamadas = [];
  for (const metodo of ['get', 'post', 'patch']) {
    apiMutavel[metodo] = async (...args: any[]) => {
      chamadas.push([metodo, ...args]);
      return { data: { ok: true } };
    };
  }
});

test.afterAll(() => Object.assign(apiMutavel, originais));

test('monta listagem e detalhe com clienteId apenas quando informado', async () => {
  await listarCertificados({ clienteId: 'cliente-1' });
  await buscarCertificado('cert-1', { clienteId: null });

  expect(chamadas[0]).toEqual(['get', '/certificados', { params: { clienteId: 'cliente-1' } }]);
  expect(chamadas[1]).toEqual(['get', '/certificados/cert-1', { params: undefined }]);
});

test('mantém os payloads de criação e edição sem transformação', async () => {
  const cadastro = { tipo: 'A1', validade: '2027-01-01', cliente_id: 'cliente-1' };
  const edicao = { serial: 'NOVO', clienteId: 'cliente-1' };
  await criarCertificado(cadastro);
  await editarCertificado('cert-1', edicao);

  expect(chamadas[0]).toEqual(['post', '/certificados', cadastro]);
  expect(chamadas[1]).toEqual(['patch', '/certificados/cert-1', edicao]);
});

test('propaga o cliente selecionado nas mutações de renovação', async () => {
  await iniciarRenovacao('cert-1', { clienteId: 'cliente-1' });
  await atualizarItemRenovacao('cert-1', 'gerar_novo', {
    concluido: true,
    dados: { validade_nova: '2028-01-01' },
    clienteId: 'cliente-1',
  });

  expect(chamadas[0]).toEqual([
    'post',
    '/certificados/cert-1/iniciar-renovacao',
    { clienteId: 'cliente-1' },
  ]);
  expect(chamadas[1]).toEqual([
    'patch',
    '/certificados/cert-1/renovacao',
    {
      itemId: 'gerar_novo',
      concluido: true,
      validade_nova: '2028-01-01',
      clienteId: 'cliente-1',
    },
  ]);
});
