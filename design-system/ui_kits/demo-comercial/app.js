"use strict";
/* ============================================================================
   EFFICIENCE CO — Demo Comercial Interativo
   Single-page, vanilla JS. Depends on data.js (must load first). Every
   automation shows "Disponível" — this is the product's sales-demo face, not
   the real build state (see AreasDetail kit in ../plataforma for the honest
   one). Ref: projetos/efficience-co-demo-comercial-interativo.md and
   automacoes/*.md in efficience-vault.
   ============================================================================ */

/* ---------- icon set (mirrors ui_kits/plataforma/Icons.jsx) ---------- */
var ICON_PATHS = {
  dashboard:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.4"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/>',
  obrigacoes:'<path d="M7 3.5v3"/><path d="M17 3.5v3"/><rect x="4" y="6.5" width="16" height="14" rx="2"/><path d="M4 10.5h16"/><path d="M12.5 14.5l-3 3-1.5-1.5"/>',
  processos:'<rect x="3.5" y="4" width="17" height="16.5" rx="2"/><path d="M3.5 8h17"/><path d="M8 12h8"/><path d="M8 15.5h5"/>',
  logs:'<path d="M5 5.5h14"/><path d="M5 12h14"/><path d="M5 18.5h9"/>',
  regras:'<circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/><path d="M7 9.4v5.2a2 2 0 0 0 2 2h5.6"/><path d="M14.6 16.6l-2 0M14.6 16.6l0-2"/>',
  usuarios:'<circle cx="9" cy="8.5" r="3"/><path d="M3.8 19c0-2.6 2.3-4.5 5.2-4.5s5.2 1.9 5.2 4.5"/><path d="M16.5 7.6a2.6 2.6 0 0 1 0 5.1"/><path d="M17.5 14.7c1.9.5 3.2 1.9 3.2 3.8"/>',
  clientes:'<path d="M3.5 20.5V8l6-4 6 4v12.5"/><path d="M15.5 11l5 3v6.5"/><path d="M3.5 20.5h17"/><path d="M7 11h2M7 14.5h2M11.5 11h.5M11.5 14.5h.5"/>',
  bell:'<path d="M12 4a5 5 0 0 0-5 5v3l-1.5 2.3v.7h13v-.7L17 12V9a5 5 0 0 0-5-5Z"/><path d="M9.5 18a2.5 2.5 0 0 0 5 0"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/>',
  bolt:'<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>',
  logout:'<path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  checkcircle:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  upload:'<path d="M12 15.5V4M12 4 7.5 8.5M12 4l4.5 4.5"/><path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  fiscal:'<path d="M6 3.5h9l3 3v13.5H6z"/><path d="M15 3.5V7h3"/><path d="M9 12.5h6"/><path d="M9 16h6"/>',
  contabil:'<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 9.5h17"/><path d="M8 14.5l2.5 2.5L16 12"/>',
  dp:'<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6"/>',
  societario:'<path d="M12 3.5 4 7v2h16V7z"/><path d="M5.5 9v9"/><path d="M9.5 9v9"/><path d="M14.5 9v9"/><path d="M18.5 9v9"/><path d="M4 20.5h16"/>',
  financeiro:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M9.5 10a2.2 2.2 0 0 1 2.2-1.7h.6A2.1 2.1 0 0 1 14.5 10c0 1.2-.9 1.7-2.5 2.2s-2.5 1-2.5 2.2a2.1 2.1 0 0 0 2.2 1.7h.6a2.2 2.2 0 0 0 2.2-1.7"/>',
  atendimento:'<path d="M4 12a8 8 0 0 1 16 0v4.5a2 2 0 0 1-2 2h-1"/><rect x="3.5" y="12" width="4" height="5.5" rx="1.2"/><rect x="16.5" y="12" width="4" height="5.5" rx="1.2"/><path d="M14.5 18.5a2 2 0 0 1-2 2h-1.5"/>',
  documento:'<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5V7.5h4"/><path d="M9.5 13h5"/><path d="M9.5 16.5h5"/>',
  calculadora:'<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M8 7.5h8"/><path d="M8.2 12h1.2M12 12h1.2M15.6 12h1.2"/><path d="M8.2 15.5h1.2M12 15.5h1.2M15.6 15.5h1.2"/>',
  guia:'<rect x="4.5" y="6" width="15" height="12" rx="1.5"/><path d="M4.5 10h15"/><path d="M8 13.5h3"/><path d="M8 16h6"/>',
  pasta:'<path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h7A1.5 1.5 0 0 1 20 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z"/>',
  transmissao:'<circle cx="12" cy="12" r="2"/><path d="M8.3 15.7a5.2 5.2 0 0 1 0-7.4"/><path d="M15.7 8.3a5.2 5.2 0 0 1 0 7.4"/><path d="M5.6 18.4a9.2 9.2 0 0 1 0-12.8"/><path d="M18.4 5.6a9.2 9.2 0 0 1 0 12.8"/>',
  etiqueta:'<path d="M11.2 4H6a1.5 1.5 0 0 0-1.5 1.5v5.2c0 .4.16.78.44 1.06l7.6 7.6a1.5 1.5 0 0 0 2.12 0l5.2-5.2a1.5 1.5 0 0 0 0-2.12l-7.6-7.6A1.5 1.5 0 0 0 11.2 4z"/><circle cx="8.5" cy="8.5" r="1.2"/>',
  cifrao:'<path d="M12 4v16"/><path d="M15.5 7.5a3 3 0 0 0-3-1.5h-1a2.6 2.6 0 0 0 0 5.2h1a2.6 2.6 0 0 1 0 5.2h-1a3 3 0 0 1-3-1.5"/>',
  lupa:'<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15 20 20"/>',
  sino:'<path d="M6 17v-5.5a6 6 0 0 1 12 0V17l1.5 2h-15z"/><path d="M10.3 20.5a1.8 1.8 0 0 0 3.4 0"/>',
  predio:'<rect x="5" y="3.5" width="10" height="17" rx="1"/><rect x="15" y="9.5" width="4.5" height="11" rx="1"/><path d="M8 7.5h1.5M11.5 7.5H13M8 11h1.5M11.5 11H13M8 14.5h1.5M11.5 14.5H13"/>',
  selo:'<circle cx="12" cy="9.5" r="5.5"/><path d="M9 14.5 8 20.5l4-2 4 2-1-6"/>',
  escudo:'<path d="M12 3.5 5 6v6c0 4.4 2.9 7.6 7 8.5 4.1-.9 7-4.1 7-8.5V6z"/><path d="M9.2 12 11 13.8 15 9.8"/>',
  assinatura:'<path d="M4 17.5c2-3.5 3.6-5.6 4.8-6.1 1-.4 1.2.7.6 1.6-.8 1.2-.6 1.9.5 1.4 1.7-.8 3.6-2.7 4.8-4.4.9-1.3-.2-2.3-1.3-1.2-1.6 1.6-2.4 3.7-1.6 4.9.7 1 2.6.6 4.2-.6"/><path d="M4 20.5h16"/>',
  ciclo:'<path d="M19 12a7 7 0 0 1-11.9 5"/><path d="M5 12a7 7 0 0 1 11.9-5"/><path d="M17.5 4.5v3.2h-3.2"/><path d="M6.5 19.5v-3.2h3.2"/>',
  comprovante:'<path d="M6.5 3.5h11v17l-2-1.3-1.8 1.3-1.7-1.3-1.8 1.3-1.7-1.3-2 1.3z"/><path d="M9 8h6"/><path d="M9 11.2h6"/><path d="M9 14.4h3.5"/>',
  calendario:'<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9.5h16"/><path d="M8 3.5v3M16 3.5v3"/><path d="M8 13h1.5M12 13h1.5M16 13h.01"/>',
  pessoa:'<circle cx="12" cy="8.2" r="3.2"/><path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6"/>',
  cruzmedica:'<circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M8.5 12h7"/>',
  relogio:'<circle cx="12" cy="12.5" r="7.5"/><path d="M12 8.5V13l3 2"/><path d="M9.5 2.5h5"/>',
  onibus:'<rect x="4" y="5.5" width="16" height="11" rx="2"/><path d="M4 11h16"/><circle cx="8" cy="19" r="1.3"/><circle cx="16" cy="19" r="1.3"/>',
  telefone:'<path d="M6 3.5c1 0 2.5 2.5 2.5 3.5S7 8.5 7 9.5c0 2.5 4 6.5 6.5 6.5 1 0 1.5-1.5 2.5-1.5s3.5 1.5 3.5 2.5c0 1.5-1.5 3-3 3-6 0-13-7-13-13 0-1.5 1.5-3 2.5-3z"/>',
  grafico:'<path d="M4 20.5h16"/><path d="M7 20.5v-6M12 20.5V8M17 20.5v-9.5"/><path d="M5.5 11 10 6.5l3 3 5.5-5.5"/><path d="M15.5 4h3v3"/>',
  envelope:'<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 6.5 12 13l8-6.5"/>',
  entrada:'<path d="M10 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H10"/><path d="M15 16l5-4-5-4"/><path d="M20 12H10"/>',
  info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6"/><path d="M12 7.7v.01"/>'
};
function icon(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name]||'') + '</svg>'; }

/* ---------- helpers ---------- */
function esc(s){ return String(s==null?'':s); }
function fmtBRL(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function statusKind(t){
  var s = (t||'').toLowerCase();
  if (/atras|vencid|rejeitad/.test(s)) return 'err';
  if (/pendente|andamento|apura|fechamento|valida|gerando|diverg|renova.*inici|inicia|n[aã]o configurado|n[aã]o iniciado|vence em|aguardando/.test(s)) return 'warn';
  return 'ok';
}
function badge(text, kindOverride){
  var kind = kindOverride || statusKind(text);
  return '<span class="badge badge-'+kind+'">'+esc(text)+'</span>';
}
function cell(v, isLast, isStatusCol){
  if (isStatusCol) return '<td>'+badge(v)+'</td>';
  return '<td>'+esc(v)+'</td>';
}
function table(cols, rows){
  var statusIdx = cols.indexOf('Status');
  var head = '<tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
  var body = rows.map(function(r){
    return '<tr>'+r.map(function(v,i){ return cell(v, i===r.length-1, i===statusIdx); }).join('')+'</tr>';
  }).join('');
  return '<div class="tbl-wrap"><table><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>';
}

/* ---------- helpers: visual enrichment (nota / totais / resumos automáticos) ---------- */
function noteChip(text){
  if (!text) return '';
  return '<div class="note-chip">'+icon('info')+'<span>'+esc(text)+'</span></div>';
}
function totalsFooter(pairs){
  if (!pairs || !pairs.length) return '';
  return '<div class="totals-footer">'+pairs.map(function(p){ return '<span>'+esc(p[0])+' <b class="tnum">'+esc(p[1])+'</b></span>'; }).join('')+'</div>';
}
function progressoSummary(clientes){
  var total = clientes.length;
  var completos = clientes.filter(function(c){ return c[2] >= 100; }).length;
  var avg = Math.round(clientes.reduce(function(s,c){ return s + c[2]; }, 0) / total);
  return '<div class="summary-bar"><span><b>'+completos+'</b> de '+total+' concluídos</span><span style="color:var(--slate-300)">·</span><span>média <b>'+avg+'%</b></span></div>';
}
function logSummary(entries){
  var counts = {}; var order = [];
  entries.forEach(function(e){ var k = e[3]; if (!(k in counts)) { counts[k]=0; order.push(k); } counts[k]++; });
  var dotColor = { alerta:'var(--warning-500)', info:'var(--brand-500)', sucesso:'var(--success-500)' };
  var chips = order.map(function(k){
    return '<span class="chip-count"><span class="dot" style="background:'+(dotColor[k]||'var(--slate-400)')+'"></span>'+counts[k]+' '+k+(counts[k]>1?'s':'')+'</span>';
  }).join('');
  return '<div class="chip-row">'+chips+'</div>';
}

/* ---------- render: sidebar / topbar / page frame ---------- */
function renderSidebar(active){
  function items(list){ return list.map(function(it){
    return '<button class="ni'+(active===it.key?' active':'')+'" data-nav="'+it.key+'">'+icon(it.ic)+'<span style="flex:1">'+it.label+'</span></button>';
  }).join(''); }
  return '<aside class="sidebar">'
    + '<div class="sb-brand">'+LOGO_SVG(30)+'<div class="sb-wm">Efficience <span class="co">Co</span></div></div>'
    + '<nav class="sb-nav">'
      + items(NAV_TOP)
      + '<div class="sb-section">Áreas de automação</div>' + items(NAV_AREAS)
      + '<div class="sb-section">Operacional</div>' + items(NAV_OP)
      + '<div class="sb-section">Gestão · admin do escritório</div>' + items(NAV_GESTAO)
    + '</nav>'
    + '<div class="agent-card"><div class="agent-top"><span class="heartbeat"></span><span class="agent-name">Agente local</span><span class="agent-state">Online</span></div><div class="agent-meta">Sincronizou há 2 min · 1.243 automações hoje</div></div>'
    + '<div class="sb-user"><span class="avatar">JS</span><div style="flex:1"><div class="sb-uname">'+STATE.user.nome+'</div><div class="sb-umail">'+STATE.user.email+'</div></div><button class="sb-logout" data-logout>'+icon('logout')+'</button></div>'
  + '</aside>';
}
function renderTopbar(route){
  return '<header class="topbar"><div class="crumb"><span>Plataforma</span><span class="sep">/</span><span class="here">'+(TITLES[route]||'Dashboard')+'</span></div>'
    + '<div class="tb-actions"><div class="competencia">'+icon('calendario')+' Competência · Agosto 2026</div>'
    + '<div class="icon-btn">'+icon('search')+'</div><div class="icon-btn">'+icon('bell')+'<span class="ping"></span></div></div></header>';
}
function LOGO_SVG(size){
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="15" fill="url(#ec-grad)"/><rect x="18" y="19" width="29" height="7" rx="3.5" fill="#fff"/><rect x="18" y="29.5" width="18" height="7" rx="3.5" fill="#fff" fill-opacity="0.72"/><rect x="18" y="40" width="24" height="7" rx="3.5" fill="#fff"/><defs><linearGradient id="ec-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#38BDF8"/><stop offset="1" stop-color="#0284C7"/></linearGradient></defs></svg>';
}

/* ---------- render: automation card + area page ---------- */
function autCard(a){
  return '<button type="button" class="acard clickable" data-nav="automacao/'+a.id+'">'
    + '<div class="acard-head"><span class="acard-ico">'+icon(a.ic)+'</span>'+badge('Disponível','ok')+'</div>'
    + '<div class="acard-title">'+a.nome+'</div><div class="acard-desc">'+a.desc+'</div></button>';
}
function renderArea(key){
  var list = AUT_BY_AREA[key] || [];
  return '<div class="page"><div class="page-head"><h1>'+AREA_LABEL[key]+'</h1><p>'+AREA_SUB[key]+'</p></div>'
    + '<div class="grid3">'+list.map(autCard).join('')+'</div></div>';
}

/* ---------- render: generic automation detail templates ---------- */
function detailHeader(a){
  return '<div class="page-head"><p class="crumbline"><b>'+AREA_LABEL[a.area]+'</b> &gt; '+a.nome+'</p><h1>'+a.nome+'</h1><p>'+a.desc+'</p></div>';
}
function renderTabelaDetail(a){
  return '<div class="page">'+detailHeader(a)+noteChip(a.nota)+'<div class="card">'+table(a.cols, a.rows)+(a.footer?totalsFooter(a.footer):'')+'</div></div>';
}
function renderResumoDetail(a){
  var kpis = a.kpis.map(function(k){ return '<div class="stat"><div class="stat-label">'+k[0]+'</div><div class="stat-value tnum">'+k[1]+'</div></div>'; }).join('');
  return '<div class="page">'+detailHeader(a)+noteChip(a.nota)+'<div class="grid3">'+kpis+'</div><div class="card">'+table(a.cols, a.rows)+'</div></div>';
}
function renderLogDetail(a){
  var items = a.entries.map(function(e){
    return '<div class="log-item"><span class="log-dot '+e[3]+'"></span><div><div class="log-text"><b>'+e[1]+'</b> — '+e[2]+'</div><div class="log-meta">'+e[0]+'</div></div></div>';
  }).join('');
  return '<div class="page">'+detailHeader(a)+noteChip(a.nota)+logSummary(a.entries)+'<div class="card card-pad">'+items+'</div></div>';
}
function renderProgressoDetail(a){
  var barColor = { 'ok':'var(--success-600)', 'warn':'var(--warning-600)' };
  var rows = a.clientes.map(function(c){
    var kind = statusKind(c[1]);
    var col = kind==='ok' ? 'var(--success-600)' : (kind==='warn' ? 'var(--warning-600)' : 'var(--slate-300)');
    return '<div class="proc-row"><div class="proc-top"><span class="proc-name">'+c[0]+'</span>'+badge(c[1])+'</div>'
      + '<div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:'+c[2]+'%;background:'+col+'"></div></div><span class="proc-pct tnum">'+c[2]+'%</span></div></div>';
  }).join('');
  return '<div class="page">'+detailHeader(a)+noteChip(a.nota)+progressoSummary(a.clientes)+'<div class="card card-pad">'+rows+'</div></div>';
}

/* ---------- bespoke: Fiscal / Escrituração NF-e ---------- */
var ESCRIT_ROWS = [
  ['01/08','Entrada','Distribuidora ABC Ltda','004521','R$ 8.420,00','1102'],
  ['03/08','Saída','Restaurante Central','000891','R$ 1.280,00','5102'],
  ['07/08','Entrada','Gráfica Sul Ltda','000034','R$ 640,00','1556'],
  ['12/08','Saída','Mercado Vizinho','000892','R$ 3.100,00','5102'],
  ['15/08','Entrada','Importadora Nacional','019872','R$ 12.400,00','1101'],
  ['18/08','Saída','Padaria Central','000893','R$ 980,00','5102'],
  ['20/08','Entrada','Fornecedora Embalagens','007654','R$ 1.850,00','1102'],
  ['22/08','Saída','Café Colonial','000894','R$ 430,00','5102']
];
function renderEscrituracao(){
  var entradas = 8420+640+12400+1850, saidas = 1280+3100+980+430;
  var rows = ESCRIT_ROWS.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+badge(r[1]==='Entrada'?'Entrada':'Saída', r[1]==='Entrada'?'ok':'err')+'</td><td>'+r[2]+'</td><td class="mono">'+r[3]+'</td><td class="strong">'+r[4]+'</td><td class="mono">'+r[5]+'</td></tr>'; }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Escrituração NF-e</p><h1>Escrituração NF-e — Padaria do João</h1><p>Lançamentos de NF-e registrados automaticamente pelo agente a partir dos XMLs recebidos.</p></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Emitente / Destinatário</th><th>NF</th><th>Valor</th><th>CFOP</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="footnote" style="display:flex;gap:32px;font-size:13px;"><span>Entradas <b class="strong">'+fmtBRL(entradas)+'</b></span><span>Saídas <b class="strong">'+fmtBRL(saidas)+'</b></span></div></div>'
    + '</div>';
}

/* ---------- bespoke: Contábil / Conciliação bancária ---------- */
var CONC_PROVAVEL_SEED = [
  {id:'p1',dataBanco:'14/08',descBanco:'TED Recebida Distrib ABC',dataLanc:'15/08',descLanc:'Recebimento cliente',valor:2450},
  {id:'p2',dataBanco:'16/08',descBanco:'PIX Enviado Embalagens',dataLanc:'16/08',descLanc:'Pagto fornecedor',valor:890.15},
  {id:'p3',dataBanco:'19/08',descBanco:'Tarifa bancária',dataLanc:'18/08',descLanc:'Despesa bancária',valor:42.90},
  {id:'p4',dataBanco:'20/08',descBanco:'DOC Recebido Mercado V.',dataLanc:'21/08',descLanc:'Recebimento cliente',valor:1180}
];
function conciliacaoState(){
  if (!STATE.conciliacao) STATE.conciliacao = { automatico: 38, provavel: CONC_PROVAVEL_SEED.slice() };
  return STATE.conciliacao;
}
function renderConciliacao(){
  var s = conciliacaoState();
  var total = 47, conciliadas = s.automatico + (CONC_PROVAVEL_SEED.length - s.provavel.length);
  var pct = Math.round(conciliadas/total*100);
  var provRows = s.provavel.map(function(p){
    return '<tr><td>'+p.dataBanco+'</td><td>'+p.descBanco+'</td><td>'+p.dataLanc+'</td><td>'+p.descLanc+'</td><td class="strong">'+fmtBRL(p.valor)+'</td>'
      + '<td><button class="btn-confirm" data-conc-confirm="'+p.id+'">Confirmar</button> <button class="btn-reject" data-conc-reject="'+p.id+'">Rejeitar</button></td></tr>';
  }).join('') || '<tr><td colspan="6" style="color:var(--fg-muted)">Nenhum par provável pendente.</td></tr>';
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Contábil</b> &gt; Conciliação bancária</p><h1>Revisão da conciliação — Padaria do João</h1><p>Conta Bradesco 1234-5 · Agosto/2026</p></div>'
    + '<div class="card card-pad"><div style="font-size:12.5px;font-weight:600;color:var(--slate-700);margin-bottom:8px;">'+conciliadas+' de '+total+' transações conciliadas</div>'
    + '<div style="display:flex;align-items:center;gap:12px;"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--slate-900)"></div></div><span class="proc-pct tnum">'+pct+'%</span></div></div>'
    + '<div class="card"><div class="card-head" style="background:var(--success-100);border-color:#A7F3D0;"><h2 style="color:#064E3B">Automático</h2>'+badge(s.automatico+' matches automáticos','ok')+'</div></div>'
    + '<div class="card"><div class="card-head" style="background:var(--warning-100);border-color:#FDE68A;"><h2 style="color:#78350F">Provável</h2>'+badge(s.provavel.length+' sem decisão','warn')+'</div>'
    + '<div class="tbl-wrap"><table><thead><tr><th>Data banco</th><th>Descrição banco</th><th>Data lançamento</th><th>Descrição lançamento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>'+provRows+'</tbody></table></div></div>'
    + '<div class="card"><div class="card-head"><h2>Sem par</h2></div><div class="card-pad" style="font-size:12.5px;color:var(--fg-muted);">3 transações sem lançamento · 2 lançamentos sem transação — leitura apenas, resolva fora do sistema.</div></div>'
    + '</div>';
}

/* ---------- bespoke: DP / Folha de pagamento ---------- */
var FOLHA_ROWS = [
  ['Marcos Ferreira','Padaria do João','R$ 2.200,00','R$ 242,00','R$ 128,00','R$ 176,00','Calculado'],
  ['Ana Cordeiro','Oficina Silva','R$ 2.400,00','R$ 264,00','R$ 148,00','R$ 192,00','Calculado'],
  ['Beatriz Souza','Clínica Rosa','R$ 3.100,00','R$ 341,00','R$ 264,00','R$ 248,00','Calculado'],
  ['Ricardo Alves','Transportes Veloz','R$ 2.600,00','R$ 286,00','R$ 168,00','R$ 208,00','Calculado'],
  ['Pedro Lima','Mercado Bom Preço','R$ 2.100,00','R$ 231,00','R$ 112,00','R$ 168,00','Pendente']
];
var FOLHA_CLIENTES_STATUS = [ ['Padaria do João','ok'], ['Oficina Silva','ok'], ['Clínica Rosa','ok'], ['Transportes Veloz','ok'], ['Mercado Bom Preço','pendente'] ];
function renderFolha(){
  var rows = FOLHA_ROWS.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td class="strong">'+r[2]+'</td><td>'+r[3]+'</td><td>'+r[4]+'</td><td>'+r[5]+'</td><td>'+badge(r[6])+'</td></tr>'; }).join('');
  var done = FOLHA_CLIENTES_STATUS.filter(function(c){return c[1]==='ok';}).length, pct = Math.round(done/FOLHA_CLIENTES_STATUS.length*100);
  var checklist = FOLHA_CLIENTES_STATUS.map(function(c){ return '<div class="step-row">'+icon(c[1]==='ok'?'checkcircle':'clock')+'<span>'+c[0]+'</span></div>'; }).join('');
  var modal = '';
  if (STATE.folhaModal === 'status') {
    modal = renderModal('Status da folha', 'Agosto · 2026', '<div style="margin-bottom:14px;"><div style="font-size:12.5px;color:var(--fg-muted);margin-bottom:6px;">'+done+' de '+FOLHA_CLIENTES_STATUS.length+' clientes processados</div><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--success-600)"></div></div></div>'+checklist);
  } else if (STATE.folhaModal === 'upload') {
    modal = renderModal('Upload da folha', 'Envie a planilha preenchida para iniciar o processamento.', '<div style="border:1.5px dashed var(--slate-300);border-radius:var(--r-md);padding:26px;text-align:center;color:var(--fg-muted);font-size:13px;">'+icon('upload')+'<div style="margin-top:8px;">Arraste o arquivo ou clique para selecionar (.xlsx, .csv)</div></div>', true);
  }
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; Folha de pagamento</p><h1>Folha de pagamento — Agosto/2026</h1><p>Processa a planilha enviada e calcula INSS, IRRF e FGTS por funcionário.</p></div>'
    + '<div class="grid2"><button type="button" class="acard clickable" data-folha-modal="upload"><div class="acard-head"><span class="acard-ico">'+icon('upload')+'</span></div><div class="acard-title">Upload da folha</div><div class="acard-desc">Envie a planilha preenchida para iniciar o processamento.</div></button>'
    + '<button type="button" class="acard clickable" data-folha-modal="status"><div class="acard-head"><span class="acard-ico">'+icon('checkcircle')+'</span></div><div class="acard-title">Status da folha</div><div class="acard-desc">Acompanhe o processamento da folha enviada — '+done+'/'+FOLHA_CLIENTES_STATUS.length+' clientes.</div></button></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cliente</th><th>Salário base</th><th>INSS</th><th>IRRF</th><th>FGTS</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>' + modal;
}

/* ---------- bespoke: Societário / Abertura de empresa ---------- */
var ABERTURA_STEPS = [
  ['Gerar contrato social','automático','ok'],['Criar estrutura de pastas','automático','ok'],
  ['Protocolar na Junta Comercial','manual — concluído','ok'],['Solicitar CNPJ na Receita Federal','manual — concluído','ok'],
  ['Aguardar CNPJ','manual — prazo 3 dias úteis','warn'],['Inscrição Estadual','—','pending'],
  ['Inscrição Municipal / Alvará','—','pending'],['Abertura de conta bancária','—','pending'],
  ['Certificado digital e-CNPJ','automático após CNPJ','pending'],['Cadastrar no sistema de folha','automático','pending']
];
function renderAbertura(){
  var done = ABERTURA_STEPS.filter(function(s){return s[2]==='ok';}).length, pct = Math.round(done/ABERTURA_STEPS.length*100);
  var rows = ABERTURA_STEPS.map(function(s){
    var ic = s[2]==='ok' ? icon('checkcircle') : (s[2]==='warn' ? icon('clock') : '<span class="step-empty"></span>');
    var col = s[2]==='ok' ? 'color:var(--success-600)' : (s[2]==='warn' ? 'color:var(--warning-600)' : 'color:var(--slate-400)');
    return '<div class="step-row"><span style="'+col+';display:inline-flex;">'+ic+'</span><span style="'+(s[2]==='pending'?'color:var(--slate-400)':'')+'">'+s[0]+'</span><span class="step-note">('+s[1]+')</span>'+(s[2]==='warn'?'<span style="margin-left:auto;">'+badge('Em andamento','warn')+'</span>':'')+'</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Abertura de empresa</p><h1>Nova Empresa Ltda</h1><p>Sociedade Limitada · Capital R$ 100.000,00 · Simples Nacional</p></div>'
    + '<div class="card card-pad"><div class="proc-top" style="margin-bottom:8px;"><span style="font-size:13px;font-weight:600;color:var(--slate-700)">Progresso do processo</span><span style="font-size:12.5px;color:var(--fg-muted)">'+done+' de '+ABERTURA_STEPS.length+' etapas</span></div>'
    + '<div style="display:flex;align-items:center;gap:12px;"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">'+pct+'%</span></div></div>'
    + '<div class="card"><div class="card-head"><h2>Checklist de abertura</h2></div><div class="card-pad">'+rows+'</div></div>'
    + '</div>';
}

/* ---------- bespoke: DP / eSocial ---------- */
var ESOCIAL_EVENTOS = [
  {codigo:'S-2200', cliente:'Padaria do João', desc:'Admissão — Marcos Ferreira', data:'15/08/2026', recibo:'1.2.202608150001234-5'},
  {codigo:'S-2230', cliente:'Oficina Silva', desc:'Afastamento — Juliana Prado (atestado)', data:'12/08/2026', recibo:'1.2.202608120009876-1'},
  {codigo:'S-1200', cliente:'Clínica Rosa', desc:'Remuneração — folha ago/2026', data:'05/08/2026', recibo:'1.2.202608050004521-9'},
  {codigo:'S-2299', cliente:'Mercado Bom Preço', desc:'Desligamento — Pedro Lima', data:'10/08/2026', recibo:'1.2.202608100007654-3'}
];
function esocialField(label, value, validated){
  return '<div class="form-mock-field"><span class="lbl">'+label+'</span><span class="val">'+(validated ? '<span class="ok">'+icon('check')+value+'</span>' : value)+'</span></div>';
}
function renderEsocial(){
  var timeline = ESOCIAL_EVENTOS.map(function(e){
    return '<div class="esoc-evt"><span class="esoc-evt-code">'+e.codigo+'</span><div class="esoc-evt-body"><div class="esoc-evt-title">'+e.cliente+' — '+e.desc+'</div><div class="esoc-evt-meta">Transmitido em '+e.data+' <span class="esoc-recibo">· recibo '+e.recibo+'</span></div></div>'+badge('Aceito','ok')+'</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; eSocial</p><h1>eSocial</h1><p>Transmite os eventos obrigatórios do eSocial — admissão, afastamento, desligamento — direto de um formulário validado, sem o DP digitar XML.</p></div>'
    + '<div class="grid2">'
      + '<div class="card card-pad"><h2 style="margin:0 0 14px;font-size:14.5px;font-weight:600;">Novo evento — S-2200 Admissão</h2><div class="form-mock">'
        + esocialField('Funcionário','Marcos Ferreira')
        + esocialField('CPF','123.456.789-00', true)
        + esocialField('NIT/PIS','120.45678.90-1', true)
        + esocialField('Data de nascimento','12/04/1994', true)
        + esocialField('Cargo / Salário','Padeiro · R$ 2.200,00')
      + '</div><button class="btn-dark" style="margin-top:14px;width:100%;">'+icon('bolt')+' Gerar e transmitir XML</button></div>'
      + '<div class="card card-pad"><h2 style="margin:0 0 6px;font-size:14.5px;font-weight:600;">Eventos transmitidos este mês</h2><p style="margin:0 0 14px;font-size:12.5px;color:var(--fg-muted);">4 eventos · 0 rejeitados · todos aceitos no primeiro envio.</p>'
      + '<div class="grid3" style="gap:10px;"><div class="stat" style="padding:12px 14px;"><div class="stat-label">Transmitidos</div><div class="stat-value tnum" style="font-size:20px;">4</div></div><div class="stat" style="padding:12px 14px;"><div class="stat-label">Rejeitados</div><div class="stat-value tnum" style="font-size:20px;">0</div></div><div class="stat" style="padding:12px 14px;"><div class="stat-label">Tempo médio</div><div class="stat-value tnum" style="font-size:20px;">1,1s</div></div></div></div>'
    + '</div>'
    + '<div class="card"><div class="card-head"><h2>Histórico de eventos</h2></div><div class="card-pad" style="padding-top:4px;">'+timeline+'</div></div>'
  + '</div>';
}

/* ---------- bespoke: Fiscal / Emissão de Guias (DAS/DARF) ---------- */
var GUIAS = [
  {tipo:'DAS', cliente:'Padaria do João', competencia:'Ago/2026', vencimento:'20/08/2026', valor:1247, status:'Emitida'},
  {tipo:'DAS', cliente:'Oficina Silva', competencia:'Ago/2026', vencimento:'20/08/2026', valor:890, status:'Emitida'},
  {tipo:'DARF IRPJ', cliente:'Clínica Rosa', competencia:'3º tri/2026', vencimento:'25/08/2026', valor:3240, status:'Pendente'},
  {tipo:'DAS', cliente:'Transportes Veloz', competencia:'Ago/2026', vencimento:'20/08/2026', valor:1680, status:'Paga'},
  {tipo:'DAS', cliente:'Mercado Bom Preço', competencia:'Ago/2026', vencimento:'20/08/2026', valor:1166, status:'Emitida'}
];
function renderEmissaoGuias(){
  var total = GUIAS.reduce(function(s,g){ return s + g.valor; }, 0);
  var emitidas = GUIAS.filter(function(g){ return g.status !== 'Pendente'; }).length;
  var cards = GUIAS.map(function(g){
    return '<div class="guia-card"><div class="guia-card-top"><div><div class="guia-tipo">'+g.tipo+'</div><div class="guia-cliente">'+g.cliente+'</div></div>'+badge(g.status)+'</div>'
      + '<div class="guia-barcode"></div>'
      + '<div class="guia-rows"><div><div class="g-lbl">Competência</div><div class="g-val">'+g.competencia+'</div></div><div style="text-align:right"><div class="g-lbl">Vencimento</div><div class="g-val">'+g.vencimento+'</div></div></div>'
      + '<div class="guia-foot"><span style="font-size:11.5px;color:var(--fg-muted)">Valor</span><span class="guia-valor tnum">'+fmtBRL(g.valor)+'</span></div></div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Emissão de guias</p><h1>Emissão de Guias (DAS/DARF)</h1><p>Assim que um imposto é apurado — Simples, retenções, FGTS/INSS — a guia sai pronta para pagar, com código de barras e vencimento, sem digitar o valor de novo em nenhum sistema do governo.</p></div>'
    + noteChip('GNRE e guias de ISS seguem o mesmo fluxo — esta lista consolida todas as guias pendentes do escritório por vencimento.')
    + '<div class="guia-grid">'+cards+'</div>'
    + '<div class="card"><div class="totals-footer" style="border-top:none;border-radius:var(--r-xl);"><span>Total em guias do período <b class="tnum">'+fmtBRL(total)+'</b></span><span>'+GUIAS.length+' guias · '+emitidas+' já emitidas ou pagas</span></div></div>'
  + '</div>';
}

/* ---------- bespoke: Atendimento / Cobrança de Documentação Pendente ---------- */
var COBRANCA_DOCS = ['Extrato bancário','NFs de entrada','Comprovantes de pagamento'];
var COBRANCA_MATRIX = [
  ['Padaria do João', ['warn','ok','ok']],
  ['Oficina Silva', ['ok','ok','warn']],
  ['Clínica Rosa', ['ok','ok','ok']],
  ['Transportes Veloz', ['ok','err','ok']],
  ['Mercado Bom Preço', ['warn','ok','warn']]
];
var COBRANCA_LOG = [
  ['19/08','Padaria do João','Lembrete #2 enviado — extrato bancário de julho','info'],
  ['18/08','Mercado Bom Preço','Lembrete #1 enviado — comprovantes de despesas de agosto','info'],
  ['15/08','Oficina Silva','Documento recebido — extrato bancário de julho','sucesso']
];
function mxIcon(kind){ return kind === 'ok' ? icon('check') : (kind === 'warn' ? icon('clock') : icon('x')); }
function renderCobrancaDoc(){
  var head = '<tr><th>Cliente</th>'+COBRANCA_DOCS.map(function(d){ return '<th>'+d+'</th>'; }).join('')+'</tr>';
  var body = COBRANCA_MATRIX.map(function(row){
    return '<tr><td>'+row[0]+'</td>'+row[1].map(function(k){ return '<td><span class="mx-cell mx-'+k+'">'+mxIcon(k)+'</span></td>'; }).join('')+'</tr>';
  }).join('');
  var logItems = COBRANCA_LOG.map(function(e){
    return '<div class="log-item"><span class="log-dot '+e[3]+'"></span><div><div class="log-text"><b>'+e[1]+'</b> — '+e[2]+'</div><div class="log-meta">'+e[0]+'</div></div></div>';
  }).join('');
  var pendentes = 0; COBRANCA_MATRIX.forEach(function(r){ r[1].forEach(function(k){ if (k !== 'ok') pendentes++; }); });
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Atendimento</b> &gt; Cobrança de doc pendente</p><h1>Cobrança de Documentação Pendente</h1><p>O contador não cobra ninguém — o agente dispara a solicitação no início do mês e reforça sozinho até o documento chegar. '+pendentes+' pendências aguardando em '+COBRANCA_MATRIX.length+' clientes.</p></div>'
    + '<div class="card"><div class="matrix-wrap"><table class="matrix"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'
    + '<div class="matrix-legend"><span><span class="mx-cell mx-ok" style="width:18px;height:18px;">'+icon('check')+'</span> Recebido</span><span><span class="mx-cell mx-warn" style="width:18px;height:18px;">'+icon('clock')+'</span> Lembrete enviado, aguardando</span><span><span class="mx-cell mx-err" style="width:18px;height:18px;">'+icon('x')+'</span> Crítico — bloqueia processo</span></div></div>'
    + '<div class="card"><div class="card-head"><h2>Últimos lembretes enviados</h2></div><div class="card-pad">'+logItems+'</div></div>'
  + '</div>';
}

/* ---------- modal helper (used by Folha upload/status) ---------- */
function renderModal(title, subtitle, body, hasFooter){
  return '<div class="modal-overlay" data-modal-close>'
    + '<div class="modal-box" onclick="event.stopPropagation()">'
    + '<div class="modal-head"><div><div class="modal-title">'+title+'</div><div class="modal-sub">'+subtitle+'</div></div><button class="icon-btn" data-modal-close>'+icon('x')+'</button></div>'
    + '<div class="modal-body">'+body+'</div>'
    + (hasFooter ? '<div class="modal-foot"><button class="btn-line" data-modal-close>Cancelar</button><button class="btn-dark" data-folha-send>Enviar planilha</button></div>' : '')
    + '</div></div>';
}

/* ---------- Nível 1: Dashboard ---------- */
function renderDashboard(){
  return '<div class="page">'
  + '<div class="page-head"><h1>Bom dia, João</h1><p>Acompanhe os principais dados dos módulos em tempo real.</p></div>'
  + '<div class="grid2">'
    + '<div class="card card-pad"><h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Vencimentos dos próximos 7 dias</h2>'
      + row('DAS ago/26 — Padaria do João','Vencimento 20/08',badge('Vencida hoje','err'))
      + row('DAS ago/26 — Oficina Silva','Vencimento 20/08',badge('Vencida hoje','err'))
      + row('DARF IRPJ — Clínica Rosa','Vencimento 25/08',badge('5 dias','warn'))
      + row('SPED Fiscal — Padaria do João','Vencimento 30/08',badge('10 dias','ok'))
    + '</div>'
    + '<div class="card card-pad"><h2 style="margin:0 0 12px;font-size:16px;font-weight:600;">Folha de agosto/2026</h2>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><div class="progress-track"><div class="progress-fill" style="width:80%;background:var(--slate-900)"></div></div><span style="font-size:12px;font-weight:600;color:var(--slate-500)">80% (4/5)</span></div>'
      + ['Padaria do João','Oficina Silva','Clínica Rosa','Transportes Veloz'].map(function(n){return '<div style="display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--slate-700);padding:4px 0;">'+icon('checkcircle')+n+'</div>';}).join('')
      + '<div style="display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--slate-400);padding:4px 0;">'+icon('clock')+'Mercado Bom Preço — pendente</div>'
    + '</div>'
    + '<div class="card card-pad"><h2 style="margin:0 0 14px;font-size:16px;font-weight:600;">Processos em andamento</h2>'
      + procMini('Abertura Nova Empresa Ltda','4/10 etapas',40)
      + procMini('Folha Mercado Bom Preço ago/26','3/10 etapas',30)
    + '</div>'
    + '<div class="card card-pad"><div style="display:flex;justify-content:space-between;"><h2 style="margin:0;font-size:16px;font-weight:600;">Licença ativa</h2>'+badge('Ativa','ok')+'</div>'
      + '<p style="margin:12px 0 0;font-size:13.5px;">Plano Escritório · 5 usuários</p><p style="margin:4px 0 0;font-size:13.5px;color:var(--fg-muted);">Válida até 19/08/2027</p></div>'
    + '<div class="card card-pad"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><h2 style="margin:0;font-size:16px;font-weight:600;">Notificações</h2><span style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9999px;background:var(--slate-900);color:#fff;font-size:11px;font-weight:700;">3</span></div>'
      + notif('err','DAS Mercado Bom Preço venceu hoje') + notif('warn','Doc pendente: extrato Padaria do João') + notif('ok','NF 4521 arquivada automaticamente')
    + '</div>'
    + '<div class="card"><div class="card-head"><h2>Últimas execuções do agente</h2></div><div class="tbl-wrap"><table><thead><tr><th>Hora</th><th>Automação</th><th>Cliente</th><th></th></tr></thead><tbody>'
      + agentRow('14:32','Organização NF-e','Padaria do João') + agentRow('13:15','Apuração Simples','Padaria do João') + agentRow('11:40','Conciliação Bancária','Clínica Rosa') + agentRow('10:05','Emissão DAS','Padaria do João') + agentRow('09:22','Abertura de Empresa','Nova Empresa Ltda')
    + '</tbody></table></div></div>'
  + '</div></div>';
  function row(t,s,b){ return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--slate-100);"><div><p style="margin:0;font-size:13.5px;font-weight:600;color:var(--slate-900);">'+t+'</p><p style="margin:2px 0 0;font-size:12px;color:var(--fg-muted);">'+s+'</p></div>'+b+'</div>'; }
  function procMini(name, sub, pct){ return '<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="font-size:13.5px;font-weight:600;color:var(--slate-900);">'+name+'</span><span style="font-size:12px;color:var(--fg-muted);">'+sub+'</span></div><div style="display:flex;align-items:center;gap:10px;"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">'+pct+'%</span></div></div>'; }
  function notif(kind, text){ var c = kind==='err'?'var(--danger-500)':(kind==='warn'?'var(--warning-500)':'var(--success-500)'); return '<div style="display:flex;align-items:start;gap:10px;padding:5px 0;"><span style="width:8px;height:8px;border-radius:9999px;background:'+c+';margin-top:5px;flex-shrink:0;"></span><span style="font-size:13.5px;color:var(--slate-700);">'+text+'</span></div>'; }
  function agentRow(h,a,c){ return '<tr><td class="mono">'+h+'</td><td>'+a+'</td><td>'+c+'</td><td>'+icon('check')+'</td></tr>'; }
}

/* ---------- Nível 1: Efficience / ROI ---------- */
var ROI_PERIODS = { '7':{h:'9h',ex:'78',rs:'R$ 1.530,00'}, '15':{h:'18h',ex:'156',rs:'R$ 3.060,00'}, '30':{h:'35h',ex:'312',rs:'R$ 6.120,00'} };
var ROI_BREAKDOWN = [ ['Organização NF-e','189','9,5h'], ['Conciliação bancária','47','8h'], ['Apuração Simples Nacional','23','5,7h'], ['Folha de pagamento','5','4h'], ['Abertura de empresa','2','3h'], ['Emissão DAS/DARF','28','2,8h'], ['Cobrança de doc pendente','18','2h'] ];
var roiPeriod = '30';
function renderROI(){
  var p = ROI_PERIODS[roiPeriod];
  var seg = ['7','15','30'].map(function(k){ return '<button class="'+(k===roiPeriod?'active':'')+'" data-roi-period="'+k+'">'+k+' dias</button>'; }).join('');
  var rows = ROI_BREAKDOWN.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td class="strong">'+r[2]+'</td></tr>'; }).join('');
  return '<div class="page">'
  + '<div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><div><h1>Efficience — seu escritório em números</h1><p>Acompanhe o impacto real das automações.</p></div><div class="seg">'+seg+'</div></div>'
  + '<div class="grid3"><div class="stat"><div class="stat-label">Horas economizadas</div><div class="stat-value tnum">'+p.h+'</div></div><div class="stat"><div class="stat-label">Automações executadas</div><div class="stat-value tnum">'+p.ex+'</div></div><div class="stat"><div class="stat-label">Equivalente em R$</div><div class="stat-value tnum">'+p.rs+'</div></div></div>'
  + '<div class="card"><div class="card-head"><h2>Detalhamento por automação</h2></div><div class="tbl-wrap"><table><thead><tr><th>Automação</th><th>Execuções</th><th>Horas economizadas</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
  + '<div class="card card-pad"><h2 style="margin:0 0 16px;font-size:16px;font-weight:600;">Licença</h2><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">'
    + '<div style="display:flex;gap:32px;"><div><p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--fg-muted);">Plano</p><p style="margin:4px 0 0;font-size:14px;font-weight:500;">Escritório · 5 usuários</p></div>'
    + '<div><p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--fg-muted);">Vencimento</p><p style="margin:4px 0 0;font-size:14px;font-weight:500;">19/08/2027</p></div>'
    + '<div><p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--fg-muted);">Status</p>'+badge('Ativa','ok')+'</div></div>'
    + '<button class="btn-dark">Pagar licença</button></div></div>'
  + '</div>';
}

/* ---------- Nível 1: Obrigações ---------- */
function renderObrigacoes(){
  var cols = ['Obrigação','Cliente','Vencimento','Dias','Status'];
  var rows = [['DAS ago/26','Padaria do João','20/08/2026','Hoje','Vencida'],['DAS ago/26','Oficina Silva','20/08/2026','Hoje','Vencida'],['DAS ago/26','Transportes Veloz','20/08/2026','Hoje','Paga'],['DARF IRPJ tri','Clínica Rosa','25/08/2026','5 dias','Pendente'],['DCTFWeb ago/26','Mercado Bom Preço','25/08/2026','5 dias','Pendente'],['SPED Fiscal','Padaria do João','30/08/2026','10 dias','Pendente'],['EFD-Contribuições','Oficina Silva','30/08/2026','10 dias','Pendente'],['EFD-Reinf ago/26','Clínica Rosa','15/09/2026','26 dias','Pendente']];
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Obrigações</h1><div style="display:flex;gap:10px;"><span class="filter">Mês: agosto 2026</span><span class="filter">Cliente: Todos</span></div></div>'
  + '<div class="card">'+table(cols, rows)+'<div class="footnote">DAS — guia mensal do Simples Nacional (vence dia 20) · DARF — Lucro Presumido/Real · DCTF — débitos e créditos tributários federais · SPED — escrituração fiscal digital · EFD-Reinf — retenções e contribuições.</div></div></div>';
}

/* ---------- Nível 1: Processos ---------- */
function renderProcessos(){
  var folha = [['Padaria do João',100,'Concluído'],['Oficina Silva',100,'Concluído'],['Clínica Rosa',100,'Concluído'],['Transportes Veloz',100,'Concluído'],['Mercado Bom Preço',30,'Em andamento']];
  var folhaRows = folha.map(function(f){ var col = f[1]===100?'var(--success-600)':'var(--warning-600)'; return '<div class="proc-row"><div class="proc-top"><span class="proc-name">'+f[0]+'</span><span style="font-size:12.5px;color:var(--fg-muted)">'+(f[1]/10)+'/10 etapas</span></div><div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:'+f[1]+'%;background:'+col+'"></div></div><span class="proc-pct tnum">'+f[1]+'%</span>'+badge(f[2])+'</div></div>'; }).join('');
  var aberturaSteps = ['Contrato social','Pastas criadas','Junta Comercial','CNPJ solicitado'];
  var steps = aberturaSteps.map(function(s){ return '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slate-700);padding:3px 0;">'+icon('checkcircle')+s+'</div>'; }).join('')
    + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--warning-600);font-weight:600;padding:3px 0;">'+icon('clock')+'Aguardando CNPJ</div>'
    + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slate-400);padding:3px 0;"><span class="step-empty"></span>Inscrição Estadual…</div>';
  return '<div class="page"><div class="page-head"><h1>Processos</h1></div>'
  + '<div class="card card-pad"><h2 style="margin:0 0 4px;font-size:16px;font-weight:600;">Folha de agosto/2026</h2>'+folhaRows+'</div>'
  + '<div class="card card-pad"><h2 style="margin:0 0 4px;font-size:16px;font-weight:600;">Outros processos</h2>'
    + '<div class="proc-row"><div class="proc-top"><span class="proc-name">Abertura Nova Empresa Ltda</span>'+badge('4/10 · Em andamento','warn')+'</div><div class="proc-bar" style="margin-bottom:12px;"><div class="progress-track"><div class="progress-fill" style="width:40%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">40%</span></div>'+steps+'</div>'
    + '<div class="proc-row"><div class="proc-top"><span class="proc-name">Alteração contratual — Oficina Silva ME</span>'+badge('3/6 · Em andamento','warn')+'</div><div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:50%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">50%</span></div><p style="margin:6px 0 0;font-size:12.5px;color:var(--fg-muted);">Mudança de endereço + nova atividade</p></div>'
  + '</div></div>';
}

/* ---------- Nível 1: Logs ---------- */
function renderLogsPage(){
  var cols = ['Horário','Automação','Cliente','Resultado','Duração'];
  var rows = [
    ['19/08 14:32','Organização NF-e','Padaria do João','NF_001234_DistribABC.xml → NFs/','0,3s'],
    ['19/08 14:28','Organização NF-e','Oficina Silva','NF_005678_GraficaSul.xml → NFs/','0,3s'],
    ['19/08 13:15','Apuração Simples','Padaria do João','DAS ago/26 R$1.247,00 (Anexo I, 4,5%)','1,2s'],
    ['19/08 11:40','Conciliação Bancária','Clínica Rosa','42/47 pares (89%) — Bradesco 1234-5','3,8s'],
    ['19/08 10:05','Emissão DAS','Padaria do João','DAS_08_2026_CNPJ12345678.pdf','0,8s'],
    ['19/08 09:22','Abertura de Empresa','Nova Empresa Ltda','Pastas criadas + contrato_social.docx','2,1s'],
    ['18/08 17:55','Folha de Pagamento','Oficina Silva','5 holerites gerados, CNAB exportado','4,5s'],
    ['18/08 16:30','eSocial Admissão','Padaria do João','S-2200 — Marcos Ferreira (admitido 15/08)','1,0s'],
    ['18/08 15:10','Honorários','(escritório)','32 boletos gerados e enviados','8,2s'],
    ['18/08 14:00','Cobrança doc pendente','Mercado Bom Preço','Lembrete #2 enviado — extrato julho','0,1s']
  ];
  var body = rows.map(function(r){ return '<tr><td class="mono">'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td><td class="mono" style="font-size:12px;">'+r[3]+'</td><td class="mono">'+r[4]+'</td><td>'+icon('check')+'</td></tr>'; }).join('');
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Logs do agente</h1><div style="display:flex;gap:8px;"><span class="filter" style="background:var(--slate-900);color:#fff;">Todos</span><span class="filter">Tipo</span><span class="filter">Período</span></div></div>'
  + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>'+cols.join('</th><th>')+'</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
}

/* ---------- Nível 1: Regras ---------- */
function renderRegras(){
  var rows = [
    ['NF-e entrada','ENTRADA/','CLIENTES/ATIVO/[cliente]/NFs/','tipo=nfe, cfop_entrada','Mover + renomear',true],
    ['Holerites DP','ENTRADA/DP/','CLIENTES/ATIVO/[cliente]/Folha/','tipo=holerite','Mover + renomear',true],
    ['Extratos bancários','ENTRADA/','CLIENTES/ATIVO/[cliente]/Extrato/','tipo=extrato_ofx','Mover + iniciar conciliação',true],
    ['Atestados médicos','ENTRADA/DP/','CLIENTES/ATIVO/[cliente]/DP/Atestados/','tipo=atestado','Mover + registrar afastamento',true],
    ['Docs societários','ENTRADA/SOCIETARIO/','CLIENTES/ATIVO/[cliente]/Documentos/','tipo=contrato','Mover + renomear',true],
    ['Guias pagas (legado)','PAGO/','CLIENTES/ATIVO/[cliente]/Guias/','tipo=guia','Mover',false]
  ];
  var body = rows.map(function(r){ return '<tr'+(r[5]?'':' style="opacity:.55"')+'><td class="strong">'+r[0]+'</td><td class="mono">'+r[1]+'</td><td class="mono">'+r[2]+'</td><td class="mono">'+r[3]+'</td><td>'+r[4]+'</td><td>'+toggle(r[5])+'</td><td><button class="link-btn">Editar</button></td></tr>'; }).join('');
  function toggle(on){ return on ? '<span style="width:34px;height:20px;border-radius:9999px;background:var(--slate-900);position:relative;display:inline-block;"><span style="position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:9999px;background:#fff;"></span></span>' : '<span style="width:34px;height:20px;border-radius:9999px;background:var(--slate-200);position:relative;display:inline-block;"><span style="position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:9999px;background:#fff;"></span></span>'; }
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Regras de automação</h1><button class="btn-dark">'+icon('plus')+' Nova regra</button></div>'
  + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>Pasta origem</th><th>Pasta destino</th><th>Condição</th><th>Ação</th><th>Status</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
}

/* ---------- Nível 1: Usuários ---------- */
function renderUsuarios(){
  var rows = [['JS','João Silva','joao@escritoriopereira.com.br','Admin','Agora',false],['CM','Carla Mendes','carla@escritoriopereira.com.br','Funcionária','Hoje 14:20',true],['MT','Marcos Tavares','marcos@escritoriopereira.com.br','Funcionário','Ontem 09:15',true],['AC','Ana Paula Costa','ana@escritoriopereira.com.br','Funcionária','15/08 16:40',true]];
  var body = rows.map(function(r){ return '<tr><td><span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:var(--brand-100);color:var(--brand-800);font-size:11.5px;font-weight:700;margin-right:10px;">'+r[0]+'</span>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td>'+r[4]+'</td><td><button class="link-btn">Editar</button>'+(r[5]?'<button class="link-btn">Remover</button>':'')+'</td></tr>'; }).join('');
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Usuários</h1><button class="btn-dark">'+icon('plus')+' Novo usuário</button></div>'
  + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>'+body+'</tbody></table></div><div class="footnote">Funcionários têm acesso ao dashboard mas não gerenciam regras, usuários ou configurações.</div></div></div>';
}

/* ---------- Nível 1: Admin Clientes ---------- */
function renderAdmin(){
  var body = CLIENTES.map(function(c){ return '<tr><td class="strong">'+c.nome+'</td><td class="mono">'+c.cnpj+'</td><td>'+c.regime+'</td><td>'+c.func+'</td><td>'+badge('Ativo','ok')+'</td><td><button class="link-btn">Ver detalhes</button><button class="link-btn">Editar</button></td></tr>'; }).join('');
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Clientes do escritório</h1><button class="btn-dark">'+icon('plus')+' Novo cliente</button></div>'
  + '<div class="grid4"><div class="stat"><div class="stat-label">Clientes ativos</div><div class="stat-value tnum">5</div></div><div class="stat"><div class="stat-label">Automações este mês</div><div class="stat-value tnum">312</div></div><div class="stat"><div class="stat-label">Obrigações em atraso</div><div class="stat-value tnum" style="color:var(--danger-700)">3</div></div><div class="stat"><div class="stat-label">Licença</div><div class="stat-value" style="font-size:18px;">Válida — ago/2027</div></div></div>'
  + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>CNPJ</th><th>Regime tributário</th><th>Funcionários</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
}

/* ---------- Login ---------- */
function renderLogin(){
  return '<div class="login"><form class="login-card" id="login-form">'
  + '<div class="login-brand">'+LOGO_SVG(34)+'<span class="wm">Efficience Co</span></div>'
  + '<div class="login-eyebrow">Plataforma</div><h1 class="login-h">Entrar na plataforma</h1><p class="login-sub">Escritório Pereira Contabilidade · use seu e-mail e senha para acessar.</p>'
  + '<div class="field"><label>E-mail</label><input type="email" id="login-email" value="joao@escritoriopereira.com.br"></div>'
  + '<div class="field"><label>Senha</label><input type="password" id="login-senha" value="demo1234"></div>'
  + '<button class="btn btn-primary" type="submit">Entrar</button>'
  + '<div class="login-hint">Protegido por JWT · dados tratados conforme a LGPD</div>'
  + '</form></div>';
}

/* ---------- app state ---------- */
var STATE = { user:null, conciliacao:null, folhaModal:null };

/* ---------- router / dispatch ---------- */
var BESPOKE = { 'escrituracao-nfe':renderEscrituracao, 'conciliacao-bancaria':renderConciliacao, 'folha-pagamento':renderFolha, 'abertura-empresa':renderAbertura, 'esocial':renderEsocial, 'emissao-das-darf':renderEmissaoGuias, 'cobranca-doc':renderCobrancaDoc };
function currentRoute(){ return (location.hash || '#dashboard').slice(1); }
function pageFor(route){
  if (route.indexOf('automacao/') === 0){
    var a = AUT_BY_ID[route.slice('automacao/'.length)];
    if (!a) return renderDashboard();
    if (a.tipo === 'bespoke') return BESPOKE[a.id]();
    if (a.tipo === 'tabela') return renderTabelaDetail(a);
    if (a.tipo === 'resumo') return renderResumoDetail(a);
    if (a.tipo === 'log') return renderLogDetail(a);
    if (a.tipo === 'progresso') return renderProgressoDetail(a);
    return renderTabelaDetail(a);
  }
  switch(route){
    case 'dashboard': return renderDashboard();
    case 'roi': return renderROI();
    case 'obrigacoes': return renderObrigacoes();
    case 'processos': return renderProcessos();
    case 'logs': return renderLogsPage();
    case 'regras': return renderRegras();
    case 'usuarios': return renderUsuarios();
    case 'admin': return renderAdmin();
    case 'fiscal': case 'contabil': case 'dp': case 'societario': case 'financeiro': case 'atendimento':
      return renderArea(route);
    default: return renderDashboard();
  }
}
function activeNavKey(route){
  if (route.indexOf('automacao/') === 0){ var a = AUT_BY_ID[route.slice(10)]; return a ? a.area : 'dashboard'; }
  return route;
}

function render(){
  var app = document.getElementById('app');
  if (!STATE.user){ app.innerHTML = renderLogin(); bindLogin(); return; }
  var route = currentRoute();
  app.innerHTML = '<div class="shell">' + renderSidebar(activeNavKey(route)) + '<div class="main">' + renderTopbar(activeNavKey(route)) + '<div class="scroll">' + pageFor(route) + '</div></div></div>';
  bindShell();
}
function bindLogin(){
  document.getElementById('login-form').addEventListener('submit', function(e){
    e.preventDefault();
    STATE.user = { nome:'João Silva', email: document.getElementById('login-email').value || 'joao@escritoriopereira.com.br' };
    location.hash = '#dashboard';
    render();
  });
}
function bindShell(){
  document.querySelectorAll('[data-nav]').forEach(function(el){
    el.addEventListener('click', function(){ location.hash = '#' + el.getAttribute('data-nav'); });
  });
  var logoutBtn = document.querySelector('[data-logout]');
  if (logoutBtn) logoutBtn.addEventListener('click', function(){ STATE.user = null; STATE.conciliacao = null; STATE.folhaModal = null; location.hash = '#dashboard'; render(); });

  document.querySelectorAll('[data-roi-period]').forEach(function(el){
    el.addEventListener('click', function(){ roiPeriod = el.getAttribute('data-roi-period'); render(); });
  });

  document.querySelectorAll('[data-conc-confirm]').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-conc-confirm'); var s = conciliacaoState();
      s.provavel = s.provavel.filter(function(p){ return p.id !== id; }); s.automatico += 1; render();
    });
  });
  document.querySelectorAll('[data-conc-reject]').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-conc-reject'); var s = conciliacaoState();
      s.provavel = s.provavel.filter(function(p){ return p.id !== id; }); render();
    });
  });

  document.querySelectorAll('[data-folha-modal]').forEach(function(el){
    el.addEventListener('click', function(){ STATE.folhaModal = el.getAttribute('data-folha-modal'); render(); });
  });
  document.querySelectorAll('[data-modal-close]').forEach(function(el){
    el.addEventListener('click', function(){ STATE.folhaModal = null; render(); });
  });
  var sendBtn = document.querySelector('[data-folha-send]');
  if (sendBtn) sendBtn.addEventListener('click', function(){ STATE.folhaModal = null; render(); });
}

window.addEventListener('hashchange', render);
render();
