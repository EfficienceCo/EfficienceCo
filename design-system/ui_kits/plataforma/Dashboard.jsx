// Efficience Co — Dashboard cockpit
function Card2({ title, tico: Tico, desc, action, children }) {
  return (
    <section className="card2">
      <div className="card2-head">
        <div>
          <div className="card2-title">{Tico ? <span className="tico"><Tico /></span> : null}{title}</div>
          {desc ? <div className="card2-desc">{desc}</div> : null}
        </div>
        {action || null}
      </div>
      {children}
    </section>
  );
}

/* ---- Focus: next critical deadline ---- */
function FocusCard({ onPrep }) {
  return (
    <div className="focus">
      <div className="focus-eyebrow"><span className="dot" /> Próximo vencimento crítico</div>
      <div className="focus-name">DAS — Simples Nacional</div>
      <div className="focus-sub">Contabilidade Andrade ME · 14 guias a emitir</div>
      <div className="focus-row">
        <div className="countdown"><span className="big tnum">3</span><span className="lbl">dias</span></div>
        <div className="focus-meta">
          <span>Vence em <b>20/05/2026</b></span>
          <span>Competência <b>04/2026</b></span>
          <span>Valor estimado <b>R$ 18.420,00</b></span>
        </div>
      </div>
      <div className="focus-cta">
        <button className="btn btn-primary"><IcoBolt /> Preparar guias</button>
        <button className="btn btn-onfocus">Ver obrigação</button>
      </div>
    </div>
  );
}

function Kpi({ Icon, label, value, trend, dir }) {
  return (
    <div className="kpi">
      <div className="kpi-ico"><Icon /></div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value tnum">{value}</div>
      </div>
      <div className={'kpi-trend ' + dir}>{trend}</div>
    </div>
  );
}

function KpiStack() {
  return (
    <div className="kpi-stack">
      <Kpi Icon={IcoObrigacoes} label="Obrigações abertas" value="38" trend="−6" dir="up" />
      <Kpi Icon={IcoProcessos} label="Processos ativos" value="142" trend="+12" dir="flat" />
      <Kpi Icon={IcoBolt} label="Horas poupadas / mês" value="96h" trend="+18%" dir="up" />
    </div>
  );
}

/* ---- Obligations calendar (May 2026, today = 17) ---- */
const MARKS = { 8: 'ok', 15: 'err', 20: 'warn', 23: 'warn', 28: 'ok', 31: 'warn' };
function buildMonth() {
  // May 2026 starts on Friday (index 5, Sun=0). 31 days.
  const lead = 5, days = 31;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ n: 26 + i, muted: true });
  for (let d = 1; d <= days; d++) cells.push({ n: d });
  let nx = 1;
  while (cells.length % 7 !== 0) cells.push({ n: nx++, muted: true });
  return cells;
}
function ObligationsCalendar() {
  const cells = buildMonth();
  const dow = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  return (
    <Card2 title="Calendário de obrigações" tico={IcoObrigacoes} desc="Maio · 2026">
      <div className="cal">
        <div className="cal-grid">
          {dow.map((d, i) => <div className="cal-dow" key={'h' + i}>{d}</div>)}
          {cells.map((c, i) => {
            const mk = !c.muted ? MARKS[c.n] : null;
            const today = !c.muted && c.n === 17;
            return (
              <div className={'cal-day' + (c.muted ? ' muted' : '') + (today ? ' today' : '')} key={i}>
                {c.n}{mk ? <span className={'mk ' + mk} /> : null}
              </div>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i style={{ background: 'var(--success-500)' }} /> Entregue</span>
          <span><i style={{ background: 'var(--warning-500)' }} /> A vencer</span>
          <span><i style={{ background: 'var(--danger-500)' }} /> Em atraso</span>
        </div>
      </div>
    </Card2>
  );
}

/* ---- Agent automation activity ---- */
const WEEK = [['seg', 62], ['ter', 88], ['qua', 71], ['qui', 96], ['sex', 120], ['sáb', 34], ['hoje', 142]];
function AgentActivity() {
  const max = 150;
  return (
    <Card2 title="Atividade do agente" tico={IcoBolt} desc="Automações executadas · últimos 7 dias"
      action={<span className="badge badge-ok"><span className="dot" />conectado</span>}>
      <div className="activity">
        <div className="activity-head">
          <span className="activity-num tnum">613</span>
          <span className="activity-cap">automações na semana · +18% vs. anterior</span>
        </div>
        <div className="bars">
          {WEEK.map(([d, v], i) => (
            <div className={'col' + (i === WEEK.length - 1 ? ' peak' : '')} key={i}>
              <div className="bar" style={{ height: Math.round((v / max) * 96) + 'px' }} />
              <span className="dlabel">{d}</span>
            </div>
          ))}
        </div>
      </div>
    </Card2>
  );
}

/* ---- Processos ---- */
const PROC = [
  ['Abertura · Padaria Lopes', 'em andamento', 'var(--brand-500)'],
  ['Alteração contratual · Vértice', 'em revisão', 'var(--slate-400)'],
  ['Baixa MEI · J. Santos', 'em atraso', 'var(--danger-500)'],
  ['Parcelamento · Nova Gestão', 'em andamento', 'var(--brand-500)'],
];
function Processos({ onSee }) {
  return (
    <Card2 title="Processos" tico={IcoProcessos} desc="Andamentos abertos nos escritórios."
      action={<button className="btn btn-secondary btn-sm" onClick={onSee}>Ver todos</button>}>
      {PROC.map((p, i) => (
        <div className="lrow" key={i}>
          <div className="lrow-l">
            <span className="lrow-tick" style={{ background: p[2] }} />
            <div><div className="lrow-name">{p[0]}</div></div>
          </div>
          <span className={'badge ' + (p[1] === 'em atraso' ? 'badge-err' : 'badge-neutral')}>{p[1]}</span>
        </div>
      ))}
    </Card2>
  );
}

/* ---- Agent event terminal ---- */
const EVENTS = [
  ['10:42', 'OK', '#34D399', 'licença validada · próxima verificação em 24h'],
  ['10:31', 'INFO', '#94A3B8', 'importou 14 NFS-e do portal municipal'],
  ['09:58', 'WARN', '#FBBF24', '3 obrigações vencem em < 48h'],
  ['09:12', 'INFO', '#94A3B8', 'conciliou 212 lançamentos bancários'],
  ['08:40', 'OK', '#34D399', 'backup automático concluído'],
];
function AgentEvents() {
  return (
    <Card2 title="Eventos do agente" tico={IcoLogs} desc="Log em tempo real da máquina do escritório.">
      <div className="terminal">
        {EVENTS.map((e, i) => (
          <div key={i}>
            <span style={{ color: '#7DD3FC' }}>{e[0]}</span>{' '}
            <span style={{ color: e[2], fontWeight: 600 }}>{e[1]}</span>{'  '}
            <span style={{ color: '#CBD5E1' }}>{e[3]}</span>
          </div>
        ))}
      </div>
    </Card2>
  );
}

function DashboardPage({ onNavigate }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Bom dia, Victor.</h1>
        <p>3 obrigações pedem atenção esta semana — o agente já adiantou o operacional.</p>
      </div>
      <div className="cockpit">
        <FocusCard />
        <KpiStack />
      </div>
      <div className="grid2">
        <ObligationsCalendar />
        <AgentActivity />
      </div>
      <div className="grid2">
        <Processos onSee={() => onNavigate('processos')} />
        <AgentEvents />
      </div>
    </div>
  );
}

Object.assign(window, { Card2, DashboardPage });
