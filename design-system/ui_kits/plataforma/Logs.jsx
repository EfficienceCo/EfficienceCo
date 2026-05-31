// Efficience Co — Logs do Agente: histórico + filtros + paginação
const { useState: useStateLg } = React;

const LOG_TYPES = {
  sucesso: { badge: 'ok', label: 'Sucesso', Icon: IcoCheckCircle, color: 'var(--success-600)' },
  erro: { badge: 'err', label: 'Erro', Icon: IcoXCircle, color: 'var(--danger-600)' },
  info: { badge: 'neutral', label: 'Info', Icon: IcoFile, color: 'var(--slate-500)' },
};

function genLogs() {
  const base = [
    ['sucesso', 'Arquivo movido', 'NFe_2026_0512.xml → /clientes/padaria-do-joao/nfe', 'Organizar NF-e recebidas'],
    ['info', 'Relatório gerado', 'folha_pagamento_andrade_maio.pdf', 'Backup de folhas de pagamento'],
    ['sucesso', 'Arquivo renomeado', 'extrato (3).pdf → extrato_lopes_2026-05.pdf', 'Renomear extratos bancários'],
    ['erro', 'Falha ao mover', 'permissão negada em /entrada/guias — arquivo em uso', 'Arquivar guias pagas'],
    ['sucesso', 'Licença validada', 'token EFC-2F9A-77C1-B0E4 · próxima verificação em 24h', null],
    ['sucesso', '212 lançamentos conciliados', 'conta corrente · Mercado Lopes ME', null],
    ['info', 'Sincronização concluída', '14 documentos importados do portal municipal', null],
    ['erro', 'CNAE inválido', 'abertura Padaria do João II — revisar formulário', 'Separar documentos de abertura'],
  ];
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const b = base[i % base.length];
    const h = (10 - Math.floor(i / 4)).toString().padStart(2, '0');
    const m = (59 - (i * 7) % 60).toString().padStart(2, '0');
    rows.push({ id: i + 1, tipo: b[0], titulo: b[1], detalhe: b[2], regra: b[3], hora: `17/05 ${h}:${m}` });
  }
  return rows;
}
const ALL_LOGS = genLogs();

function LogsPage() {
  const [tipo, setTipo] = useStateLg('all');
  const [page, setPage] = useStateLg(1);
  const perPage = 8;
  const filtered = ALL_LOGS.filter((l) => tipo === 'all' || l.tipo === tipo);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const setFilter = (t) => { setTipo(t); setPage(1); };

  return (
    <div className="page">
      <PageHead title="Logs do agente" sub="Tudo que o agente local executou na máquina do escritório." />

      <div className="grid4">
        <div className="stat"><div className="stat-label">Eventos (24h)</div><div className="stat-value">1.243</div></div>
        <div className="stat"><div className="stat-label">Sucessos</div><div className="stat-value" style={{ color: 'var(--success-700)' }}>1.231</div></div>
        <div className="stat"><div className="stat-label">Erros</div><div className="stat-value" style={{ color: 'var(--danger-700)' }}>12</div></div>
        <div className="stat"><div className="stat-label">Última sincronização</div><div className="stat-value" style={{ fontSize: '20px' }}>há 2 min</div></div>
      </div>

      <div className="toolbar">
        <FilterChips options={[{ value: 'all', label: 'Todos' }, { value: 'sucesso', label: 'Sucesso' }, { value: 'erro', label: 'Erro' }, { value: 'info', label: 'Info' }]} value={tipo} onChange={setFilter} />
        <div className="spacer" />
        <Dropdown value="hoje" onChange={() => {}} options={[{ value: 'hoje', label: 'Hoje' }, { value: '7d', label: 'Últimos 7 dias' }, { value: '30d', label: 'Últimos 30 dias' }]} />
        <Search placeholder="Buscar no log…" />
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th style={{ width: '120px' }}>Tipo</th><th>Evento</th><th>Regra</th><th style={{ width: '130px' }}>Quando</th></tr></thead>
          <tbody>
            {pageRows.map((l) => {
              const T = LOG_TYPES[l.tipo];
              return (
                <tr key={l.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: T.color, fontWeight: 600, fontSize: '12.5px' }}>
                      <T.Icon width="17" height="17" style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1.8 }} />{T.label}
                    </span>
                  </td>
                  <td><div className="cell-name">{l.titulo}</div><div className="cell-sub" style={{ fontFamily: 'var(--font-mono)' }}>{l.detalhe}</div></td>
                  <td>{l.regra ? <span className="cell-sub">{l.regra}</span> : <span style={{ color: 'var(--slate-300)' }}>—</span>}</td>
                  <td className="cell-mono">{l.hora}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pager page={page} pages={pages} total={filtered.length} onPage={setPage} />
      </div>
    </div>
  );
}

Object.assign(window, { LogsPage });
