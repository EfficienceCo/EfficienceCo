'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import {
  atualizarRegra,
  criarRegra,
  deletarRegra,
  listarRegras,
} from '../../../services/regras.service';

const PERFIS_AUTORIZADOS = new Set(['admin_cliente', 'admin_efficience']);
const TIPO_FOLHA_PAGAMENTO = 'folha_pagamento';
const EXTENSAO_FOLHA_PAGAMENTO = 'xlsx';

const TIPO_DOCUMENTO_OPCOES = [
  { value: '', label: 'Qualquer tipo' },
  { value: 'cartao_cnpj', label: 'Cartão CNPJ' },
  { value: 'contrato_social', label: 'Contrato social' },
  { value: 'extrato_bancario', label: 'Extrato bancário' },
  { value: TIPO_FOLHA_PAGAMENTO, label: 'Folha de pagamento' },
  { value: 'holerite', label: 'Holerite' },
  { value: 'nao_identificado', label: 'Não identificado' },
];

const EXTENSAO_OPCOES = [
  { value: 'pdf', label: '.pdf' },
  { value: 'xml', label: '.xml' },
  { value: 'csv', label: '.csv' },
  { value: 'txt', label: '.txt' },
  { value: 'xlsx', label: '.xlsx' },
];

const ACAO_OPCOES = [
  { value: 'mover', label: 'Mover arquivo' },
  { value: 'renomear', label: 'Renomear arquivo' },
  { value: 'organizar_arquivo', label: 'Organizar arquivo' },
  { value: 'upload_folha', label: 'Upload folha (.xlsx em Folha/YYYY-MM)' },
  { value: 'abertura_empresa', label: 'Criar estrutura de empresa' },
];

/** Campos e labels que mudam conforme a ação selecionada. */
const SCHEMA_ACAO = {
  mover: {
    pastaOrigem: { visivel: true, obrigatorio: true, label: 'Pasta origem', placeholder: 'Ex: C:\\Docs\\Entrada' },
    pastaDestino: {
      visivel: true,
      obrigatorio: true,
      label: 'Pasta destino',
      placeholder: 'Ex: C:\\Docs\\Processados',
    },
    empresaPropria: { visivel: false },
    nomeEmpresa: { visivel: false },
    criteriosCondicao: true,
  },
  renomear: {
    pastaOrigem: { visivel: true, obrigatorio: true, label: 'Pasta origem', placeholder: 'Ex: C:\\Docs\\Entrada' },
    pastaDestino: { visivel: false, obrigatorio: false },
    empresaPropria: { visivel: false },
    nomeEmpresa: { visivel: false },
    criteriosCondicao: true,
  },
  organizar_arquivo: {
    pastaOrigem: {
      visivel: true,
      obrigatorio: true,
      label: 'Pasta de entrada',
      placeholder: 'Ex: C:\\Souza_Contabilidade\\ENTRADA',
    },
    pastaDestino: {
      visivel: true,
      obrigatorio: true,
      label: 'Base de clientes (CLIENTES\\ATIVO)',
      placeholder: 'Ex: C:\\Souza_Contabilidade\\CLIENTES\\ATIVO',
      ajuda: 'A empresa e a subpasta do tipo são resolvidas pelo nome/classificação do arquivo.',
    },
    empresaPropria: {
      visivel: true,
      label: 'Empresa do escritório (opcional)',
      placeholder: 'Ex: Souza Contabilidade',
      ajuda: 'Se o nome do arquivo contiver este texto, o arquivo vai para a pasta dessa empresa.',
    },
    nomeEmpresa: { visivel: false },
    criteriosCondicao: true,
  },
  upload_folha: {
    pastaOrigem: {
      visivel: true,
      obrigatorio: true,
      label: 'Pasta origem (Folha/YYYY-MM)',
      placeholder: 'Ex: C:\\Docs\\Folha\\2026-07',
    },
    pastaDestino: {
      visivel: true,
      obrigatorio: false,
      label: 'Arquivar após sucesso (opcional)',
      placeholder: 'Vazio = subpasta enviados/',
    },
    empresaPropria: { visivel: false },
    nomeEmpresa: { visivel: false },
    criteriosCondicao: true,
  },
  abertura_empresa: {
    pastaOrigem: { visivel: false, obrigatorio: false },
    pastaDestino: {
      visivel: true,
      obrigatorio: true,
      label: 'Pasta base (CLIENTES\\ATIVO)',
      placeholder: 'Ex: C:\\Souza_Contabilidade\\CLIENTES\\ATIVO',
    },
    empresaPropria: { visivel: false },
    nomeEmpresa: {
      visivel: true,
      obrigatorio: true,
      label: 'Nome da empresa',
      placeholder: 'Ex: Padaria do João',
    },
    criteriosCondicao: false,
  },
};

function obterSchemaAcao(acao) {
  return SCHEMA_ACAO[acao] || SCHEMA_ACAO.mover;
}

const TIPO_DOCUMENTO_LABELS = TIPO_DOCUMENTO_OPCOES.reduce((acc, opcao) => {
  if (opcao.value) {
    acc[opcao.value] = opcao.label;
  }

  return acc;
}, {});

const ACAO_LABELS = ACAO_OPCOES.reduce((acc, opcao) => {
  acc[opcao.value] = opcao.label;
  return acc;
}, {});

function obterExtensaoOpcoes(tipo) {
  if (tipo === TIPO_FOLHA_PAGAMENTO) {
    return EXTENSAO_OPCOES.filter((opcao) => opcao.value === EXTENSAO_FOLHA_PAGAMENTO);
  }

  return [{ value: '', label: 'Qualquer extensão' }, ...EXTENSAO_OPCOES];
}

const FORM_INICIAL = {
  pasta_origem: '',
  pasta_destino: '',
  condicao_in_name: '',
  condicao_extensao: 'pdf',
  condicao_tipo: '',
  condicao_tamanho_min: '',
  condicao_tamanho_max: '',
  condicao_criado_em_depois: '',
  condicao_criado_em_antes: '',
  condicao_recebido_em_depois: '',
  condicao_recebido_em_antes: '',
  condicao_empresa_propria: '',
  condicao_nome_empresa: '',
  acao: ACAO_OPCOES[0].value,
  ativa: true,
};

function obterMensagemErro(error, fallback = 'Não foi possível processar sua solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function removerPontoExtensao(valor) {
  return String(valor || '')
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase();
}

function normalizarCondicao(condicao) {
  if (condicao && typeof condicao === 'object' && !Array.isArray(condicao)) {
    return condicao;
  }

  return {};
}

function valorParaCampo(valor) {
  if (valor === undefined || valor === null) {
    return '';
  }

  return String(valor);
}

function dataParaCampo(valor) {
  return valorParaCampo(valor).split('T')[0];
}

function campoPreenchido(valor) {
  return valor !== undefined && valor !== null && valor !== '';
}

function formatarDataCondicao(valor) {
  const [data] = String(valor || '').split('T');
  const [ano, mes, dia] = data.split('-');

  if (!ano || !mes || !dia) {
    return String(valor || '');
  }

  return `${dia}/${mes}/${ano}`;
}

function formatarBytes(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return String(valor);
  }

  if (numero < 1024) {
    return `${numero} B`;
  }

  if (numero < 1024 * 1024) {
    return `${(numero / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
  }

  return `${(numero / (1024 * 1024)).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} MB`;
}

function formatarCondicao(condicao) {
  const condicaoNormalizada = normalizarCondicao(condicao);
  const partes = [];

  if (condicaoNormalizada.in_name) {
    partes.push(`Nome contém "${condicaoNormalizada.in_name}"`);
  }

  if (condicaoNormalizada.extensao) {
    partes.push(`Extensão .${removerPontoExtensao(condicaoNormalizada.extensao)}`);
  }

  if (condicaoNormalizada.tipo) {
    partes.push(
      `Tipo ${TIPO_DOCUMENTO_LABELS[condicaoNormalizada.tipo] || condicaoNormalizada.tipo}`,
    );
  }

  if (condicaoNormalizada.tamanho) {
    if (campoPreenchido(condicaoNormalizada.tamanho.min)) {
      partes.push(`Tamanho >= ${formatarBytes(condicaoNormalizada.tamanho.min)}`);
    }

    if (campoPreenchido(condicaoNormalizada.tamanho.max)) {
      partes.push(`Tamanho <= ${formatarBytes(condicaoNormalizada.tamanho.max)}`);
    }
  }

  if (condicaoNormalizada.criado_em) {
    if (condicaoNormalizada.criado_em.depois) {
      partes.push(`Criado depois de ${formatarDataCondicao(condicaoNormalizada.criado_em.depois)}`);
    }

    if (condicaoNormalizada.criado_em.antes) {
      partes.push(`Criado antes de ${formatarDataCondicao(condicaoNormalizada.criado_em.antes)}`);
    }
  }

  if (condicaoNormalizada.recebido_em) {
    if (condicaoNormalizada.recebido_em.depois) {
      partes.push(
        `Recebido depois de ${formatarDataCondicao(condicaoNormalizada.recebido_em.depois)}`,
      );
    }

    if (condicaoNormalizada.recebido_em.antes) {
      partes.push(
        `Recebido antes de ${formatarDataCondicao(condicaoNormalizada.recebido_em.antes)}`,
      );
    }
  }

  if (condicaoNormalizada.empresa_propria) {
    partes.push(`Empresa própria "${condicaoNormalizada.empresa_propria}"`);
  }

  if (condicaoNormalizada.nome_empresa) {
    partes.push(`Empresa "${condicaoNormalizada.nome_empresa}"`);
  }

  return partes.length > 0 ? partes.join('; ') : 'Sem filtros';
}

function formatarAcao(acao) {
  if (!acao) {
    return '-';
  }

  return ACAO_LABELS[acao] || `${acao.charAt(0).toUpperCase()}${acao.slice(1)}`;
}

function regraParaFormulario(regra) {
  const condicao = normalizarCondicao(regra?.condicao);
  const tipo = valorParaCampo(condicao.tipo);
  const extensao =
    tipo === TIPO_FOLHA_PAGAMENTO
      ? EXTENSAO_FOLHA_PAGAMENTO
      : valorParaCampo(condicao.extensao ? removerPontoExtensao(condicao.extensao) : '');

  return {
    pasta_origem: regra?.pasta_origem || '',
    pasta_destino: regra?.pasta_destino || '',
    condicao_in_name: valorParaCampo(condicao.in_name),
    condicao_extensao: extensao,
    condicao_tipo: tipo,
    condicao_tamanho_min: valorParaCampo(condicao.tamanho?.min),
    condicao_tamanho_max: valorParaCampo(condicao.tamanho?.max),
    condicao_criado_em_depois: dataParaCampo(condicao.criado_em?.depois),
    condicao_criado_em_antes: dataParaCampo(condicao.criado_em?.antes),
    condicao_recebido_em_depois: dataParaCampo(condicao.recebido_em?.depois),
    condicao_recebido_em_antes: dataParaCampo(condicao.recebido_em?.antes),
    condicao_empresa_propria: valorParaCampo(condicao.empresa_propria),
    condicao_nome_empresa: valorParaCampo(condicao.nome_empresa),
    acao: regra?.acao || ACAO_OPCOES[0].value,
    ativa: Boolean(regra?.ativa),
  };
}

function validarNumeroInteiroNaoNegativo(valor, label) {
  const texto = String(valor || '').trim();

  if (!texto) {
    return { valor: undefined };
  }

  const numero = Number(texto);

  if (!Number.isInteger(numero) || numero < 0) {
    return { erro: `${label} deve ser um número inteiro maior ou igual a zero.` };
  }

  return { valor: numero };
}

function montarCondicaoFormulario(formData) {
  const condicao = {};
  const inName = formData.condicao_in_name.trim();
  const tipo = formData.condicao_tipo.trim();
  const extensao =
    tipo === TIPO_FOLHA_PAGAMENTO
      ? EXTENSAO_FOLHA_PAGAMENTO
      : removerPontoExtensao(formData.condicao_extensao);
  const tamanhoMin = validarNumeroInteiroNaoNegativo(
    formData.condicao_tamanho_min,
    'Tamanho mínimo',
  );
  const tamanhoMax = validarNumeroInteiroNaoNegativo(
    formData.condicao_tamanho_max,
    'Tamanho máximo',
  );

  if (tamanhoMin.erro) {
    return { erro: tamanhoMin.erro };
  }

  if (tamanhoMax.erro) {
    return { erro: tamanhoMax.erro };
  }

  if (
    tamanhoMin.valor !== undefined &&
    tamanhoMax.valor !== undefined &&
    tamanhoMin.valor > tamanhoMax.valor
  ) {
    return { erro: 'Tamanho mínimo não pode ser maior que o tamanho máximo.' };
  }

  if (
    formData.condicao_criado_em_depois &&
    formData.condicao_criado_em_antes &&
    formData.condicao_criado_em_depois > formData.condicao_criado_em_antes
  ) {
    return { erro: 'Data inicial de criação não pode ser depois da data final.' };
  }

  if (
    formData.condicao_recebido_em_depois &&
    formData.condicao_recebido_em_antes &&
    formData.condicao_recebido_em_depois > formData.condicao_recebido_em_antes
  ) {
    return { erro: 'Data inicial de recebimento não pode ser depois da data final.' };
  }

  if (inName) {
    condicao.in_name = inName;
  }

  if (extensao) {
    condicao.extensao = extensao;
  }

  if (tipo) {
    condicao.tipo = tipo;
  }

  if (tamanhoMin.valor !== undefined || tamanhoMax.valor !== undefined) {
    condicao.tamanho = {};

    if (tamanhoMin.valor !== undefined) {
      condicao.tamanho.min = tamanhoMin.valor;
    }

    if (tamanhoMax.valor !== undefined) {
      condicao.tamanho.max = tamanhoMax.valor;
    }
  }

  if (formData.condicao_criado_em_depois || formData.condicao_criado_em_antes) {
    condicao.criado_em = {};

    if (formData.condicao_criado_em_depois) {
      condicao.criado_em.depois = formData.condicao_criado_em_depois;
    }

    if (formData.condicao_criado_em_antes) {
      condicao.criado_em.antes = formData.condicao_criado_em_antes;
    }
  }

  if (formData.condicao_recebido_em_depois || formData.condicao_recebido_em_antes) {
    condicao.recebido_em = {};

    if (formData.condicao_recebido_em_depois) {
      condicao.recebido_em.depois = formData.condicao_recebido_em_depois;
    }

    if (formData.condicao_recebido_em_antes) {
      condicao.recebido_em.antes = formData.condicao_recebido_em_antes;
    }
  }

  const empresaPropria = formData.condicao_empresa_propria?.trim();
  if (empresaPropria) {
    condicao.empresa_propria = empresaPropria;
  }

  const nomeEmpresa = formData.condicao_nome_empresa?.trim();
  if (nomeEmpresa) {
    condicao.nome_empresa = nomeEmpresa;
  }

  return { condicao };
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function Regras() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [regras, setRegras] = useState([]);
  const [isLoadingRegras, setIsLoadingRegras] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [isFormModalAberto, setIsFormModalAberto] = useState(false);
  const [modoFormulario, setModoFormulario] = useState('criar');
  const [regraEditandoId, setRegraEditandoId] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [erroFormulario, setErroFormulario] = useState('');
  const [isSavingFormulario, setIsSavingFormulario] = useState(false);

  const [regraParaDeletar, setRegraParaDeletar] = useState(null);
  const [isDeleteModalAberto, setIsDeleteModalAberto] = useState(false);
  const [erroDelete, setErroDelete] = useState('');
  const [isDeletingRegra, setIsDeletingRegra] = useState(false);

  const [statusEmAtualizacao, setStatusEmAtualizacao] = useState({});

  const podeGerenciarRegras = PERFIS_AUTORIZADOS.has(user?.perfil);
  const clienteIdAdminGlobal =
    user?.perfil === 'admin_efficience' ? user?.cliente_id || null : null;
  const requerClienteId = user?.perfil === 'admin_efficience' && !clienteIdAdminGlobal;
  const extensaoOpcoesFormulario = obterExtensaoOpcoes(formData.condicao_tipo);
  const extensaoRestritaFolha = formData.condicao_tipo === TIPO_FOLHA_PAGAMENTO;
  const schemaAcao = obterSchemaAcao(formData.acao);

  const carregarRegras = useCallback(async () => {
    if (requerClienteId) {
      setIsLoadingRegras(false);
      setRegras([]);
      setErroLista(
        'Seu usuário admin_efficience não possui cliente_id no token. Use um admin_cliente para configurar regras.',
      );
      return;
    }

    setIsLoadingRegras(true);
    setErroLista('');

    try {
      const data = await listarRegras({ clienteId: clienteIdAdminGlobal || undefined });
      setRegras(Array.isArray(data) ? data : []);
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Não foi possível carregar as regras.'));
    } finally {
      setIsLoadingRegras(false);
    }
  }, [clienteIdAdminGlobal, requerClienteId]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && podeGerenciarRegras) {
      carregarRegras();
    }
  }, [carregarRegras, isAuthenticated, isLoading, podeGerenciarRegras]);

  useEffect(() => {
    if (
      formData.condicao_tipo === TIPO_FOLHA_PAGAMENTO &&
      formData.condicao_extensao !== EXTENSAO_FOLHA_PAGAMENTO
    ) {
      setFormData((currentValue) => {
        if (
          currentValue.condicao_tipo !== TIPO_FOLHA_PAGAMENTO ||
          currentValue.condicao_extensao === EXTENSAO_FOLHA_PAGAMENTO
        ) {
          return currentValue;
        }

        return {
          ...currentValue,
          condicao_extensao: EXTENSAO_FOLHA_PAGAMENTO,
        };
      });
    }
  }, [formData.condicao_extensao, formData.condicao_tipo]);

  function abrirModalCriacao() {
    setModoFormulario('criar');
    setRegraEditandoId(null);
    setFormData(FORM_INICIAL);
    setErroFormulario('');
    setIsFormModalAberto(true);
  }

  function abrirModalEdicao(regra) {
    setModoFormulario('editar');
    setRegraEditandoId(regra.id);
    setFormData(regraParaFormulario(regra));
    setErroFormulario('');
    setIsFormModalAberto(true);
  }

  function fecharModalFormulario() {
    if (isSavingFormulario) {
      return;
    }

    setIsFormModalAberto(false);
    setErroFormulario('');
  }

  function handleFormChange(event) {
    const { name, value, type, checked } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;

    setFormData((currentValue) => ({
      ...currentValue,
      [name]: nextValue,
      ...(name === 'condicao_tipo' && nextValue === TIPO_FOLHA_PAGAMENTO
        ? { condicao_extensao: EXTENSAO_FOLHA_PAGAMENTO }
        : {}),
      ...(name === 'condicao_extensao' && currentValue.condicao_tipo === TIPO_FOLHA_PAGAMENTO
        ? { condicao_extensao: EXTENSAO_FOLHA_PAGAMENTO }
        : {}),
    }));
  }

  async function handleSubmitFormulario(event) {
    event.preventDefault();

    const schema = obterSchemaAcao(formData.acao);
    const pastaOrigem = formData.pasta_origem.trim();
    const pastaDestino = formData.pasta_destino.trim();

    if (!formData.acao) {
      setErroFormulario('Selecione uma ação.');
      return;
    }

    if (schema.pastaOrigem.obrigatorio && !pastaOrigem) {
      setErroFormulario(`Preencha ${schema.pastaOrigem.label.toLowerCase()}.`);
      return;
    }

    if (schema.pastaDestino.obrigatorio && !pastaDestino) {
      setErroFormulario(`Preencha ${schema.pastaDestino.label.toLowerCase()}.`);
      return;
    }

    if (schema.nomeEmpresa?.obrigatorio && !formData.condicao_nome_empresa.trim()) {
      setErroFormulario('Informe o nome da empresa.');
      return;
    }

    const { condicao, erro } = montarCondicaoFormulario(formData);

    if (erro) {
      setErroFormulario(erro);
      return;
    }

    // Campos específicos de ação: limpa o que não se aplica
    if (!schema.empresaPropria?.visivel) {
      delete condicao.empresa_propria;
    }
    if (!schema.nomeEmpresa?.visivel) {
      delete condicao.nome_empresa;
    }
    if (!schema.criteriosCondicao) {
      delete condicao.in_name;
      delete condicao.extensao;
      delete condicao.tipo;
      delete condicao.tamanho;
      delete condicao.criado_em;
      delete condicao.recebido_em;
    }

    setIsSavingFormulario(true);
    setErroFormulario('');

    const payload = {
      pasta_origem: schema.pastaOrigem.visivel ? pastaOrigem : pastaOrigem || '',
      pasta_destino: schema.pastaDestino.visivel ? pastaDestino : '',
      condicao,
      acao: formData.acao,
      ativa: Boolean(formData.ativa),
    };

    // abertura_empresa não usa pasta_origem no formulário — espelha a base para a regra existir no agente
    if (formData.acao === 'abertura_empresa' && !payload.pasta_origem) {
      payload.pasta_origem = payload.pasta_destino;
    }

    try {
      if (modoFormulario === 'criar') {
        const criada = await criarRegra(payload, {
          clienteId: clienteIdAdminGlobal || undefined,
        });

        setRegras((currentValue) => [criada, ...currentValue]);
      } else {
        const atualizada = await atualizarRegra(regraEditandoId, payload, {
          clienteId: clienteIdAdminGlobal || undefined,
        });

        setRegras((currentValue) =>
          currentValue.map((item) => (item.id === atualizada.id ? atualizada : item)),
        );
      }

      setIsFormModalAberto(false);
      setRegraEditandoId(null);
      setFormData(FORM_INICIAL);
    } catch (error) {
      setErroFormulario(obterMensagemErro(error));
    } finally {
      setIsSavingFormulario(false);
    }
  }

  async function handleToggleAtiva(regra) {
    if (!regra?.id) {
      return;
    }

    setStatusEmAtualizacao((currentValue) => ({
      ...currentValue,
      [regra.id]: true,
    }));

    try {
      const atualizada = await atualizarRegra(
        regra.id,
        { ativa: !regra.ativa },
        { clienteId: clienteIdAdminGlobal || undefined },
      );

      setRegras((currentValue) =>
        currentValue.map((item) => (item.id === atualizada.id ? atualizada : item)),
      );
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Não foi possível atualizar o status da regra.'));
    } finally {
      setStatusEmAtualizacao((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[regra.id];
        return nextValue;
      });
    }
  }

  function abrirModalDelete(regra) {
    setRegraParaDeletar(regra);
    setErroDelete('');
    setIsDeleteModalAberto(true);
  }

  function fecharModalDelete() {
    if (isDeletingRegra) {
      return;
    }

    setIsDeleteModalAberto(false);
    setRegraParaDeletar(null);
    setErroDelete('');
  }

  async function confirmarDeleteRegra() {
    if (!regraParaDeletar?.id) {
      return;
    }

    setIsDeletingRegra(true);
    setErroDelete('');

    try {
      await deletarRegra(regraParaDeletar.id, {
        clienteId: clienteIdAdminGlobal || undefined,
      });

      setRegras((currentValue) =>
        currentValue.filter((item) => item.id !== regraParaDeletar.id),
      );
      setIsDeleteModalAberto(false);
      setRegraParaDeletar(null);
    } catch (error) {
      setErroDelete(obterMensagemErro(error, 'Não foi possível deletar a regra.'));
    } finally {
      setIsDeletingRegra(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!podeGerenciarRegras) {
    return (
      <main className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-900">Regras de automação</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Apenas administradores podem visualizar esta área.
          </p>
        </header>
      </main>
    );
  }

  return (
    <>
      <main className="space-y-6 p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Regras de automação</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Configure as regras que o agente deve aplicar nos arquivos monitorados.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={abrirModalCriacao}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Nova regra
            </button>

            <button
              type="button"
              onClick={carregarRegras}
              disabled={isLoadingRegras}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingRegras ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </header>

        {erroLista ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroLista}</p>
          </section>
        ) : null}

        {!erroLista && isLoadingRegras ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando regras...</span>
            </div>
          </section>
        ) : null}

        {!erroLista && !isLoadingRegras && regras.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Nenhuma regra cadastrada para este cliente.</p>
          </section>
        ) : null}

        {!erroLista && !isLoadingRegras && regras.length > 0 ? (
          <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-[1040px] divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Pasta origem</th>
                  <th className="px-4 py-3">Pasta destino</th>
                  <th className="px-4 py-3">Condição</th>
                  <th className="px-4 py-3">Ação</th>
                  <th className="px-4 py-3">Status ativa</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {regras.map((regra) => {
                  const atualizandoStatus = Boolean(statusEmAtualizacao[regra.id]);

                  return (
                    <tr key={regra.id || `${regra.pasta_origem}-${regra.pasta_destino}`}>
                      <td className="max-w-[220px] break-all px-4 py-3 font-medium text-zinc-900">
                        {regra.pasta_origem || '-'}
                      </td>
                      <td className="max-w-[220px] break-all px-4 py-3 text-zinc-700">
                        {regra.pasta_destino || '-'}
                      </td>
                      <td className="max-w-[360px] px-4 py-3 text-zinc-700">
                        {formatarCondicao(regra.condicao)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                        {formatarAcao(regra.acao)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleAtiva(regra)}
                          disabled={atualizandoStatus}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            regra.ativa
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                          }`}
                        >
                          {atualizandoStatus ? 'Salvando...' : regra.ativa ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirModalEdicao(regra)}
                            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirModalDelete(regra)}
                            className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                          >
                            Deletar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>

      {isFormModalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {modoFormulario === 'criar' ? 'Nova regra' : 'Editar regra'}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Defina origem, destino, condição, ação e status da regra.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalFormulario}
                disabled={isSavingFormulario}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Fechar modal"
              >
                X
              </button>
            </header>

            <form className="space-y-5 overflow-y-auto p-5" onSubmit={handleSubmitFormulario}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="acao" className="block text-sm font-medium text-zinc-700">
                    Ação
                  </label>
                  <select
                    id="acao"
                    name="acao"
                    value={formData.acao}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    {ACAO_OPCOES.map((opcao) => (
                      <option key={opcao.value} value={opcao.value}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                </div>

                {schemaAcao.pastaOrigem.visivel ? (
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="pasta_origem" className="block text-sm font-medium text-zinc-700">
                      {schemaAcao.pastaOrigem.label}
                    </label>
                    <input
                      id="pasta_origem"
                      name="pasta_origem"
                      value={formData.pasta_origem}
                      onChange={handleFormChange}
                      placeholder={schemaAcao.pastaOrigem.placeholder}
                      disabled={isSavingFormulario}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                      required={Boolean(schemaAcao.pastaOrigem.obrigatorio)}
                    />
                  </div>
                ) : null}

                {schemaAcao.pastaDestino.visivel ? (
                  <div className="space-y-2 sm:col-span-2">
                    <label htmlFor="pasta_destino" className="block text-sm font-medium text-zinc-700">
                      {schemaAcao.pastaDestino.label}
                    </label>
                    <input
                      id="pasta_destino"
                      name="pasta_destino"
                      value={formData.pasta_destino}
                      onChange={handleFormChange}
                      placeholder={schemaAcao.pastaDestino.placeholder}
                      disabled={isSavingFormulario}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                      required={Boolean(schemaAcao.pastaDestino.obrigatorio)}
                    />
                    {schemaAcao.pastaDestino.ajuda ? (
                      <p className="text-xs text-zinc-500">{schemaAcao.pastaDestino.ajuda}</p>
                    ) : null}
                  </div>
                ) : null}

                {schemaAcao.nomeEmpresa?.visivel ? (
                  <div className="space-y-2 sm:col-span-2">
                    <label
                      htmlFor="condicao_nome_empresa"
                      className="block text-sm font-medium text-zinc-700"
                    >
                      {schemaAcao.nomeEmpresa.label}
                    </label>
                    <input
                      id="condicao_nome_empresa"
                      name="condicao_nome_empresa"
                      value={formData.condicao_nome_empresa}
                      onChange={handleFormChange}
                      placeholder={schemaAcao.nomeEmpresa.placeholder}
                      disabled={isSavingFormulario}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                      required={Boolean(schemaAcao.nomeEmpresa.obrigatorio)}
                    />
                  </div>
                ) : null}

                {schemaAcao.empresaPropria?.visivel ? (
                  <div className="space-y-2 sm:col-span-2">
                    <label
                      htmlFor="condicao_empresa_propria"
                      className="block text-sm font-medium text-zinc-700"
                    >
                      {schemaAcao.empresaPropria.label}
                    </label>
                    <input
                      id="condicao_empresa_propria"
                      name="condicao_empresa_propria"
                      value={formData.condicao_empresa_propria}
                      onChange={handleFormChange}
                      placeholder={schemaAcao.empresaPropria.placeholder}
                      disabled={isSavingFormulario}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {schemaAcao.empresaPropria.ajuda ? (
                      <p className="text-xs text-zinc-500">{schemaAcao.empresaPropria.ajuda}</p>
                    ) : null}
                  </div>
                ) : null}

                {schemaAcao.criteriosCondicao ? (
                  <>
                <div className="space-y-2 sm:col-span-2">
                  <h3 className="text-sm font-semibold text-zinc-900">Critérios de condição</h3>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_in_name"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Nome contém
                  </label>
                  <input
                    id="condicao_in_name"
                    name="condicao_in_name"
                    value={formData.condicao_in_name}
                    onChange={handleFormChange}
                    placeholder="Ex: FOLHA"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_extensao"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Extensão
                  </label>
                  <select
                    id="condicao_extensao"
                    name="condicao_extensao"
                    value={
                      extensaoRestritaFolha
                        ? EXTENSAO_FOLHA_PAGAMENTO
                        : formData.condicao_extensao
                    }
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {extensaoOpcoesFormulario.map((opcao) => (
                      <option key={opcao.value} value={opcao.value}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_tipo"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Tipo
                  </label>
                  <select
                    id="condicao_tipo"
                    name="condicao_tipo"
                    value={formData.condicao_tipo}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {TIPO_DOCUMENTO_OPCOES.map((opcao) => (
                      <option key={opcao.value || 'qualquer'} value={opcao.value}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_tamanho_min"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Tamanho mínimo (bytes)
                  </label>
                  <input
                    id="condicao_tamanho_min"
                    name="condicao_tamanho_min"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.condicao_tamanho_min}
                    onChange={handleFormChange}
                    placeholder="Ex: 0"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_tamanho_max"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Tamanho máximo (bytes)
                  </label>
                  <input
                    id="condicao_tamanho_max"
                    name="condicao_tamanho_max"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.condicao_tamanho_max}
                    onChange={handleFormChange}
                    placeholder="Ex: 5000000"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_criado_em_depois"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Criado depois de
                  </label>
                  <input
                    id="condicao_criado_em_depois"
                    name="condicao_criado_em_depois"
                    type="date"
                    value={formData.condicao_criado_em_depois}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_criado_em_antes"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Criado antes de
                  </label>
                  <input
                    id="condicao_criado_em_antes"
                    name="condicao_criado_em_antes"
                    type="date"
                    value={formData.condicao_criado_em_antes}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_recebido_em_depois"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Recebido depois de
                  </label>
                  <input
                    id="condicao_recebido_em_depois"
                    name="condicao_recebido_em_depois"
                    type="date"
                    value={formData.condicao_recebido_em_depois}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="condicao_recebido_em_antes"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Recebido antes de
                  </label>
                  <input
                    id="condicao_recebido_em_antes"
                    name="condicao_recebido_em_antes"
                    type="date"
                    value={formData.condicao_recebido_em_antes}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                  </>
                ) : null}

                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name="ativa"
                      checked={Boolean(formData.ativa)}
                      onChange={handleFormChange}
                      disabled={isSavingFormulario}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                    />
                    Regra ativa
                  </label>
                </div>
              </div>

              {erroFormulario ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {erroFormulario}
                </p>
              ) : null}

              <footer className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={fecharModalFormulario}
                  disabled={isSavingFormulario}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSavingFormulario}
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingFormulario ? <Spinner /> : null}
                  {isSavingFormulario
                    ? 'Salvando...'
                    : modoFormulario === 'criar'
                      ? 'Criar regra'
                      : 'Salvar alterações'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {isDeleteModalAberto && regraParaDeletar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Confirmar exclusão</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Deseja realmente deletar esta regra?
            </p>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              {regraParaDeletar.pasta_origem || '-'} {'->'} {regraParaDeletar.pasta_destino || '-'}
            </p>

            {erroDelete ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {erroDelete}
              </p>
            ) : null}

            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={fecharModalDelete}
                disabled={isDeletingRegra}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarDeleteRegra}
                disabled={isDeletingRegra}
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingRegra ? <Spinner /> : null}
                {isDeletingRegra ? 'Deletando...' : 'Deletar regra'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
