'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { listarClientes } from '../../../../services/clientes.service';
import {
  aprovarEventoEsocial,
  baixarXmlEventoEsocial,
  buscarEventoEsocial,
  criarEventoEsocial,
  listarEventosEsocial,
  listarFuncionarios,
} from '../../../../services/esocial.service';
import {
  CATALOGO_ESOCIAL,
  EVENTOS_POR_GRUPO,
  STATUS_EVENTO_META,
} from '../../../../lib/esocial-catalogo';
import {
  CATEGORIAS_ESTATUTARIAS,
  CATEGORIAS_S2200,
  ESTADO_CIVIL,
  GRAU_INSTRUCAO,
  IND_ADMISSAO,
  IND_APRENDIZ,
  MOTIVOS_AFASTAMENTO,
  MOTIVOS_DESLIGAMENTO,
  NAT_ATIVIDADE,
  PAISES,
  RACA_COR,
  SEXO,
  SIM_NAO,
  TP_ADMISSAO,
  TP_CONTRATO,
  TP_DEPENDENTE,
  TP_INSC,
  TP_JORNADA,
  TP_PLANO_RP,
  TP_PROVIMENTO,
  TP_REG_JOR,
  TP_REG_PREV,
  TP_REG_TRAB,
  TMP_PARCIAL,
  UFS,
  UNIDADE_SALARIO,
  parseValorMonetario,
  validarCpf,
  validarDataCivil,
} from '../../../../lib/esocial-tabelas';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';
const TIPO_REFERENCIA = 'S-2200';

// ---------------------------------------------------------------------------
// Helpers (mesmo vocabulário de fiscal/apuracao/page.jsx)
// ---------------------------------------------------------------------------

function obterMensagemErro(error, fallback = 'Não foi possível processar a solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function obterCodigoErro(error) {
  return error?.response?.data?.codigo || null;
}

function obterCamposFaltando(error) {
  const campos = error?.response?.data?.camposFaltando;
  return Array.isArray(campos) ? campos : [];
}

function normalizarClientes(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.clientes)) return payload.clientes;
  return [];
}

function normalizarLista(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}

function obterIdCliente(cliente) {
  return cliente?.id || cliente?.cliente_id || cliente?.clienteId || '';
}

function obterNomeCliente(cliente) {
  return cliente?.nome || cliente?.razao_social || cliente?.email || obterIdCliente(cliente);
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Skeleton do formulário — o shape aninhado é o que gerarXmlS2200(funcionario,
// dadosAdmissao) espera (ver JSDoc em backend/src/utils/esocial-xml.util.js).
function formInicial() {
  return {
    funcionario: {
      cpf: '',
      nome: '',
      sexo: '',
      racaCor: '',
      grauInstr: '',
      dataNascimento: '',
      nomeSocial: '',
      estadoCivil: '',
      paisNascimento: '105',
      paisNacionalidade: '105',
      naturalidade: { codMunicipio: '', uf: '' },
      endereco: {
        tipoLogradouro: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cep: '',
        codMunicipio: '',
        uf: '',
      },
      contato: { telefone: '', email: '' },
      dependentes: [],
    },
    dadosAdmissao: {
      empregador: { tpInsc: '1', nrInsc: '' },
      matricula: '',
      codCateg: '',
      dataAdmissao: '',
      tpRegTrab: '1',
      tpRegPrev: '1',
      cadIni: 'N',
      // celetista
      tpAdmissao: '1',
      indAdmissao: '',
      tpRegJor: '',
      natAtividade: '',
      dtBase: '',
      cnpjSindCategProf: '',
      fgts: { dataOpcao: '' },
      aprendiz: { indAprend: '', cnpjEntQual: '', tpInsc: '', nrInsc: '', cnpjPrat: '' },
      // estatutário
      estatutario: {
        tpProv: '',
        dataExercicio: '',
        indTetoRGPS: '',
        tpPlanRP: '',
        indAbonoPerm: '',
        dataInicioAbono: '',
      },
      // infoContrato
      cargo: { nome: '', cbo: '', dataIngresso: '' },
      funcao: { nome: '', cbo: '' },
      remuneracao: { valorSalarioFixo: '', unidadeSalarioFixo: '5', descricaoSalarioVariavel: '' },
      duracao: { tpContr: '1', dataTermino: '', clausulaAssecuratoria: '', objetoDeterminante: '' },
      localTrabalho: { tpInsc: '1', nrInsc: '', descricaoComplementar: '' },
      horContratual: {
        qtdHrsSem: '',
        tpJornada: '',
        tmpParc: '0',
        horarioNoturno: 'N',
        descricaoJornada: '',
      },
      observacoesContrato: '',
      afastamento: { dataInicio: '', codMotivo: '' },
      desligamento: { data: '', motivo: '' },
    },
    // toggles de grupos opcionais (não vão no payload)
    incluiFuncao: false,
    incluiAprendiz: false,
    incluiFgts: false,
    incluiContato: false,
    incluiAfastamento: false,
    incluiDesligamento: false,
  };
}

function limparVazios(objeto) {
  const saida = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor === '' || valor === null || valor === undefined) continue;
    saida[chave] = valor;
  }
  return Object.keys(saida).length ? saida : undefined;
}

// Constrói { funcionario, dadosAdmissao } removendo os grupos opcionais que o
// usuário não preencheu — o gerador chama exigir() em qualquer sub-objeto
// truthy, então mandar { dataInicio:'' } quebraria a geração.
function montarPayload(form) {
  const f = form.funcionario;
  const a = form.dadosAdmissao;
  const estatutaria = CATEGORIAS_ESTATUTARIAS.has(a.codCateg);

  const funcionario = {
    cpf: f.cpf,
    nome: f.nome,
    sexo: f.sexo,
    racaCor: f.racaCor,
    grauInstr: f.grauInstr,
    dataNascimento: f.dataNascimento,
    nomeSocial: f.nomeSocial || undefined,
    estadoCivil: f.estadoCivil || undefined,
    paisNascimento: f.paisNascimento || '105',
    paisNacionalidade: f.paisNacionalidade || '105',
    naturalidade: limparVazios(f.naturalidade),
    endereco: limparVazios(f.endereco),
  };

  const contato = form.incluiContato ? limparVazios(f.contato) : undefined;
  if (contato) funcionario.contato = contato;

  const dependentes = (f.dependentes || [])
    .map((dep) => limparVazios(dep))
    .filter(Boolean);
  if (dependentes.length) funcionario.dependentes = dependentes;

  const dadosAdmissao = {
    empregador: { tpInsc: a.empregador.tpInsc, nrInsc: a.empregador.nrInsc },
    matricula: a.matricula,
    codCateg: a.codCateg,
    dataAdmissao: a.dataAdmissao,
    tpRegTrab: a.tpRegTrab,
    tpRegPrev: a.tpRegPrev,
    cadIni: a.cadIni,
    cargo: limparVazios(a.cargo),
    remuneracao: limparVazios(a.remuneracao),
    duracao: limparVazios(a.duracao),
    localTrabalho: limparVazios(a.localTrabalho),
    horContratual: limparVazios(a.horContratual),
  };

  if (form.incluiFuncao) {
    const funcao = limparVazios(a.funcao);
    if (funcao) dadosAdmissao.funcao = funcao;
  }

  const observacoes = (a.observacoesContrato || '')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
  if (observacoes.length) dadosAdmissao.observacoesContrato = observacoes;

  if (estatutaria) {
    dadosAdmissao.estatutario = limparVazios(a.estatutario);
  } else {
    dadosAdmissao.tpAdmissao = a.tpAdmissao;
    dadosAdmissao.indAdmissao = a.indAdmissao || undefined;
    dadosAdmissao.tpRegJor = a.tpRegJor;
    dadosAdmissao.natAtividade = a.natAtividade;
    dadosAdmissao.dtBase = a.dtBase || undefined;
    dadosAdmissao.cnpjSindCategProf = a.cnpjSindCategProf || undefined;
    if (form.incluiFgts && a.fgts.dataOpcao) {
      dadosAdmissao.fgts = { dataOpcao: a.fgts.dataOpcao };
    }
    if (form.incluiAprendiz) {
      const aprendiz = limparVazios(a.aprendiz);
      if (aprendiz) dadosAdmissao.aprendiz = aprendiz;
    }
  }

  if (form.incluiAfastamento) {
    const afastamento = limparVazios(a.afastamento);
    if (afastamento) dadosAdmissao.afastamento = afastamento;
  }
  if (form.incluiDesligamento) {
    const desligamento = limparVazios(a.desligamento);
    if (desligamento) dadosAdmissao.desligamento = desligamento;
  }

  return { funcionario, dadosAdmissao };
}

// Validação client-side espelhando as regras de gerarXmlS2200. Devolve um mapa
// { rótulo: mensagem } — usado pra bloquear o botão "Revisar" e listar as
// pendências.
function validarFormulario(form) {
  const erros = {};
  const f = form.funcionario;
  const a = form.dadosAdmissao;

  const exigir = (valor, rotulo) => {
    if (valor === '' || valor === null || valor === undefined) erros[rotulo] = 'Campo obrigatório.';
  };

  // Trabalhador
  if (!f.cpf) erros['CPF'] = 'Campo obrigatório.';
  else if (!validarCpf(f.cpf)) erros['CPF'] = 'CPF inválido (dígitos verificadores não conferem).';
  exigir(f.nome, 'Nome');
  exigir(f.sexo, 'Sexo');
  exigir(f.racaCor, 'Raça/cor');
  exigir(f.grauInstr, 'Grau de instrução');
  if (!f.dataNascimento) erros['Data de nascimento'] = 'Campo obrigatório.';
  else if (!validarDataCivil(f.dataNascimento)) {
    erros['Data de nascimento'] = 'Use dd/mm/aaaa e uma data existente.';
  }

  // Nesta versão o wizard só cobre trabalhador nascido no Brasil — o gerador
  // do S-2200 não emite o grupo de imigrante, e não há campos para isso.
  if ((f.paisNascimento || '105') !== '105') {
    erros['País de nascimento'] =
      'Admissão de trabalhador nascido no exterior ainda não é suportada nesta versão.';
  }
  if (!/^\d{7}$/.test(String(f.naturalidade.codMunicipio || ''))) {
    erros['Naturalidade — código do município'] = 'Informe o código IBGE de 7 dígitos.';
  }
  exigir(f.naturalidade.uf, 'Naturalidade — UF');

  // Endereço
  exigir(f.endereco.logradouro, 'Endereço — logradouro');
  exigir(f.endereco.numero, 'Endereço — número');
  if (!/^\d{8}$/.test(String(f.endereco.cep || ''))) {
    erros['Endereço — CEP'] = 'Informe 8 dígitos.';
  }
  if (!/^\d{7}$/.test(String(f.endereco.codMunicipio || ''))) {
    erros['Endereço — código do município'] = 'Informe o código IBGE de 7 dígitos.';
  }
  exigir(f.endereco.uf, 'Endereço — UF');

  // Contato (opcional, mas valida e-mail se preenchido)
  if (form.incluiContato && f.contato.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contato.email)) {
    erros['Contato — e-mail'] = 'E-mail inválido.';
  }

  // Dependentes
  (f.dependentes || []).forEach((dep, indice) => {
    const prefixo = `Dependente ${indice + 1}`;
    exigir(dep.tipo, `${prefixo} — tipo`);
    exigir(dep.nome, `${prefixo} — nome`);
    if (!dep.dataNascimento || !validarDataCivil(dep.dataNascimento)) {
      erros[`${prefixo} — data de nascimento`] = 'Use dd/mm/aaaa e uma data existente.';
    }
    if (dep.cpf && !validarCpf(dep.cpf)) erros[`${prefixo} — CPF`] = 'CPF inválido.';
    exigir(dep.depIRRF, `${prefixo} — dependente de IRRF`);
    exigir(dep.depSF, `${prefixo} — dependente de salário-família`);
    exigir(dep.incTrab, `${prefixo} — inclusão em contracheque`);
  });

  // Vínculo
  exigir(a.empregador.tpInsc, 'Empregador — tipo de inscrição');
  exigir(a.empregador.nrInsc, 'Empregador — número de inscrição');
  exigir(a.matricula, 'Matrícula');
  if (!a.codCateg) {
    erros['Categoria do trabalhador'] = 'Campo obrigatório.';
  } else if (!CATEGORIAS_S2200.some((c) => c.value === a.codCateg)) {
    erros['Categoria do trabalhador'] = 'Categoria não aceita pelo S-2200.';
  }
  if (!a.dataAdmissao || !validarDataCivil(a.dataAdmissao)) {
    erros['Data de admissão'] = 'Use dd/mm/aaaa e uma data existente.';
  }
  exigir(a.tpRegPrev, 'Regime previdenciário');
  exigir(a.cadIni, 'Cadastramento inicial (cadIni)');

  // tpRegTrab é derivado da categoria (campo read-only na UI); este guard só
  // cobre um estado inconsistente vindo de fora do fluxo normal.
  const estatutaria = CATEGORIAS_ESTATUTARIAS.has(a.codCateg);
  if (a.codCateg && ((estatutaria && a.tpRegTrab !== '2') || (!estatutaria && a.tpRegTrab === '2'))) {
    erros['Regime trabalhista'] = 'Regime trabalhista inconsistente com a categoria selecionada.';
  }

  // infoContrato (sempre obrigatório)
  exigir(a.cargo.nome, 'Cargo — nome');
  exigir(a.cargo.cbo, 'Cargo — CBO');
  const salarioFixo = parseValorMonetario(a.remuneracao.valorSalarioFixo);
  if (!a.remuneracao.valorSalarioFixo || !Number.isFinite(salarioFixo) || salarioFixo <= 0) {
    erros['Remuneração — salário fixo'] = 'Informe um valor válido maior que zero (ex.: 2500,00).';
  }
  exigir(a.remuneracao.unidadeSalarioFixo, 'Remuneração — unidade');
  exigir(a.duracao.tpContr, 'Duração — tipo de contrato');
  if (a.duracao.tpContr === '2' && (!a.duracao.dataTermino || !validarDataCivil(a.duracao.dataTermino))) {
    erros['Duração — data de término'] =
      'Obrigatória para contrato por prazo determinado com data (dd/mm/aaaa).';
  }
  if (a.duracao.tpContr === '3') {
    exigir(a.duracao.objetoDeterminante, 'Duração — objeto determinante');
  }
  exigir(a.localTrabalho.tpInsc, 'Local de trabalho — tipo de inscrição');
  exigir(a.localTrabalho.nrInsc, 'Local de trabalho — número de inscrição');
  exigir(a.horContratual.tpJornada, 'Horário — tipo de jornada');
  exigir(a.horContratual.tmpParc, 'Horário — tempo parcial');
  exigir(a.horContratual.horarioNoturno, 'Horário — trabalho noturno');
  exigir(a.horContratual.descricaoJornada, 'Horário — descrição da jornada');

  // Regime-específico
  if (estatutaria) {
    exigir(a.estatutario.tpProv, 'Estatutário — tipo de provimento');
    if (!a.estatutario.dataExercicio || !validarDataCivil(a.estatutario.dataExercicio)) {
      erros['Estatutário — data de exercício'] = 'Use dd/mm/aaaa e uma data existente.';
    }
    if (a.tpRegPrev === '1') exigir(a.estatutario.indTetoRGPS, 'Estatutário — indicador de teto do RGPS');
  } else {
    exigir(a.tpAdmissao, 'Celetista — tipo de admissão');
    exigir(a.tpRegJor, 'Celetista — regime de jornada');
    exigir(a.natAtividade, 'Celetista — natureza da atividade');
    if (a.dtBase && !(/^\d{1,2}$/.test(String(a.dtBase)) && Number(a.dtBase) >= 1 && Number(a.dtBase) <= 31)) {
      erros['Celetista — dia base (dtBase)'] = 'Informe um dia do mês entre 1 e 31.';
    }
  }

  if (form.incluiFuncao) {
    exigir(a.funcao.nome, 'Função — nome');
    exigir(a.funcao.cbo, 'Função — CBO');
  }
  if (form.incluiAprendiz && !estatutaria) exigir(a.aprendiz.indAprend, 'Aprendiz — indicador');
  if (form.incluiFgts && !estatutaria && a.fgts.dataOpcao && !validarDataCivil(a.fgts.dataOpcao)) {
    erros['FGTS — data de opção'] = 'Use dd/mm/aaaa e uma data existente.';
  }
  if (form.incluiAfastamento) {
    if (!a.afastamento.dataInicio || !validarDataCivil(a.afastamento.dataInicio)) {
      erros['Afastamento — data de início'] = 'Use dd/mm/aaaa e uma data existente.';
    }
    exigir(a.afastamento.codMotivo, 'Afastamento — motivo');
  }
  if (form.incluiDesligamento) {
    if (!a.desligamento.data || !validarDataCivil(a.desligamento.data)) {
      erros['Desligamento — data'] = 'Use dd/mm/aaaa e uma data existente.';
    }
    exigir(a.desligamento.motivo, 'Desligamento — motivo');
  }

  return erros;
}

// ---------------------------------------------------------------------------
// Sub-componentes de campo
// ---------------------------------------------------------------------------

function Campo({ label, value, onChange, obrigatorio, placeholder, type = 'text', className = '' }) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="block text-xs font-medium text-zinc-700">
        {label}
        {obrigatorio ? <span aria-hidden="true" className="text-rose-500"> *</span> : null}
      </span>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
    </label>
  );
}

function CampoSelect({ label, value, onChange, opcoes, obrigatorio, disabled, ajuda, placeholder = 'Selecione', className = '' }) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="block text-xs font-medium text-zinc-700">
        {label}
        {obrigatorio ? <span aria-hidden="true" className="text-rose-500"> *</span> : null}
      </span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(evento) => onChange(evento.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
      >
        <option value="">{placeholder}</option>
        {opcoes.map((opcao) => {
          const val = typeof opcao === 'string' ? opcao : opcao.value;
          const lab = typeof opcao === 'string' ? opcao : opcao.label;
          return (
            <option key={val} value={val}>
              {lab}
            </option>
          );
        })}
      </select>
      {ajuda ? <span className="block text-[11px] text-zinc-400">{ajuda}</span> : null}
    </label>
  );
}

function Fieldset({ titulo, descricao, children }) {
  return (
    <fieldset className="rounded-lg border border-zinc-200 p-4">
      <legend className="px-1 text-sm font-semibold text-zinc-800">{titulo}</legend>
      {descricao ? <p className="mb-3 text-xs text-zinc-500">{descricao}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_EVENTO_META[status] || STATUS_EVENTO_META.rascunho;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.classes}`}>
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function EsocialPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');
  const [clienteId, setClienteId] = useState(null);
  const clienteIdEfetivo = isAdminEfficience ? clienteId : user?.cliente_id || null;

  const [passo, setPasso] = useState(1);
  const [tipoEvento, setTipoEvento] = useState(TIPO_REFERENCIA);
  const [funcionarioId, setFuncionarioId] = useState('');
  const [funcionarios, setFuncionarios] = useState([]);
  const [erroFuncionarios, setErroFuncionarios] = useState('');

  const [form, setForm] = useState(formInicial);
  const [tentouRevisar, setTentouRevisar] = useState(false);

  const [historico, setHistorico] = useState([]);
  const [isLoadingHistorico, setIsLoadingHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');

  const [eventoAtual, setEventoAtual] = useState(null);
  const [erroSubmit, setErroSubmit] = useState(null);
  const [isSubmetendo, setIsSubmetendo] = useState(false);
  const [isAprovando, setIsAprovando] = useState(false);
  const [erroAprovar, setErroAprovar] = useState('');
  const [avisoAprovacao, setAvisoAprovacao] = useState('');
  const [isBaixando, setIsBaixando] = useState(false);
  const [erroDownload, setErroDownload] = useState('');

  const metaEvento = CATALOGO_ESOCIAL[tipoEvento];
  const exigeFuncionario = Boolean(metaEvento?.requerFuncionario);
  const geradorDisponivel = Boolean(metaEvento?.geradorDisponivel);

  const errosValidacao = useMemo(() => validarFormulario(form), [form]);
  const formValido = Object.keys(errosValidacao).length === 0;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  const carregarClientes = useCallback(async () => {
    setIsLoadingClientes(true);
    setErroClientes('');
    try {
      const data = await listarClientes();
      setClientes(normalizarClientes(data));
    } catch (error) {
      setErroClientes(obterMensagemErro(error, 'Não foi possível carregar os clientes.'));
    } finally {
      setIsLoadingClientes(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdminEfficience) {
      carregarClientes();
    }
  }, [carregarClientes, isAdminEfficience, isAuthenticated, isLoading]);

  const carregarHistorico = useCallback(async () => {
    if (!clienteIdEfetivo) {
      setHistorico([]);
      return;
    }
    setIsLoadingHistorico(true);
    setErroHistorico('');
    try {
      const data = await listarEventosEsocial({ clienteId: clienteIdEfetivo });
      setHistorico(normalizarLista(data));
    } catch (error) {
      setErroHistorico(obterMensagemErro(error, 'Não foi possível carregar o histórico.'));
    } finally {
      setIsLoadingHistorico(false);
    }
  }, [clienteIdEfetivo]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  // Funcionários só são necessários para eventos que exigem (S-2200 não exige).
  useEffect(() => {
    if (!clienteIdEfetivo || !exigeFuncionario) {
      setFuncionarios([]);
      setErroFuncionarios('');
      return;
    }
    let ativo = true;
    (async () => {
      try {
        const data = await listarFuncionarios({ clienteId: clienteIdEfetivo });
        if (ativo) setFuncionarios(normalizarLista(data));
      } catch (error) {
        if (ativo) {
          setFuncionarios([]);
          setErroFuncionarios(
            obterMensagemErro(error, 'Cadastro de funcionários ainda não disponível (ES-5).'),
          );
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [clienteIdEfetivo, exigeFuncionario]);

  // -- mutadores de formulário ------------------------------------------
  function atualizarFuncionario(campo, valor) {
    setForm((atual) => ({ ...atual, funcionario: { ...atual.funcionario, [campo]: valor } }));
  }
  function atualizarFuncionarioAninhado(grupo, campo, valor) {
    setForm((atual) => ({
      ...atual,
      funcionario: {
        ...atual.funcionario,
        [grupo]: { ...atual.funcionario[grupo], [campo]: valor },
      },
    }));
  }
  function atualizarAdmissao(campo, valor) {
    setForm((atual) => ({ ...atual, dadosAdmissao: { ...atual.dadosAdmissao, [campo]: valor } }));
  }
  function atualizarAdmissaoAninhado(grupo, campo, valor) {
    setForm((atual) => ({
      ...atual,
      dadosAdmissao: {
        ...atual.dadosAdmissao,
        [grupo]: { ...atual.dadosAdmissao[grupo], [campo]: valor },
      },
    }));
  }
  function atualizarToggle(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function handleSelecionarCategoria(valor) {
    setForm((atual) => ({
      ...atual,
      dadosAdmissao: {
        ...atual.dadosAdmissao,
        codCateg: valor,
        // deriva o regime trabalhista da categoria (o gerador rejeita divergência)
        tpRegTrab: CATEGORIAS_ESTATUTARIAS.has(valor) ? '2' : '1',
      },
    }));
  }

  function adicionarDependente() {
    setForm((atual) => ({
      ...atual,
      funcionario: {
        ...atual.funcionario,
        dependentes: [
          ...atual.funcionario.dependentes,
          { tipo: '', nome: '', dataNascimento: '', cpf: '', sexo: '', depIRRF: '', depSF: '', incTrab: '', descricao: '' },
        ],
      },
    }));
  }
  function removerDependente(indice) {
    setForm((atual) => ({
      ...atual,
      funcionario: {
        ...atual.funcionario,
        dependentes: atual.funcionario.dependentes.filter((_, i) => i !== indice),
      },
    }));
  }
  function atualizarDependente(indice, campo, valor) {
    setForm((atual) => ({
      ...atual,
      funcionario: {
        ...atual.funcionario,
        dependentes: atual.funcionario.dependentes.map((dep, i) =>
          i === indice ? { ...dep, [campo]: valor } : dep,
        ),
      },
    }));
  }

  // -- navegação do wizard --------------------------------------------
  function irParaFormulario() {
    setErroSubmit(null);
    setPasso(2);
  }

  async function handleRevisar() {
    setTentouRevisar(true);
    if (!formValido) return;
    setErroSubmit(null);
    setIsSubmetendo(true);
    try {
      const evento = await criarEventoEsocial({
        clienteId: clienteIdEfetivo,
        funcionarioId: exigeFuncionario ? funcionarioId || undefined : undefined,
        tipoEvento,
        dadosFormulario: montarPayload(form),
      });
      setEventoAtual(evento);
      setAvisoAprovacao('');
      setErroAprovar('');
      setErroDownload('');
      setPasso(3);
      carregarHistorico();
    } catch (error) {
      setErroSubmit({
        codigo: obterCodigoErro(error),
        mensagem: obterMensagemErro(error, 'Não foi possível gerar o rascunho do evento.'),
        camposFaltando: obterCamposFaltando(error),
      });
    } finally {
      setIsSubmetendo(false);
    }
  }

  async function handleAprovar() {
    if (!eventoAtual?.id) return;
    setIsAprovando(true);
    setErroAprovar('');
    try {
      const atualizado = await aprovarEventoEsocial(eventoAtual.id);
      setEventoAtual((anterior) => ({ ...anterior, ...atualizado }));
      setAvisoAprovacao(atualizado?.aviso || '');
      setPasso('pos-aprovacao');
      carregarHistorico();
    } catch (error) {
      setErroAprovar(obterMensagemErro(error, 'Não foi possível aprovar o evento.'));
    } finally {
      setIsAprovando(false);
    }
  }

  async function handleBaixar() {
    if (!eventoAtual?.id) return;
    setIsBaixando(true);
    setErroDownload('');
    try {
      const { blob } = await baixarXmlEventoEsocial(eventoAtual.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${eventoAtual.tipo_evento || tipoEvento}-${eventoAtual.id}.xml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Deixa o navegador iniciar o download antes de invalidar o blob.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      setErroDownload(obterMensagemErro(error, 'Não foi possível baixar o XML.'));
    } finally {
      setIsBaixando(false);
    }
  }

  async function abrirEventoDoHistorico(evento) {
    setErroSubmit(null);
    setErroAprovar('');
    setErroDownload('');
    try {
      const detalhe = await buscarEventoEsocial(evento.id);
      setEventoAtual(detalhe);
      setTipoEvento(detalhe.tipo_evento || evento.tipo_evento || TIPO_REFERENCIA);
      setAvisoAprovacao('');
      setPasso(detalhe.status === 'rascunho' ? 3 : 'pos-aprovacao');
    } catch (error) {
      setErroHistorico(obterMensagemErro(error, 'Não foi possível abrir o evento.'));
    }
  }

  function reiniciarWizard() {
    setForm(formInicial());
    setTentouRevisar(false);
    setTipoEvento(TIPO_REFERENCIA);
    setFuncionarioId('');
    setEventoAtual(null);
    setErroSubmit(null);
    setErroAprovar('');
    setErroDownload('');
    setAvisoAprovacao('');
    setPasso(1);
  }

  if (isLoading) return <p className="p-6">Carregando...</p>;
  if (!isAuthenticated) return null;

  const aguardandoCliente = isAdminEfficience && !clienteIdEfetivo;
  const xmlDoEvento = eventoAtual?.xml_gerado || '';
  const jaAprovado =
    eventoAtual && eventoAtual.status && eventoAtual.status !== 'rascunho';

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">eSocial</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Gere, revise e aprove os eventos do eSocial. A aprovação humana é obrigatória antes de
          qualquer download ou transmissão.
        </p>
      </header>

      {/* Passos */}
      <ol className="flex flex-wrap gap-2 text-xs font-medium">
        {[
          { n: 1, label: '1. Selecionar evento' },
          { n: 2, label: '2. Preencher formulário' },
          { n: 3, label: '3. Revisão e aprovação' },
        ].map((item) => {
          const ativo =
            passo === item.n || (item.n === 3 && passo === 'pos-aprovacao');
          return (
            <li
              key={item.n}
              className={`rounded-full px-3 py-1 ring-1 ${
                ativo
                  ? 'bg-zinc-900 text-white ring-zinc-900'
                  : 'bg-white text-zinc-500 ring-zinc-200'
              }`}
            >
              {item.label}
            </li>
          );
        })}
      </ol>

      {/* Seletor de cliente (admin_efficience) */}
      {isAdminEfficience ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="min-w-[240px] max-w-md space-y-2">
            <span className="text-sm font-medium text-zinc-700">Cliente</span>
            <select
              value={clienteId || ''}
              onChange={(evento) => {
                setClienteId(evento.target.value || null);
                reiniciarWizard();
              }}
              disabled={isLoadingClientes || Boolean(erroClientes)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {isLoadingClientes ? 'Carregando clientes...' : 'Selecione um cliente'}
              </option>
              {[...clientes]
                .sort((a, b) => obterNomeCliente(a).localeCompare(obterNomeCliente(b), 'pt-BR'))
                .map((cliente) => {
                  const id = obterIdCliente(cliente);
                  return (
                    <option key={id} value={id}>
                      {obterNomeCliente(cliente)}
                    </option>
                  );
                })}
            </select>
          </label>
          {erroClientes ? <p className="mt-2 text-sm text-rose-700">{erroClientes}</p> : null}
        </section>
      ) : null}

      {aguardandoCliente ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <p className="text-sm text-sky-900">Selecione um cliente para começar.</p>
        </section>
      ) : (
        <>
          {passo === 1 ? (
            <PassoSelecionarEvento
              tipoEvento={tipoEvento}
              onSelecionar={setTipoEvento}
              exigeFuncionario={exigeFuncionario}
              geradorDisponivel={geradorDisponivel}
              funcionarios={funcionarios}
              funcionarioId={funcionarioId}
              onSelecionarFuncionario={setFuncionarioId}
              erroFuncionarios={erroFuncionarios}
              onAvancar={irParaFormulario}
              historico={historico}
              isLoadingHistorico={isLoadingHistorico}
              erroHistorico={erroHistorico}
              onAbrirEvento={abrirEventoDoHistorico}
            />
          ) : null}

          {passo === 2 ? (
            <PassoFormulario
              form={form}
              erros={errosValidacao}
              mostrarErros={tentouRevisar}
              atualizarFuncionario={atualizarFuncionario}
              atualizarFuncionarioAninhado={atualizarFuncionarioAninhado}
              atualizarAdmissao={atualizarAdmissao}
              atualizarAdmissaoAninhado={atualizarAdmissaoAninhado}
              atualizarToggle={atualizarToggle}
              onSelecionarCategoria={handleSelecionarCategoria}
              adicionarDependente={adicionarDependente}
              removerDependente={removerDependente}
              atualizarDependente={atualizarDependente}
              onVoltar={() => setPasso(1)}
              onRevisar={handleRevisar}
              isSubmetendo={isSubmetendo}
              erroSubmit={erroSubmit}
            />
          ) : null}

          {(passo === 3 || passo === 'pos-aprovacao') && eventoAtual ? (
            <PassoRevisao
              evento={eventoAtual}
              xml={xmlDoEvento}
              jaAprovado={jaAprovado}
              posAprovacao={passo === 'pos-aprovacao'}
              onAprovar={handleAprovar}
              isAprovando={isAprovando}
              erroAprovar={erroAprovar}
              avisoAprovacao={avisoAprovacao}
              onBaixar={handleBaixar}
              isBaixando={isBaixando}
              erroDownload={erroDownload}
              onNovoEvento={reiniciarWizard}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Passo 1
// ---------------------------------------------------------------------------

function PassoSelecionarEvento({
  tipoEvento,
  onSelecionar,
  exigeFuncionario,
  geradorDisponivel,
  funcionarios,
  funcionarioId,
  onSelecionarFuncionario,
  erroFuncionarios,
  onAvancar,
  historico,
  isLoadingHistorico,
  erroHistorico,
  onAbrirEvento,
}) {
  const podeAvancar = geradorDisponivel && (!exigeFuncionario || Boolean(funcionarioId));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipo de evento</p>
        <div className="mt-4 space-y-5">
          {EVENTOS_POR_GRUPO.map((grupo) => (
            <div key={grupo.grupo}>
              <p className="text-sm font-semibold text-zinc-800">{grupo.titulo}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {grupo.eventos.map((evento) => {
                  const selecionado = evento.codigo === tipoEvento;
                  return (
                    <button
                      key={evento.codigo}
                      type="button"
                      aria-pressed={selecionado}
                      onClick={() => onSelecionar(evento.codigo)}
                      className={`rounded-lg border p-3 text-left transition ${
                        selecionado
                          ? 'border-zinc-900 bg-zinc-900/5 ring-1 ring-zinc-900'
                          : 'border-zinc-200 hover:border-zinc-300'
                      } ${evento.geradorDisponivel ? '' : 'opacity-70'}`}
                    >
                      <p className="text-sm font-semibold text-zinc-900">{evento.codigo}</p>
                      <p className="text-xs text-zinc-500">{evento.nome}</p>
                      {!evento.geradorDisponivel ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-600">
                          Gerador em desenvolvimento
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!geradorDisponivel ? (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            O gerador de XML de {tipoEvento} ainda não está disponível. Nesta versão só o evento
            S-2200 (Admissão) pode ser preenchido e transmitido.
          </p>
        ) : null}

        {exigeFuncionario ? (
          <div className="mt-4 max-w-md">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-zinc-700">
                Funcionário <span className="text-rose-500">*</span>
              </span>
              <select
                value={funcionarioId}
                onChange={(evento) => onSelecionarFuncionario(evento.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">Selecione um funcionário</option>
                {funcionarios.map((funcionario) => (
                  <option key={funcionario.id} value={funcionario.id}>
                    {funcionario.nome || funcionario.cpf || funcionario.id}
                  </option>
                ))}
              </select>
            </label>
            {erroFuncionarios ? (
              <p className="mt-2 text-xs text-amber-700">{erroFuncionarios}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5">
          <button
            type="button"
            onClick={onAvancar}
            disabled={!podeAvancar}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Avançar para o formulário
          </button>
        </div>
      </section>

      {/* Histórico */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Histórico de eventos
          </p>
          {isLoadingHistorico ? <span className="text-xs text-zinc-400">Carregando...</span> : null}
        </div>
        {erroHistorico ? (
          <p className="mt-3 text-sm text-rose-700">{erroHistorico}</p>
        ) : historico.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nenhum evento gerado para este cliente ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Evento</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Criado em</th>
                  <th className="py-2 pr-4">Aprovado por</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {historico.map((evento) => (
                  <tr key={evento.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-4 font-medium text-zinc-900">
                      {evento.tipo_evento}
                      <span className="block text-xs font-normal text-zinc-500">
                        {CATALOGO_ESOCIAL[evento.tipo_evento]?.nome || ''}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={evento.status} />
                    </td>
                    <td className="py-2 pr-4 text-zinc-600">{formatarDataHora(evento.criado_em)}</td>
                    <td className="py-2 pr-4 text-zinc-600">{evento.aprovado_por || '-'}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onAbrirEvento(evento)}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 2 — formulário do S-2200
// ---------------------------------------------------------------------------

function PassoFormulario({
  form,
  erros,
  mostrarErros,
  atualizarFuncionario,
  atualizarFuncionarioAninhado,
  atualizarAdmissao,
  atualizarAdmissaoAninhado,
  atualizarToggle,
  onSelecionarCategoria,
  adicionarDependente,
  removerDependente,
  atualizarDependente,
  onVoltar,
  onRevisar,
  isSubmetendo,
  erroSubmit,
}) {
  const f = form.funcionario;
  const a = form.dadosAdmissao;
  const estatutaria = CATEGORIAS_ESTATUTARIAS.has(a.codCateg);
  const listaErros = Object.entries(erros);

  return (
    <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Formulário — S-2200 (Admissão)
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Campos com <span className="text-rose-500">*</span> são obrigatórios. A validação é em
            tempo real; o XML só é gerado quando tudo estiver consistente.
          </p>
        </div>
      </div>

      {/* Trabalhador */}
      <Fieldset titulo="Trabalhador">
        <Campo label="CPF" obrigatorio value={f.cpf} onChange={(v) => atualizarFuncionario('cpf', v)} placeholder="Somente números" />
        <Campo label="Nome completo" obrigatorio value={f.nome} onChange={(v) => atualizarFuncionario('nome', v)} />
        <Campo label="Nome social" value={f.nomeSocial} onChange={(v) => atualizarFuncionario('nomeSocial', v)} />
        <CampoSelect label="Sexo" obrigatorio opcoes={SEXO} value={f.sexo} onChange={(v) => atualizarFuncionario('sexo', v)} />
        <CampoSelect label="Raça/cor" obrigatorio opcoes={RACA_COR} value={f.racaCor} onChange={(v) => atualizarFuncionario('racaCor', v)} />
        <CampoSelect label="Grau de instrução" obrigatorio opcoes={GRAU_INSTRUCAO} value={f.grauInstr} onChange={(v) => atualizarFuncionario('grauInstr', v)} />
        <Campo label="Data de nascimento" obrigatorio placeholder="dd/mm/aaaa" value={f.dataNascimento} onChange={(v) => atualizarFuncionario('dataNascimento', v)} />
        <CampoSelect label="Estado civil" opcoes={ESTADO_CIVIL} value={f.estadoCivil} onChange={(v) => atualizarFuncionario('estadoCivil', v)} />
        <CampoSelect
          label="País de nascimento"
          opcoes={PAISES}
          value={f.paisNascimento}
          onChange={(v) => atualizarFuncionario('paisNascimento', v)}
          placeholder="105 — Brasil"
          ajuda="Nesta versão só é possível admitir trabalhador nascido no Brasil."
        />
        <CampoSelect label="País de nacionalidade" opcoes={PAISES} value={f.paisNacionalidade} onChange={(v) => atualizarFuncionario('paisNacionalidade', v)} placeholder="105 — Brasil" />
        <Campo
          label="Naturalidade — código do município (IBGE)"
          obrigatorio
          placeholder="7 dígitos"
          value={f.naturalidade.codMunicipio}
          onChange={(v) => atualizarFuncionarioAninhado('naturalidade', 'codMunicipio', v)}
        />
        <CampoSelect
          label="Naturalidade — UF"
          obrigatorio
          opcoes={UFS}
          value={f.naturalidade.uf}
          onChange={(v) => atualizarFuncionarioAninhado('naturalidade', 'uf', v)}
        />
      </Fieldset>

      {/* Endereço */}
      <Fieldset titulo="Endereço">
        <Campo label="Tipo de logradouro" placeholder="R, AV, TV..." value={f.endereco.tipoLogradouro} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'tipoLogradouro', v)} />
        <Campo label="Logradouro" obrigatorio value={f.endereco.logradouro} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'logradouro', v)} />
        <Campo label="Número" obrigatorio value={f.endereco.numero} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'numero', v)} />
        <Campo label="Complemento" value={f.endereco.complemento} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'complemento', v)} />
        <Campo label="Bairro" value={f.endereco.bairro} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'bairro', v)} />
        <Campo label="CEP" obrigatorio placeholder="8 dígitos" value={f.endereco.cep} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'cep', v)} />
        <Campo label="Código do município (IBGE)" obrigatorio placeholder="7 dígitos" value={f.endereco.codMunicipio} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'codMunicipio', v)} />
        <CampoSelect label="UF" obrigatorio opcoes={UFS} value={f.endereco.uf} onChange={(v) => atualizarFuncionarioAninhado('endereco', 'uf', v)} />
      </Fieldset>

      {/* Contato */}
      <ToggleGrupo
        titulo="Contato"
        ativo={form.incluiContato}
        onToggle={(v) => atualizarToggle('incluiContato', v)}
      >
        <Fieldset titulo="Contato">
          <Campo label="Telefone" placeholder="Somente números" value={f.contato.telefone} onChange={(v) => atualizarFuncionarioAninhado('contato', 'telefone', v)} />
          <Campo label="E-mail" type="email" value={f.contato.email} onChange={(v) => atualizarFuncionarioAninhado('contato', 'email', v)} />
        </Fieldset>
      </ToggleGrupo>

      {/* Dependentes */}
      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-800">Dependentes</p>
          <button
            type="button"
            onClick={adicionarDependente}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Adicionar dependente
          </button>
        </div>
        {f.dependentes.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">Nenhum dependente informado.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {f.dependentes.map((dep, indice) => (
              <div key={indice} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-700">Dependente {indice + 1}</p>
                  <button
                    type="button"
                    onClick={() => removerDependente(indice)}
                    className="text-xs font-medium text-rose-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <CampoSelect label="Tipo" obrigatorio opcoes={TP_DEPENDENTE} value={dep.tipo} onChange={(v) => atualizarDependente(indice, 'tipo', v)} />
                  <Campo label="Nome" obrigatorio value={dep.nome} onChange={(v) => atualizarDependente(indice, 'nome', v)} />
                  <Campo label="Data de nascimento" obrigatorio placeholder="dd/mm/aaaa" value={dep.dataNascimento} onChange={(v) => atualizarDependente(indice, 'dataNascimento', v)} />
                  <Campo label="CPF" value={dep.cpf} onChange={(v) => atualizarDependente(indice, 'cpf', v)} />
                  <CampoSelect label="Sexo" opcoes={SEXO} value={dep.sexo} onChange={(v) => atualizarDependente(indice, 'sexo', v)} />
                  <CampoSelect label="Dependente de IRRF" obrigatorio opcoes={SIM_NAO} value={dep.depIRRF} onChange={(v) => atualizarDependente(indice, 'depIRRF', v)} />
                  <CampoSelect label="Dependente de salário-família" obrigatorio opcoes={SIM_NAO} value={dep.depSF} onChange={(v) => atualizarDependente(indice, 'depSF', v)} />
                  <CampoSelect label="Inclusão em contracheque" obrigatorio opcoes={SIM_NAO} value={dep.incTrab} onChange={(v) => atualizarDependente(indice, 'incTrab', v)} />
                  <Campo label="Descrição" value={dep.descricao} onChange={(v) => atualizarDependente(indice, 'descricao', v)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vínculo */}
      <Fieldset titulo="Vínculo">
        <CampoSelect label="Empregador — tipo de inscrição" obrigatorio opcoes={TP_INSC} value={a.empregador.tpInsc} onChange={(v) => atualizarAdmissaoAninhado('empregador', 'tpInsc', v)} />
        <Campo label="Empregador — número de inscrição" obrigatorio placeholder="CNPJ/CPF" value={a.empregador.nrInsc} onChange={(v) => atualizarAdmissaoAninhado('empregador', 'nrInsc', v)} />
        <Campo label="Matrícula" obrigatorio value={a.matricula} onChange={(v) => atualizarAdmissao('matricula', v)} />
        <CampoSelect label="Categoria do trabalhador" obrigatorio opcoes={CATEGORIAS_S2200} value={a.codCateg} onChange={onSelecionarCategoria} />
        <CampoSelect
          label="Regime trabalhista"
          obrigatorio
          disabled
          opcoes={TP_REG_TRAB}
          value={a.tpRegTrab}
          onChange={(v) => atualizarAdmissao('tpRegTrab', v)}
          ajuda="Definido automaticamente pela categoria selecionada."
        />
        <Campo label="Data de admissão" obrigatorio placeholder="dd/mm/aaaa" value={a.dataAdmissao} onChange={(v) => atualizarAdmissao('dataAdmissao', v)} />
        <CampoSelect label="Regime previdenciário" obrigatorio opcoes={TP_REG_PREV} value={a.tpRegPrev} onChange={(v) => atualizarAdmissao('tpRegPrev', v)} />
        <CampoSelect label="Cadastramento inicial (cadIni)" obrigatorio opcoes={SIM_NAO} value={a.cadIni} onChange={(v) => atualizarAdmissao('cadIni', v)} />
      </Fieldset>

      {/* Regime celetista */}
      {!estatutaria ? (
        <Fieldset titulo="Regime CLT (infoCeletista)">
          <CampoSelect label="Tipo de admissão" obrigatorio opcoes={TP_ADMISSAO} value={a.tpAdmissao} onChange={(v) => atualizarAdmissao('tpAdmissao', v)} />
          <CampoSelect label="Indicativo de admissão" opcoes={IND_ADMISSAO} value={a.indAdmissao} onChange={(v) => atualizarAdmissao('indAdmissao', v)} />
          <CampoSelect label="Regime de jornada" obrigatorio opcoes={TP_REG_JOR} value={a.tpRegJor} onChange={(v) => atualizarAdmissao('tpRegJor', v)} />
          <CampoSelect label="Natureza da atividade" obrigatorio opcoes={NAT_ATIVIDADE} value={a.natAtividade} onChange={(v) => atualizarAdmissao('natAtividade', v)} />
          <Campo label="Dia base (dtBase)" placeholder="Dia do mês (1-31)" value={a.dtBase} onChange={(v) => atualizarAdmissao('dtBase', v)} />
          <Campo label="CNPJ do sindicato da categoria" value={a.cnpjSindCategProf} onChange={(v) => atualizarAdmissao('cnpjSindCategProf', v)} />
        </Fieldset>
      ) : (
        <Fieldset titulo="Regime estatutário (infoEstatutario)">
          <CampoSelect label="Tipo de provimento" obrigatorio opcoes={TP_PROVIMENTO} value={a.estatutario.tpProv} onChange={(v) => atualizarAdmissaoAninhado('estatutario', 'tpProv', v)} />
          <Campo label="Data de exercício" obrigatorio placeholder="dd/mm/aaaa" value={a.estatutario.dataExercicio} onChange={(v) => atualizarAdmissaoAninhado('estatutario', 'dataExercicio', v)} />
          <CampoSelect
            label="Indicador de teto do RGPS"
            obrigatorio={a.tpRegPrev === '1'}
            opcoes={SIM_NAO}
            value={a.estatutario.indTetoRGPS}
            onChange={(v) => atualizarAdmissaoAninhado('estatutario', 'indTetoRGPS', v)}
          />
          <CampoSelect label="Tipo de plano de RP" opcoes={TP_PLANO_RP} value={a.estatutario.tpPlanRP} onChange={(v) => atualizarAdmissaoAninhado('estatutario', 'tpPlanRP', v)} />
          <CampoSelect label="Indicador de abono permanência" opcoes={SIM_NAO} value={a.estatutario.indAbonoPerm} onChange={(v) => atualizarAdmissaoAninhado('estatutario', 'indAbonoPerm', v)} />
          <Campo label="Data de início do abono" placeholder="dd/mm/aaaa" value={a.estatutario.dataInicioAbono} onChange={(v) => atualizarAdmissaoAninhado('estatutario', 'dataInicioAbono', v)} />
        </Fieldset>
      )}

      {/* FGTS e aprendiz (celetista) */}
      {!estatutaria ? (
        <>
          <ToggleGrupo titulo="Opção pelo FGTS" ativo={form.incluiFgts} onToggle={(v) => atualizarToggle('incluiFgts', v)}>
            <Fieldset titulo="FGTS">
              <Campo label="Data de opção pelo FGTS" placeholder="dd/mm/aaaa" value={a.fgts.dataOpcao} onChange={(v) => atualizarAdmissaoAninhado('fgts', 'dataOpcao', v)} />
            </Fieldset>
          </ToggleGrupo>

          <ToggleGrupo titulo="Aprendiz" ativo={form.incluiAprendiz} onToggle={(v) => atualizarToggle('incluiAprendiz', v)}>
            <Fieldset titulo="Aprendiz">
              <CampoSelect label="Indicador de aprendiz" obrigatorio opcoes={IND_APRENDIZ} value={a.aprendiz.indAprend} onChange={(v) => atualizarAdmissaoAninhado('aprendiz', 'indAprend', v)} />
              <Campo label="CNPJ da entidade qualificadora" value={a.aprendiz.cnpjEntQual} onChange={(v) => atualizarAdmissaoAninhado('aprendiz', 'cnpjEntQual', v)} />
              <CampoSelect label="Tipo de inscrição (prática)" opcoes={TP_INSC} value={a.aprendiz.tpInsc} onChange={(v) => atualizarAdmissaoAninhado('aprendiz', 'tpInsc', v)} />
              <Campo label="Número de inscrição (prática)" value={a.aprendiz.nrInsc} onChange={(v) => atualizarAdmissaoAninhado('aprendiz', 'nrInsc', v)} />
              <Campo label="CNPJ do estabelecimento de prática" value={a.aprendiz.cnpjPrat} onChange={(v) => atualizarAdmissaoAninhado('aprendiz', 'cnpjPrat', v)} />
            </Fieldset>
          </ToggleGrupo>
        </>
      ) : null}

      {/* infoContrato */}
      <Fieldset titulo="Cargo">
        <Campo label="Nome do cargo" obrigatorio value={a.cargo.nome} onChange={(v) => atualizarAdmissaoAninhado('cargo', 'nome', v)} />
        <Campo label="CBO do cargo" obrigatorio value={a.cargo.cbo} onChange={(v) => atualizarAdmissaoAninhado('cargo', 'cbo', v)} />
        <Campo label="Data de ingresso no cargo" placeholder="dd/mm/aaaa" value={a.cargo.dataIngresso} onChange={(v) => atualizarAdmissaoAninhado('cargo', 'dataIngresso', v)} />
      </Fieldset>

      <ToggleGrupo titulo="Função" ativo={form.incluiFuncao} onToggle={(v) => atualizarToggle('incluiFuncao', v)}>
        <Fieldset titulo="Função">
          <Campo label="Nome da função" obrigatorio value={a.funcao.nome} onChange={(v) => atualizarAdmissaoAninhado('funcao', 'nome', v)} />
          <Campo label="CBO da função" obrigatorio value={a.funcao.cbo} onChange={(v) => atualizarAdmissaoAninhado('funcao', 'cbo', v)} />
        </Fieldset>
      </ToggleGrupo>

      <Fieldset titulo="Remuneração">
        <Campo label="Salário fixo" obrigatorio placeholder="Ex.: 2500,00" value={a.remuneracao.valorSalarioFixo} onChange={(v) => atualizarAdmissaoAninhado('remuneracao', 'valorSalarioFixo', v)} />
        <CampoSelect label="Unidade do salário fixo" obrigatorio opcoes={UNIDADE_SALARIO} value={a.remuneracao.unidadeSalarioFixo} onChange={(v) => atualizarAdmissaoAninhado('remuneracao', 'unidadeSalarioFixo', v)} />
        <Campo label="Descrição do salário variável" value={a.remuneracao.descricaoSalarioVariavel} onChange={(v) => atualizarAdmissaoAninhado('remuneracao', 'descricaoSalarioVariavel', v)} />
      </Fieldset>

      <Fieldset titulo="Duração do contrato">
        <CampoSelect label="Tipo de contrato" obrigatorio opcoes={TP_CONTRATO} value={a.duracao.tpContr} onChange={(v) => atualizarAdmissaoAninhado('duracao', 'tpContr', v)} />
        <Campo label="Data de término" placeholder="dd/mm/aaaa" value={a.duracao.dataTermino} onChange={(v) => atualizarAdmissaoAninhado('duracao', 'dataTermino', v)} />
        <CampoSelect label="Cláusula assecuratória" opcoes={SIM_NAO} value={a.duracao.clausulaAssecuratoria} onChange={(v) => atualizarAdmissaoAninhado('duracao', 'clausulaAssecuratoria', v)} />
        <Campo label="Objeto determinante (contrato por obra)" value={a.duracao.objetoDeterminante} onChange={(v) => atualizarAdmissaoAninhado('duracao', 'objetoDeterminante', v)} />
      </Fieldset>

      <Fieldset titulo="Local de trabalho">
        <CampoSelect label="Tipo de inscrição" obrigatorio opcoes={TP_INSC} value={a.localTrabalho.tpInsc} onChange={(v) => atualizarAdmissaoAninhado('localTrabalho', 'tpInsc', v)} />
        <Campo label="Número de inscrição" obrigatorio value={a.localTrabalho.nrInsc} onChange={(v) => atualizarAdmissaoAninhado('localTrabalho', 'nrInsc', v)} />
        <Campo label="Descrição complementar" value={a.localTrabalho.descricaoComplementar} onChange={(v) => atualizarAdmissaoAninhado('localTrabalho', 'descricaoComplementar', v)} />
      </Fieldset>

      <Fieldset titulo="Horário contratual">
        <Campo label="Quantidade de horas semanais" value={a.horContratual.qtdHrsSem} onChange={(v) => atualizarAdmissaoAninhado('horContratual', 'qtdHrsSem', v)} />
        <CampoSelect label="Tipo de jornada" obrigatorio opcoes={TP_JORNADA} value={a.horContratual.tpJornada} onChange={(v) => atualizarAdmissaoAninhado('horContratual', 'tpJornada', v)} />
        <CampoSelect label="Tempo parcial" obrigatorio opcoes={TMP_PARCIAL} value={a.horContratual.tmpParc} onChange={(v) => atualizarAdmissaoAninhado('horContratual', 'tmpParc', v)} />
        <CampoSelect label="Trabalho noturno" obrigatorio opcoes={SIM_NAO} value={a.horContratual.horarioNoturno} onChange={(v) => atualizarAdmissaoAninhado('horContratual', 'horarioNoturno', v)} />
        <Campo label="Descrição da jornada" obrigatorio value={a.horContratual.descricaoJornada} onChange={(v) => atualizarAdmissaoAninhado('horContratual', 'descricaoJornada', v)} className="lg:col-span-2" />
      </Fieldset>

      <div className="rounded-lg border border-zinc-200 p-4">
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-zinc-800">Observações do contrato</span>
          <span className="block text-xs text-zinc-500">Uma observação por linha.</span>
          <textarea
            rows={3}
            value={a.observacoesContrato}
            onChange={(evento) => atualizarAdmissao('observacoesContrato', evento.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </label>
      </div>

      {/* Afastamento / desligamento */}
      <ToggleGrupo titulo="Afastamento" ativo={form.incluiAfastamento} onToggle={(v) => atualizarToggle('incluiAfastamento', v)}>
        <Fieldset titulo="Afastamento">
          <Campo label="Data de início" obrigatorio placeholder="dd/mm/aaaa" value={a.afastamento.dataInicio} onChange={(v) => atualizarAdmissaoAninhado('afastamento', 'dataInicio', v)} />
          <CampoSelect label="Motivo" obrigatorio opcoes={MOTIVOS_AFASTAMENTO} value={a.afastamento.codMotivo} onChange={(v) => atualizarAdmissaoAninhado('afastamento', 'codMotivo', v)} />
        </Fieldset>
      </ToggleGrupo>

      <ToggleGrupo titulo="Desligamento" ativo={form.incluiDesligamento} onToggle={(v) => atualizarToggle('incluiDesligamento', v)}>
        <Fieldset titulo="Desligamento">
          <Campo label="Data" obrigatorio placeholder="dd/mm/aaaa" value={a.desligamento.data} onChange={(v) => atualizarAdmissaoAninhado('desligamento', 'data', v)} />
          <CampoSelect label="Motivo" obrigatorio opcoes={MOTIVOS_DESLIGAMENTO} value={a.desligamento.motivo} onChange={(v) => atualizarAdmissaoAninhado('desligamento', 'motivo', v)} />
        </Fieldset>
      </ToggleGrupo>

      {/* Pendências de validação — aparecem depois da primeira tentativa de revisar */}
      {mostrarErros && listaErros.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">
            {listaErros.length} pendência(s) antes de revisar:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {listaErros.map(([campo, mensagem]) => (
              <li key={campo}>
                <span className="font-medium">{campo}:</span> {mensagem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {erroSubmit ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">{erroSubmit.mensagem}</p>
          {erroSubmit.codigo === 'ESOCIAL_NAO_CONFIGURADO' ? (
            <p className="mt-1 text-sm text-rose-700">
              É o primeiro evento deste cliente. Confirme com quem faz a configuração inicial do
              eSocial (Grupo 1) antes de enviar.
            </p>
          ) : null}
          {erroSubmit.camposFaltando?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
              {erroSubmit.camposFaltando.map((campo) => (
                <li key={campo}>{campo}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onRevisar}
          disabled={isSubmetendo}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmetendo ? <Spinner /> : null}
          {isSubmetendo ? 'Gerando XML...' : 'Revisar'}
        </button>
        {listaErros.length > 0 ? (
          <span className="self-center text-xs text-zinc-500">
            {listaErros.length} campo(s) obrigatório(s) pendente(s)
          </span>
        ) : null}
      </div>
    </section>
  );
}

function ToggleGrupo({ titulo, ativo, onToggle, children }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
        <input
          type="checkbox"
          checked={ativo}
          onChange={(evento) => onToggle(evento.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Incluir {titulo.toLowerCase()}
      </label>
      {ativo ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 3 — revisão / aprovação / download
// ---------------------------------------------------------------------------

function PassoRevisao({
  evento,
  xml,
  jaAprovado,
  posAprovacao,
  onAprovar,
  isAprovando,
  erroAprovar,
  avisoAprovacao,
  onBaixar,
  isBaixando,
  erroDownload,
  onNovoEvento,
}) {
  const aprovado = jaAprovado || posAprovacao;

  return (
    <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Revisão do evento
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-zinc-900">
            {evento.tipo_evento} — {CATALOGO_ESOCIAL[evento.tipo_evento]?.nome || ''}
          </span>
          <StatusBadge status={evento.status} />
          {evento.aprovado_por ? (
            <span className="text-xs text-zinc-500">
              Aprovado por {evento.aprovado_por}
              {evento.aprovado_em ? ` em ${formatarDataHora(evento.aprovado_em)}` : ''}
            </span>
          ) : null}
        </div>
      </div>

      {/* AVISO DE RESPONSABILIDADE — destaque obrigatório em todos os caminhos */}
      <div className="flex gap-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-7 w-7 shrink-0 text-amber-600"
        >
          <path d="M10.3 3.9 2.6 17a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 16.5h.01" />
        </svg>
        <div>
          <p className="text-base font-bold text-amber-900">Responsabilidade pelo conteúdo</p>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            Ao aprovar este evento, você declara ter conferido todas as informações do XML abaixo e
            assume a responsabilidade legal pelo seu conteúdo perante o eSocial. A revisão e a
            aprovação humana são obrigatórias — inclusive quando o evento for apenas baixado, sem
            transmissão automática.
          </p>
        </div>
      </div>

      {/* XML completo, rolável */}
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-700">XML gerado</p>
        <pre className="max-h-[480px] overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
          <code>{xml || 'XML não disponível para este evento.'}</code>
        </pre>
      </div>

      {avisoAprovacao ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Aprovação registrada com aviso</p>
          <p className="mt-1 text-sm text-amber-700">{avisoAprovacao}</p>
        </div>
      ) : null}

      {erroAprovar ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{erroAprovar}</p>
      ) : null}
      {erroDownload ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{erroDownload}</p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!aprovado ? (
          <button
            type="button"
            onClick={onAprovar}
            disabled={isAprovando}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAprovando ? <Spinner /> : null}
            {isAprovando ? 'Aprovando...' : 'Aprovar'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onBaixar}
            disabled={isBaixando}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBaixando ? <Spinner /> : null}
            {isBaixando ? 'Baixando...' : 'Baixar XML'}
          </button>
        )}

        <button
          type="button"
          onClick={onNovoEvento}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Novo evento
        </button>
      </div>

      {aprovado ? (
        <p className="text-xs text-zinc-500">
          Transmissão automática ao eSocial disponível após a configuração de certificado digital do
          cliente (ES-8). Por enquanto, baixe o XML e transmita pelo canal do escritório.
        </p>
      ) : null}
    </section>
  );
}
