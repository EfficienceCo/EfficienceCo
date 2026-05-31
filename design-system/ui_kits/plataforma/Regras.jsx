// Efficience Co — Regras de Automação: lista + toggle + criar/editar
const { useState: useStateRg } = React;

const REGRAS_SEED = [
  { id: 1, nome: 'Organizar NF-e recebidas', origem: '/entrada/nfe', destino: '/clientes/{cliente}/nfe', cond: 'arquivo .xml', acao: 'mover', cliente: 'Padaria do João', on: true },
  { id: 2, nome: 'Renomear extratos bancários', origem: '/entrada/extratos', destino: '/clientes/{cliente}/extratos', cond: 'nome contém "extrato"', acao: 'renomear', cliente: 'Mercado Lopes ME', on: true },
  { id: 3, nome: 'Arquivar guias pagas', origem: '/entrada/guias', destino: '/arquivo/{ano}/guias', cond: 'arquivo .pdf', acao: 'mover', cliente: 'Todos', on: true },
  { id: 4, nome: 'Separar documentos de abertura', origem: '/entrada/abertura', destino: '/processos/abertura', cond: 'pasta nova', acao: 'mover', cliente: 'Andrade Transportes', on: false },
  { id: 5, nome: 'Backup de folhas de pagamento', origem: '/clientes/{cliente}/folha', destino: '/backup/folha', cond: 'fim do mês', acao: 'copiar', cliente: 'Todos', on: true },
];
const ACAO_BADGE = { mover: 'brand', renomear: 'neutral', copiar: 'neutral' };

function RegrasPage() {
  const [rows, setRows] = useStateRg(REGRAS_SEED);
  const [editing, setEditing] = useStateRg(null);
  const toggle = (id) => setRows((rs) => rs.map((r) => r.id === id ? { ...r, on: !r.on } : r));
  return (
    <div className="page">
      <PageHead title="Regras de automação" sub="O que o agente local executa sozinho na máquina do escritório.">
        <button className="btn btn-primary" onClick={() => setEditing('new')}><IcoPlus /> Nova regra</button>
      </PageHead>

      <div className="grid4">
        <div className="stat"><div className="stat-label">Regras ativas</div><div className="stat-value" style={{ color: 'var(--success-700)' }}>{rows.filter(r=>r.on).length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Inativas</div><div className="stat-value">{rows.filter(r=>!r.on).length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Execuções hoje</div><div className="stat-value">1.2k</div></div>
        <div className="stat"><div className="stat-label">Falhas (24h)</div><div className="stat-value" style={{ color: 'var(--danger-700)' }}>02</div></div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th style={{ width: '56px' }}>Ativa</th><th>Regra</th><th>Origem → destino</th><th>Ação</th><th>Cliente</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.on ? 1 : .6 }}>
                <td><Toggle on={r.on} onChange={() => toggle(r.id)} /></td>
                <td><div className="cell-name">{r.nome}</div><div className="cell-sub">condição: {r.cond}</div></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--slate-600)' }}>
                    <span style={{ background: 'var(--slate-100)', padding: '2px 7px', borderRadius: '5px' }}>{r.origem}</span>
                    <IcoArrowRight width="14" height="14" style={{ stroke: 'var(--slate-400)', fill: 'none', strokeWidth: 2 }} />
                    <span style={{ background: 'var(--slate-100)', padding: '2px 7px', borderRadius: '5px' }}>{r.destino}</span>
                  </div>
                </td>
                <td><Badge kind={ACAO_BADGE[r.acao]}>{r.acao}</Badge></td>
                <td>{r.cliente}</td>
                <td style={{ textAlign: 'right' }}>
                  <div className="rowactions">
                    <button className="iconaction" title="Editar" onClick={() => setEditing(r)}><IcoEdit /></button>
                    <button className="iconaction danger" title="Excluir"><IcoTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? <RegraForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function RegraForm({ row, onClose }) {
  const [acao, setAcao] = useStateRg(row?.acao || 'mover');
  return (
    <Modal title={row ? 'Editar regra' : 'Nova regra de automação'} subtitle="O agente aplica a regra quando a condição for satisfeita." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onClose}>{row ? 'Salvar regra' : 'Criar regra'}</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Nome da regra" required full><Input defaultValue={row?.nome} placeholder="Ex.: Organizar NF-e recebidas" /></Field>
        <Field label="Pasta de origem" required><Input defaultValue={row?.origem} placeholder="/entrada/nfe" /></Field>
        <Field label="Pasta de destino" required><Input defaultValue={row?.destino} placeholder="/clientes/{cliente}/nfe" /></Field>
        <Field label="Condição" required full><Input defaultValue={row?.cond} placeholder='Ex.: arquivo .xml · nome contém "extrato"' /></Field>
        <Field label="Ação" required>
          <SegRadio value={acao} onChange={setAcao} options={[{ value: 'mover', label: 'Mover' }, { value: 'renomear', label: 'Renomear' }, { value: 'copiar', label: 'Copiar' }]} />
        </Field>
        <Field label="Cliente associado">
          <Select defaultValue={row?.cliente}><option>Todos</option>{CLIENTES_OPT.filter(c=>c.value!=='all').map(c=><option key={c.value}>{c.label}</option>)}</Select>
        </Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 14px', background: 'var(--brand-50)', border: '1px solid var(--brand-200)', borderRadius: 'var(--r-md)' }}>
        <IcoBolt width="18" height="18" style={{ stroke: 'var(--brand-600)', fill: 'none', strokeWidth: 1.8, flex: 'none' }} />
        <span style={{ fontSize: '13px', color: 'var(--brand-800)' }}>A regra entra em vigor assim que o agente local sincronizar (até 24h).</span>
      </div>
    </Modal>
  );
}

Object.assign(window, { RegrasPage });
