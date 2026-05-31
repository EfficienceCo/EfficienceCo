// Efficience Co — Obrigações Fiscais: lista + calendário + criar/editar + concluir
const { useState: useStateOb } = React;

const CLIENTES_OPT = [
  { value: 'all', label: 'Todos os clientes' },
  { value: 'padaria', label: 'Padaria do João' },
  { value: 'lopes', label: 'Mercado Lopes ME' },
  { value: 'andrade', label: 'Andrade Transportes' },
  { value: 'bella', label: 'Bella Moda Ltda' },
];
const MES_OPT = [
  { value: '2026-05', label: 'Maio · 2026' },
  { value: '2026-04', label: 'Abril · 2026' },
  { value: '2026-06', label: 'Junho · 2026' },
];
const STATUS_OPT = [
  { value: 'all', label: 'Todas' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'concluida', label: 'Concluídas' },
  { value: 'vencida', label: 'Vencidas' },
];

const OBRIG_SEED = [
  { id: 1, nome: 'DAS — Simples Nacional', cliente: 'Padaria do João', tipo: 'Tributária', venc: '20/05/2026', dia: 20, status: 'pendente' },
  { id: 2, nome: 'DCTFWeb — comp. 04', cliente: 'Mercado Lopes ME', tipo: 'Acessória', venc: '23/05/2026', dia: 23, status: 'pendente' },
  { id: 3, nome: 'FGTS Digital', cliente: 'Andrade Transportes', tipo: 'Trabalhista', venc: '28/05/2026', dia: 28, status: 'pendente' },
  { id: 4, nome: 'EFD-Reinf', cliente: 'Bella Moda Ltda', tipo: 'Acessória', venc: '15/05/2026', dia: 15, status: 'vencida' },
  { id: 5, nome: 'ISS — Nota Carioca', cliente: 'Padaria do João', tipo: 'Municipal', venc: '10/05/2026', dia: 10, status: 'concluida' },
  { id: 6, nome: 'GPS — INSS', cliente: 'Mercado Lopes ME', tipo: 'Trabalhista', venc: '08/05/2026', dia: 8, status: 'concluida' },
  { id: 7, nome: 'DEFIS anual', cliente: 'Andrade Transportes', tipo: 'Acessória', venc: '31/05/2026', dia: 31, status: 'pendente' },
];
const STATUS_BADGE = { pendente: ['warn', 'Pendente'], concluida: ['ok', 'Concluída'], vencida: ['err', 'Vencida'] };

function ObrigacoesPage() {
  const [tab, setTab] = useStateOb('lista');
  const [status, setStatus] = useStateOb('all');
  const [cliente, setCliente] = useStateOb('all');
  const [mes, setMes] = useStateOb('2026-05');
  const [rows, setRows] = useStateOb(OBRIG_SEED);
  const [editing, setEditing] = useStateOb(null);   // obj or 'new' or null
  const [completing, setCompleting] = useStateOb(null);

  const filtered = rows.filter((r) =>
    (status === 'all' || r.status === status) &&
    (cliente === 'all' || CLIENTES_OPT.find((c) => c.value === cliente)?.label === r.cliente)
  );

  const markDone = (id) => setRows((rs) => rs.map((r) => r.id === id ? { ...r, status: 'concluida' } : r));

  return (
    <div className="page">
      <PageHead title="Obrigações fiscais" sub="Calendário fiscal e acessório dos clientes do escritório.">
        <button className="btn btn-primary" onClick={() => setEditing('new')}><IcoPlus /> Nova obrigação</button>
      </PageHead>

      <div className="grid4">
        <div className="stat"><div className="stat-label">Pendentes</div><div className="stat-value" style={{ color: 'var(--warning-700)' }}>{rows.filter(r=>r.status==='pendente').length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Vencem &lt; 7 dias</div><div className="stat-value">03</div></div>
        <div className="stat"><div className="stat-label">Vencidas</div><div className="stat-value" style={{ color: 'var(--danger-700)' }}>{rows.filter(r=>r.status==='vencida').length.toString().padStart(2,'0')}</div></div>
        <div className="stat"><div className="stat-label">Concluídas / mês</div><div className="stat-value" style={{ color: 'var(--success-700)' }}>{rows.filter(r=>r.status==='concluida').length.toString().padStart(2,'0')}</div></div>
      </div>

      <div className="toolbar">
        <PageTabs tabs={[{ key: 'lista', label: 'Lista', Icon: IcoList }, { key: 'calendario', label: 'Calendário', Icon: IcoCalendarGrid }]} active={tab} onChange={setTab} />
        <div className="spacer" />
        <Dropdown value={mes} onChange={setMes} options={MES_OPT} />
        <Dropdown value={cliente} onChange={setCliente} options={CLIENTES_OPT} />
      </div>

      {tab === 'lista' ? (
        <React.Fragment>
          <div className="toolbar">
            <FilterChips options={STATUS_OPT} value={status} onChange={setStatus} />
            <div className="spacer" />
            <Search placeholder="Buscar obrigação…" />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Obrigação</th><th>Cliente</th><th>Tipo</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-name">{r.nome}</td>
                    <td>{r.cliente}</td>
                    <td>{r.tipo}</td>
                    <td className="cell-mono">{r.venc}</td>
                    <td><Badge kind={STATUS_BADGE[r.status][0]} dot>{STATUS_BADGE[r.status][1]}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="rowactions">
                        {r.status !== 'concluida'
                          ? <button className="btn btn-secondary btn-sm" onClick={() => setCompleting(r)}><IcoCheck /> Concluir</button>
                          : <button className="iconaction" title="Comprovante"><IcoFile /></button>}
                        <button className="iconaction" title="Editar" onClick={() => setEditing(r)}><IcoEdit /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? <EmptyState Icon={IcoObrigacoes} title="Nenhuma obrigação" sub="Nenhuma obrigação para este filtro." /> : null}
          </div>
        </React.Fragment>
      ) : (
        <ObrigCalendar rows={rows} />
      )}

      {editing ? <ObrigForm row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      {completing ? <ConcluirModal row={completing} onClose={() => setCompleting(null)} onDone={() => { markDone(completing.id); setCompleting(null); }} /> : null}
    </div>
  );
}

/* ---- Calendar tab ---- */
function ObrigCalendar({ rows }) {
  const byDay = {};
  rows.forEach((r) => { (byDay[r.dia] = byDay[r.dia] || []).push(r); });
  const lead = 5, days = 31;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const kindOf = (s) => s === 'concluida' ? 'ok' : s === 'vencida' ? 'err' : 'warn';
  return (
    <div className="card2">
      <div className="card2-head"><div className="card2-title"><span className="tico"><IcoCalendarGrid /></span>Maio · 2026</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '8px' }}>
        {dow.map((d) => <div key={d} style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--slate-400)', textAlign: 'center', paddingBottom: '4px' }}>{d}</div>)}
        {cells.map((d, i) => (
          <div key={i} style={{ minHeight: '92px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: d === 17 ? 'var(--brand-50)' : '#fff', padding: '7px 8px', opacity: d ? 1 : .4 }}>
            {d ? <div style={{ fontSize: '12px', fontWeight: d === 17 ? 700 : 500, color: d === 17 ? 'var(--brand-800)' : 'var(--slate-500)', marginBottom: '5px' }}>{d}</div> : null}
            {(byDay[d] || []).map((r) => (
              <div key={r.id} className={'badge badge-' + kindOf(r.status)} style={{ display: 'flex', width: '100%', justifyContent: 'flex-start', marginBottom: '4px', fontSize: '10.5px', padding: '3px 7px', borderRadius: '6px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome.split(' — ')[0]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Create / edit modal ---- */
function ObrigForm({ row, onClose }) {
  const [rec, setRec] = useStateOb(row?.rec || 'mensal');
  return (
    <Modal title={row ? 'Editar obrigação' : 'Nova obrigação'} subtitle="Defina os dados da obrigação fiscal." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onClose}>{row ? 'Salvar alterações' : 'Criar obrigação'}</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Nome" required full><Input defaultValue={row?.nome} placeholder="Ex.: DAS — Simples Nacional" /></Field>
        <Field label="Tipo" required>
          <Select defaultValue={row?.tipo || 'Tributária'}><option>Tributária</option><option>Acessória</option><option>Trabalhista</option><option>Municipal</option></Select>
        </Field>
        <Field label="Cliente" required>
          <Select defaultValue={row?.cliente}>{CLIENTES_OPT.filter(c=>c.value!=='all').map(c=><option key={c.value}>{c.label}</option>)}</Select>
        </Field>
        <Field label="Data de vencimento" required><Input type="text" defaultValue={row?.venc} placeholder="dd/mm/aaaa" /></Field>
        <Field label="Recorrência">
          <SegRadio value={rec} onChange={setRec} options={[{ value: 'unica', label: 'Única' }, { value: 'mensal', label: 'Mensal' }, { value: 'anual', label: 'Anual' }]} />
        </Field>
        <Field label="Observações" full><Textarea placeholder="Notas internas (opcional)" /></Field>
      </div>
    </Modal>
  );
}

/* ---- Complete with upload ---- */
function ConcluirModal({ row, onClose, onDone }) {
  const [file, setFile] = useStateOb(null);
  return (
    <Modal title="Concluir obrigação" subtitle={row.nome + ' · ' + row.cliente} onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={onDone}><IcoCheck /> Marcar como concluída</button></React.Fragment>}>
      <Field label="Comprovante de entrega" help="Anexe o PDF ou imagem do comprovante (DARF, recibo, protocolo).">
        {!file ? (
          <div className="dropzone" onClick={() => setFile({ name: 'DARF_DAS_05-2026.pdf', size: '184 KB' })}>
            <div className="dz-ico"><IcoUpload /></div>
            <div className="dz-t">Arraste o arquivo ou clique para enviar</div>
            <div className="dz-s">PDF, PNG ou JPG · até 10 MB</div>
          </div>
        ) : (
          <div className="file-row">
            <span className="fi"><IcoFile /></span>
            <div style={{ flex: 1 }}><div className="fn">{file.name}</div><div className="fs">{file.size}</div></div>
            <button className="iconaction danger" onClick={() => setFile(null)}><IcoTrash /></button>
          </div>
        )}
      </Field>
      <Field label="Data da entrega"><Input type="text" defaultValue="17/05/2026" /></Field>
    </Modal>
  );
}

Object.assign(window, { ObrigacoesPage, CLIENTES_OPT });
