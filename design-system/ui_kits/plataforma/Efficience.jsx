// Efficience Co — Efficience / ROI: quanto as automações economizaram do escritório.
// Mirrors frontend/src/app/dashboard/efficience/page.jsx for the admin_cliente view
// (the admin_efficience cliente-picker branch does not apply to this kit's user).
const { useState: useStateEf } = React;

const ROI_PERIODOS = [{ value: '7', label: '7 dias' }, { value: '15', label: '15 dias' }, { value: '30', label: '30 dias' }];
const ROI_BREAKDOWN = [
  { nome: 'Escrituração NF-e', exec: 1842, horas: 48 },
  { nome: 'Conciliação bancária', exec: 96, horas: 22 },
  { nome: 'Folha de pagamento', exec: 4, horas: 14 },
  { nome: 'Backup de folhas de pagamento', exec: 30, horas: 6 },
  { nome: 'Arquivamento de guias pagas', exec: 210, horas: 4 },
  { nome: 'Outras automações', exec: 298, horas: 2 },
];
const VALOR_HORA = 80;

function EfficiencePage() {
  const [periodo, setPeriodo] = useStateEf('30');
  const [mensagem, setMensagem] = useStateEf('');
  const totalHoras = ROI_BREAKDOWN.reduce((s, r) => s + r.horas, 0);
  const totalExec = ROI_BREAKDOWN.reduce((s, r) => s + r.exec, 0);
  const equivalente = totalHoras * VALOR_HORA;

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'flex-end' }}>
        <div><h1>Efficience — seu escritório em números</h1><p>Quanto tempo as automações economizaram do seu time nos últimos dias.</p></div>
        <SegRadio value={periodo} onChange={setPeriodo} options={ROI_PERIODOS} />
      </div>

      <div className="grid3">
        <div className="stat"><div className="stat-label">Horas economizadas</div><div className="stat-value">{totalHoras}h</div></div>
        <div className="stat"><div className="stat-label">Automações executadas</div><div className="stat-value">{totalExec.toLocaleString('pt-BR')}</div></div>
        <div className="stat"><div className="stat-label">Equivalente em R$</div><div className="stat-value" style={{ fontSize: '26px' }}>{fmtValor(equivalente)}</div></div>
      </div>

      <div className="card2">
        <div className="card2-title">Detalhamento por automação</div>
        <div className="tbl-wrap" style={{ boxShadow: 'none', border: '1px solid var(--border)', marginTop: '12px' }}>
          <table className="tbl">
            <thead><tr><th>Automação</th><th>Execuções</th><th>Horas economizadas</th></tr></thead>
            <tbody>
              {ROI_BREAKDOWN.map((r) => (
                <tr key={r.nome}><td>{r.nome}</td><td>{r.exec.toLocaleString('pt-BR')}</td><td className="cell-name">{r.horas}h</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card2">
        <div className="card2-title">Licença</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '32px' }}>
            <div><div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--slate-500)' }}>Plano</div><div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--slate-900)', marginTop: '4px' }}>Efficience Co</div></div>
            <div><div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--slate-500)' }}>Vencimento</div><div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--slate-900)', marginTop: '4px' }}>19/08/2027</div></div>
            <div><div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--slate-500)' }}>Status</div><div style={{ marginTop: '4px' }}><Badge kind="ok">Ativa</Badge></div></div>
          </div>
          <button className="btn btn-primary" onClick={() => setMensagem('Pagamento online chega em breve — fale com o time Efficience Co para regularizar sua licença.')}>Pagar licença</button>
        </div>
        {mensagem ? <p style={{ marginTop: '14px', padding: '10px 12px', background: 'var(--brand-50)', border: '1px solid var(--brand-200)', borderRadius: 'var(--r-md)', fontSize: '13px', color: 'var(--brand-800)' }}>{mensagem}</p> : null}
      </div>
    </div>
  );
}

function fmtValor(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }

Object.assign(window, { EfficiencePage });
