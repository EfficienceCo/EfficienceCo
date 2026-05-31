// Efficience Co — Processos e Checklists: lista + detalhe + criar + abertura de empresa
const { useState: useStatePr } = React;

const PROC_SEED = [
  { id: 1, nome: 'Folha de pagamento — Maio', tipo: 'Folha de pagamento', cliente: 'Andrade Transportes', resp: 'Marina Reis', status: 'em_andamento', prog: 60 },
  { id: 2, nome: 'Abertura — Padaria do João II', tipo: 'Abertura de empresa', cliente: 'Padaria do João', resp: 'Victor Almeida', status: 'em_andamento', prog: 40 },
  { id: 3, nome: 'Folha de pagamento — Maio', tipo: 'Folha de pagamento', cliente: 'Bella Moda Ltda', resp: 'Marina Reis', status: 'concluido', prog: 100 },
  { id: 4, nome: 'Baixa de MEI — J. Santos', tipo: 'Baixa de empresa', cliente: 'Mercado Lopes ME', resp: 'Caio Nunes', status: 'parado', prog: 25 },
  { id: 5, nome: 'Alteração contratual', tipo: 'Alteração societária', cliente: 'Bella Moda Ltda', resp: 'Victor Almeida', status: 'em_andamento', prog: 75 },
];
const PROC_STATUS = { em_andamento: ['neutral', 'Em andamento'], concluido: ['ok', 'Concluído'], parado: ['err', 'Parado'] };
const PTIPO_OPT = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'Folha de pagamento', label: 'Folha de pagamento' },
  { value: 'Abertura de empresa', label: 'Abertura de empresa' },
  { value: 'Baixa de empresa', label: 'Baixa de empresa' },
  { value: 'Alteração societária', label: 'Alteração societária' },
];

const STEPS_SEED = [
  { t: 'Coletar documentos dos sócios', who: 'Marina Reis', done: true },
  { t: 'Consultar viabilidade na Junta Comercial', who: 'Marina Reis', done: true },
  { t: 'Registrar contrato social', who: 'Victor Almeida', done: true },
  { t: 'Emitir CNPJ na Receita Federal', who: null, done: false },
  { t: 'Inscrição municipal e alvará', who: null, done: false },
  { t: 'Configurar regras no agente local', who: null, done: false },
];

function ProcessosPage() {
  const [detail, setDetail] = useStatePr(null);
  const [creating, setCreating] = useStatePr(null);   // 'new' | 'abertura' | null
  const [tipo, setTipo] = useStatePr('all');
  const [status, setStatus] = useStatePr('all');
  const [rows] = useStatePr(PROC_SEED);

  if (detail) return <ProcessoDetail proc={detail} onBack={() => setDetail(null)} />;

  const filtered = rows.filter((r) => (tipo === 'all' || r.tipo === tipo) && (status === 'all' || r.status === status));

  return (
    <div className="page">
      <PageHead title="Processos e checklists" sub="Folha, aberturas, baixas e alterações — acompanhadas etapa a etapa.">
        <button className="btn btn-secondary" onClick={() => setCreating('abertura')}><IcoBuilding2 /> Abertura de empresa</button>
        <button className="btn btn-primary" onClick={() => setCreating('new')}><IcoPlus /> Novo processo</button>
      </PageHead>

      <div className="grid4">
        <div className="stat"><div className="stat-label">Em andamento</div><div className="stat-value">{rows.filter(r=>r.status==='em_andamento').length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Parados</div><div className="stat-value" style={{ color: 'var(--danger-700)' }}>{rows.filter(r=>r.status==='parado').length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Concluídos / mês</div><div className="stat-value" style={{ color: 'var(--success-700)' }}>18</div></div>
        <div className="stat"><div className="stat-label">Prazo médio</div><div className="stat-value">6<span style={{ fontSize: '16px', color: 'var(--slate-400)' }}> dias</span></div></div>
      </div>

      <div className="toolbar">
        <FilterChips options={[{ value: 'all', label: 'Todos' }, { value: 'em_andamento', label: 'Em andamento' }, { value: 'parado', label: 'Parados' }, { value: 'concluido', label: 'Concluídos' }]} value={status} onChange={setStatus} />
        <div className="spacer" />
        <Dropdown value={tipo} onChange={setTipo} options={PTIPO_OPT} />
        <Search placeholder="Buscar processo…" />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Processo</th><th>Cliente</th><th>Responsável</th><th style={{ width: '180px' }}>Progresso</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                <td><div className="cell-name">{r.nome}</div><div className="cell-sub">{r.tipo}</div></td>
                <td>{r.cliente}</td>
                <td><div className="cell-user"><Avatar name={r.resp} /><span>{r.resp}</span></div></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1 }}><Progress value={r.prog} done={r.prog === 100} /></div>
                    <span className="cell-mono" style={{ fontSize: '11.5px' }}>{r.prog}%</span>
                  </div>
                </td>
                <td><Badge kind={PROC_STATUS[r.status][0]} dot>{PROC_STATUS[r.status][1]}</Badge></td>
                <td style={{ textAlign: 'right' }}><button className="iconaction"><IcoArrowRight /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating === 'new' ? <ProcessoForm onClose={() => setCreating(null)} /> : null}
      {creating === 'abertura' ? <AberturaForm onClose={() => setCreating(null)} /> : null}
    </div>
  );
}

/* ---- Detail with checklist ---- */
function ProcessoDetail({ proc, onBack }) {
  const [steps, setSteps] = useStatePr(STEPS_SEED.map((s) => ({ ...s })));
  const toggle = (i) => setSteps((ss) => ss.map((s, j) => j === i ? { ...s, done: !s.done, who: !s.done ? 'Victor Almeida' : s.who } : s));
  const doneCount = steps.filter((s) => s.done).length;
  const prog = Math.round((doneCount / steps.length) * 100);
  return (
    <div className="page">
      <div className="detail-head">
        <button className="back-btn" onClick={onBack}><IcoChevLeft /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '28px', letterSpacing: '-0.02em', margin: 0 }}>{proc.nome}</h1>
          <p style={{ fontSize: '14px', color: 'var(--fg-muted)', margin: '7px 0 0' }}>{proc.tipo} · {proc.cliente}</p>
        </div>
        <Badge kind={PROC_STATUS[proc.status][0]} dot>{PROC_STATUS[proc.status][1]}</Badge>
      </div>

      <div className="card2">
        <div className="kv">
          <div><div className="k">Cliente</div><div className="v">{proc.cliente}</div></div>
          <div><div className="k">Responsável</div><div className="v">{proc.resp}</div></div>
          <div><div className="k">Aberto em</div><div className="v mono">02/05/2026</div></div>
          <div><div className="k">Prazo</div><div className="v mono">30/05/2026</div></div>
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card2">
          <div className="card2-head">
            <div className="card2-title"><span className="tico"><IcoCheck /></span>Etapas do processo</div>
            <span className="cell-sub">{doneCount} de {steps.length} concluídas</span>
          </div>
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}><Progress value={prog} done={prog === 100} /></div>
            <span className="cell-mono" style={{ fontWeight: 600 }}>{prog}%</span>
          </div>
          <div className="checklist">
            {steps.map((s, i) => (
              <div key={i} className={'check-item' + (s.done ? ' done' : '')}>
                <button className={'checkbox' + (s.done ? ' on' : '')} onClick={() => toggle(i)}><IcoCheck /></button>
                <div className="check-main">
                  <div className="check-title">{s.t}</div>
                  <div className="check-meta">
                    {s.done && s.who ? <span className="who"><span className="av">{s.who.split(' ').map(x=>x[0]).join('')}</span>{s.who}</span> : <span>Pendente</span>}
                  </div>
                </div>
                {s.done ? <IcoCheckCircle width="18" height="18" style={{ color: 'var(--success-500)', stroke: 'currentColor', fill: 'none', strokeWidth: 1.8 }} /> : null}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card2">
            <div className="block-label">Documentos</div>
            <div className="file-row" style={{ marginBottom: '8px' }}><span className="fi"><IcoFile /></span><div style={{ flex: 1 }}><div className="fn">contrato_social.pdf</div><div className="fs">312 KB</div></div></div>
            <div className="file-row"><span className="fi"><IcoFile /></span><div style={{ flex: 1 }}><div className="fn">rg_socios.pdf</div><div className="fs">1.1 MB</div></div></div>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}><IcoUpload /> Anexar documento</button>
          </div>
          <div className="card2">
            <div className="block-label">Automação vinculada</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--slate-700)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcoBolt width="18" height="18" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.8 }} /></span>
              <div><div style={{ fontWeight: 600, color: 'var(--slate-900)' }}>Organizar documentos de abertura</div><div className="cell-sub">Regra ativa · executa ao concluir etapa</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Create process modal ---- */
function ProcessoForm({ onClose }) {
  return (
    <Modal title="Novo processo" subtitle="Crie um processo manual a partir de um modelo." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onClose}>Criar processo</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Tipo de processo" required full>
          <Select>{PTIPO_OPT.filter(t=>t.value!=='all').map(t=><option key={t.value}>{t.label}</option>)}</Select>
        </Field>
        <Field label="Cliente" required>
          <Select>{CLIENTES_OPT.filter(c=>c.value!=='all').map(c=><option key={c.value}>{c.label}</option>)}</Select>
        </Field>
        <Field label="Responsável" required>
          <Select><option>Victor Almeida</option><option>Marina Reis</option><option>Caio Nunes</option></Select>
        </Field>
        <Field label="Prazo"><Input type="text" placeholder="dd/mm/aaaa" /></Field>
        <Field label="Nome do processo" full><Input placeholder="Ex.: Folha de pagamento — Maio" /></Field>
      </div>
      <div className="help">As etapas do checklist são geradas automaticamente conforme o tipo selecionado.</div>
    </Modal>
  );
}

/* ---- Abertura de empresa form ---- */
function AberturaForm({ onClose }) {
  const [regime, setRegime] = useStatePr('simples');
  return (
    <Modal size="lg" title="Abertura de empresa" subtitle="Os dados abaixo disparam o processo e a automação no agente local." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onClose}><IcoBolt /> Iniciar abertura</button></React.Fragment>}>
      <div className="block-label">Dados da empresa</div>
      <div className="form-grid">
        <Field label="Razão social" required full><Input placeholder="Ex.: Padaria do João II Ltda" /></Field>
        <Field label="Nome fantasia"><Input placeholder="Padaria do João II" /></Field>
        <Field label="CNAE principal" required><Input placeholder="1091-1/02 — Padaria" /></Field>
        <Field label="Regime tributário" required full>
          <SegRadio value={regime} onChange={setRegime} options={[{ value: 'simples', label: 'Simples Nacional' }, { value: 'presumido', label: 'Lucro Presumido' }, { value: 'real', label: 'Lucro Real' }]} />
        </Field>
      </div>
      <div className="block-label" style={{ marginTop: '6px' }}>Sócios</div>
      <div className="form-grid">
        <Field label="Sócio 1 — nome" required><Input placeholder="Nome completo" /></Field>
        <Field label="Sócio 1 — CPF" required><Input placeholder="000.000.000-00" /></Field>
        <Field label="Sócio 2 — nome"><Input placeholder="Nome completo (opcional)" /></Field>
        <Field label="Sócio 2 — CPF"><Input placeholder="000.000.000-00" /></Field>
      </div>
      <div className="block-label" style={{ marginTop: '6px' }}>Endereço</div>
      <div className="form-grid">
        <Field label="Logradouro" required full><Input placeholder="Rua, número, complemento" /></Field>
        <Field label="Cidade / UF" required><Input placeholder="Rio de Janeiro / RJ" /></Field>
        <Field label="CEP" required><Input placeholder="00000-000" /></Field>
      </div>
    </Modal>
  );
}

Object.assign(window, { ProcessosPage });
