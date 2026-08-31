// Efficience Co — Áreas de automação (Fiscal, Contábil, DP, Societário, Financeiro,
// Atendimento). Data mirrors the real frontend/src/app/dashboard/<area>/page.jsx
// AUTOMACOES arrays as of issue #358 — status is the real current build state
// (disponivel / em_desenvolvimento / planejado), not the "tudo disponível" sales demo.

const STATUS_META = {
  disponivel: { kind: 'ok', label: 'Disponível' },
  em_desenvolvimento: { kind: 'warn', label: 'Em desenvolvimento' },
  planejado: { kind: 'neutral', label: 'Planejado' },
};

function AutomacaoCard({ Icon, nome, descricao, status, route, observacao, onNavigate }) {
  const meta = STATUS_META[status] || STATUS_META.planejado;
  const clicavel = status === 'disponivel' && Boolean(route);
  const body = (
    <React.Fragment>
      <div className="acard-head">
        <span className="acard-ico"><Icon /></span>
        <Badge kind={meta.kind}>{meta.label}</Badge>
      </div>
      <div className="acard-title">{nome}</div>
      <div className="acard-desc">{descricao}</div>
      {observacao ? <div className="acard-obs">{observacao}</div> : null}
      {status === 'planejado' ? <div className="acard-soon">Em breve</div> : null}
    </React.Fragment>
  );
  if (clicavel) {
    return <button type="button" className="acard clickable" onClick={() => onNavigate(route)}>{body}</button>;
  }
  return <div className={'acard' + (status === 'planejado' ? ' locked' : '')}>{body}</div>;
}

function AreaPage({ title, sub, automacoes, onNavigate }) {
  return (
    <div className="page">
      <div className="page-head"><h1>{title}</h1><p>{sub}</p></div>
      <div className="grid3">
        {automacoes.map((a) => <AutomacaoCard key={a.nome} {...a} onNavigate={onNavigate} />)}
      </div>
    </div>
  );
}

/* ---- Fiscal ---- */
const FISCAL_AUTOMACOES = [
  { Icon: IcoAutDocumento, nome: 'Escrituração fiscal (NF-e XML)', descricao: 'Lê os XMLs de NF-e recebidos e gera o lançamento fiscal correspondente.', status: 'disponivel', route: 'fiscal-escrituracao' },
  { Icon: IcoAutCalculadora, nome: 'Apuração de impostos — Simples Nacional', descricao: 'Calcula o DAS a partir dos lançamentos fiscais do período.', status: 'em_desenvolvimento', observacao: 'Sprint atual' },
  { Icon: IcoAutCalculadora, nome: 'Apuração — Lucro Presumido', descricao: 'Calcula IRPJ, CSLL, PIS e COFINS pelo regime de lucro presumido.', status: 'planejado' },
  { Icon: IcoAutGuia, nome: 'Emissão de guias (DAS, DARF, ISS)', descricao: 'Gera as guias de recolhimento dos tributos apurados no período.', status: 'planejado' },
  { Icon: IcoAutPasta, nome: 'SPED Fiscal', descricao: 'Monta o arquivo SPED Fiscal a partir da escrituração do período.', status: 'planejado' },
  { Icon: IcoAutPasta, nome: 'SPED Contribuições', descricao: 'Monta o arquivo SPED Contribuições (PIS/COFINS) do período.', status: 'planejado' },
  { Icon: IcoAutTransmissao, nome: 'EFD-Reinf', descricao: 'Transmite os eventos de retenção apurados na EFD-Reinf.', status: 'planejado' },
  { Icon: IcoAutTransmissao, nome: 'DCTF/DCTFWeb', descricao: 'Preenche e transmite a DCTF e a DCTFWeb do período.', status: 'planejado' },
  { Icon: IcoAutEtiqueta, nome: 'Classificação NCM/CFOP', descricao: 'Sugere NCM e CFOP para itens novos identificados nas NF-e.', status: 'planejado' },
  { Icon: IcoAutCifrao, nome: 'Retenções na fonte', descricao: 'Identifica e calcula os tributos retidos na fonte.', status: 'planejado' },
  { Icon: IcoAutLupa, nome: 'Revisão de NF-e emitidas', descricao: 'Checa inconsistências nas notas emitidas pelo cliente.', status: 'planejado' },
  { Icon: IcoAutSino, nome: 'Alerta de mudança de alíquota', descricao: 'Avisa quando a legislação altera uma alíquota relevante.', status: 'planejado' },
];
function FiscalPage({ onNavigate }) {
  return <AreaPage title="Fiscal" sub="Automações tributárias e de escrituração." automacoes={FISCAL_AUTOMACOES} onNavigate={onNavigate} />;
}

/* ---- Contábil ---- */
const CONTABIL_AUTOMACOES = [
  { Icon: IcoAutTransmissao, nome: 'Conciliação Bancária', descricao: 'Importa o extrato OFX e concilia com os lançamentos internos.', status: 'disponivel', route: 'contabil-conciliacao' },
  { Icon: IcoAutDocumento, nome: 'Conciliação de contas contábeis', descricao: 'Cruza os saldos entre contas contábeis relacionadas.', status: 'planejado' },
  { Icon: IcoAutGrafico, nome: 'Depreciação e amortização', descricao: 'Calcula a depreciação e amortização dos ativos do cliente.', status: 'planejado' },
  { Icon: IcoAutGrafico, nome: 'Relatórios gerenciais', descricao: 'Gera os relatórios gerenciais periódicos do cliente.', status: 'planejado' },
  { Icon: IcoAutCalendario, nome: 'Balancete mensal', descricao: 'Fecha e gera o balancete do mês.', status: 'planejado' },
  { Icon: IcoAutPasta, nome: 'Encerramento de exercício', descricao: 'Conduz a apuração e o encerramento do exercício contábil.', status: 'planejado' },
];
function ContabilPage({ onNavigate }) {
  return <AreaPage title="Contábil" sub="Automações de conciliação e fechamento contábil." automacoes={CONTABIL_AUTOMACOES} onNavigate={onNavigate} />;
}

/* ---- DP ---- */
const DP_AUTOMACOES = [
  { Icon: IcoAutComprovante, nome: 'Folha de pagamento mensal', descricao: 'Processa a planilha de folha enviada e faz os cálculos do mês.', status: 'disponivel', route: 'dp-folha' },
  { Icon: IcoAutTransmissao, nome: 'eSocial (todos os eventos)', descricao: 'Transmite os eventos obrigatórios do eSocial.', status: 'planejado' },
  { Icon: IcoAutCalendario, nome: 'Férias', descricao: 'Calcula e agenda as férias dos funcionários.', status: 'planejado' },
  { Icon: IcoAutCifrao, nome: '13º salário', descricao: 'Calcula a primeira e a segunda parcela do 13º.', status: 'planejado' },
  { Icon: IcoAutGuia, nome: 'FGTS e guias (GRF, GRRF)', descricao: 'Gera as guias de FGTS do período.', status: 'planejado' },
  { Icon: IcoAutDocumento, nome: 'INSS (GPS)', descricao: 'Calcula e emite a guia de recolhimento do INSS.', status: 'planejado' },
  { Icon: IcoAutPessoa, nome: 'Admissão de funcionário', descricao: 'Preenche a documentação de admissão.', status: 'planejado' },
  { Icon: IcoAutCruzMedica, nome: 'Atestados médicos', descricao: 'Registra e calcula os afastamentos por atestado.', status: 'planejado' },
  { Icon: IcoAutRelogio, nome: 'Horas extras e adicionais', descricao: 'Calcula horas extras e adicionais legais do período.', status: 'planejado' },
  { Icon: IcoAutOnibus, nome: 'Vale-transporte e vale-refeição', descricao: 'Calcula os benefícios de VT e VR por funcionário.', status: 'planejado' },
];
function DpPage({ onNavigate }) {
  return <AreaPage title="DP" sub="Automações de departamento pessoal e folha de pagamento." automacoes={DP_AUTOMACOES} onNavigate={onNavigate} />;
}

/* ---- Societário ---- */
const SOCIETARIO_AUTOMACOES = [
  { Icon: IcoAutPredio, nome: 'Abertura de empresa', descricao: 'Gera a documentação e a estrutura de pastas de abertura.', status: 'em_desenvolvimento', observacao: 'QA pendente' },
  { Icon: IcoAutDocumento, nome: 'Alteração contratual', descricao: 'Preenche as alterações no contrato social.', status: 'planejado' },
  { Icon: IcoAutPredio, nome: 'Baixa de empresa', descricao: 'Monta a documentação necessária para o encerramento da empresa.', status: 'planejado' },
  { Icon: IcoAutSelo, nome: 'Alvarás e licenças', descricao: 'Acompanha vencimentos e emite alvarás e licenças.', status: 'planejado' },
  { Icon: IcoAutEscudo, nome: 'Certificado digital', descricao: 'Alerta e conduz a renovação do certificado digital.', status: 'planejado' },
  { Icon: IcoAutPredio, nome: 'Registro em órgãos', descricao: 'Registra os atos societários nos órgãos competentes.', status: 'planejado' },
  { Icon: IcoAutAssinatura, nome: 'Procurações (e-CAC, Gov.br)', descricao: 'Gera as procurações eletrônicas para os clientes.', status: 'planejado' },
  { Icon: IcoAutCiclo, nome: 'Regularização cadastral', descricao: 'Identifica e corrige pendências cadastrais.', status: 'planejado' },
];
function SocietarioPage({ onNavigate }) {
  return <AreaPage title="Societário" sub="Automações de constituição, alteração e regularização de empresas." automacoes={SOCIETARIO_AUTOMACOES} onNavigate={onNavigate} />;
}

/* ---- Financeiro ---- */
const FINANCEIRO_AUTOMACOES = [
  { Icon: IcoAutComprovante, nome: 'Emissão de honorários e boletos', descricao: 'Gera os boletos de honorários mensais dos clientes.', status: 'planejado' },
  { Icon: IcoAutTelefone, nome: 'Cobrança de inadimplentes', descricao: 'Régua de cobrança para honorários em atraso.', status: 'planejado' },
  { Icon: IcoAutGrafico, nome: 'Reajuste de honorários', descricao: 'Calcula e aplica o reajuste anual de honorários.', status: 'planejado' },
  { Icon: IcoAutDocumento, nome: 'Renovação de contratos', descricao: 'Alerta e gera a renovação de contratos de prestação de serviço.', status: 'planejado' },
  { Icon: IcoAutPessoa, nome: 'Folha dos funcionários do escritório', descricao: 'Processa a folha interna do próprio escritório.', status: 'planejado' },
];
function FinanceiroPage({ onNavigate }) {
  return <AreaPage title="Financeiro" sub="Automações financeiras do próprio escritório de contabilidade." automacoes={FINANCEIRO_AUTOMACOES} onNavigate={onNavigate} />;
}

/* ---- Atendimento ---- */
const ATENDIMENTO_AUTOMACOES = [
  { Icon: IcoAutEnvelope, nome: 'Cobrança de documentação pendente', descricao: 'Lembra clientes com documentos pendentes de envio.', status: 'planejado' },
  { Icon: IcoAutGrafico, nome: 'Envio de relatórios periódicos', descricao: 'Envia relatórios e resultados para o cliente.', status: 'planejado' },
  { Icon: IcoAutDocumento, nome: 'Renovação de contratos', descricao: 'Alerta sobre vencimento e renovação de contratos com clientes.', status: 'planejado' },
  { Icon: IcoAutEntrada, nome: 'Onboarding de novo cliente', descricao: 'Conduz parte da coleta de dados e documentos na entrada de um novo cliente.', status: 'planejado', observacao: 'Parcial' },
];
function AtendimentoPage({ onNavigate }) {
  return <AreaPage title="Atendimento" sub="Automações de relacionamento e comunicação com o cliente." automacoes={ATENDIMENTO_AUTOMACOES} onNavigate={onNavigate} />;
}

Object.assign(window, {
  AutomacaoCard, FiscalPage, ContabilPage, DpPage, SocietarioPage, FinanceiroPage, AtendimentoPage,
});
