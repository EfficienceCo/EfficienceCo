// Efficience Co — detail screens for the área automations that are actually
// "disponivel" today: Fiscal/Escrituração NF-e, Contábil/Conciliação bancária,
// DP/Folha de pagamento mensal. Mirrors the real page.jsx structure for each.
const { useState: useStateAD } = React;

/* ================= Fiscal — Escrituração NF-e ================= */
const ESCRITURACAO_ROWS = [
  { data: '02/05', chave: '35260512345678000199550010000012341123456789', tipo: 'entrada', emit: '12.345.678/0001-99', dest: '98.765.432/0001-11', valor: 8420 },
  { data: '04/05', chave: '35260598765432000111550010000089121987654321', tipo: 'saida', emit: '98.765.432/0001-11', dest: '11.222.333/0001-44', valor: 1280 },
  { data: '07/05', chave: '35260511222333000144550010000003401122334455', tipo: 'entrada', emit: '11.222.333/0001-44', dest: '98.765.432/0001-11', valor: 640 },
  { data: '11/05', chave: '35260555666777000122550010000089201556667777', tipo: 'saida', emit: '98.765.432/0001-11', dest: '55.666.777/0001-22', valor: 3100 },
  { data: '15/05', chave: '35260533444555000166550010000198721334445555', tipo: 'entrada', emit: '33.444.555/0001-66', dest: '98.765.432/0001-11', valor: 12400 },
  { data: '18/05', chave: '35260598765432000111550010000089301987654321', tipo: 'saida', emit: '98.765.432/0001-11', dest: '12.345.678/0001-99', valor: 980 },
  { data: '21/05', chave: '35260512345678000199550010000076541123456789', tipo: 'entrada', emit: '12.345.678/0001-99', dest: '98.765.432/0001-11', valor: 1850 },
  { data: '25/05', chave: '35260598765432000111550010000089401987654321', tipo: 'saida', emit: '98.765.432/0001-11', dest: '11.222.333/0001-44', valor: 430 },
];
function fmtValor(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v); }
function truncChave(c) { return c.length <= 16 ? c : `${c.slice(0, 8)}…${c.slice(-6)}`; }

function FiscalEscrituracaoPage() {
  const totalNfe = ESCRITURACAO_ROWS.length;
  const valorTotal = ESCRITURACAO_ROWS.reduce((s, r) => s + r.valor, 0);
  return (
    <div className="page">
      <div className="page-head"><h1>Escrituração NF-e</h1><p>Lançamentos de NFe registrados automaticamente pelo agente.</p></div>

      <div className="grid4">
        <div className="stat"><div className="stat-label">Total de NFes processadas</div><div className="stat-value">{totalNfe}</div></div>
        <div className="stat"><div className="stat-label">Valor total</div><div className="stat-value" style={{ fontSize: '24px' }}>{fmtValor(valorTotal)}</div></div>
        <div className="stat"><div className="stat-label">ICMS total</div><div className="stat-value" style={{ fontSize: '24px' }}>{fmtValor(valorTotal * 0.078)}</div></div>
        <div className="stat"><div className="stat-label">PIS + COFINS total</div><div className="stat-value" style={{ fontSize: '24px' }}>{fmtValor(valorTotal * 0.0217)}</div></div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Data emissão</th><th>Chave NFe</th><th>Tipo</th><th>CNPJ emitente</th><th>CNPJ destinatário</th><th>Valor total</th></tr></thead>
          <tbody>
            {ESCRITURACAO_ROWS.map((r, i) => (
              <tr key={i}>
                <td>{r.data}</td>
                <td className="cell-mono" title={r.chave}>{truncChave(r.chave)}</td>
                <td><Badge kind={r.tipo === 'entrada' ? 'ok' : 'err'}>{r.tipo === 'entrada' ? 'Entrada' : 'Saída'}</Badge></td>
                <td className="cell-mono">{r.emit}</td>
                <td className="cell-mono">{r.dest}</td>
                <td className="cell-name">{fmtValor(r.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= Contábil — Conciliação bancária ================= */
const LANCAMENTOS_SEED = [
  { id: 1, data: '02/05', desc: 'Pagamento fornecedor Distribuidora ABC', tipo: 'debito', valor: 2340, conciliado: true },
  { id: 2, data: '05/05', desc: 'Recebimento honorários — Padaria do João', tipo: 'credito', valor: 890, conciliado: true },
  { id: 3, data: '09/05', desc: 'Tarifa bancária', tipo: 'debito', valor: 42.9, conciliado: true },
  { id: 4, data: '14/05', desc: 'Recebimento honorários — Mercado Lopes ME', tipo: 'credito', valor: 650, conciliado: false },
  { id: 5, data: '18/05', desc: 'Pagamento fornecedor Embalagens Sul', tipo: 'debito', valor: 1180, conciliado: false },
];
const SESSOES_SEED = [
  { id: 1, data: '30/04/2026 18:02', status: 'concluida', conciliadas: 47, total: 47 },
  { id: 2, data: '31/05/2026 09:15', status: 'em_andamento', conciliadas: 42, total: 47 },
];
const SESSAO_DETALHE = {
  automatico: 38,
  provavel: [
    { id: 'p1', dataBanco: '19/05', descBanco: 'TED recebida Distrib ABC', dataLanc: '19/05', descLanc: 'Recebimento cliente', valor: 2450 },
    { id: 'p2', dataBanco: '20/05', descBanco: 'PIX enviado Embalagens', dataLanc: '20/05', descLanc: 'Pagto fornecedor', valor: 890.15 },
    { id: 'p3', dataBanco: '21/05', descBanco: 'Tarifa bancária', dataLanc: '21/05', descLanc: 'Despesa bancária', valor: 42.9 },
    { id: 'p4', dataBanco: '22/05', descBanco: 'DOC recebido Mercado V.', dataLanc: '23/05', descLanc: 'Recebimento cliente', valor: 1180 },
  ],
  semParExtrato: [{ data: '24/05', desc: 'PIX recebido — não identificado', valor: 350 }, { data: '25/05', desc: 'Depósito em dinheiro', valor: 620 }],
  semParLanc: [{ data: '21/05', desc: 'Provisão de honorários', valor: 890 }],
};

function LancamentoModal({ onClose, onSave }) {
  const [tipo, setTipo] = useStateAD('debito');
  return (
    <Modal title="Novo lançamento" subtitle="Informe os dados do lançamento contábil interno." onClose={onClose}
      footer={<React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => { onSave(tipo); onClose(); }}>Adicionar lançamento</button></React.Fragment>}>
      <div className="form-grid">
        <Field label="Data" required><Input type="date" /></Field>
        <Field label="Tipo" required><SegRadio value={tipo} onChange={setTipo} options={[{ value: 'debito', label: 'Débito' }, { value: 'credito', label: 'Crédito' }]} /></Field>
        <Field label="Descrição" required full><Input placeholder="Ex.: Pagamento fornecedor ABC" /></Field>
        <Field label="Valor" required><Input type="number" step="0.01" placeholder="0,00" /></Field>
        <Field label="Categoria (opcional)"><Input placeholder="Ex.: fornecedor" /></Field>
      </div>
    </Modal>
  );
}

function SessaoDetalheModal({ sessao, onClose }) {
  const [provavel, setProvavel] = useStateAD(SESSAO_DETALHE.provavel);
  const [automatico, setAutomatico] = useStateAD(SESSAO_DETALHE.automatico);
  const resolve = (id) => setProvavel((rows) => rows.filter((r) => r.id !== id));
  const confirmar = (id) => { resolve(id); setAutomatico((n) => n + 1); };
  return (
    <Modal title="Revisão da conciliação" subtitle={`Sessão de ${sessao.data}`} size="lg" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--success-100)', borderRadius: 'var(--r-md)' }}>
          <IcoCheckCircle width="18" height="18" style={{ stroke: 'var(--success-700)', fill: 'none', strokeWidth: 2 }} />
          <span style={{ fontSize: '13px', color: 'var(--success-700)', fontWeight: 600 }}>{automatico} matches automáticos</span>
        </div>

        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '8px' }}>Provável — {provavel.length} sem decisão</div>
          {provavel.length === 0 ? <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>Nenhum par provável pendente.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {provavel.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--slate-700)' }}>
                    <div><b>{p.descBanco}</b> · {p.dataBanco}</div>
                    <div style={{ color: 'var(--fg-muted)' }}>{p.descLanc} · {p.dataLanc} · {fmtValor(p.valor)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => confirmar(p.id)}>Confirmar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => resolve(p.id)}>Rejeitar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '8px' }}>Sem par — leitura apenas</div>
          <div style={{ fontSize: '12.5px', color: 'var(--fg-muted)' }}>
            {SESSAO_DETALHE.semParExtrato.length} transações sem lançamento · {SESSAO_DETALHE.semParLanc.length} lançamentos sem transação
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ContabilConciliacaoPage() {
  const [lancamentos, setLancamentos] = useStateAD(LANCAMENTOS_SEED);
  const [modalNovo, setModalNovo] = useStateAD(false);
  const [sessaoAberta, setSessaoAberta] = useStateAD(null);
  const addLancamento = (tipo) => setLancamentos((rows) => [{ id: rows.length + 1, data: '31/05', desc: 'Novo lançamento', tipo, valor: 0, conciliado: false }, ...rows]);

  return (
    <div className="page">
      <div className="page-head"><h1>Conciliação bancária</h1><p>Gerencie os lançamentos internos, envie o extrato e revise as sessões de conciliação.</p></div>

      <div className="card2">
        <div className="card2-head">
          <div className="card2-title">Lançamentos internos</div>
          <button className="btn btn-primary btn-sm" onClick={() => setModalNovo(true)}><IcoPlus /> Adicionar lançamento</button>
        </div>
        <div className="tbl-wrap" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
          <table className="tbl">
            <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Conciliado?</th></tr></thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>{l.data}</td><td>{l.desc}</td>
                  <td><Badge kind={l.tipo === 'credito' ? 'ok' : 'err'}>{l.tipo === 'credito' ? 'Crédito' : 'Débito'}</Badge></td>
                  <td className="cell-name">{fmtValor(l.valor)}</td>
                  <td><Badge kind={l.conciliado ? 'ok' : 'neutral'}>{l.conciliado ? 'Sim' : 'Não'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card2">
        <div className="card2-title">Extrato bancário</div>
        <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: '4px 0 12px' }}>Bradesco · Ag 1234-5 · 47 transações importadas em 31/05/2026 08:14.</p>
        <button className="btn btn-secondary btn-sm"><IcoUpload /> Enviar novo extrato</button>
      </div>

      <div className="card2">
        <div className="card2-title">Sessões de conciliação</div>
        <div className="tbl-wrap" style={{ boxShadow: 'none', border: '1px solid var(--border)', marginTop: '12px' }}>
          <table className="tbl">
            <thead><tr><th>Data</th><th>Status</th><th>Conciliadas / total</th><th></th></tr></thead>
            <tbody>
              {SESSOES_SEED.map((s) => (
                <tr key={s.id}>
                  <td>{s.data}</td>
                  <td><Badge kind={s.status === 'concluida' ? 'ok' : 'brand'}>{s.status === 'concluida' ? 'Concluída' : 'Em andamento'}</Badge></td>
                  <td>{s.conciliadas} / {s.total}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => setSessaoAberta(s)}>Ver detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalNovo ? <LancamentoModal onClose={() => setModalNovo(false)} onSave={addLancamento} /> : null}
      {sessaoAberta ? <SessaoDetalheModal sessao={sessaoAberta} onClose={() => setSessaoAberta(null)} /> : null}
    </div>
  );
}

/* ================= DP — Folha de pagamento mensal ================= */
const FOLHA_CLIENTES = [
  { nome: 'Padaria do João', ok: true },
  { nome: 'Mercado Lopes ME', ok: true },
  { nome: 'Andrade Transportes', ok: true },
  { nome: 'Bella Moda Ltda', ok: false },
];

function FolhaStatusModal({ onClose }) {
  const done = FOLHA_CLIENTES.filter((c) => c.ok).length;
  const pct = Math.round((done / FOLHA_CLIENTES.length) * 100);
  return (
    <Modal title="Status da folha" subtitle="Maio · 2026" onClose={onClose}>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '12.5px', color: 'var(--fg-muted)', marginBottom: '6px' }}>{done} de {FOLHA_CLIENTES.length} clientes processados</div>
        <Progress value={pct} done={pct === 100} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {FOLHA_CLIENTES.map((c) => (
          <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13.5px', color: 'var(--slate-700)' }}>
            {c.ok ? <IcoCheckCircle width="16" height="16" style={{ stroke: 'var(--success-600)', fill: 'none', strokeWidth: 2 }} /> : <IcoClock width="16" height="16" style={{ stroke: 'var(--warning-600)', fill: 'none', strokeWidth: 2 }} />}
            {c.nome}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function FolhaUploadModal({ onClose }) {
  const [sent, setSent] = useStateAD(false);
  return (
    <Modal title="Upload da folha" subtitle="Envie a planilha preenchida para iniciar o processamento." onClose={onClose}
      footer={sent ? null : <React.Fragment><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => setSent(true)}>Enviar planilha</button></React.Fragment>}>
      {sent ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--success-100)', borderRadius: 'var(--r-md)' }}>
          <IcoCheckCircle width="18" height="18" style={{ stroke: 'var(--success-700)', fill: 'none', strokeWidth: 2 }} />
          <span style={{ fontSize: '13px', color: 'var(--success-700)', fontWeight: 600 }}>Planilha recebida — processamento iniciado.</span>
        </div>
      ) : (
        <Field label="Planilha da folha" required full>
          <div style={{ border: '1.5px dashed var(--border-strong)', borderRadius: 'var(--r-md)', padding: '22px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '13px' }}>
            <IcoUpload width="20" height="20" style={{ stroke: 'var(--slate-400)', fill: 'none', strokeWidth: 1.8, margin: '0 auto 8px' }} />
            Arraste o arquivo ou clique para selecionar (.xlsx, .csv)
          </div>
        </Field>
      )}
    </Modal>
  );
}

function DpFolhaPage() {
  const [modal, setModal] = useStateAD(null);
  return (
    <div className="page">
      <div className="page-head"><h1>Folha de pagamento mensal</h1><p>Envie a planilha da folha ou acompanhe o status do processamento mensal.</p></div>
      <div className="grid2">
        <button type="button" className="acard clickable" onClick={() => setModal('upload')}>
          <div className="acard-head"><span className="acard-ico"><IcoUpload /></span></div>
          <div className="acard-title">Upload da folha</div>
          <div className="acard-desc">Envie a planilha preenchida para iniciar o processamento.</div>
        </button>
        <button type="button" className="acard clickable" onClick={() => setModal('status')}>
          <div className="acard-head"><span className="acard-ico"><IcoCheckCircle /></span></div>
          <div className="acard-title">Status da folha</div>
          <div className="acard-desc">Acompanhe o processamento da folha enviada.</div>
        </button>
      </div>
      {modal === 'upload' ? <FolhaUploadModal onClose={() => setModal(null)} /> : null}
      {modal === 'status' ? <FolhaStatusModal onClose={() => setModal(null)} /> : null}
    </div>
  );
}

Object.assign(window, { FiscalEscrituracaoPage, ContabilConciliacaoPage, DpFolhaPage });
