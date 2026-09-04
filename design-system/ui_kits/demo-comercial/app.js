"use strict";
/* ============================================================================
   EFFICIENCE CO — Demo Comercial Interativo
   Depende de data.js (carregado antes). Cada uma das 42 automações tem sua
   própria função de render + bind, com estado guardado em STATE.exec[id] —
   nada de template compartilhado entre automações; só átomos visuais bem
   pequenos (spinner, anel, stepper, badge) são reaproveitados quando fazem
   sentido técnico. Ref.: automacoes/*.md (seção "Especificação de interface")
   em efficience-vault.
   ============================================================================ */

/* ---------- icon set ---------- */
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
  info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 10.5v6"/><path d="M12 7.7v.01"/>',
  cadeado:'<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  onibus2:'<rect x="4" y="5.5" width="16" height="11" rx="2"/>'
};
function icon(name){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name]||'') + '</svg>'; }

/* ---------- helpers ---------- */
function esc(s){ return String(s==null?'':s); }
function fmtBRL(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function statusKind(t){
  var s = (t||'').toLowerCase();
  if (/atras|vencid|rejeitad/.test(s)) return 'err';
  if (/pendente|andamento|apura|fechamento|valida|gerando|diverg|renova.*inici|inicia|n[aã]o configurado|n[aã]o iniciado|vence em|aguardando|emitindo/.test(s)) return 'warn';
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
function noteChip(text){
  if (!text) return '';
  return '<div class="note-chip">'+icon('info')+'<span>'+esc(text)+'</span></div>';
}

/* ---------- generic tiny UI atoms (reused by several bespoke screens) ---------- */
function sp(){ return '<span class="mini-spin" aria-hidden="true"></span>'; }
function ring(pct, kind, days, size){
  size = size || 76;
  var r = (size/2) - 6;
  var c = 2*Math.PI*r;
  var off = c * (1 - Math.max(0,Math.min(100,pct))/100);
  var col = kind==='ok' ? 'var(--success-500)' : (kind==='warn' ? 'var(--warning-500)' : 'var(--danger-500)');
  return '<svg class="ring-gauge" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'
    + '<circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="var(--slate-200)" stroke-width="6"/>'
    + '<circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="6" stroke-linecap="round" stroke-dasharray="'+c+'" stroke-dashoffset="'+off+'" transform="rotate(-90 '+(size/2)+' '+(size/2)+')"/>'
    + '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-label">'+days+'</text>'
    + '</svg>';
}
function mgauge(pct, kind){
  var col = kind==='err' ? 'var(--danger-500)' : (kind==='warn' ? 'var(--warning-500)' : 'var(--success-500)');
  return '<div class="mgauge"><div class="mgauge-fill" style="width:'+Math.max(0,Math.min(100,pct))+'%;background:'+col+'"></div></div>';
}
function stepper3(labels, phaseIndex){
  return '<div class="stepper3">' + labels.map(function(l,i){
    var state = i<phaseIndex ? 'done' : (i===phaseIndex ? 'active' : 'todo');
    return '<div class="st3-node st3-'+state+'"><span class="st3-dot">'+(state==='done'?icon('check'):'')+'</span><span class="st3-label">'+l+'</span></div>'
      + (i<labels.length-1 ? '<span class="st3-line st3-line-'+(i<phaseIndex?'done':'todo')+'"></span>' : '');
  }).join('') + '</div>';
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
    + '<div class="sb-user"><span class="avatar">JS</span><div style="flex:1;min-width:0"><div class="sb-uname">'+STATE.user.nome+'</div><div class="sb-umail">'+STATE.user.email+'</div></div><button class="sb-logout" data-logout>'+icon('logout')+'</button></div>'
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
function detailHeader(a){
  return '<div class="page-head"><p class="crumbline"><b>'+AREA_LABEL[a.area]+'</b> &gt; '+a.nome+'</p><h1>'+a.nome+'</h1><p>'+a.desc+'</p></div>';
}

/* ---------- app state ---------- */
var STATE = { user:null, exec:{} };
function ex(id, factory){ if (!STATE.exec[id]) STATE.exec[id] = factory(); return STATE.exec[id]; }
function rerender(){ render(); }

/* ============================================================================
   FISCAL
   ============================================================================ */

/* ---- Escrituração NF-e (a1): réplica do fluxo real de
   frontend/src/app/dashboard/fiscal/page.jsx — KPIs (Total NFes, Valor
   total, ICMS, PIS+COFINS), filtros Cliente/Mês/Ano, tabela com chave NFe
   e CNPJ emitente/destinatário, botão "Atualizar lista". ---- */
var PADARIA_CNPJ = '12.345.678/0001-99';
var ESCRIT_SEED = [
  { data:'01/08/2026', chave:'35260812345678000199550010000045211234567890', tipo:'entrada', emit:'11.222.333/0001-44', dest:PADARIA_CNPJ, valor:8420 },
  { data:'03/08/2026', chave:'35260812345678000199550010000008911987654321', tipo:'saida', emit:PADARIA_CNPJ, dest:'22.333.444/0001-55', valor:1280 },
  { data:'07/08/2026', chave:'35260812345678000199550010000000341122334455', tipo:'entrada', emit:'33.444.555/0001-66', dest:PADARIA_CNPJ, valor:640 },
  { data:'12/08/2026', chave:'35260812345678000199550010000008925566778899', tipo:'saida', emit:PADARIA_CNPJ, dest:'44.555.666/0001-77', valor:3100 },
  { data:'15/08/2026', chave:'35260812345678000199550010000198729988776655', tipo:'entrada', emit:'55.666.777/0001-88', dest:PADARIA_CNPJ, valor:12400 },
  { data:'18/08/2026', chave:'35260812345678000199550010000008934433221100', tipo:'saida', emit:PADARIA_CNPJ, dest:'66.777.888/0001-99', valor:980 },
  { data:'20/08/2026', chave:'35260812345678000199550010000076545566778899', tipo:'entrada', emit:'77.888.999/0001-00', dest:PADARIA_CNPJ, valor:1850 },
  { data:'22/08/2026', chave:'35260812345678000199550010000008946677889900', tipo:'saida', emit:PADARIA_CNPJ, dest:'88.999.000/0001-11', valor:430 }
];
function escritState(){ return ex('escrituracao-nfe', function(){ return { rows: ESCRIT_SEED.slice(), atualizando:false }; }); }
function truncarChave(c){ return c.slice(0,8)+'…'+c.slice(-6); }
function renderEscrituracao(){
  var s = escritState();
  var totalNfe = s.rows.length, valorTotal = 0, icms = 0, pisCofins = 0;
  s.rows.forEach(function(r){ valorTotal += r.valor; icms += r.valor*0.12; pisCofins += r.valor*0.0365; });
  var kpis = '<div class="grid4">'
    + '<div class="stat"><div class="stat-label">Total de NFes processadas</div><div class="stat-value tnum">'+totalNfe+'</div></div>'
    + '<div class="stat"><div class="stat-label">Valor total</div><div class="stat-value tnum">'+fmtBRL(valorTotal)+'</div></div>'
    + '<div class="stat"><div class="stat-label">ICMS total</div><div class="stat-value tnum">'+fmtBRL(icms)+'</div></div>'
    + '<div class="stat"><div class="stat-label">PIS + COFINS total</div><div class="stat-value tnum">'+fmtBRL(pisCofins)+'</div></div>'
    + '</div>';
  var inputCss = 'border:1px solid var(--slate-300);border-radius:6px;padding:8px 10px;font-size:13px;width:100%;';
  var filtros = '<div class="card card-pad"><div class="stat-label" style="margin-bottom:12px;">Filtros</div>'
    + '<div class="grid3">'
    + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Cliente</span><select style="'+inputCss+'"><option selected>Padaria do João</option></select></label>'
    + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Mês</span><select style="'+inputCss+'"><option selected>Agosto</option></select></label>'
    + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Ano</span><select style="'+inputCss+'"><option selected>2026</option></select></label>'
    + '</div></div>';
  var rows = s.rows.map(function(r){
    return '<tr><td>'+r.data+'</td><td class="mono" title="'+r.chave+'">'+truncarChave(r.chave)+'</td>'
      + '<td>'+badge(r.tipo==='entrada'?'Entrada':'Saída', r.tipo==='entrada'?'ok':'err')+'</td>'
      + '<td class="mono">'+r.emit+'</td><td class="mono">'+r.dest+'</td>'
      + '<td class="strong">'+fmtBRL(r.valor)+'</td></tr>';
  }).join('');
  var tabela = '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Data emissão</th><th>Chave NFe</th><th>Tipo</th><th>CNPJ emitente</th><th>CNPJ destinatário</th><th>Valor total</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  return '<div class="page">'
    + '<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">'
    + '<div><p class="crumbline"><b>Fiscal</b> &gt; Escrituração NF-e</p><h1>Fiscal</h1><p>Lançamentos de NFe registrados automaticamente pelo agente.</p></div>'
    + '<button class="btn-line" data-escrit-atualizar>'+(s.atualizando?(sp()+' Atualizando...'):'Atualizar lista')+'</button>'
    + '</div>'
    + kpis + filtros + tabela
    + '</div>';
}
function bindEscrituracao(){
  var btn = document.querySelector('[data-escrit-atualizar]');
  if (btn) btn.addEventListener('click', function(){
    var s = escritState();
    if (s.atualizando) return;
    s.atualizando = true; render();
    setTimeout(function(){ s.atualizando = false; render(); }, 700);
  });
}

/* ---- Apuração Simples Nacional (c7): réplica do fluxo real de
   frontend/src/app/dashboard/apuracoes/page.jsx — filtros + Calcular DAS,
   Resultado do cálculo, Composição da RBT12, Notas auditadas, Editar valor
   (rascunho), Histórico de edições, Aprovar DAS com modal de confirmação. ---- */
var APSIMPLES_DADOS = {
  padaria: { cliente:'Padaria do João', anexo:'Anexo I', rbt12:412000, receitaMes:27711, aliquotaNominal:10.70, parcela:22500, aliquotaEfetiva:4.50, faixaLimite:720000, das:1247,
    status:'aprovado', aprovadoPor:'João Silva', aprovadoEm:'20/08/2026 09:14',
    consideradas:[
      { nf:'004521', desc:'Distribuidora ABC Ltda', data:'01/08/2026', valor:8420 },
      { nf:'000034', desc:'Gráfica Sul Ltda', data:'07/08/2026', valor:640 },
      { nf:'007654', desc:'Fornecedora Embalagens', data:'20/08/2026', valor:1850 }
    ],
    excluidas:[ { nf:'000893', desc:'Padaria Central', data:'18/08/2026', valor:980, motivo:'Devolução de mercadoria' } ],
    historico:[] },
  oficina: { cliente:'Oficina Silva', anexo:'Anexo III', rbt12:198500, receitaMes:14355, aliquotaNominal:13.00, parcela:13498, aliquotaEfetiva:6.20, faixaLimite:360000, das:890,
    status:'aprovado', aprovadoPor:'João Silva', aprovadoEm:'20/08/2026 09:20',
    consideradas:[
      { nf:'2200145', desc:'Peças Automotivas RS', data:'04/08/2026', valor:5200 },
      { nf:'2200198', desc:'Cliente balcão', data:'15/08/2026', valor:3100 }
    ],
    excluidas:[], historico:[] },
  transportes: { cliente:'Transportes Veloz', anexo:'Anexo III', rbt12:256000, receitaMes:23662, aliquotaNominal:15.00, parcela:20224, aliquotaEfetiva:7.10, faixaLimite:360000, das:1680,
    status:'aprovado', aprovadoPor:'João Silva', aprovadoEm:'20/08/2026 09:25',
    consideradas:[
      { nf:'0091823', desc:'Frete — Mercado Bom Preço', data:'09/08/2026', valor:12400 },
      { nf:'0091855', desc:'Frete — Clínica Rosa', data:'19/08/2026', valor:6800 }
    ],
    excluidas:[], historico:[] },
  mercado: { cliente:'Mercado Bom Preço', anexo:'Anexo I', rbt12:388000, receitaMes:24292, aliquotaNominal:9.50, parcela:18236, aliquotaEfetiva:4.80, faixaLimite:720000, das:1166,
    status:'rascunho',
    historico:[ { de:1140, para:1166, motivo:'Ajuste após conferência de nota fiscal tardia', quando:'21/08/2026 16:02', por:'João Silva' } ],
    consideradas:[ { nf:'000892', desc:'Compra em atacado — revenda', data:'12/08/2026', valor:3100 } ],
    excluidas:[] }
};
function fmtPct(v){ return v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%'; }
function gerarRBT12(total){
  var pesos = [0.076,0.081,0.079,0.084,0.088,0.083,0.086,0.090,0.085,0.082,0.079,0.087];
  var meses = ['Set/25','Out/25','Nov/25','Dez/25','Jan/26','Fev/26','Mar/26','Abr/26','Mai/26','Jun/26','Jul/26','Ago/26'];
  var soma = 0;
  var linhas = meses.map(function(m,i){ var v = Math.round(total*pesos[i]); soma += v; return { mes:m, receita:v }; });
  linhas[11].receita += (total - soma);
  return linhas;
}
function apsimplesState(){
  return ex('apuracao-simples', function(){
    return { clienteId:'padaria', calculando:false, calculado:true, valorEditado:'', motivo:'', erroEdicao:'', salvando:false, showAprovar:false, aprovando:false };
  });
}
function renderApuracaoSimples(){
  var s = apsimplesState();
  var d = APSIMPLES_DADOS[s.clienteId];
  var opcoesCliente = ['padaria','oficina','transportes','mercado'].map(function(id){
    return '<option value="'+id+'"'+(s.clienteId===id?' selected':'')+'>'+esc(APSIMPLES_DADOS[id].cliente)+'</option>';
  }).join('');
  var inputCss = 'border:1px solid var(--slate-300);border-radius:6px;padding:8px 10px;font-size:13px;width:100%;';

  var head = '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Apuração Simples Nacional</p><h1>Apuração Simples Nacional</h1><p>Calcule, revise e aprove o DAS dos clientes no Simples Nacional.</p></div>';

  var filtros = '<div class="card card-pad"><div class="stat-label" style="margin-bottom:12px;">Filtros</div>'
    + '<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:16px;">'
    + '<label style="min-width:220px;flex:1;display:block;"><span class="stat-label" style="display:block;margin-bottom:6px;">Cliente</span><select data-apsim-cliente style="'+inputCss+'">'+opcoesCliente+'</select></label>'
    + '<label style="min-width:140px;display:block;"><span class="stat-label" style="display:block;margin-bottom:6px;">Mês</span><select style="'+inputCss+'"><option selected>Agosto</option></select></label>'
    + '<label style="min-width:100px;display:block;"><span class="stat-label" style="display:block;margin-bottom:6px;">Ano</span><select style="'+inputCss+'"><option selected>2026</option></select></label>'
    + '<button class="btn-dark" data-apsim-calcular>'+(s.calculando?(sp()+' Calculando...'):'Calcular DAS')+'</button>'
    + '</div></div>';

  if (!s.calculado){
    return '<div class="page">'+head+filtros+'<div class="card card-pad" style="background:var(--brand-50);border-color:var(--brand-200);color:var(--brand-800);font-size:13.5px;">Selecione um cliente e clique em "Calcular DAS" para ver o resultado.</div></div>';
  }

  var statusBadge = d.status==='aprovado'
    ? '<span class="badge badge-ok">Aprovado</span>'
    : '<span class="badge badge-neutral">Rascunho</span>';

  var resultado = '<div class="card card-pad">'
    + '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:18px;">'
    + '<div><div style="font-weight:700;font-size:15px;color:var(--slate-900);">Resultado do cálculo</div><div class="stat-label" style="margin-top:2px;">'+esc(d.cliente)+' · Agosto/2026</div></div>'
    + statusBadge + '</div>'
    + '<div class="grid4" style="margin-bottom:16px;">'
    + '<div><div class="stat-label">Regime</div><div class="strong">Simples Nacional</div></div>'
    + '<div><div class="stat-label">Anexo efetivo</div><div class="strong">'+d.anexo+'</div></div>'
    + '<div><div class="stat-label">RBT12</div><div class="strong mono">'+fmtBRL(d.rbt12)+'</div></div>'
    + '<div><div class="stat-label">Faixa de receita</div><div class="strong mono">até '+fmtBRL(d.faixaLimite)+'</div></div>'
    + '</div>'
    + '<div class="grid4" style="padding-top:14px;border-top:1px solid var(--slate-100);">'
    + '<div><div class="stat-label">Receita da competência</div><div class="strong mono">'+fmtBRL(d.receitaMes)+'</div></div>'
    + '<div><div class="stat-label">Alíquota nominal</div><div class="strong mono">'+fmtPct(d.aliquotaNominal)+'</div></div>'
    + '<div><div class="stat-label">Parcela deduzida</div><div class="strong mono">'+fmtBRL(d.parcela)+'</div></div>'
    + '<div><div class="stat-label">Alíquota efetiva</div><div class="strong mono">'+fmtPct(d.aliquotaEfetiva)+'</div></div>'
    + '</div>'
    + '<div style="margin-top:18px;display:flex;justify-content:space-between;align-items:baseline;border-radius:var(--r-md);background:var(--brand-50);border:1px solid var(--brand-200);padding:16px 18px;">'
    + '<span class="stat-label" style="color:var(--brand-800);">Valor do DAS</span>'
    + '<span class="mono" style="font-size:26px;font-weight:700;color:var(--brand-800);">'+fmtBRL(d.das)+'</span>'
    + '</div></div>';

  var rbt12rows = gerarRBT12(d.rbt12).map(function(r){
    return '<tr><td>'+r.mes+'</td><td style="text-align:right" class="mono">'+fmtBRL(r.receita)+'</td><td style="text-align:right" class="mono">'+fmtBRL(0)+'</td><td style="text-align:right" class="mono strong">'+fmtBRL(r.receita)+'</td></tr>';
  }).join('');
  var rbt12Table = '<div class="card"><div class="card-head"><h2>Composição da RBT12</h2></div>'
    + '<div class="tbl-wrap"><table><thead><tr><th>Competência</th><th style="text-align:right">NF-es</th><th style="text-align:right">Histórico informado</th><th style="text-align:right">Total</th></tr></thead>'
    + '<tbody>'+rbt12rows+'</tbody>'
    + '<tfoot><tr><td colspan="3" style="text-align:right" class="stat-label">RBT12</td><td style="text-align:right" class="mono strong">'+fmtBRL(d.rbt12)+'</td></tr></tfoot></table></div></div>';

  var notasCol = function(lista, cor, titulo){
    if (!lista.length) return '<div><h3 style="font-size:13px;font-weight:700;color:'+cor+';margin-bottom:8px;">'+titulo+' (0)</h3><div class="stat-label" style="padding:10px 0;">Nenhuma NF-e nesta lista.</div></div>';
    var itens = lista.map(function(n){
      return '<div style="padding:10px 0;border-bottom:1px solid var(--slate-100);"><div style="display:flex;justify-content:space-between;"><span>'+esc(n.desc)+' <span class="mono" style="color:var(--fg-muted);">('+n.nf+')</span></span><span class="mono strong">'+fmtBRL(n.valor)+'</span></div><div class="stat-label" style="margin-top:2px;">'+n.data+(n.motivo?' · '+esc(n.motivo):'')+'</div></div>';
    }).join('');
    return '<div><h3 style="font-size:13px;font-weight:700;color:'+cor+';margin-bottom:8px;">'+titulo+' ('+lista.length+')</h3>'+itens+'</div>';
  };
  var notas = '<div class="card card-pad"><div style="font-weight:700;font-size:15px;color:var(--slate-900);">Notas fiscais auditadas</div>'
    + '<p class="stat-label" style="margin:4px 0 16px;">Confira quais NF-es foram consideradas ou excluídas e o motivo.</p>'
    + '<div class="grid2">'
    + notasCol(d.consideradas, 'var(--success-700)', 'Consideradas')
    + notasCol(d.excluidas, 'var(--danger-700)', 'Excluídas')
    + '</div></div>';

  var editar = '';
  if (d.status !== 'aprovado'){
    editar = '<div class="card card-pad"><div style="font-weight:700;font-size:15px;color:var(--slate-900);">Editar valor</div>'
      + '<p class="stat-label" style="margin:4px 0 14px;">Ajuste o valor do DAS caso discorde do cálculo automático.</p>'
      + '<div style="display:grid;grid-template-columns:1fr 2fr;gap:14px;">'
      + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Valor final</span><input type="text" data-apsim-valor value="'+esc(s.valorEditado||fmtBRL(d.das))+'" style="'+inputCss+'font-family:var(--font-mono,monospace);"></label>'
      + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Motivo da edição</span><input type="text" data-apsim-motivo placeholder="Obrigatório para registrar a alteração" value="'+esc(s.motivo)+'" style="'+inputCss+'"></label>'
      + '</div>'
      + (s.erroEdicao ? '<p style="margin-top:10px;border:1px solid var(--danger-200,#FECDD3);background:var(--danger-50,#FFF1F2);color:var(--danger-700);border-radius:6px;padding:8px 12px;font-size:13px;">'+esc(s.erroEdicao)+'</p>' : '')
      + '<div style="margin-top:14px;display:flex;justify-content:flex-end;">'
      + '<button class="btn-line" data-apsim-salvar>'+(s.salvando?(sp()+' Salvando...'):'Salvar edição')+'</button>'
      + '</div></div>';
  }

  var historico = '';
  if (d.historico.length){
    var hrows = d.historico.map(function(h){
      return '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--slate-100);">'
        + '<div class="mono" style="font-size:13px;"><span style="color:var(--fg-muted);text-decoration:line-through;">'+fmtBRL(h.de)+'</span> → <span class="strong">'+fmtBRL(h.para)+'</span></div>'
        + '<div style="flex:1;font-size:13px;">'+esc(h.motivo)+'</div>'
        + '<div class="stat-label" style="text-align:right;">'+h.quando+'<br>por '+h.por+'</div></div>';
    }).join('');
    historico = '<div class="card"><div class="card-head"><h2>Histórico de edições</h2></div><div style="padding:4px 20px;">'+hrows+'</div></div>';
  }

  var aprovarBar = '<div class="card card-pad" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;">'
    + (d.status==='aprovado'
        ? '<span style="color:var(--success-700);font-weight:600;font-size:13.5px;">Aprovado por '+d.aprovadoPor+' em '+d.aprovadoEm+'</span>'
        : '<span class="stat-label">Revise os dados acima antes de aprovar este DAS.</span>')
    + '<button class="btn-dark" data-apsim-abrir-aprovar '+(d.status==='aprovado'?'disabled style="opacity:.5;cursor:not-allowed;"':'')+'>Aprovar DAS</button>'
    + '</div>';

  var modal = '';
  if (s.showAprovar){
    modal = '<div class="modal-overlay" data-apsim-fechar-aprovar><div class="modal-box" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">Confirmar aprovação</div></div><button class="icon-btn" data-apsim-fechar-aprovar>'+icon('x')+'</button></div>'
      + '<div class="modal-body"><p style="font-size:13.5px;line-height:1.6;">Confirmar aprovação do DAS de <b>'+fmtBRL(d.das)+'</b> para <b>'+esc(d.cliente)+'</b> referente a <b>Agosto/2026</b>?</p></div>'
      + '<div class="modal-foot"><button class="btn-line" data-apsim-fechar-aprovar>Cancelar</button><button class="btn-dark" data-apsim-confirmar-aprovar>'+(s.aprovando?(sp()+' Aprovando...'):'Confirmar aprovação')+'</button></div>'
      + '</div></div>';
  }

  return '<div class="page">'+head+filtros+resultado+rbt12Table+notas+editar+historico+aprovarBar+'</div>'+modal;
}
function bindApuracaoSimples(){
  var s = apsimplesState();
  var elCliente = document.querySelector('[data-apsim-cliente]');
  if (elCliente) elCliente.addEventListener('change', function(){ s.clienteId = elCliente.value; s.valorEditado=''; s.motivo=''; s.erroEdicao=''; render(); });
  var elCalcular = document.querySelector('[data-apsim-calcular]');
  if (elCalcular) elCalcular.addEventListener('click', function(){
    if (s.calculando) return;
    s.calculando = true; render();
    setTimeout(function(){ s.calculando = false; s.calculado = true; render(); }, 800);
  });
  var elValor = document.querySelector('[data-apsim-valor]');
  if (elValor) elValor.addEventListener('input', function(){ s.valorEditado = elValor.value; });
  var elMotivo = document.querySelector('[data-apsim-motivo]');
  if (elMotivo) elMotivo.addEventListener('input', function(){ s.motivo = elMotivo.value; });
  var elSalvar = document.querySelector('[data-apsim-salvar]');
  if (elSalvar) elSalvar.addEventListener('click', function(){
    if (s.salvando) return;
    if (!s.motivo || !s.motivo.trim()){ s.erroEdicao = 'Informe o motivo da alteração.'; render(); return; }
    s.salvando = true; s.erroEdicao=''; render();
    setTimeout(function(){
      var d = APSIMPLES_DADOS[s.clienteId];
      var novo = Number(String(s.valorEditado).replace(/[^\d,.-]/g,'').replace(',', '.')) || d.das;
      d.historico.push({ de:d.das, para:novo, motivo:s.motivo, quando:'23/08/2026 '+new Date().toTimeString().slice(0,5), por:'João Silva' });
      d.das = novo;
      s.salvando = false; s.motivo=''; s.valorEditado='';
      render();
    }, 900);
  });
  document.querySelectorAll('[data-apsim-abrir-aprovar]').forEach(function(el){ el.addEventListener('click', function(){ if (el.hasAttribute('disabled')) return; s.showAprovar = true; render(); }); });
  document.querySelectorAll('[data-apsim-fechar-aprovar]').forEach(function(el){ el.addEventListener('click', function(){ if (s.aprovando) return; s.showAprovar = false; render(); }); });
  var elConfirmar = document.querySelector('[data-apsim-confirmar-aprovar]');
  if (elConfirmar) elConfirmar.addEventListener('click', function(){
    if (s.aprovando) return;
    s.aprovando = true; render();
    setTimeout(function(){
      var d = APSIMPLES_DADOS[s.clienteId];
      d.status = 'aprovado'; d.aprovadoPor = 'João Silva'; d.aprovadoEm = '23/08/2026 '+new Date().toTimeString().slice(0,5);
      s.aprovando = false; s.showAprovar = false;
      render();
    }, 900);
  });
}

/* ---- Apuração Lucro Presumido (c8): trilha de 4 trimestres ---- */
var APPRES_TRI = [
  { tri:'1º tri/2026', base:42000, irpj:2835, csll:1701, pis:273, cofins:1260, status:'Apurado', done:true },
  { tri:'2º tri/2026', base:45500, irpj:3071, csll:1843, pis:296, cofins:1365, status:'Apurado', done:true },
  { tri:'3º tri/2026', base:48000, irpj:3240, csll:1944, pis:312, cofins:1440, status:'Emitida', done:true, atual:true },
  { tri:'4º tri/2026', status:'Aguardando fechamento', done:false }
];
function appresState(){ return ex('apuracao-presumido', function(){ return { sel: [2] }; }); }
function renderApuracaoPresumido(){
  var s = appresState();
  var trilha = APPRES_TRI.map(function(t,i){
    var cls = 'trim-node' + (t.atual ? ' trim-atual' : '') + (t.done ? ' trim-done' : ' trim-pending') + (s.sel.indexOf(i)>=0 ? ' trim-sel' : '');
    return '<button type="button" class="'+cls+'" data-appres-tri="'+i+'" '+(t.done?'':'disabled')+'><span class="trim-title">'+t.tri+'</span><span class="trim-sub">'+(t.done ? fmtBRL(t.irpj+t.csll+t.pis+t.cofins) : 'sem dados ainda')+'</span></button>';
  }).join('<span class="trim-connector"></span>');
  var cards = s.sel.map(function(i){
    var t = APPRES_TRI[i];
    if (!t.done) return '';
    return '<div class="card card-pad appres-card"><h3>'+t.tri+'</h3>'
      + '<div class="appres-grid"><div><span class="g-lbl">Base presumida</span><span class="g-val">'+fmtBRL(t.base)+'</span></div><div><span class="g-lbl">IRPJ</span><span class="g-val">'+fmtBRL(t.irpj)+'</span></div><div><span class="g-lbl">CSLL</span><span class="g-val">'+fmtBRL(t.csll)+'</span></div><div><span class="g-lbl">PIS</span><span class="g-val">'+fmtBRL(t.pis)+'</span></div><div><span class="g-lbl">COFINS</span><span class="g-val">'+fmtBRL(t.cofins)+'</span></div><div><span class="g-lbl">Status</span>'+badge(t.status)+'</div></div></div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Apuração Lucro Presumido/Real</p><h1>Apuração Lucro Presumido/Real</h1><p>Calcula IRPJ, CSLL, PIS e COFINS por atividade — hoje aplicado à Clínica Rosa S/S, único cliente do dataset em Lucro Presumido.</p></div>'
    + noteChip('IRPJ leva adicional de 10% sobre a base trimestral que exceder R$ 60.000,00.')
    + '<div class="card card-pad"><div class="trim-trail">'+trilha+'</div><p class="trim-hint">Clique num trimestre para ver o detalhamento — clique em dois para comparar lado a lado.</p></div>'
    + (cards ? '<div class="grid2">'+cards+'</div>' : '')
    + '</div>';
}
function bindApuracaoPresumido(){
  document.querySelectorAll('[data-appres-tri]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-appres-tri');
      var s = appresState();
      var pos = s.sel.indexOf(i);
      if (pos >= 0) s.sel.splice(pos,1);
      else { s.sel.push(i); if (s.sel.length > 2) s.sel.shift(); }
      render();
    });
  });
}

/* ---- Emissão de Guias DAS/DARF (c9): boleto com código de barras ---- */
var GUIAS_SEED = [
  {id:'g1', tipo:'DAS', cliente:'Padaria do João', competencia:'Ago/2026', vencimento:'20/08/2026', valor:1247, status:'Emitida'},
  {id:'g2', tipo:'DAS', cliente:'Oficina Silva', competencia:'Ago/2026', vencimento:'20/08/2026', valor:890, status:'Emitida'},
  {id:'g3', tipo:'DARF IRPJ', cliente:'Clínica Rosa', competencia:'3º tri/2026', vencimento:'25/08/2026', valor:3240, status:'Pendente'},
  {id:'g4', tipo:'DAS', cliente:'Transportes Veloz', competencia:'Ago/2026', vencimento:'20/08/2026', valor:1680, status:'Paga'},
  {id:'g5', tipo:'DAS', cliente:'Mercado Bom Preço', competencia:'Ago/2026', vencimento:'20/08/2026', valor:1166, status:'Emitida'}
];
function guiasState(){ return ex('emissao-das-darf', function(){ return { rows: GUIAS_SEED.map(function(g){ return Object.assign({}, g); }) }; }); }
function renderEmissaoGuias(){
  var s = guiasState();
  var total = s.rows.reduce(function(a,g){ return a+g.valor; }, 0);
  var emitidas = s.rows.filter(function(g){ return g.status !== 'Pendente'; }).length;
  var cards = s.rows.map(function(g){
    return '<div class="guia-card"><div class="guia-card-top"><div><div class="guia-tipo">'+g.tipo+'</div><div class="guia-cliente">'+g.cliente+'</div></div>'+badge(g.status)+'</div>'
      + '<div class="guia-barcode'+(g.drawing?' drawing':'')+'"></div>'
      + '<div class="guia-rows"><div><div class="g-lbl">Competência</div><div class="g-val">'+g.competencia+'</div></div><div style="text-align:right"><div class="g-lbl">Vencimento</div><div class="g-val">'+g.vencimento+'</div></div></div>'
      + '<div class="guia-foot"><span style="font-size:11.5px;color:var(--fg-muted)">Valor</span><span class="guia-valor tnum">'+fmtBRL(g.valor)+'</span></div>'
      + (g.status==='Pendente' ? '<div style="padding:0 16px 14px;"><button class="btn-dark" style="width:100%" data-guia-gerar="'+g.id+'">Gerar Guia</button></div>' : '')
      + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Emissão de guias</p><h1>Emissão de Guias (DAS/DARF)</h1><p>Assim que um imposto é apurado, a guia sai pronta para pagar, com código de barras e vencimento, sem digitar o valor de novo em nenhum sistema do governo.</p></div>'
    + noteChip('GNRE e guias de ISS seguem o mesmo fluxo — esta lista consolida todas as guias pendentes do escritório por vencimento.')
    + '<div class="guia-grid">'+cards+'</div>'
    + '<div class="card"><div class="totals-footer" style="border-top:none;border-radius:var(--r-xl);"><span>Total em guias do período <b class="tnum">'+fmtBRL(total)+'</b></span><span>'+s.rows.length+' guias · '+emitidas+' já emitidas ou pagas</span></div></div>'
  + '</div>';
}
function bindEmissaoGuias(){
  document.querySelectorAll('[data-guia-gerar]').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-guia-gerar');
      var s = guiasState();
      var g = s.rows.find(function(x){ return x.id===id; });
      if (!g) return;
      g.drawing = true; render();
      setTimeout(function(){ g.drawing = false; g.status = 'Emitida'; render(); }, 850);
    });
  });
}

/* ---- Retenções na fonte (b10): linha expansível com a conta ---- */
var RETFONTE_SEED = [
  { nf:'000891', cliente:'Clínica Rosa', tipo:'ISS', base:4200, aliq:'5%', valor:210 },
  { nf:'004521', cliente:'Transportes Veloz', tipo:'IRRF', base:8400, aliq:'1,5%', valor:126 },
  { nf:'000034', cliente:'Clínica Rosa', tipo:'INSS', base:3100, aliq:'11%', valor:341 },
  { nf:'007654', cliente:'Transportes Veloz', tipo:'ISS', base:5600, aliq:'3%', valor:168 }
];
function retfonteState(){ return ex('retencoes-fonte', function(){ return { open:{} }; }); }
function renderRetencoesFonte(){
  var s = retfonteState();
  var total = RETFONTE_SEED.reduce(function(a,r){ return a+r.valor; }, 0);
  var rows = RETFONTE_SEED.map(function(r,i){
    var main = '<tr class="clickable-row" data-retfonte-toggle="'+i+'"><td class="mono">'+r.nf+'</td><td>'+r.cliente+'</td><td>'+r.tipo+'</td><td>'+fmtBRL(r.base)+'</td><td>'+r.aliq+'</td><td class="strong">'+fmtBRL(r.valor)+'</td></tr>';
    var open = s.open[i] ? '<tr class="calc-row"><td colspan="6"><span class="mono calc-line">'+fmtBRL(r.base)+' × '+r.aliq+' = '+fmtBRL(r.valor)+'</span></td></tr>' : '';
    return main + open;
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Retenções na fonte</p><h1>Retenções na fonte</h1><p>Identifica e calcula IRRF, INSS e ISS retidos em cada nota fiscal de serviço. Clique numa linha para ver a conta.</p></div>'
    + noteChip('Errar a retenção gera autuação do tomador do serviço, não só do prestador — é responsabilidade solidária.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>NF</th><th>Cliente</th><th>Tipo retenção</th><th>Base de cálculo</th><th>Alíquota</th><th>Valor retido</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="totals-footer"><span>Total retido no período <b class="tnum">'+fmtBRL(total)+'</b></span></div></div>'
    + '</div>';
}
function bindRetencoesFonte(){
  document.querySelectorAll('[data-retfonte-toggle]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-retfonte-toggle'); var s = retfonteState(); s.open[i] = !s.open[i]; render(); });
  });
}

/* ---- Revisão NF-e (b21): contagem regressiva de 24h, 3 botões ---- */
function revnfeState(){ return ex('revisao-nfe', function(){ return { rows: [
  { nf:'000892', cliente:'Mercado Bom Preço', desc:'CFOP divergente do cadastro', status:'Pendente', horas:2 },
  { nf:'004521', cliente:'Padaria do João', desc:'Sem retenção esperada', status:'Pendente', horas:23 },
  { nf:'019872', cliente:'Padaria do João', desc:'NCM desatualizado', status:'Pendente', horas:8 },
  { nf:'000034', cliente:'Oficina Silva', desc:'Valor de ICMS zerado', status:'Pendente', horas:0 }
], editing:null }; }); }
function revnfeBadgeKind(h){ return h<=0 ? 'err' : (h<4 ? 'err' : (h<12 ? 'warn' : 'ok')); }
function renderRevisaoNfe(){
  var s = revnfeState();
  var rows = s.rows.map(function(r,i){
    var resolved = r.status !== 'Pendente';
    var countdown = resolved ? '' : '<span class="badge badge-'+revnfeBadgeKind(r.horas)+'" style="margin-left:8px">'+(r.horas<=0?'Prazo encerrado':r.horas+'h restantes')+'</span>';
    var descCell = s.editing===i ? '<input type="text" class="revnfe-edit-input" id="revnfe-input-'+i+'" value="'+esc(r.desc)+'">' : r.desc + countdown;
    var actions = resolved ? '' : (
      '<button class="btn-confirm" data-revnfe-act="'+i+':aprovar">Aprovar</button> '
      + (s.editing===i ? '<button class="btn-line" data-revnfe-act="'+i+':salvar">Salvar</button>' : '<button class="btn-line" data-revnfe-act="'+i+':corrigir">Corrigir</button>') + ' '
      + '<button class="btn-reject" data-revnfe-act="'+i+':cancelar" '+(r.horas<=0?'disabled title="Prazo de cancelamento encerrado"':'')+'>Cancelar</button>'
    );
    return '<tr><td class="mono">'+r.nf+'</td><td>'+r.cliente+'</td><td>'+descCell+'</td><td>'+badge(r.status)+'</td><td>'+actions+'</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Revisão NF-e</p><h1>Revisão NF-e</h1><p>Checklist de inconsistências identificadas em notas emitidas pelo cliente, dentro da janela real de 24h para cancelamento.</p></div>'
    + noteChip('Nota fiscal só pode ser cancelada em até 24h após a emissão — por isso a validação precisa ser imediata, não no fechamento do mês.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>NF</th><th>Cliente</th><th>Inconsistência encontrada</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>';
}
function bindRevisaoNfe(){
  var s = revnfeState();
  document.querySelectorAll('[data-revnfe-act]').forEach(function(el){
    el.addEventListener('click', function(){
      var parts = el.getAttribute('data-revnfe-act').split(':'); var i = +parts[0]; var act = parts[1];
      var r = s.rows[i];
      if (act === 'aprovar'){ r.status = 'Aprovada'; s.editing = null; }
      else if (act === 'cancelar'){ if (r.horas>0){ r.status = 'Cancelada'; } }
      else if (act === 'corrigir'){ s.editing = i; }
      else if (act === 'salvar'){ var input = document.getElementById('revnfe-input-'+i); if (input) r.desc = input.value; r.status = 'Corrigida manualmente'; s.editing = null; }
      render();
    });
  });
}

/* ---- Classificação NCM/CFOP (c10): gauge de confiança + autocomplete ---- */
var NCM_POOL = ['1101.00.10 — Farinha de trigo','2710.19.32 — Óleo lubrificante','4011.10.00 — Pneu automóvel','3923.21.00 — Embalagem plástica','1101.00.20 — Farinha de centeio'];
function ncmState(){ return ex('ncm-cfop', function(){ return { rows: [
  { item:'Farinha de trigo tipo 1', cliente:'Padaria do João', ncm:'1101.00.10', cfop:'5102', conf:98, resolved:false, search:'' },
  { item:'Óleo de motor 20W50', cliente:'Oficina Silva', ncm:'2710.19.32', cfop:'5102', conf:95, resolved:false, search:'' },
  { item:'Pneu 175/70 R13', cliente:'Oficina Silva', ncm:'4011.10.00', cfop:'1102', conf:91, resolved:false, search:'' },
  { item:'Embalagem plástica', cliente:'Mercado Bom Preço', ncm:'3923.21.00', cfop:'1102', conf:96, resolved:false, search:'' }
], editing:null }; }); }
function renderNcmCfop(){
  var s = ncmState();
  var rows = s.rows.map(function(r,i){
    var confKind = r.conf>=95?'ok':(r.conf>=90?'warn':'err');
    var editRow = s.editing===i ? (
      '<tr class="calc-row"><td colspan="6"><input type="text" class="revnfe-edit-input" placeholder="Buscar NCM..." data-ncm-search="'+i+'" value="'+esc(r.search)+'">'
      + '<div class="ncm-suggest">' + NCM_POOL.filter(function(n){ return !r.search || n.toLowerCase().indexOf(r.search.toLowerCase())>=0; }).slice(0,3).map(function(n){ return '<button type="button" class="ncm-suggest-item" data-ncm-pick="'+i+':'+esc(n.split(' — ')[0])+'">'+n+'</button>'; }).join('') + '</div></td></tr>'
    ) : '';
    return '<tr class="'+(r.resolved?'ncm-resolved':'')+'"><td>'+r.item+'</td><td>'+r.cliente+'</td><td class="mono">'+r.ncm+'</td><td class="mono">'+r.cfop+'</td>'
      + '<td>'+mgauge(r.conf, confKind)+' <span class="tnum" style="margin-left:6px">'+r.conf+'%</span></td>'
      + '<td>'+(r.resolved ? badge('Resolvida','ok') : '<button class="btn-confirm" data-ncm-accept="'+i+'">Aceitar sugestão</button> <button class="btn-line" data-ncm-edit="'+i+'">Corrigir manualmente</button>')+'</td></tr>' + editRow;
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Classificação NCM/CFOP</p><h1>Classificação NCM/CFOP</h1><p>Sugere NCM e CFOP para itens novos, com base no histórico do cliente, e mostra o nível de confiança de cada sugestão.</p></div>'
    + noteChip('NCM classifica o produto (define ICMS/IPI aplicável); CFOP classifica a natureza da operação (venda, devolução, transferência...).')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Cliente</th><th>NCM sugerido</th><th>CFOP sugerido</th><th>Confiança</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>';
}
function bindNcmCfop(){
  var s = ncmState();
  document.querySelectorAll('[data-ncm-accept]').forEach(function(el){ el.addEventListener('click', function(){ s.rows[+el.getAttribute('data-ncm-accept')].resolved = true; render(); }); });
  document.querySelectorAll('[data-ncm-edit]').forEach(function(el){ el.addEventListener('click', function(){ s.editing = +el.getAttribute('data-ncm-edit'); render(); }); });
  document.querySelectorAll('[data-ncm-search]').forEach(function(el){ el.addEventListener('input', function(){ s.rows[+el.getAttribute('data-ncm-search')].search = el.value; render(); }); });
  document.querySelectorAll('[data-ncm-pick]').forEach(function(el){
    el.addEventListener('click', function(){
      var parts = el.getAttribute('data-ncm-pick').split(':'); var i = +parts[0];
      s.rows[i].ncm = parts[1]; s.rows[i].resolved = true; s.editing = null; render();
    });
  });
}

/* ---- SPED Fiscal (c1): stepper de 3 fases + log de validação ---- */
function spedState(){ return ex('sped-fiscal', function(){ return { rows: [
  { cliente:'Padaria do João', phase:3, log:[] },
  { cliente:'Oficina Silva', phase:3, log:[] },
  { cliente:'Clínica Rosa', phase:1, log:[] },
  { cliente:'Transportes Veloz', phase:3, log:[] },
  { cliente:'Mercado Bom Preço', phase:0, log:[] }
] }; }); }
var SPED_PHASES = ['Gerando','Validando','Transmitido'];
function renderSpedFiscal(){
  var s = spedState();
  var rows = s.rows.map(function(r,i){
    var clickable = r.phase < 3;
    return '<div class="sped-row'+(clickable?' clickable':'')+'" '+(clickable?'data-sped-advance="'+i+'"':'')+'>'
      + '<span class="sped-cliente">'+r.cliente+'</span>' + stepper3(SPED_PHASES, r.phase)
      + (r.log.length ? '<div class="sped-log">'+r.log.map(function(l){ return '<div>'+l+'</div>'; }).join('')+'</div>' : '')
      + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; SPED Fiscal</p><h1>SPED Fiscal</h1><p>Monta, valida e transmite o arquivo SPED Fiscal do período em 3 fases — sem digitar nada de novo, as notas já chegam classificadas da escrituração.</p></div>'
    + noteChip('SPED = Sistema Público de Escrituração Digital — o "extrato" oficial de tudo que a empresa comprou e vendeu no período.')
    + '<div class="card card-pad">'+rows+'</div>'
    + '</div>';
}
function bindSpedFiscal(){
  document.querySelectorAll('[data-sped-advance]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-sped-advance');
      var s = spedState(); var r = s.rows[i];
      if (r.log.length) return;
      function step(lines, cb){
        if (!lines.length){ cb(); return; }
        r.log.push(lines[0]); render();
        setTimeout(function(){ step(lines.slice(1), cb); }, 550);
      }
      if (r.phase === 0){
        r.log = ['Compilando registros C100/C170...'];
        render();
        setTimeout(function(){ r.phase = 1; r.log = []; step(['Verificando registro C170...','Verificando totalizador E110...'], function(){ r.phase = 2; r.log = []; render(); }); }, 700);
      } else if (r.phase === 1){
        step(['Verificando registro C170...','Verificando totalizador E110...'], function(){ r.phase = 2; r.log = []; render(); });
      }
    });
  });
}

/* ---- EFD-Contribuições (c2): mini barras duplas PIS/COFINS ---- */
function efdcontribState(){ return ex('efd-contribuicoes', function(){ return { rows: [
  { cliente:'Padaria do João', competencia:'Ago/2026', pis:412, cofins:1898, status:'Transmitida' },
  { cliente:'Oficina Silva', competencia:'Ago/2026', pis:198.5, cofins:913, status:'Transmitida' },
  { cliente:'Clínica Rosa', competencia:'Ago/2026', pis:312, cofins:1440, status:'Transmitida' },
  { cliente:'Mercado Bom Preço', competencia:'Ago/2026', pis:388, cofins:1786, status:'Pendente', sending:false }
] }; }); }
function renderEfdContribuicoes(){
  var s = efdcontribState();
  var maxV = Math.max.apply(null, s.rows.map(function(r){ return r.cofins; }));
  var rows = s.rows.map(function(r,i){
    var pisW = Math.max(4, Math.round(r.pis/maxV*60)), cofW = Math.max(4, Math.round(r.cofins/maxV*60));
    var bars = '<div class="dualbar"><div class="dualbar-pis" style="width:'+pisW+'px" title="PIS"></div><div class="dualbar-cofins" style="width:'+cofW+'px" title="COFINS"></div></div>';
    return '<tr><td>'+r.cliente+'</td><td>'+r.competencia+'</td><td>'+bars+' '+fmtBRL(r.pis)+'</td><td>'+fmtBRL(r.cofins)+'</td><td>'+badge(r.status)
      + (r.status==='Pendente' ? ' <button class="btn-line" data-efdc-send="'+i+'">'+(r.sending?sp()+' Transmitindo...':'Gerar e Transmitir')+'</button>' : '') + '</td></tr>';
  }).join('');
  var totalPis = s.rows.reduce(function(a,r){return a+r.pis;},0), totalCof = s.rows.reduce(function(a,r){return a+r.cofins;},0);
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; EFD-Contribuições</p><h1>EFD-Contribuições</h1><p>Apura crédito e débito de PIS/COFINS e transmite a EFD do período — os dois tributos mantêm uma proporção quase constante entre si (0,65% × 3%).</p></div>'
    + noteChip('Prazo de entrega: até o 10º dia útil do 2º mês subsequente à competência.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Competência</th><th>PIS apurado</th><th>COFINS apurado</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="totals-footer"><span>Total PIS <b class="tnum">'+fmtBRL(totalPis)+'</b></span><span>Total COFINS <b class="tnum">'+fmtBRL(totalCof)+'</b></span></div></div>'
    + '</div>';
}
function bindEfdContribuicoes(){
  document.querySelectorAll('[data-efdc-send]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-efdc-send'); var s = efdcontribState(); var r = s.rows[i];
      if (r.sending) return;
      r.sending = true; render();
      setTimeout(function(){ r.sending = false; r.status = 'Transmitida'; render(); }, 900);
    });
  });
}

/* ---- DCTF/DCTFWeb (c4): chips conectados ---- */
function dctfState(){ return ex('dctf-web', function(){ return { active:null }; }); }
var DCTF_ROWS = [
  { cliente:'Clínica Rosa', competencia:'Ago/2026', tributos:['IRPJ','CSLL','PIS','COFINS'], guias:'4 guias', status:'Transmitida' },
  { cliente:'Transportes Veloz', competencia:'Ago/2026', tributos:['PIS','COFINS'], guias:'2 guias', status:'Transmitida' },
  { cliente:'Padaria do João', competencia:'Ago/2026', tributos:['INSS retido'], guias:'1 guia', status:'Transmitida' }
];
function renderDctfWeb(){
  var s = dctfState();
  var rows = DCTF_ROWS.map(function(r,i){
    var chips = r.tributos.map(function(t,ti){
      var key = i+':'+ti;
      return '<button type="button" class="dctf-chip'+(s.active===key?' active':'')+'" data-dctf-chip="'+key+'">'+t+'</button>';
    }).join('<span class="dctf-dots"></span>');
    return '<tr><td>'+r.cliente+'</td><td>'+r.competencia+'</td><td>'+chips+'</td><td>'+r.guias+(s.active && s.active.indexOf(i+':')===0 ? ' <span class="dctf-link-note">↔ conectado à guia acima</span>' : '')+'</td><td>'+badge(r.status)+'</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; DCTF/DCTFWeb</p><h1>DCTF/DCTFWeb</h1><p>Confronta tributos declarados com os DARFs efetivamente emitidos e transmite — é reconciliar números que o sistema já sabe, não recalcular do zero.</p></div>'
    + noteChip('A DCTFWeb já nasce pré-preenchida com dados do eSocial e da EFD-Reinf.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Competência</th><th>Tributos declarados</th><th>DARFs vinculados</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>';
}
function bindDctfWeb(){
  document.querySelectorAll('[data-dctf-chip]').forEach(function(el){
    el.addEventListener('click', function(){
      var key = el.getAttribute('data-dctf-chip'); var s = dctfState();
      s.active = s.active === key ? null : key; render();
    });
  });
}

/* ---- EFD-Reinf (c3): abas por tipo de evento ---- */
function efdreinfState(){ return ex('efd-reinf', function(){ return { tab:'R-2010' }; }); }
var EFDREINF_ROWS = [
  { cliente:'Clínica Rosa', evento:'R-2010 Retenções tomadas', competencia:'Ago/2026', status:'Transmitido' },
  { cliente:'Transportes Veloz', evento:'R-2010 Retenções tomadas', competencia:'Ago/2026', status:'Transmitido' },
  { cliente:'Padaria do João', evento:'R-1000 Info do contribuinte', competencia:'Ago/2026', status:'Transmitido' }
];
function renderEfdReinf(){
  var s = efdreinfState();
  var counts = { 'R-1000': EFDREINF_ROWS.filter(function(r){return r.evento.indexOf('R-1000')===0;}).length, 'R-2010': EFDREINF_ROWS.filter(function(r){return r.evento.indexOf('R-2010')===0;}).length };
  var tabs = ['R-1000','R-2010'].map(function(t){ return '<button class="'+(s.tab===t?'active':'')+'" data-efdreinf-tab="'+t+'">'+t+' ('+counts[t]+')</button>'; }).join('');
  var rows = EFDREINF_ROWS.filter(function(r){ return r.evento.indexOf(s.tab)===0; }).map(function(r){
    return '<tr><td>'+r.cliente+'</td><td>'+r.evento+'</td><td>'+r.competencia+'</td><td>'+badge(r.status)+'</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; EFD-Reinf</p><h1>EFD-Reinf</h1><p>Transmite os eventos de retenção e informações do contribuinte, agrupados por tipo de evento.</p></div>'
    + noteChip('Prazo de entrega: até o 15º dia do mês subsequente à competência.')
    + '<div class="seg">'+tabs+'</div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Evento</th><th>Competência</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>';
}
function bindEfdReinf(){
  document.querySelectorAll('[data-efdreinf-tab]').forEach(function(el){
    el.addEventListener('click', function(){ efdreinfState().tab = el.getAttribute('data-efdreinf-tab'); render(); });
  });
}

/* ---- Alerta de alíquota (c11): feed expansível com aprovação humana ---- */
function alertaliqState(){ return ex('alerta-aliquota', function(){ return { rows: [
  { data:'20/08', assunto:'Simples Nacional — Anexo III', desc:'Sublimite de receita bruta atualizado para 2026', clientes:['Oficina Silva','Transportes Veloz'], tipo:'alerta', open:false, working:false, state:null },
  { data:'12/08', assunto:'ISS município sede', desc:'Alíquota de serviços de saúde alterada de 3% para 3,5%', clientes:['Clínica Rosa'], tipo:'alerta', open:false, working:false, state:null },
  { data:'05/08', assunto:'ICMS estadual', desc:'Nova tabela de CFOP para farinha de trigo publicada', clientes:['Padaria do João'], tipo:'info', open:false, working:false, state:null }
] }; }); }
function renderAlertaAliquota(){
  var s = alertaliqState();
  var items = s.rows.map(function(r,i){
    var head = '<div class="alertaliq-head" data-alertaliq-toggle="'+i+'"><span class="log-dot '+r.tipo+'"></span><div class="alertaliq-headtext"><b>'+r.assunto+'</b> — '+r.desc+'<div class="log-meta">'+r.data+(r.state?' · <b>'+r.state+'</b>':'')+'</div></div><span class="alertaliq-caret">'+(r.open?'▾':'▸')+'</span></div>';
    var body = r.open ? '<div class="alertaliq-body">'
      + '<div class="chip-row">'+r.clientes.map(function(c){ return '<span class="chip-count">'+c+'</span>'; }).join('')+'</div>'
      + (r.state ? '' : '<div style="margin-top:10px;display:flex;gap:10px;">'
        + '<button class="btn-confirm" data-alertaliq-act="'+i+':confirmar">'+(r.working?sp()+' Atualizando...':'Confirmar leitura e atualizar tabela')+'</button>'
        + '<button class="btn-line" data-alertaliq-act="'+i+':adiar">Marcar para revisar depois</button></div>')
      + '</div>' : '';
    return '<div class="alertaliq-item'+(r.state?' resolved':'')+'">'+head+body+'</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Fiscal</b> &gt; Alerta de alíquota</p><h1>Alerta de alíquota</h1><p>Feed de mudanças legislativas com os clientes impactados por cada uma — a leitura da norma continua humana, o agente só avisa.</p></div>'
    + noteChip('O agente monitora e avisa; interpretar a norma e autorizar a atualização da tabela é sempre decisão do contador.')
    + '<div class="card card-pad">'+items+'</div>'
    + '</div>';
}
function bindAlertaAliquota(){
  var s = alertaliqState();
  document.querySelectorAll('[data-alertaliq-toggle]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-alertaliq-toggle'); s.rows[i].open = !s.rows[i].open; render(); });
  });
  document.querySelectorAll('[data-alertaliq-act]').forEach(function(el){
    el.addEventListener('click', function(e){
      e.stopPropagation();
      var parts = el.getAttribute('data-alertaliq-act').split(':'); var i = +parts[0]; var act = parts[1];
      var r = s.rows[i];
      if (act === 'adiar'){ r.state = 'Marcado para revisar'; render(); return; }
      r.working = true; render();
      setTimeout(function(){ r.working = false; r.state = 'Atualizado'; render(); }, 700);
    });
  });
}

/* ============================================================================
   CONTÁBIL
   ============================================================================ */

/* ---- Conciliação bancária (a2): réplica do fluxo real de
   frontend/src/app/dashboard/conciliacao/[id]/page.jsx — ✅ Automático /
   ⚠️ Provável (Confirmar/Rejeitar) / ❌ Sem par (2 sub-tabelas reais), badge
   de status, "Concluir conciliação" travado até zerar os prováveis, e
   "Download Relatório" depois de concluída. ---- */
var CONC_PROVAVEL_SEED = [
  {id:'p1',dataBanco:'14/08',descBanco:'TED Recebida Distrib ABC',dataLanc:'15/08',descLanc:'Recebimento cliente',valor:2450},
  {id:'p2',dataBanco:'16/08',descBanco:'PIX Enviado Embalagens',dataLanc:'16/08',descLanc:'Pagto fornecedor',valor:890.15},
  {id:'p3',dataBanco:'19/08',descBanco:'Tarifa bancária',dataLanc:'18/08',descLanc:'Despesa bancária',valor:42.90},
  {id:'p4',dataBanco:'20/08',descBanco:'DOC Recebido Mercado V.',dataLanc:'21/08',descLanc:'Recebimento cliente',valor:1180}
];
var CONC_SEM_PAR_TRANSACOES = [
  { data:'17/08', desc:'Estorno cartão POS', valor:64.30 },
  { data:'19/08', desc:'IOF sobre operação', valor:8.12 },
  { data:'21/08', desc:'TED não identificada', valor:530 }
];
var CONC_SEM_PAR_LANCAMENTOS = [
  { data:'13/08', desc:'Pagamento fornecedor Embalagens Rio', valor:410.50 },
  { data:'20/08', desc:'Reembolso despesa de viagem', valor:220 }
];
function conciliacaoState(){ return ex('conciliacao-bancaria', function(){ return { automatico: 38, provavel: CONC_PROVAVEL_SEED.slice(), status:'em_andamento', showConcluir:false, concluindo:false, baixando:false }; }); }
function renderConciliacao(){
  var s = conciliacaoState();
  var total = 47, conciliadas = s.automatico + (CONC_PROVAVEL_SEED.length - s.provavel.length);
  var pct = Math.round(conciliadas/total*100);
  var podeConcluir = s.provavel.length === 0;
  var provRows = s.provavel.map(function(p){
    return '<tr><td>'+p.dataBanco+'</td><td>'+p.descBanco+'</td><td>'+p.dataLanc+'</td><td>'+p.descLanc+'</td><td class="strong">'+fmtBRL(p.valor)+'</td>'
      + '<td><button class="btn-confirm" data-conc-confirm="'+p.id+'">Confirmar</button> <button class="btn-reject" data-conc-reject="'+p.id+'">Rejeitar</button></td></tr>';
  }).join('') || '<tr><td colspan="6" style="color:var(--fg-muted)">Nenhum par provável pendente de decisão.</td></tr>';

  var semParTabela = function(titulo, lista, cols){
    if (!lista.length) return '<div><h3 style="font-size:13px;font-weight:600;color:var(--slate-700);margin-bottom:8px;">'+titulo+' (0)</h3><p style="font-size:13px;color:var(--fg-muted);">Nenhum item nesta lista.</p></div>';
    var rows = lista.map(function(x){ return '<tr><td>'+x.data+'</td><td>'+x.desc+'</td><td class="strong">'+fmtBRL(x.valor)+'</td></tr>'; }).join('');
    return '<div><h3 style="font-size:13px;font-weight:600;color:var(--slate-700);margin-bottom:8px;">'+titulo+' ('+lista.length+')</h3>'
      + '<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  };

  var statusBadge = s.status==='concluida' ? badge('Concluída','ok') : badge('Em andamento','warn');
  var acaoHeader = s.status==='concluida'
    ? '<button class="btn-line" data-conc-baixar>'+(s.baixando?(sp()+' Baixando...'):'Download Relatório')+'</button>'
    : '<button class="btn-dark" data-conc-abrir-concluir '+(podeConcluir?'':'disabled style="opacity:.5;cursor:not-allowed;" title="Resolva todos os pares prováveis antes de concluir"')+'>Concluir conciliação</button>';

  var modal = '';
  if (s.showConcluir){
    modal = '<div class="modal-overlay" data-conc-fechar-concluir><div class="modal-box" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">Concluir conciliação</div></div><button class="icon-btn" data-conc-fechar-concluir>'+icon('x')+'</button></div>'
      + '<div class="modal-body"><p style="font-size:13.5px;line-height:1.6;">Deseja realmente concluir esta conciliação? Essa ação marca as transações e lançamentos conciliados como definitivos.</p></div>'
      + '<div class="modal-foot"><button class="btn-line" data-conc-fechar-concluir>Cancelar</button><button class="btn-dark" data-conc-confirmar-concluir>'+(s.concluindo?(sp()+' Concluindo...'):'Concluir conciliação')+'</button></div>'
      + '</div></div>';
  }

  return '<div class="page">'
    + '<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">'
    + '<div><p class="crumbline"><b>Contábil</b> &gt; Conciliação bancária</p>'
    + '<div class="client-pill">'+icon('predio')+'<span>Padaria do João Ltda</span></div>'
    + '<h1>Revisão da conciliação</h1><p>Conta Bradesco 1234-5 · Agosto/2026</p></div>'
    + '<div style="display:flex;align-items:center;gap:10px;">'+statusBadge+acaoHeader+'</div>'
    + '</div>'
    + '<div class="card card-pad"><div style="font-size:12.5px;font-weight:600;color:var(--slate-700);margin-bottom:8px;">'+conciliadas+' de '+total+' transações conciliadas</div>'
    + '<div style="display:flex;align-items:center;gap:12px;"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--slate-900)"></div></div><span class="proc-pct tnum">'+pct+'%</span></div></div>'
    + '<div class="card"><div class="card-head" style="background:var(--success-100);border-color:#A7F3D0;"><h2 style="color:#064E3B">✅ Automático</h2>'+badge(s.automatico+' matches automáticos','ok')+'</div></div>'
    + '<div class="card"><div class="card-head" style="background:var(--warning-100);border-color:#FDE68A;"><h2 style="color:#78350F">⚠️ Provável</h2>'+badge(s.provavel.length+' sem decisão','warn')+'</div>'
    + '<div class="tbl-wrap"><table><thead><tr><th>Data banco</th><th>Descrição banco</th><th>Data lançamento</th><th>Descrição lançamento</th><th>Valor</th><th>Ações</th></tr></thead><tbody>'+provRows+'</tbody></table></div></div>'
    + '<div class="card card-pad"><div style="font-weight:700;font-size:15px;color:var(--slate-900);margin-bottom:2px;">❌ Sem par</div>'
    + '<p style="font-size:13px;color:var(--fg-muted);margin:0 0 14px;">Leitura apenas — resolva fora do sistema (lance ou ignore).</p>'
    + '<div class="grid2">'
    + semParTabela('Transações sem lançamento', CONC_SEM_PAR_TRANSACOES)
    + semParTabela('Lançamentos sem transação', CONC_SEM_PAR_LANCAMENTOS)
    + '</div></div>'
    + '</div>' + modal;
}
function bindConciliacao(){
  var s = conciliacaoState();
  document.querySelectorAll('[data-conc-confirm]').forEach(function(el){
    el.addEventListener('click', function(){ var id = el.getAttribute('data-conc-confirm'); s.provavel = s.provavel.filter(function(p){ return p.id !== id; }); s.automatico += 1; render(); });
  });
  document.querySelectorAll('[data-conc-reject]').forEach(function(el){
    el.addEventListener('click', function(){ var id = el.getAttribute('data-conc-reject'); s.provavel = s.provavel.filter(function(p){ return p.id !== id; }); render(); });
  });
  var abrirBtn = document.querySelector('[data-conc-abrir-concluir]');
  if (abrirBtn) abrirBtn.addEventListener('click', function(){ if (abrirBtn.hasAttribute('disabled')) return; s.showConcluir = true; render(); });
  document.querySelectorAll('[data-conc-fechar-concluir]').forEach(function(el){ el.addEventListener('click', function(){ if (s.concluindo) return; s.showConcluir = false; render(); }); });
  var confirmarBtn = document.querySelector('[data-conc-confirmar-concluir]');
  if (confirmarBtn) confirmarBtn.addEventListener('click', function(){
    if (s.concluindo) return;
    s.concluindo = true; render();
    setTimeout(function(){ s.concluindo = false; s.showConcluir = false; s.status = 'concluida'; render(); }, 900);
  });
  var baixarBtn = document.querySelector('[data-conc-baixar]');
  if (baixarBtn) baixarBtn.addEventListener('click', function(){
    if (s.baixando) return;
    s.baixando = true; render();
    setTimeout(function(){ s.baixando = false; render(); }, 700);
  });
}

/* ---- Balancete mensal (b15): sensação de fechamento ---- */
function balanceteState(){ return ex('balancete-mensal', function(){ return { rows: [
  { cliente:'Padaria do João', comp:'Ago/2026', ini:18420, mov:6850, fim:25270, status:'Fechado' },
  { cliente:'Oficina Silva', comp:'Ago/2026', ini:9120, mov:3240, fim:12360, status:'Fechado' },
  { cliente:'Clínica Rosa', comp:'Ago/2026', ini:41800, mov:12100, fim:53900, status:'Fechado' },
  { cliente:'Mercado Bom Preço', comp:'Ago/2026', ini:22900, mov:8410, fim:31310, status:'Em fechamento', flashing:false, locking:false }
] }; }); }
function renderBalanceteMensal(){
  var s = balanceteState();
  var rows = s.rows.map(function(r){
    var cls = (r.flashing?' balancete-flash':'');
    var action = r.status==='Em fechamento' ? '<button class="btn-dark" data-balancete-fechar="'+r.cliente+'">Gerar Balancete</button>' : (r.locking ? '<span class="cadeado-anim">'+icon('cadeado')+'</span>' : '');
    return '<tr class="'+cls+'"><td>'+r.cliente+'</td><td>'+r.comp+'</td><td>'+fmtBRL(r.ini)+'</td><td>'+fmtBRL(r.mov)+'</td><td class="strong">'+fmtBRL(r.fim)+'</td><td>'+badge(r.status)+'</td><td>'+action+'</td></tr>';
  }).join('');
  var total = s.rows.reduce(function(a,r){return a+r.fim;},0);
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Contábil</b> &gt; Balancete mensal</p><h1>Balancete mensal</h1><p>Fecha o balancete do mês com saldo inicial, movimento e saldo final por conta.</p></div>'
    + noteChip('O balancete não vai ao Fisco — é a conferência interna que alimenta a DRE e o relatório gerencial do cliente.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Competência</th><th>Saldo inicial</th><th>Movimento</th><th>Saldo final</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="totals-footer"><span>Saldo final consolidado <b class="tnum">'+fmtBRL(total)+'</b></span></div></div>'
    + '</div>';
}
function bindBalanceteMensal(){
  document.querySelectorAll('[data-balancete-fechar]').forEach(function(el){
    el.addEventListener('click', function(){
      var cliente = el.getAttribute('data-balancete-fechar'); var s = balanceteState();
      var r = s.rows.find(function(x){ return x.cliente===cliente; });
      if (!r) return;
      r.flashing = true; render();
      setTimeout(function(){ r.flashing = false; r.status = 'Fechado'; r.locking = true; render();
        setTimeout(function(){ r.locking = false; render(); }, 320);
      }, 260);
    });
  });
}

/* ---- Relatórios gerenciais (b14): preview A4 pro cliente final ---- */
function relgerState(){ return ex('relatorios-gerenciais', function(){ return { rows: [
  { cliente:'Padaria do João', envio:'Mensal — dia 5', ultimo:'05/08/2026', status:'Enviado' },
  { cliente:'Clínica Rosa', envio:'Mensal — dia 5', ultimo:'05/08/2026', status:'Enviado' },
  { cliente:'Transportes Veloz', envio:'Quinzenal', ultimo:'18/08/2026', status:'Enviado' },
  { cliente:'Mercado Bom Preço', envio:'Mensal — dia 5', ultimo:'—', status:'Pendente' }
], preview:null, sending:false, sent:false }; }); }
function renderRelatoriosGerenciais(){
  var s = relgerState();
  var rows = s.rows.map(function(r,i){
    return '<tr class="clickable-row" data-relger-open="'+i+'"><td>'+r.cliente+'</td><td>'+r.envio+'</td><td>'+r.ultimo+'</td><td>'+badge(r.status)+'</td></tr>';
  }).join('');
  var previewPanel = '';
  if (s.preview !== null){
    var r = s.rows[s.preview];
    previewPanel = '<div class="modal-overlay" data-relger-close><div class="modal-box a4-modal" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">Prévia do relatório — '+r.cliente+'</div><div class="modal-sub">O que o cliente recebe por e-mail</div></div><button class="icon-btn" data-relger-close>'+icon('x')+'</button></div>'
      + '<div class="modal-body"><div class="a4-sheet'+(s.sent?' a4-sent':'')+'">'
        + (s.sent ? '<div class="a4-stamp">Enviado</div>' : '')
        + '<p class="a4-text">Sua empresa faturou R$ 45.000 em julho. Suas despesas foram R$ 38.000. Seu lucro do mês foi de R$ 7.000 (15,5%).</p>'
        + '<div class="a4-chart"><div class="a4-bar a4-bar-receita" style="height:70%"></div><div class="a4-bar a4-bar-despesa" style="height:58%"></div></div>'
        + '<div class="a4-legend"><span><span class="dot" style="background:var(--brand-500)"></span>Receita</span><span><span class="dot" style="background:var(--slate-400)"></span>Despesa</span></div>'
      + '</div></div>'
      + '<div class="modal-foot"><button class="btn-dark" data-relger-send>'+(s.sending?sp()+' Enviando...':'Gerar e Enviar')+'</button></div>'
      + '</div></div>';
  }
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Contábil</b> &gt; Relatórios gerenciais</p><h1>Relatórios gerenciais</h1><p>Gera DRE resumida em linguagem simples e envia o pacote gerencial no calendário configurado. Clique num cliente para ver exatamente o que ele recebe.</p></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Envio configurado</th><th>Último envio</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + previewPanel
    + '</div>';
}
function bindRelatoriosGerenciais(){
  var s = relgerState();
  document.querySelectorAll('[data-relger-open]').forEach(function(el){
    el.addEventListener('click', function(){ s.preview = +el.getAttribute('data-relger-open'); s.sent = s.rows[s.preview].status==='Enviado'; render(); });
  });
  document.querySelectorAll('[data-relger-close]').forEach(function(el){ el.addEventListener('click', function(){ s.preview = null; render(); }); });
  var sendBtn = document.querySelector('[data-relger-send]');
  if (sendBtn) sendBtn.addEventListener('click', function(){
    if (s.sending) return;
    s.sending = true; render();
    setTimeout(function(){
      s.sending = false; s.sent = true;
      var r = s.rows[s.preview]; r.status = 'Enviado'; r.ultimo = '23/08/2026';
      render();
    }, 900);
  });
}

/* ---- Depreciação de ativos (b13): barra que encolhe ---- */
var DEPREC_SEED = [
  { ativo:'Forno industrial', cliente:'Padaria do João', aquis:'03/2023', vida:'10 anos', mensal:145, residual:8700, elapsedPct:31 },
  { ativo:'Elevador veicular', cliente:'Oficina Silva', aquis:'06/2021', vida:'8 anos', mensal:210, residual:5040, elapsedPct:63 },
  { ativo:'Caminhão 3/4', cliente:'Transportes Veloz', aquis:'01/2022', vida:'5 anos', mensal:890, residual:21360, elapsedPct:92 },
  { ativo:'Equipamento de raio-x', cliente:'Clínica Rosa', aquis:'09/2020', vida:'10 anos', mensal:680, residual:40800, elapsedPct:59 }
];
function deprecState(){ return ex('depreciacao', function(){ return { lancamentos: [] }; }); }
function renderDepreciacao(){
  var s = deprecState();
  var total = DEPREC_SEED.reduce(function(a,r){return a+r.mensal;},0);
  var rows = DEPREC_SEED.map(function(r){
    return '<tr><td>'+r.ativo+'</td><td>'+r.cliente+'</td><td>'+r.aquis+'</td><td>'+r.vida+'</td><td>'+fmtBRL(r.mensal)+'</td><td>'+fmtBRL(r.residual)
      + '<div class="wear-bar"><div class="wear-fill" style="width:'+(100-r.elapsedPct)+'%"></div><div class="wear-marker" style="left:'+r.elapsedPct+'%"></div></div></td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Contábil</b> &gt; Depreciação de ativos</p><h1>Depreciação de ativos</h1><p>Calcula a depreciação mensal e lança o valor residual de cada ativo — a barra mostra o desgaste do bem até hoje, do valor de aquisição ao residual.</p></div>'
    + noteChip('Taxas de referência: veículo 20%/ano, computador 33%/ano, imóvel 4%/ano.')
    + '<div><button class="btn-dark" data-deprec-gerar>'+icon('bolt')+' Gerar Lançamento de Depreciação</button></div>'
    + (s.flashMsg ? '<div class="deprec-flash">'+s.flashMsg+'</div>' : '')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Ativo</th><th>Cliente</th><th>Aquisição</th><th>Vida útil</th><th>Depreciação mensal</th><th>Valor residual</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + (s.lancamentos.length ? '<div class="card card-pad"><h3 style="margin:0 0 8px;font-size:13.5px;">Lançamentos gerados</h3>'+s.lancamentos.map(function(l){ return '<div class="deprec-lanc">'+icon('checkcircle')+' '+l+'</div>'; }).join('')+'</div>' : '')
    + '</div>';
}
function bindDepreciacao(){
  var btn = document.querySelector('[data-deprec-gerar]');
  if (!btn) return;
  btn.addEventListener('click', function(){
    var s = deprecState();
    var total = DEPREC_SEED.reduce(function(a,r){return a+r.mensal;},0);
    s.flashMsg = 'Lançamento de '+fmtBRL(total)+' gerado — Agosto/2026';
    render();
    setTimeout(function(){ s.flashMsg = ''; s.lancamentos.unshift(fmtBRL(total)+' — Agosto/2026'); render(); }, 2600);
  });
}

/* ---- Conciliação de contas contábeis (b16): ponte visual ---- */
function concilcontasState(){ return ex('conciliacao-contas', function(){ return { rows: [
  { conta:'Caixa', cliente:'Padaria do João', saldoC:3240, saldoA:3240, status:'Conciliada' },
  { conta:'Clientes a receber', cliente:'Clínica Rosa', saldoC:18900, saldoA:18400, status:'Divergente', editing:false, ajuste:'' },
  { conta:'Fornecedores', cliente:'Mercado Bom Preço', saldoC:9120, saldoA:9120, status:'Conciliada' },
  { conta:'Estoque', cliente:'Oficina Silva', saldoC:12600, saldoA:12310, status:'Divergente', editing:false, ajuste:'' }
] }; }); }
function renderConciliacaoContas(){
  var s = concilcontasState();
  var rows = s.rows.map(function(r,i){
    var div = r.saldoC - r.saldoA;
    var bridge = '<div class="bridge '+(div===0?'bridge-ok':'bridge-bad')+'"></div>';
    var actions = r.status==='Divergente' ? (
      r.editing ? '<input type="text" class="revnfe-edit-input" id="cc-ajuste-'+i+'" placeholder="Novo saldo auxiliar" value="'+esc(r.ajuste)+'"> <button class="btn-confirm" data-cc-act="'+i+':salvar">Salvar</button>'
      : '<button class="btn-line" data-cc-act="'+i+':lancar">Lançar Manualmente</button> <button class="btn-line" data-cc-act="'+i+':aceitar">Marcar como Divergência</button>'
    ) : '';
    return '<tr><td>'+r.conta+'</td><td>'+r.cliente+'</td><td>'+fmtBRL(r.saldoC)+'</td><td>'+bridge+'</td><td>'+fmtBRL(r.saldoA)+'</td><td>'+fmtBRL(div)+'</td><td>'+badge(r.status)+'</td><td>'+actions+'</td></tr>';
  }).join('');
  var totalDiv = s.rows.reduce(function(a,r){return a+(r.status==='Divergente'?(r.saldoC-r.saldoA):0);},0);
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Contábil</b> &gt; Conciliação de contas contábeis</p><h1>Conciliação de contas contábeis</h1><p>Cruza o saldo contábil com o saldo auxiliar de cada conta — a ponte entre as duas colunas fica reta e verde quando batem, quebrada e vermelha quando divergem.</p></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Conta</th><th>Cliente</th><th>Saldo contábil</th><th></th><th>Saldo auxiliar</th><th>Divergência</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="totals-footer"><span>Divergência total em aberto <b class="tnum">'+fmtBRL(totalDiv)+'</b></span></div></div>'
    + '</div>';
}
function bindConciliacaoContas(){
  var s = concilcontasState();
  document.querySelectorAll('[data-cc-act]').forEach(function(el){
    el.addEventListener('click', function(){
      var parts = el.getAttribute('data-cc-act').split(':'); var i = +parts[0]; var act = parts[1];
      var r = s.rows[i];
      if (act === 'lancar'){ r.editing = true; render(); return; }
      if (act === 'aceitar'){ r.status = 'Divergência aceita'; render(); return; }
      if (act === 'salvar'){ r.saldoA = r.saldoC; r.status = 'Conciliada'; r.editing = false; render(); return; }
    });
  });
}

/* ---- Encerramento de exercício (c12): auto vs manual ---- */
var ENCERR_CHECKLIST = {
  padrao: [
    { texto:'Revisão dos 12 balancetes', auto:true },
    { texto:'Conferência de depreciação acumulada', auto:true },
    { texto:'Provisões pendentes', auto:false },
    { texto:'Ajustes e reclassificações finais', auto:false },
    { texto:'Apuração de resultado no sistema contábil', auto:false }
  ]
};
function encerrState(){ return ex('encerramento-exercicio', function(){ return { rows: [
  { cliente:'Padaria do João', etapa:'Concluído', pct:100, open:false, done:{0:true,1:true,2:true,3:true,4:true} },
  { cliente:'Oficina Silva', etapa:'Concluído', pct:100, open:false, done:{0:true,1:true,2:true,3:true,4:true} },
  { cliente:'Clínica Rosa', etapa:'Em apuração', pct:60, open:false, done:{0:true,1:true,2:true,3:false,4:false} },
  { cliente:'Transportes Veloz', etapa:'Concluído', pct:100, open:false, done:{0:true,1:true,2:true,3:true,4:true} },
  { cliente:'Mercado Bom Preço', etapa:'Não iniciado', pct:0, open:false, done:{} }
] }; }); }
function renderEncerramentoExercicio(){
  var s = encerrState();
  var rows = s.rows.map(function(r,i){
    var col = r.pct===100?'var(--success-600)':(r.pct>0?'var(--warning-600)':'var(--slate-300)');
    var checklist = r.open ? '<div class="encerr-checklist">'+ENCERR_CHECKLIST.padrao.map(function(item,ii){
      var done = !!r.done[ii];
      return '<div class="encerr-item'+(done?' done':'')+'" '+(item.auto?'':'data-encerr-toggle="'+i+':'+ii+'"')+'>'
        + icon(item.auto?'bolt':'pessoa') + '<span>'+item.texto+'</span>' + (done?icon('check'):'') + (item.auto?'<span class="encerr-auto-tag">automático</span>':'') + '</div>';
    }).join('')+'</div>' : '';
    return '<div class="proc-row"><div class="proc-top clickable-row" data-encerr-open="'+i+'"><span class="proc-name">'+r.cliente+'</span>'+badge(r.etapa)+'</div>'
      + '<div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:'+r.pct+'%;background:'+col+'"></div></div><span class="proc-pct tnum">'+r.pct+'%</span></div>'
      + checklist + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Contábil</b> &gt; Encerramento de exercício</p><h1>Encerramento de exercício</h1><p>Conduz a apuração e o checklist de encerramento do exercício contábil — clique num cliente para ver quais etapas a EfficienceCo já fez e quais dependem do contador.</p></div>'
    + noteChip('O cálculo do resultado continua no sistema contábil do escritório — o agente organiza o processo, não substitui o julgamento contábil.')
    + '<div class="card card-pad">'+rows+'</div>'
    + '</div>';
}
function bindEncerramentoExercicio(){
  var s = encerrState();
  document.querySelectorAll('[data-encerr-open]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-encerr-open'); s.rows[i].open = !s.rows[i].open; render(); });
  });
  document.querySelectorAll('[data-encerr-toggle]').forEach(function(el){
    el.addEventListener('click', function(){
      var parts = el.getAttribute('data-encerr-toggle').split(':'); var i=+parts[0], ii=+parts[1];
      var r = s.rows[i]; r.done[ii] = !r.done[ii]; render();
    });
  });
}

/* ============================================================================
   DEPARTAMENTO PESSOAL
   ============================================================================ */

/* ---- Folha de pagamento (folha-pagamento): já implementada (padrão-ouro) ---- */
var FOLHA_ROWS = [
  ['Marcos Ferreira','Padaria do João','R$ 2.200,00','R$ 242,00','R$ 128,00','R$ 176,00','Calculado'],
  ['Ana Cordeiro','Oficina Silva','R$ 2.400,00','R$ 264,00','R$ 148,00','R$ 192,00','Calculado'],
  ['Beatriz Souza','Clínica Rosa','R$ 3.100,00','R$ 341,00','R$ 264,00','R$ 248,00','Calculado'],
  ['Ricardo Alves','Transportes Veloz','R$ 2.600,00','R$ 286,00','R$ 168,00','R$ 208,00','Calculado'],
  ['Pedro Lima','Mercado Bom Preço','R$ 2.100,00','R$ 231,00','R$ 112,00','R$ 168,00','Pendente']
];
/* status por cliente casado com os 4 estados reais de /dashboard/folha/status:
   pendente / processando / concluido / erro */
var FOLHA_CLIENTES_STATUS = [ ['Padaria do João','concluido'], ['Oficina Silva','concluido'], ['Clínica Rosa','concluido'], ['Transportes Veloz','concluido'], ['Mercado Bom Preço','pendente'] ];
function folhaState(){ return ex('folha-pagamento', function(){ return { modal:null, baixandoModelo:false }; }); }
function renderFolha(){
  var s = folhaState();
  var rows = FOLHA_ROWS.map(function(r){ return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td class="strong">'+r[2]+'</td><td>'+r[3]+'</td><td>'+r[4]+'</td><td>'+r[5]+'</td><td>'+badge(r[6])+'</td></tr>'; }).join('');
  var contadores = { pendente:0, processando:0, concluido:0, erro:0 };
  FOLHA_CLIENTES_STATUS.forEach(function(c){ contadores[c[1]]++; });
  var modal = '';
  if (s.modal === 'status') {
    var linhas = FOLHA_CLIENTES_STATUS.map(function(c){
      var kind = c[1]==='concluido'?'ok':(c[1]==='erro'?'err':(c[1]==='processando'?'warn':'neutral'));
      var rotulo = c[1]==='concluido'?'Concluído':(c[1]==='erro'?'Erro':(c[1]==='processando'?'Processando':'Pendente'));
      var arquivos = c[1]==='concluido' ? '<button class="btn-line" data-folha-baixar="'+c[0]+'" style="margin-left:8px;">Baixar holerites</button>' : '';
      return '<div class="step-row" style="justify-content:space-between;"><span>'+c[0]+'</span><span>'+badge(rotulo,kind)+arquivos+'</span></div>';
    }).join('');
    var statusBody = noteChip('Este status acompanha só o processamento da planilha enviada. O checklist da página "Processos" é um controle separado e pode não bater com o que aparece aqui — um cliente pode aparecer pendente ali mesmo já com a folha calculada, ou vice-versa.')
      + '<div class="grid4" style="margin:14px 0 16px;">'
      + '<div class="stat"><div class="stat-label">Pendente</div><div class="stat-value tnum" style="color:var(--warning-700);">'+contadores.pendente+'</div></div>'
      + '<div class="stat"><div class="stat-label">Processando</div><div class="stat-value tnum" style="color:var(--brand-700);">'+contadores.processando+'</div></div>'
      + '<div class="stat"><div class="stat-label">Concluído</div><div class="stat-value tnum" style="color:var(--success-700);">'+contadores.concluido+'</div></div>'
      + '<div class="stat"><div class="stat-label">Erro</div><div class="stat-value tnum" style="color:var(--danger-700);">'+contadores.erro+'</div></div>'
      + '</div>' + linhas;
    modal = renderModal('Status da folha', 'Agosto · 2026', statusBody, false, 'modal-wide');
  } else if (s.modal === 'upload') {
    modal = renderModal('Upload da folha', 'Envie a planilha preenchida para iniciar o processamento.', '<div style="border:1.5px dashed var(--slate-300);border-radius:var(--r-md);padding:26px;text-align:center;color:var(--fg-muted);font-size:13px;">'+icon('upload')+'<div style="margin-top:8px;">Arraste o arquivo ou clique para selecionar (.xlsx)</div></div>', true);
  }
  var done = contadores.concluido;
  return '<div class="page">'
    + '<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;">'
    + '<div><p class="crumbline"><b>DP</b> &gt; Folha de pagamento</p><h1>Folha de pagamento — Agosto/2026</h1><p>Processa a planilha enviada e calcula INSS, IRRF e FGTS por funcionário.</p></div>'
    + '<button class="btn-line" data-folha-modelo>'+(s.baixandoModelo?(sp()+' Baixando...'):'Baixar planilha modelo')+'</button>'
    + '</div>'
    + '<div class="grid2"><button type="button" class="acard clickable" data-folha-modal="upload"><div class="acard-head"><span class="acard-ico">'+icon('upload')+'</span></div><div class="acard-title">Upload da folha</div><div class="acard-desc">Envie a planilha preenchida para iniciar o processamento.</div></button>'
    + '<button type="button" class="acard clickable" data-folha-modal="status"><div class="acard-head"><span class="acard-ico">'+icon('checkcircle')+'</span></div><div class="acard-title">Status da folha</div><div class="acard-desc">Acompanhe o processamento da folha enviada — '+done+'/'+FOLHA_CLIENTES_STATUS.length+' clientes.</div></button></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cliente</th><th>Salário base</th><th>INSS</th><th>IRRF</th><th>FGTS</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>' + modal;
}
function bindFolha(){
  var s = folhaState();
  document.querySelectorAll('[data-folha-modal]').forEach(function(el){ el.addEventListener('click', function(){ s.modal = el.getAttribute('data-folha-modal'); render(); }); });
  document.querySelectorAll('[data-modal-close]').forEach(function(el){ el.addEventListener('click', function(){ s.modal = null; render(); }); });
  var modeloBtn = document.querySelector('[data-folha-modelo]');
  if (modeloBtn) modeloBtn.addEventListener('click', function(){
    if (s.baixandoModelo) return;
    s.baixandoModelo = true; render();
    setTimeout(function(){ s.baixandoModelo = false; render(); }, 700);
  });
  document.querySelectorAll('[data-folha-baixar]').forEach(function(el){ el.addEventListener('click', function(e){ e.stopPropagation(); }); });
  var sendBtn = document.querySelector('[data-folha-send]');
  if (sendBtn) sendBtn.addEventListener('click', function(){
    var pendente = FOLHA_CLIENTES_STATUS.find(function(c){ return c[1]==='pendente'; });
    if (pendente) pendente[1] = 'processando';
    s.modal = null; render();
    if (pendente) setTimeout(function(){ pendente[1] = 'concluido'; render(); }, 2200);
  });
}
function renderModal(title, subtitle, body, hasFooter, extraClass){
  return '<div class="modal-overlay" data-modal-close>'
    + '<div class="modal-box'+(extraClass?' '+extraClass:'')+'" onclick="event.stopPropagation()">'
    + '<div class="modal-head"><div><div class="modal-title">'+title+'</div><div class="modal-sub">'+subtitle+'</div></div><button class="icon-btn" data-modal-close>'+icon('x')+'</button></div>'
    + '<div class="modal-body">'+body+'</div>'
    + (hasFooter ? '<div class="modal-foot"><button class="btn-line" data-modal-close>Cancelar</button><button class="btn-dark" data-folha-send>Enviar planilha</button></div>' : '')
    + '</div></div>';
}

/* ---- Férias (b1): régua de tempo por funcionário ---- */
function feriasState(){ return ex('ferias', function(){ return { rows: [
  { func:'Marcos Ferreira', cliente:'Padaria do João', periodo:'15/08/25 – 14/08/26', venc:'14/08/2026', dias:30, status:'Programadas', posPct:96, gozo:null, avisoPreview:false, gozoOpen:false },
  { func:'Juliana Prado', cliente:'Oficina Silva', periodo:'01/03/25 – 28/02/26', venc:'28/02/2026', dias:20, status:'Pendente de aviso', posPct:82, gozo:null, avisoPreview:false, gozoOpen:false },
  { func:'Ricardo Alves', cliente:'Transportes Veloz', periodo:'10/06/25 – 09/06/26', venc:'09/06/2026', dias:30, status:'Programadas', posPct:70, gozo:null, avisoPreview:false, gozoOpen:false },
  { func:'Beatriz Souza', cliente:'Clínica Rosa', periodo:'22/01/25 – 21/01/26', venc:'21/01/2026', dias:15, status:'Pendente de aviso', posPct:88, gozo:null, avisoPreview:false, gozoOpen:false }
] }; }); }
function renderFerias(){
  var s = feriasState();
  var rows = s.rows.map(function(r,i){
    var riskStart = 100 - (60/365*100);
    var gantt = '<div class="gantt-row"><div class="gantt-risk" style="left:'+riskStart+'%"></div>'
      + (r.gozo ? '<div class="gantt-gozo" style="left:'+r.gozo.from+'%;width:'+(r.gozo.to-r.gozo.from)+'%"></div>' : '')
      + '<div class="gantt-now" style="left:'+r.posPct+'%"></div></div>';
    var gozoForm = r.gozoOpen ? '<div class="ferias-gozo-form"><label>Início <input type="text" placeholder="dd/mm" id="ferias-gozo-ini-'+i+'"></label><label>Fim <input type="text" placeholder="dd/mm" id="ferias-gozo-fim-'+i+'"></label><button class="btn-confirm" data-ferias-gozo-confirm="'+i+'">Confirmar</button></div>' : '';
    return '<tr><td>'+r.func+'</td><td>'+r.cliente+'</td><td>'+r.periodo+gantt+'</td><td>'+r.venc+'</td><td>'+r.dias+'</td><td>'+badge(r.status)+'</td>'
      + '<td><button class="btn-line" data-ferias-aviso="'+i+'">Gerar Aviso de Férias</button> <button class="btn-line" data-ferias-gozo="'+i+'">Registrar Datas de Gozo</button>'+gozoForm+'</td></tr>';
  }).join('');
  var previewModal = '';
  if (s.previewIdx !== null && s.previewIdx !== undefined){
    var r = s.rows[s.previewIdx];
    previewModal = '<div class="modal-overlay" data-ferias-close><div class="modal-box a4-modal" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">Aviso de Férias — '+r.func+'</div><div class="modal-sub">Prévia do documento</div></div><button class="icon-btn" data-ferias-close>'+icon('x')+'</button></div>'
      + '<div class="modal-body"><div class="a4-sheet"><p class="a4-text">Comunicamos que o(a) funcionário(a) <b>'+r.func+'</b>, do cliente <b>'+r.cliente+'</b>, gozará '+r.dias+' dias de férias referentes ao período aquisitivo '+r.periodo+', com vencimento em '+r.venc+'.</p></div></div>'
      + '<div class="modal-foot"><button class="btn-dark" data-ferias-baixar>Confirmar e Baixar</button></div></div></div>';
  }
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; Férias</p><h1>Férias</h1><p>Controla o período aquisitivo e calcula o valor das férias de cada funcionário — a régua mostra onde no período de 12 meses cada um está agora, com a zona de risco dos últimos 60 dias em degradê.</p></div>'
    + noteChip('Passado 1 ano do fim do período aquisitivo sem conceder férias, o pagamento dobra.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cliente</th><th>Período aquisitivo</th><th>Vencimento</th><th>Dias disponíveis</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + previewModal
    + '</div>';
}
function bindFerias(){
  var s = feriasState();
  document.querySelectorAll('[data-ferias-aviso]').forEach(function(el){ el.addEventListener('click', function(){ s.previewIdx = +el.getAttribute('data-ferias-aviso'); render(); }); });
  document.querySelectorAll('[data-ferias-close]').forEach(function(el){ el.addEventListener('click', function(){ s.previewIdx = null; render(); }); });
  var baixar = document.querySelector('[data-ferias-baixar]');
  if (baixar) baixar.addEventListener('click', function(){ s.previewIdx = null; render(); });
  document.querySelectorAll('[data-ferias-gozo]').forEach(function(el){ el.addEventListener('click', function(){ var i = +el.getAttribute('data-ferias-gozo'); s.rows[i].gozoOpen = !s.rows[i].gozoOpen; render(); }); });
  document.querySelectorAll('[data-ferias-gozo-confirm]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-ferias-gozo-confirm');
      var r = s.rows[i];
      r.gozo = { from: Math.max(0, r.posPct-8), to: r.posPct };
      r.status = 'Programadas'; r.gozoOpen = false; render();
    });
  });
}

/* ---- 13º salário (b8): card partido 1ª/2ª parcela ---- */
function decterState(){ return ex('decimo-terceiro', function(){ return { rows: [
  { cliente:'Padaria do João', func:5, p1:6200, p2:6200, status:'1ª parcela paga', receiptShown:false },
  { cliente:'Oficina Silva', func:3, p1:3900, p2:3900, status:'1ª parcela paga', receiptShown:false },
  { cliente:'Clínica Rosa', func:8, p1:14800, p2:14800, status:'1ª parcela paga', receiptShown:false },
  { cliente:'Transportes Veloz', func:4, p1:5100, p2:5100, status:'1ª parcela paga', receiptShown:false }
], flashAll:false }; }); }
function renderDecimoTerceiro(){
  var s = decterState();
  var cards = s.rows.map(function(r,i){
    return '<div class="dt-card'+(s.flashAll?' dt-flash':'')+'">' + (r.receiptShown ? '<span class="dt-receipt">'+icon('comprovante')+'</span>' : '')
      + '<div class="dt-head"><span class="strong">'+r.cliente+'</span><span class="dt-func">'+r.func+' funcionários</span></div>'
      + '<div class="dt-split"><div class="dt-half dt-half-past"><div class="dt-lbl">1ª parcela</div><div class="dt-val">'+fmtBRL(r.p1)+'</div><div class="dt-seal">paga em 28/11</div></div>'
      + '<div class="dt-half dt-half-future"><div class="dt-lbl">2ª parcela</div><div class="dt-val">'+fmtBRL(r.p2)+'</div><div class="dt-countdown">faltam 122 dias · prevista 20/12</div></div></div>'
      + '</div>';
  }).join('');
  var t1 = s.rows.reduce(function(a,r){return a+r.p1;},0), t2 = s.rows.reduce(function(a,r){return a+r.p2;},0);
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; 13º salário</p><h1>13º salário</h1><p>Calcula a primeira e a segunda parcela do 13º de cada cliente — cada card mostra a metade já paga e a metade futura, com contagem regressiva.</p></div>'
    + noteChip('Multa por atraso na 2ª parcela: 50% do valor devido, além de juros.')
    + '<div><button class="btn-dark" data-dt-aprovar>'+icon('bolt')+' Aprovar e Gerar Recibos</button></div>'
    + '<div class="dt-grid">'+cards+'</div>'
    + '<div class="card"><div class="totals-footer"><span>Total 1ª parcela <b class="tnum">'+fmtBRL(t1)+'</b></span><span>Total 2ª parcela prevista <b class="tnum">'+fmtBRL(t2)+'</b></span></div></div>'
    + '</div>';
}
function bindDecimoTerceiro(){
  var btn = document.querySelector('[data-dt-aprovar]');
  if (!btn) return;
  btn.addEventListener('click', function(){
    var s = decterState();
    s.flashAll = true; render();
    setTimeout(function(){ s.flashAll = false; s.rows.forEach(function(r){ r.receiptShown = true; }); render(); }, 350);
  });
}

/* ---- eSocial (a3): wizard de 3 passos com validação ao vivo ---- */
var ESOCIAL_EVENTS_HIST_SEED = [
  {codigo:'S-2200', cliente:'Padaria do João', desc:'Admissão — Marcos Ferreira', data:'15/08/2026'},
  {codigo:'S-2230', cliente:'Oficina Silva', desc:'Afastamento — Juliana Prado (atestado)', data:'12/08/2026'},
  {codigo:'S-1200', cliente:'Clínica Rosa', desc:'Remuneração — folha ago/2026', data:'05/08/2026'},
  {codigo:'S-2299', cliente:'Mercado Bom Preço', desc:'Desligamento — Pedro Lima', data:'10/08/2026'}
];
/* Pacote de 12 eventos decidido em reunião de sprint (24/08/2026) — Grupos
   2, 3 e 4 completos (ver automacoes/a3-esocial.md). Todos os 12 aparecem
   como cards idênticos (demo comercial não expõe o que está "em
   desenvolvimento" ou "protótipo" pro público) — só a Admissão (S-2200)
   tem `enabled:true` e de fato abre o formulário; os outros 11 não têm
   data-esoc-pick, então o clique não faz nada. */
var ESOCIAL_EVENT_TYPES = [
  { key:'S-2200', grupo:'Ciclo de vida do vínculo', label:'Admissão (S-2200)', ic:'entrada', enabled:true },
  { key:'S-2205', grupo:'Ciclo de vida do vínculo', label:'Alteração de dados cadastrais (S-2205)', ic:'pessoa', enabled:false },
  { key:'S-2206', grupo:'Ciclo de vida do vínculo', label:'Alteração de contrato (S-2206)', ic:'documento', enabled:false },
  { key:'S-2230', grupo:'Ciclo de vida do vínculo', label:'Afastamento temporário (S-2230)', ic:'calendario', enabled:false },
  { key:'S-2298', grupo:'Ciclo de vida do vínculo', label:'Reintegração (S-2298)', ic:'ciclo', enabled:false },
  { key:'S-2299', grupo:'Ciclo de vida do vínculo', label:'Desligamento (S-2299)', ic:'logout', enabled:false },
  { key:'S-2210', grupo:'Saúde e segurança do trabalho', label:'Comunicação de acidente — CAT (S-2210)', ic:'escudo', enabled:false },
  { key:'S-2220', grupo:'Saúde e segurança do trabalho', label:'Monitoramento da saúde — ASO (S-2220)', ic:'cruzmedica', enabled:false },
  { key:'S-2240', grupo:'Saúde e segurança do trabalho', label:'Condições ambientais (S-2240)', ic:'selo', enabled:false },
  { key:'S-1200', grupo:'Fechamento periódico da folha', label:'Remuneração mensal (S-1200)', ic:'comprovante', enabled:false },
  { key:'S-1210', grupo:'Fechamento periódico da folha', label:'Pagamentos (S-1210)', ic:'cifrao', enabled:false },
  { key:'S-1299', grupo:'Fechamento periódico da folha', label:'Fechamento dos eventos (S-1299)', ic:'pasta', enabled:false }
];
function esocialState(){ return ex('esocial', function(){ return { step:0, evento:null, form:{ nome:'', cpf:'', nit:'', nasc:'', extra:'' }, transmitting:false, hist: ESOCIAL_EVENTS_HIST_SEED.slice() }; }); }
function cpfValida(v){ return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v||''); }
function maskCpf(v){
  var d = String(v||'').replace(/\D/g,'').slice(0,11);
  if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return d;
}
function esocialExtraLabel(evt){ return evt==='S-2200' ? 'Cargo / Salário' : (evt==='S-2230' ? 'CID / Período' : 'Motivo do desligamento'); }
function esocialPrefill(key){
  if (key === 'S-2200') return { nome:'Marcos Ferreira', cpf:'123.456.789-00', nit:'123.45678.90-1', nasc:'1998-04-12', extra:'Auxiliar de padaria — R$ 2.200,00' };
  return { nome:'', cpf:'', nit:'', nasc:'', extra:'' };
}
function renderEsocPicker(){
  var groups = [];
  ESOCIAL_EVENT_TYPES.forEach(function(t){
    var g = groups.filter(function(x){ return x.nome===t.grupo; })[0];
    if (!g){ g = { nome:t.grupo, items:[] }; groups.push(g); }
    g.items.push(t);
  });
  return groups.map(function(g){
    var cards = g.items.map(function(t){
      var attr = t.enabled ? ' data-esoc-pick="'+t.key+'"' : '';
      return '<button type="button" class="esoc-pick-card"'+attr+'>'+icon(t.ic)+'<span>'+t.label+'</span></button>';
    }).join('');
    return '<div class="esoc-group-label">'+g.nome+'</div><div class="esoc-picker">'+cards+'</div>';
  }).join('');
}
function renderEsocial(){
  var s = esocialState();
  var picker = s.step===1 ? renderEsocPicker() : '';
  var form = '';
  if (s.step===2){
    var cpfOk = s.form.cpf === '' || cpfValida(s.form.cpf);
    var nascOk = s.form.nasc === '' || s.form.nasc <= '2026-08-23';
    form = '<div class="card card-pad"><h3 style="margin:0 0 14px;font-size:14.5px;">'+ (ESOCIAL_EVENT_TYPES.find(function(t){return t.key===s.evento;})||{}).label +'</h3>'
      + '<div class="form-mock">'
      + '<div class="form-mock-field"><span class="lbl">Funcionário</span><input type="text" class="esoc-input" data-esoc-field="nome" value="'+esc(s.form.nome)+'"></div>'
      + '<div class="form-mock-field'+(cpfOk?'':' esoc-invalid')+'"><span class="lbl">CPF</span><div><input type="text" class="esoc-input" placeholder="000.000.000-00" data-esoc-field="cpf" value="'+esc(s.form.cpf)+'">'+(cpfOk?'':'<div class="esoc-error">CPF inválido</div>')+'</div></div>'
      + '<div class="form-mock-field"><span class="lbl">NIT/PIS</span><input type="text" class="esoc-input" data-esoc-field="nit" value="'+esc(s.form.nit)+'"></div>'
      + '<div class="form-mock-field'+(nascOk?'':' esoc-invalid')+'"><span class="lbl">Data de nascimento</span><div><input type="date" class="esoc-input" max="2026-08-23" data-esoc-field="nasc" value="'+esc(s.form.nasc)+'">'+(nascOk?'':'<div class="esoc-error">Data não pode ser futura</div>')+'</div></div>'
      + '<div class="form-mock-field"><span class="lbl">'+esocialExtraLabel(s.evento)+'</span><input type="text" class="esoc-input" data-esoc-field="extra" value="'+esc(s.form.extra)+'"></div>'
      + '</div><div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn-dark" data-esoc-next '+((!cpfOk||!nascOk||!s.form.nome||!s.form.cpf)?'disabled':'')+'>Gerar eSocial</button></div></div>';
  }
  var previewPanel = '';
  if (s.step===3){
    previewPanel = '<div class="modal-overlay" data-esoc-close><div class="modal-box esoc-preview" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">Preview — '+s.evento+'</div><div class="modal-sub">Confira antes de transmitir</div></div><button class="icon-btn" data-esoc-close>'+icon('x')+'</button></div>'
      + '<div class="modal-body">'
      + (s.transmitDone ? '<div class="esoc-done">'+badge('Transmitido — Recibo #'+s.recibo,'ok')+'</div>' : '<ul class="esoc-preview-list"><li><b>Funcionário:</b> '+esc(s.form.nome)+'</li><li><b>CPF:</b> '+esc(s.form.cpf)+'</li><li><b>NIT/PIS:</b> '+esc(s.form.nit)+'</li><li><b>'+esocialExtraLabel(s.evento)+':</b> '+esc(s.form.extra)+'</li></ul>')
      + '</div>'
      + (s.transmitDone ? '' : '<div class="modal-foot"><button class="btn-dark" data-esoc-transmit>'+(s.transmitting?sp()+' Processando...':'Transmitir')+'</button></div>')
      + '</div></div>';
  }
  var hist = s.hist.map(function(h){ return '<tr><td class="mono">'+h.codigo+'</td><td>'+h.cliente+'</td><td>'+h.desc+'</td><td>'+h.data+'</td><td>'+badge('Aceito')+'</td></tr>'; }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; eSocial</p><h1>eSocial</h1><p>Transmite os eventos obrigatórios do eSocial — cada campo é validado em tempo real, antes mesmo de tentar enviar.</p></div>'
    + (s.step===0 ? '<div><button class="btn-dark" data-esoc-new>'+icon('plus')+' Novo Evento</button></div>' : '')
    + picker + form
    + '<div class="card"><div class="card-head"><h2>Histórico de eventos</h2></div><div class="tbl-wrap"><table><thead><tr><th>Evento</th><th>Cliente</th><th>Descrição</th><th>Data envio</th><th>Status</th></tr></thead><tbody>'+hist+'</tbody></table></div></div>'
    + previewPanel
    + '</div>';
}
function bindEsocial(){
  var s = esocialState();
  var newBtn = document.querySelector('[data-esoc-new]');
  if (newBtn) newBtn.addEventListener('click', function(){ s.step = 1; render(); });
  document.querySelectorAll('[data-esoc-pick]').forEach(function(el){
    el.addEventListener('click', function(){ s.evento = el.getAttribute('data-esoc-pick'); s.step = 2; s.form = esocialPrefill(s.evento); render(); });
  });
  document.querySelectorAll('[data-esoc-field]').forEach(function(el){
    el.addEventListener('input', function(){
      var key = el.getAttribute('data-esoc-field');
      var val = key === 'cpf' ? maskCpf(el.value) : el.value;
      if (key === 'cpf') el.value = val;
      s.form[key] = val;
      render();
    });
  });
  var next = document.querySelector('[data-esoc-next]');
  if (next) next.addEventListener('click', function(){ s.step = 3; s.transmitDone = false; render(); });
  var close = document.querySelector('[data-esoc-close]');
  if (close) close.addEventListener('click', function(){ s.step = 0; render(); });
  var transmit = document.querySelector('[data-esoc-transmit]');
  if (transmit) transmit.addEventListener('click', function(){
    if (s.transmitting) return;
    s.transmitting = true; render();
    setTimeout(function(){
      s.transmitting = false; s.transmitDone = true;
      s.recibo = String(Math.floor(100000+Math.random()*899999));
      s.hist.unshift({ codigo:s.evento, cliente:'Escritório', desc: esocialExtraLabel(s.evento)+': '+s.form.extra, data:'23/08/2026' });
      render();
    }, 1200);
  });
}

/* ---- Atestados e afastamentos (b7): leitura de documento dramatizada ---- */
var ATESTADOS_HIST_SEED = [
  { func:'Juliana Prado', cliente:'Oficina Silva', cid:'M54', periodo:'10/08 – 12/08', evento:'S-2230 enviado', status:'Registrado' },
  { func:'Carlos Nunes', cliente:'Clínica Rosa', cid:'J11', periodo:'05/08 – 07/08', evento:'S-2230 enviado', status:'Registrado' },
  { func:'Fernanda Lima', cliente:'Mercado Bom Preço', cid:'Z76', periodo:'18/08 – 18/08', evento:'S-2230 enviado', status:'Registrado' }
];
var ATESTADO_CANDIDATOS = [
  { func:'Ana Cordeiro', cliente:'Oficina Silva', cid:'M54', periodo:'20/08 – 22/08', dias:3 },
  { func:'Pedro Lima', cliente:'Mercado Bom Preço', cid:'J45', periodo:'11/08 – 28/08', dias:18 }
];
function atestadosState(){ return ex('atestados', function(){ return { uploading:false, reading:false, revealed:0, result:null, cand:0, hist: ATESTADOS_HIST_SEED.slice() }; }); }
function renderAtestados(){
  var s = atestadosState();
  var fields = ['Funcionário','CID','Período'];
  var revealBox = '';
  if (s.result){
    var vals = ['Funcionário: '+s.result.func, 'CID: '+s.result.cid, 'Período: '+s.result.periodo];
    revealBox = '<div class="ocr-fields">' + vals.slice(0, s.revealed).map(function(v){ return '<div class="ocr-field">'+v+'</div>'; }).join('') + '</div>';
    if (s.revealed >= 3){
      revealBox += s.result.dias <= 15
        ? '<div class="atest-branch atest-branch-green">'+icon('checkcircle')+' Pago pelo empregador — já incluído na folha</div>'
        : '<div class="atest-branch atest-branch-blue">'+icon('sino')+' Afastamento acima de 15 dias — INSS assume a partir do 16º dia<br><button class="btn-dark" data-atest-esocial style="margin-top:8px">Gerar eSocial S-2230</button></div>';
    }
  }
  var hist = s.hist.map(function(h){ return '<tr><td>'+h.func+'</td><td>'+h.cliente+'</td><td>'+h.cid+'</td><td>'+h.periodo+'</td><td>'+h.evento+'</td><td>'+badge(h.status)+'</td></tr>'; }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; Atestados e afastamentos</p><h1>Atestados e afastamentos</h1><p>Registra afastamentos por CID e envia o evento S-2230 quando necessário — digitaliza o atestado e joga na pasta, o resto é automático.</p></div>'
    + noteChip('Até 15 dias, o salário é pago pelo empregador; do 16º dia em diante, o INSS assume via auxílio-doença.')
    + '<div class="card card-pad">'
      + '<div class="atest-dropzone" data-atest-simular>'+icon('upload')+'<div>'+(s.uploading||s.reading?'':'Simular atestado recebido — clique para simular o upload')+'</div>'
      + (s.uploading ? '<div class="atest-progress"><div class="atest-progress-fill"></div></div><div>Lendo documento...</div>' : '')
      + '</div>'
      + revealBox
    + '</div>'
    + '<div class="card"><div class="card-head"><h2>Histórico</h2></div><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cliente</th><th>CID</th><th>Período</th><th>Evento eSocial</th><th>Status</th></tr></thead><tbody>'+hist+'</tbody></table></div></div>'
    + '</div>';
}
function bindAtestados(){
  var s = atestadosState();
  var dz = document.querySelector('[data-atest-simular]');
  if (dz) dz.addEventListener('click', function(){
    if (s.uploading || s.reading) return;
    s.uploading = true; s.result = null; s.revealed = 0; render();
    setTimeout(function(){
      s.uploading = false;
      s.result = ATESTADO_CANDIDATOS[s.cand % ATESTADO_CANDIDATOS.length];
      s.cand++;
      render();
      function reveal(n){ if (n>3) return; s.revealed = n; render(); setTimeout(function(){ reveal(n+1); }, 500); }
      reveal(1);
    }, 900);
  });
  var esocBtn = document.querySelector('[data-atest-esocial]');
  if (esocBtn) esocBtn.addEventListener('click', function(){
    s.hist.unshift({ func:s.result.func, cliente:s.result.cliente, cid:s.result.cid, periodo:s.result.periodo, evento:'S-2230 enviado', status:'Registrado' });
    s.result = null; s.revealed = 0; render();
  });
}

/* ---- FGTS/GRF/INSS (b9): dependência da folha + botão contextual ---- */
function fgtsinssState(){ return ex('fgts-inss', function(){ return { rows: [
  { guia:'GRF', cliente:'Padaria do João', comp:'Ago/2026', venc:'07/09/2026', valor:660, status:'Gerada' },
  { guia:'GPS', cliente:'Clínica Rosa', comp:'Ago/2026', venc:'20/09/2026', valor:2960, status:'Gerada' },
  { guia:'GRF', cliente:'Transportes Veloz', comp:'Ago/2026', venc:'07/09/2026', valor:512, status:'Gerada' },
  { guia:'GPS', cliente:'Mercado Bom Preço', comp:'Ago/2026', venc:'20/09/2026', valor:1140, status:'Pendente', generating:false }
] }; }); }
function renderFgtsInss(){
  var s = fgtsinssState();
  var total = s.rows.reduce(function(a,r){return a+r.valor;},0);
  var rows = s.rows.map(function(r,i){
    var action = r.status==='Pendente' ? '<button class="btn-line" data-fgts-gerar="'+i+'">'+(r.generating?sp()+' Gerando...':'Gerar Guia')+'</button>' : '';
    return '<tr><td>'+r.guia+'</td><td>'+r.cliente+'</td><td>'+r.comp+'</td><td>'+r.venc+'</td><td>'+fmtBRL(r.valor)+'</td><td>'+badge(r.status)+'</td><td>'+action+'</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; FGTS/GRF/INSS</p><h1>FGTS/GRF/INSS</h1><p>Gera as guias de FGTS e INSS do período, prontas para pagamento.</p></div>'
    + '<div class="chain-strip">'+badge('Folha de Agosto fechada','ok')+'<span class="chain-arrow">→</span><span>Guias geradas automaticamente</span></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Guia</th><th>Cliente</th><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="totals-footer"><span>Total de guias do período <b class="tnum">'+fmtBRL(total)+'</b></span></div></div>'
    + '</div>';
}
function bindFgtsInss(){
  document.querySelectorAll('[data-fgts-gerar]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-fgts-gerar'); var s = fgtsinssState(); var r = s.rows[i];
      if (r.generating) return;
      r.generating = true; render();
      setTimeout(function(){ r.generating = false; r.status = 'Gerada'; render(); }, 800);
    });
  });
}

/* ---- Horas extras (b12): upload + barra empilhada ---- */
function horasextraState(){ return ex('horas-extras', function(){ return { processed:false, processing:false }; }); }
var HORASEXTRA_ROWS = [
  { func:'Marcos Ferreira', cliente:'Padaria do João', h50:6, h100:0, valor:187.5 },
  { func:'Ricardo Alves', cliente:'Transportes Veloz', h50:12, h100:4, valor:620 },
  { func:'Ana Cordeiro', cliente:'Oficina Silva', h50:3, h100:0, valor:94.5 }
];
function renderHorasExtras(){
  var s = horasextraState();
  var maxH = 16;
  var rows = s.processed ? HORASEXTRA_ROWS.map(function(r){
    var w50 = Math.round(r.h50/maxH*100), w100 = Math.round(r.h100/maxH*100);
    return '<tr><td>'+r.func+'</td><td>'+r.cliente+'</td><td>'+r.h50+'h</td><td>'+r.h100+'h</td><td class="strong">'+fmtBRL(r.valor)+'</td><td>'
      + '<div class="stack-bar"><div class="stack-50" style="width:'+w50+'%"></div><div class="stack-100" style="width:'+w100+'%"></div></div>'+badge('Calculado')+'</td></tr>';
  }).join('') : '';
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; Horas extras</p><h1>Horas extras</h1><p>Importa o relatório de ponto e calcula horas extras e adicionais legais — 50% em dias normais, 100% em domingos e feriados.</p></div>'
    + noteChip('50% sobre a hora normal em dias úteis, 100% em domingos e feriados — aplicado automaticamente conforme o dia da semana.')
    + '<div class="card card-pad"><div class="upload-strip">'+icon('upload')+'<span>Relatório de ponto (.csv)</span><button class="btn-dark" data-horas-processar style="margin-left:auto">'+(s.processing?sp()+' Calculando adicionais...':'Processar')+'</button></div></div>'
    + (s.processed ? '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cliente</th><th>Horas 50%</th><th>Horas 100%</th><th>Valor adicional</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="totals-footer"><span>Total de adicionais no mês <b class="tnum">R$ 902,00</b></span></div></div>' : '<div class="card card-pad" style="color:var(--fg-muted);font-size:13px;">Envie o relatório de ponto e clique em Processar para calcular os adicionais do mês.</div>')
    + '</div>';
}
function bindHorasExtras(){
  var btn = document.querySelector('[data-horas-processar]');
  if (!btn) return;
  btn.addEventListener('click', function(){
    var s = horasextraState();
    if (s.processing) return;
    s.processing = true; render();
    setTimeout(function(){ s.processing = false; s.processed = true; render(); }, 1100);
  });
}

/* ---- Vale-transporte/VR (b11): medidor de 6% + recarga ---- */
function vtvrState(){ return ex('vt-vr', function(){ return { rows: [
  { cliente:'Padaria do João', func:5, vt:440, vr:900, pctLimite:92, status:'Recarregado', loading:false, ts:'' },
  { cliente:'Oficina Silva', func:3, vt:264, vr:540, pctLimite:78, status:'Recarregado', loading:false, ts:'' },
  { cliente:'Clínica Rosa', func:8, vt:704, vr:1440, pctLimite:85, status:'Recarregado', loading:false, ts:'' },
  { cliente:'Transportes Veloz', func:4, vt:352, vr:720, pctLimite:60, status:'Recarregado', loading:false, ts:'' }
] }; }); }
function renderVtVr(){
  var s = vtvrState();
  var cards = s.rows.map(function(r,i){
    var kind = r.pctLimite>=90?'err':(r.pctLimite>=75?'warn':'ok');
    return '<div class="vtvr-card"><div class="strong">'+r.cliente+'</div><div class="vtvr-func">'+r.func+' funcionários</div>'
      + '<div class="vtvr-gauge-row"><span class="vtvr-gauge-lbl">Desconto no teto de 6%</span>'+mgauge(r.pctLimite, kind)+'<span class="tnum">'+r.pctLimite+'%</span></div>'
      + '<div class="vtvr-vals"><div><span class="g-lbl">VT recarregado</span><span class="g-val">'+fmtBRL(r.vt)+'</span></div><div><span class="g-lbl">VR recarregado</span><span class="g-val">'+fmtBRL(r.vr)+'</span></div></div>'
      + '<button class="btn-line" style="width:100%;margin-top:10px" data-vtvr-recarregar="'+i+'">'+(r.loading?'<span class="vtvr-spin">'+icon('onibus')+'</span> Recarregando...':(r.ts?'Recarregado · '+r.ts:'Recarregar'))+'</button>'
      + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; Vale-transporte/VR</p><h1>Vale-transporte/VR</h1><p>Calcula e recarrega o vale-transporte e o vale-refeição por funcionário — o desconto de VT nunca passa de 6% do salário.</p></div>'
    + noteChip('Desconto de VT limitado a 6% do salário do funcionário, mesmo se o custo real do transporte for maior.')
    + '<div class="vtvr-grid">'+cards+'</div>'
    + '</div>';
}
function bindVtVr(){
  document.querySelectorAll('[data-vtvr-recarregar]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-vtvr-recarregar'); var s = vtvrState(); var r = s.rows[i];
      if (r.loading) return;
      r.loading = true; render();
      setTimeout(function(){ r.loading = false; r.ts = 'agora mesmo'; render(); }, 1000);
    });
  });
}

/* ---- Admissão de funcionário (b19): slots de documento lado a lado ---- */
var ADMISSAO_HIST_SEED = [
  { func:'Marcos Ferreira', cliente:'Padaria do João', slots:'4/4', esocial:'Aceito', status:'Concluída' },
  { func:'Pedro Lima', cliente:'Mercado Bom Preço', slots:'3/4 (falta exame admissional)', esocial:'Aguardando', status:'Pendente' }
];
function admissaoState(){ return ex('admissao-funcionario', function(){ return { slots:{ rg:false, cpf:false, comp:false, exame:false }, form:{ nome:'', cpf:'', cargo:'' } }; }); }
function renderAdmissaoFuncionario(){
  var s = admissaoState();
  var slotDefs = [ ['rg','RG'], ['cpf','CPF'], ['comp','Comprovante de residência'], ['exame','Exame admissional'] ];
  var slots = slotDefs.map(function(d){
    var filled = s.slots[d[0]];
    return '<button type="button" class="doc-slot'+(filled?' filled':'')+'" data-admissao-slot="'+d[0]+'">'+(filled?icon('check'):'')+'<span>'+d[1]+'</span></button>';
  }).join('');
  var cpfOk = s.form.cpf==='' || cpfValida(s.form.cpf);
  var allSlots = Object.keys(s.slots).every(function(k){ return s.slots[k]; });
  var formOk = s.form.nome && s.form.cpf && cpfValida(s.form.cpf) && s.form.cargo;
  var hist = ADMISSAO_HIST_SEED.map(function(h){ return '<tr><td>'+h.func+'</td><td>'+h.cliente+'</td><td>'+h.slots+'</td><td>'+badge(h.esocial)+'</td><td>'+badge(h.status)+'</td></tr>'; }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>DP</b> &gt; Admissão de funcionário</p><h1>Admissão de funcionário</h1><p>Contrato, eSocial S-2200 e checklist de documentos numa tela só — com upload de múltiplos documentos em paralelo.</p></div>'
    + noteChip('Sem o eSocial enviado antes do início das atividades, a empresa fica irregular — multa de R$ 402 a R$ 3.048 por funcionário.')
    + '<div class="card card-pad"><h3 style="margin:0 0 12px;font-size:13.5px;">Documentos</h3><div class="doc-slots">'+slots+'</div>'
    + '<div class="form-mock" style="margin-top:18px;">'
    + '<div class="form-mock-field"><span class="lbl">Nome</span><input type="text" class="esoc-input" data-admissao-field="nome" value="'+esc(s.form.nome)+'"></div>'
    + '<div class="form-mock-field'+(cpfOk?'':' esoc-invalid')+'"><span class="lbl">CPF</span><div><input type="text" class="esoc-input" placeholder="000.000.000-00" data-admissao-field="cpf" value="'+esc(s.form.cpf)+'">'+(cpfOk?'':'<div class="esoc-error">CPF inválido</div>')+'</div></div>'
    + '<div class="form-mock-field"><span class="lbl">Cargo</span><input type="text" class="esoc-input" data-admissao-field="cargo" value="'+esc(s.form.cargo)+'"></div>'
    + '</div>'
    + '<button class="btn-dark" style="margin-top:16px" data-admissao-concluir '+((!allSlots||!formOk)?'disabled':'')+'>Concluir Admissão</button>'
    + '</div>'
    + '<div class="card"><div class="card-head"><h2>Admissões recentes</h2></div><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cliente</th><th>Slots preenchidos</th><th>eSocial S-2200</th><th>Status</th></tr></thead><tbody>'+hist+'</tbody></table></div></div>'
    + '</div>';
}
function bindAdmissaoFuncionario(){
  var s = admissaoState();
  document.querySelectorAll('[data-admissao-slot]').forEach(function(el){
    el.addEventListener('click', function(){ var k = el.getAttribute('data-admissao-slot'); s.slots[k] = !s.slots[k]; render(); });
  });
  document.querySelectorAll('[data-admissao-field]').forEach(function(el){
    el.addEventListener('input', function(){ s.form[el.getAttribute('data-admissao-field')] = el.value; render(); });
  });
  var concluir = document.querySelector('[data-admissao-concluir]');
  if (concluir) concluir.addEventListener('click', function(){
    if (concluir.disabled) return;
    ADMISSAO_HIST_SEED.unshift({ func:s.form.nome, cliente:'Padaria do João', slots:'4/4', esocial:'Aceito', status:'Concluída' });
    s.slots = { rg:false, cpf:false, comp:false, exame:false }; s.form = { nome:'', cpf:'', cargo:'' };
    render();
  });
}

/* ============================================================================
   SOCIETÁRIO
   ============================================================================ */

/* ---- Abertura de empresa (a4): réplica fiel do checklist real de
   ETAPAS_PADRAO (backend/src/services/processos.service.js) — 9 etapas,
   não 10 (a versão antiga desta tela tinha uma etapa inventada "Aguardar
   CNPJ" e duas ações automatizadas — certificado digital, cadastro de
   folha — que não existem no backend real; corrigido conforme
   automacoes/a4-abertura-de-empresa.md, seção Especificação técnica).
   1) formulário de dados da empresa, 2) checklist único de 9 itens na
   ordem real — etapa manual = checkbox, etapa automatizada (Gerar
   contrato social / Criar estrutura de pastas, únicas automatizadas de
   verdade) = formulário inline + "Concluir" com "Processando..." e
   card verde "✓ Execução concluída", igual ao componente EtapaAutomatizada
   de frontend/src/app/dashboard/processos/page.jsx. Lista expansível,
   não kanban — a UI real também não é kanban. ---- */
var ABERTURA_CHECKLIST_BASE = [
  { nome:'Verificar viabilidade do nome empresarial', tipo:'manual', status:'pending', nota:'—' },
  { nome:'Registrar na Junta Comercial', tipo:'manual', status:'pending', nota:'—' },
  { nome:'Gerar contrato social', tipo:'auto', status:'pending', nota:'automático', arquivo:null, acao:'gerar_contrato_social' },
  { nome:'Obter CNPJ na Receita Federal', tipo:'manual', status:'pending', nota:'—' },
  { nome:'Registrar no município (Alvará)', tipo:'manual', status:'pending', nota:'—' },
  { nome:'Registrar no estado (Inscrição Estadual, se aplicável)', tipo:'manual', status:'pending', nota:'—' },
  { nome:'Abrir conta bancária pessoa jurídica', tipo:'manual', status:'pending', nota:'—' },
  { nome:'Criar estrutura de pastas', tipo:'auto', status:'pending', nota:'automático', arquivo:null, acao:'criar_pastas' },
  { nome:'Configurar emissão de NFS-e', tipo:'manual', status:'pending', nota:'—' }
];
function socioVazio(){ return { nome:'', cpf:'', participacao:'' }; }
function aberturaState(){
  return ex('abertura-empresa', function(){
    return {
      fase:'form',
      form:{ nomeEmpresa:'Padaria Estrela Ltda', capitalSocial:'50000', objetoSocial:'Comércio varejista de pães, doces e produtos de padaria', endereco:'Rua das Acácias, 245 — São Paulo/SP' },
      socios:[ { nome:'Fernanda Duarte', cpf:'234.567.890-11', participacao:'60' }, { nome:'Rafael Nunes', cpf:'345.678.901-22', participacao:'40' } ],
      erroForm:'',
      steps: ABERTURA_CHECKLIST_BASE.map(function(s){ return Object.assign({}, s); }),
      execAberto:null, execProcessando:false
    };
  });
}
function renderAberturaForm(s){
  var inputCss = 'border:1px solid var(--slate-300);border-radius:6px;padding:8px 10px;font-size:13px;width:100%;';
  var sociosHtml = s.socios.map(function(soc,i){
    return '<div style="display:grid;grid-template-columns:2fr 1.3fr 0.8fr auto;gap:10px;margin-bottom:8px;align-items:end;">'
      + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Sócio '+(i+1)+' — nome</span><input type="text" style="'+inputCss+'" data-abertura-socio-nome="'+i+'" value="'+esc(soc.nome)+'"></label>'
      + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">CPF</span><input type="text" style="'+inputCss+'" placeholder="000.000.000-00" data-abertura-socio-cpf="'+i+'" value="'+esc(soc.cpf)+'"></label>'
      + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Participação %</span><input type="text" style="'+inputCss+'" data-abertura-socio-part="'+i+'" value="'+esc(soc.participacao)+'"></label>'
      + (s.socios.length>1 ? '<button class="btn-line" data-abertura-remover-socio="'+i+'" title="Remover sócio">×</button>' : '<span></span>')
      + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Abertura de empresa</p><h1>Nova Abertura de Empresa</h1><p>Preencha os dados — o contrato social e a estrutura de pastas são gerados automaticamente a partir daqui.</p></div>'
    + '<div class="card card-pad">'
    + '<label style="display:block;margin-bottom:14px;"><span class="stat-label" style="display:block;margin-bottom:6px;">Nome da empresa</span><input type="text" style="'+inputCss+'" placeholder="Ex: Nova Empresa Ltda" data-abertura-campo="nomeEmpresa" value="'+esc(s.form.nomeEmpresa)+'"></label>'
    + '<div style="font-weight:600;font-size:13px;color:var(--slate-700);margin-bottom:8px;">Sócios</div>'
    + sociosHtml
    + '<button class="btn-line" data-abertura-add-socio style="margin-bottom:16px;">+ Adicionar sócio</button>'
    + '<div class="grid2" style="margin-bottom:14px;">'
    + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Capital social (R$)</span><input type="text" style="'+inputCss+'" placeholder="Ex: 100000" data-abertura-campo="capitalSocial" value="'+esc(s.form.capitalSocial)+'"></label>'
    + '<label><span class="stat-label" style="display:block;margin-bottom:6px;">Endereço</span><input type="text" style="'+inputCss+'" data-abertura-campo="endereco" value="'+esc(s.form.endereco)+'"></label>'
    + '</div>'
    + '<label style="display:block;margin-bottom:16px;"><span class="stat-label" style="display:block;margin-bottom:6px;">Objeto social</span><input type="text" style="'+inputCss+'" placeholder="Ex: Comércio varejista de produtos alimentícios" data-abertura-campo="objetoSocial" value="'+esc(s.form.objetoSocial)+'"></label>'
    + (s.erroForm ? '<p style="margin-bottom:12px;border:1px solid var(--danger-200,#FECDD3);background:var(--danger-50,#FFF1F2);color:var(--danger-700);border-radius:6px;padding:8px 12px;font-size:13px;">'+esc(s.erroForm)+'</p>' : '')
    + '<div style="display:flex;justify-content:flex-end;"><button class="btn-dark" data-abertura-iniciar>Iniciar Abertura de Empresa</button></div>'
    + '</div></div>';
}
function renderAberturaProcesso(s){
  var nome = s.form.nomeEmpresa || 'a empresa';

  var doneTotal = s.steps.filter(function(st){return st.status==='ok';}).length;
  var totalSteps = s.steps.length;
  var pct = Math.round(doneTotal/totalSteps*100);
  var rows = s.steps.map(function(st,i){
    if (st.status==='ok'){
      var arquivoLink = st.arquivo ? '<span class="step-note" style="color:var(--success-700);">— '+st.arquivo+'</span>' : '';
      var autoTagDone = st.tipo==='auto' ? '<span class="badge-auto">'+icon('bolt')+'Automatizado</span>' : '';
      return '<div class="step-row'+(st.tipo==='auto'?' step-row-auto':'')+'"><span style="color:var(--success-600);display:inline-flex;">'+icon('checkcircle')+'</span><span>'+st.nome+'</span>'+autoTagDone+arquivoLink+'</div>';
    }
    if (st.tipo==='manual'){
      return '<label class="step-row" style="cursor:pointer;"><input type="checkbox" data-abertura-manual="'+i+'" style="width:15px;height:15px;"><span style="color:var(--slate-400);">'+st.nome+'</span></label>';
    }
    var aberto = s.execAberto === i;
    var linha = '<div class="step-row step-row-auto" style="cursor:pointer;" data-abertura-abrir="'+i+'"><span class="step-auto-ic">'+icon('bolt')+'</span><span style="color:var(--slate-800);font-weight:600;">'+st.nome+'</span><span class="badge-auto">Automatizado</span><span style="margin-left:auto;">'+badge('Pendente','neutral')+'</span></div>';
    if (!aberto) return linha;
    var painel = s.execProcessando
      ? '<div class="form-mock-field" style="justify-content:flex-start;gap:10px;">'+sp()+'<span>A solicitação foi enviada. O resultado aparecerá automaticamente.</span></div>'
      : '<div style="border:1px solid var(--slate-200);border-radius:var(--r-md);background:var(--slate-50);padding:14px;margin-top:2px;">'
        + '<p style="font-size:12.5px;color:var(--fg-muted);margin:0 0 12px;">O agente executará esta etapa automaticamente. Nenhum dado adicional é necessário.</p>'
        + '<div style="display:flex;justify-content:flex-end;"><button class="btn-dark" data-abertura-concluir="'+i+'">Concluir</button></div></div>';
    return linha + painel;
  }).join('');

  var intro = '<div class="card card-pad" style="margin-bottom:14px;"><div class="proc-top" style="margin-bottom:8px;"><span style="font-size:13px;font-weight:600;color:var(--slate-700)">Progresso do processo</span><span style="font-size:12.5px;color:var(--fg-muted)">'+doneTotal+' de '+totalSteps+' etapas</span></div>'
    + '<div style="display:flex;align-items:center;gap:12px;"><div class="progress-track"><div class="progress-fill" style="width:'+pct+'%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">'+pct+'%</span></div></div>'
    + '<div class="card"><div class="card-head"><h2>Checklist de abertura</h2></div><div class="card-pad">'+rows+'</div></div>';

  return '<div class="page">'+aberturaHeader(nome)+intro+'</div>';
}
function aberturaHeader(nome){
  return '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Abertura de empresa</p><h1>'+esc(nome)+'</h1><p>Acompanhamento do processo de abertura.</p></div>';
}
function renderAbertura(){
  var s = aberturaState();
  return s.fase==='form' ? renderAberturaForm(s) : renderAberturaProcesso(s);
}
function bindAbertura(){
  var s = aberturaState();

  // formulário
  document.querySelectorAll('[data-abertura-campo]').forEach(function(el){
    el.addEventListener('input', function(){ s.form[el.getAttribute('data-abertura-campo')] = el.value; });
  });
  document.querySelectorAll('[data-abertura-socio-nome]').forEach(function(el){
    el.addEventListener('input', function(){ s.socios[+el.getAttribute('data-abertura-socio-nome')].nome = el.value; });
  });
  document.querySelectorAll('[data-abertura-socio-cpf]').forEach(function(el){
    el.addEventListener('input', function(){ s.socios[+el.getAttribute('data-abertura-socio-cpf')].cpf = el.value; });
  });
  document.querySelectorAll('[data-abertura-socio-part]').forEach(function(el){
    el.addEventListener('input', function(){ s.socios[+el.getAttribute('data-abertura-socio-part')].participacao = el.value; });
  });
  var addSocioBtn = document.querySelector('[data-abertura-add-socio]');
  if (addSocioBtn) addSocioBtn.addEventListener('click', function(){ s.socios.push(socioVazio()); render(); });
  document.querySelectorAll('[data-abertura-remover-socio]').forEach(function(el){
    el.addEventListener('click', function(){ s.socios.splice(+el.getAttribute('data-abertura-remover-socio'), 1); render(); });
  });
  var iniciarBtn = document.querySelector('[data-abertura-iniciar]');
  if (iniciarBtn) iniciarBtn.addEventListener('click', function(){
    if (!s.form.nomeEmpresa || !s.form.nomeEmpresa.trim()){
      s.erroForm = 'Informe o nome da empresa.'; render(); return;
    }
    s.erroForm = '';
    s.fase = 'processo'; render();
  });

  // checklist único de 9 etapas (ver ABERTURA_CHECKLIST_BASE)
  document.querySelectorAll('[data-abertura-manual]').forEach(function(el){
    el.addEventListener('change', function(){
      s.steps[+el.getAttribute('data-abertura-manual')].status = 'ok';
      render();
    });
  });
  document.querySelectorAll('[data-abertura-abrir]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-abertura-abrir');
      s.execAberto = (s.execAberto === i) ? null : i;
      render();
    });
  });
  var concluirBtn = document.querySelector('[data-abertura-concluir]');
  if (concluirBtn) concluirBtn.addEventListener('click', function(e){
    e.stopPropagation();
    var i = +concluirBtn.getAttribute('data-abertura-concluir');
    if (s.execProcessando) return;
    s.execProcessando = true; render();
    setTimeout(function(){
      var nome = s.form.nomeEmpresa || 'a empresa';
      s.steps[i].status = 'ok';
      s.steps[i].arquivo = s.steps[i].acao === 'gerar_contrato_social'
        ? 'arquivo gerado: contrato_social_v1.docx'
        : '8 subpastas criadas em CLIENTES/'+nome+'/ (Documentos, Contratos, Requerimentos, Comprovantes, Correspondencias, Folha, Notas Fiscais, Declaracoes)';
      s.execProcessando = false; s.execAberto = null;
      render();
    }, 1400);
  });
}

/* ---- Alteração contratual (b17): diff no topo ---- */
function alteracaoState(){ return ex('alteracao-contratual', function(){ return { rows: [
  { processo:'Oficina Silva ME — mudança de endereço + nova atividade', status:'Em andamento', pct:50, diff:[ ['Endereço','Rua Antiga, 123','Rua Nova, 456'], ['Atividade','Comércio varejista','+ Serviços de manutenção automotiva'] ], open:false },
  { processo:'Transportes Veloz — inclusão de sócio', status:'Concluída', pct:100, diff:[ ['Quadro societário','2 sócios','3 sócios (inclusão de Rafael Nunes)'] ], open:false }
] }; }); }
function renderAlteracaoContratual(){
  var s = alteracaoState();
  var rows = s.rows.map(function(r,i){
    var col = r.pct===100?'var(--success-600)':'var(--warning-600)';
    var diff = r.open ? '<div class="diff-card">'+r.diff.map(function(d){ return '<div class="diff-line"><span class="diff-lbl">'+d[0]+':</span> <span class="diff-old">'+d[1]+'</span> <span class="diff-arrow">→</span> <span class="diff-new">'+d[2]+'</span></div>'; }).join('')+'</div>' : '';
    return '<div class="proc-row"><div class="proc-top clickable-row" data-alteracao-toggle="'+i+'"><span class="proc-name">'+r.processo+'</span>'+badge(r.status)+'</div>'
      + '<div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:'+r.pct+'%;background:'+col+'"></div></div><span class="proc-pct tnum">'+r.pct+'%</span></div>'
      + diff + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Alteração contratual</p><h1>Alteração contratual</h1><p>Preenche a alteração no contrato social e acompanha as etapas na Junta — clique num processo para ver exatamente o que muda.</p></div>'
    + noteChip('Mesmo motor de checklist da abertura de empresa, adaptado ao tipo de alteração.')
    + '<div class="card card-pad">'+rows+'</div>'
    + '</div>';
}
function bindAlteracaoContratual(){
  document.querySelectorAll('[data-alteracao-toggle]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-alteracao-toggle'); var s = alteracaoState(); s.rows[i].open = !s.rows[i].open; render(); });
  });
}

/* ---- Baixa de empresa (b18): tom grave na etapa final ---- */
function baixaState(){ return ex('baixa-empresa', function(){ return { rows: [
  { processo:'Doceria Estrela ME — encerramento de atividades', status:'Concluída', pct:100, open:false, armed:false },
  { processo:'Mercadinho Aurora ME — encerramento de atividades', status:'Em andamento', pct:35, open:false, armed:false }
] }; }); }
function renderBaixaEmpresa(){
  var s = baixaState();
  var rows = s.rows.map(function(r,i){
    var col = r.pct===100?'var(--success-600)':'var(--warning-600)';
    var final = r.status!=='Concluída' ? '<div class="baixa-final"><p>'+icon('sino')+' Esta ação não pode ser desfeita — a empresa sai da lista de clientes ativos.</p><button class="btn-reject" data-baixa-confirm="'+i+'">'+(r.armed?'Clique novamente para confirmar':'Confirmar encerramento definitivo')+'</button></div>' : '';
    var body = r.open ? '<div class="baixa-checklist"><div class="step-row">'+icon('checkcircle')+'<span>Quitar débitos com Receita e prefeitura</span></div><div class="step-row">'+icon('checkcircle')+'<span>Entregar declaração final (DEFIS)</span></div><div class="step-row">'+icon('checkcircle')+'<span>Baixar inscrições estadual e municipal</span></div>'+final+'</div>' : '';
    return '<div class="proc-row"><div class="proc-top clickable-row" data-baixa-toggle="'+i+'"><span class="proc-name">'+r.processo+'</span>'+badge(r.status)+'</div>'
      + '<div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:'+r.pct+'%;background:'+col+'"></div></div><span class="proc-pct tnum">'+r.pct+'%</span></div>'
      + body + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Baixa de empresa</p><h1>Baixa de empresa</h1><p>Monta o checklist de documentação para encerramento da empresa — a última etapa é irreversível e tem tom visual diferente das demais.</p></div>'
    + noteChip('Sem baixa formal, obrigações do Simples Nacional continuam sendo geradas mesmo após a empresa parar de operar.')
    + '<div class="card card-pad">'+rows+'</div>'
    + '</div>';
}
function bindBaixaEmpresa(){
  var s = baixaState();
  document.querySelectorAll('[data-baixa-toggle]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-baixa-toggle'); s.rows[i].open = !s.rows[i].open; render(); });
  });
  document.querySelectorAll('[data-baixa-confirm]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-baixa-confirm'); var r = s.rows[i];
      if (!r.armed){ r.armed = true; render(); return; }
      r.status = 'Concluída'; r.pct = 100; r.armed = false; render();
    });
  });
}

/* ---- Alvarás e licenças (b2): agrupado por urgência, checklist por tipo ---- */
var ALVARAS_CHECKLISTS = {
  'Alvará de funcionamento': ['Formulário da prefeitura preenchido', 'Certidão negativa de débitos'],
  'Licença sanitária': ['Laudo técnico da vigilância', 'Vistoria agendada'],
  'Alvará sanitário': ['Laudo técnico da vigilância', 'Vistoria agendada'],
  'Licença ambiental': ['Estudo de impacto simplificado', 'Protocolo no órgão estadual']
};
function alvarasState(){ return ex('alvaras-licencas', function(){ return { rows: [
  { licenca:'Alvará de funcionamento', cliente:'Padaria do João', orgao:'Prefeitura Municipal', venc:'15/03/2027', status:'Vigente', dias:400, open:false, checked:{} },
  { licenca:'Licença sanitária', cliente:'Padaria do João', orgao:'Vigilância Sanitária', venc:'22/06/2027', status:'Vigente', dias:500, open:false, checked:{} },
  { licenca:'Alvará de funcionamento', cliente:'Oficina Silva', orgao:'Prefeitura Municipal', venc:'30/09/2026', status:'Vence em 41 dias', dias:41, open:false, checked:{} },
  { licenca:'Licença ambiental', cliente:'Transportes Veloz', orgao:'Órgão estadual de meio ambiente', venc:'10/01/2027', status:'Vigente', dias:140, open:false, checked:{} },
  { licenca:'Alvará sanitário', cliente:'Clínica Rosa', orgao:'Vigilância Sanitária', venc:'05/08/2026', status:'Renovação em andamento', dias:12, open:false, checked:{} }
] }; }); }
function alvarasBand(dias){ return dias<30 ? 'red' : (dias<90 ? 'amber' : 'green'); }
function renderAlvarasLicencas(){
  var s = alvarasState();
  var bands = { red:[], amber:[], green:[] };
  s.rows.forEach(function(r,i){ bands[alvarasBand(r.dias)].push(i); });
  function cardFor(i){
    var r = s.rows[i];
    var checklist = ALVARAS_CHECKLISTS[r.licenca] || ['Documentação padrão'];
    var body = r.open ? '<div class="alvara-checklist">'+checklist.map(function(item,ii){
      var checked = !!r.checked[ii];
      return '<label class="alvara-item"><input type="checkbox" data-alvara-check="'+i+':'+ii+'" '+(checked?'checked':'')+'><span>'+item+'</span></label>';
    }).join('')+'</div>' : '';
    return '<div class="alvara-card"><div class="alvara-top"><span class="strong">'+r.licenca+'</span>'+badge(r.status)+'</div>'
      + '<div class="alvara-cliente">'+r.cliente+'</div><div class="alvara-orgao">'+r.orgao+'</div><div class="alvara-venc">Vence '+r.venc+'</div>'
      + '<button class="btn-line" data-alvara-toggle="'+i+'" style="margin-top:8px;width:100%">Renovar</button>' + body + '</div>';
  }
  function bandSection(key, label, cls){
    if (!bands[key].length) return '';
    return '<div class="alvara-band"><div class="alvara-band-label alvara-band-'+cls+'">'+label+'</div><div class="alvara-band-cards">'+bands[key].map(cardFor).join('')+'</div></div>';
  }
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Alvarás e licenças</p><h1>Alvarás e licenças</h1><p>Acompanha vencimentos e emite alvarás e licenças por órgão — agrupados por urgência, cada tipo com checklist de renovação próprio.</p></div>'
    + noteChip('Alertas em 3 janelas — 90 dias antes (iniciar renovação), 30 dias (urgente) e no vencimento (crítico).')
    + bandSection('red','Vencido / vence em menos de 30 dias','red') + bandSection('amber','Vence em 30–90 dias','amber') + bandSection('green','Vigente (mais de 90 dias)','green')
    + '</div>';
}
function bindAlvarasLicencas(){
  var s = alvarasState();
  document.querySelectorAll('[data-alvara-toggle]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-alvara-toggle'); s.rows[i].open = !s.rows[i].open; render(); });
  });
  document.querySelectorAll('[data-alvara-check]').forEach(function(el){
    el.addEventListener('change', function(){
      var parts = el.getAttribute('data-alvara-check').split(':'); var i=+parts[0], ii=+parts[1];
      s.rows[i].checked[ii] = el.checked; render();
    });
  });
}

/* ---- Certificado digital (b3): anel de contagem regressiva ---- */
function certdigState(){ return ex('certificado-digital', function(){ return { rows: [
  { cliente:'Padaria do João', tipo:'e-CNPJ A1', validade:'14/02/2027', dias:175, kind:'ok', open:false, agendaDia:'' },
  { cliente:'Oficina Silva', tipo:'e-CNPJ A1', validade:'30/08/2026', dias:7, kind:'err', open:false, agendaDia:'', status:'Renovação iniciada' },
  { cliente:'Clínica Rosa', tipo:'e-CNPJ A3 (cartão)', validade:'19/11/2026', dias:90, kind:'ok', open:false, agendaDia:'' },
  { cliente:'Transportes Veloz', tipo:'e-CNPJ A1', validade:'05/05/2027', dias:250, kind:'ok', open:false, agendaDia:'' },
  { cliente:'Mercado Bom Preço', tipo:'e-CNPJ A1', validade:'22/12/2026', dias:120, kind:'warn', open:false, agendaDia:'' }
] }; }); }
function renderCertificadoDigital(){
  var s = certdigState();
  var cards = s.rows.map(function(r,i){
    var isA3 = r.tipo.indexOf('A3') >= 0;
    var body = r.open ? (isA3
      ? '<div class="certdig-checklist"><div class="step-row">'+icon('checkcircle')+'<span>Confirmar dados cadastrais</span></div><div class="step-row">'+icon('checkcircle')+'<span>Gerar novo certificado</span></div><div class="step-row"><span class="strong">Agendar comparecimento presencial</span> <input type="date" data-certdig-agenda="'+i+'" value="'+esc(r.agendaDia)+'"></div></div>'
      : '<div class="certdig-checklist"><div class="step-row">'+icon('checkcircle')+'<span>Confirmar dados cadastrais</span></div><div class="step-row">'+icon('checkcircle')+'<span>Gerar novo certificado (arquivo digital)</span></div></div>'
    ) : '';
    return '<div class="certdig-card"><span class="strong">'+r.cliente+'</span><span class="certdig-tipo">'+r.tipo+'</span>'
      + ring(Math.min(100, r.dias/2), r.kind, r.dias+'d')
      + (r.status ? badge(r.status,'warn') : '') + '<div class="certdig-validade">Validade '+r.validade+'</div>'
      + '<button class="btn-line" data-certdig-toggle="'+i+'" style="width:100%;margin-top:6px">Iniciar Renovação</button>' + body + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Certificado digital</p><h1>Certificado digital</h1><p>Alerta e conduz a renovação do certificado digital de cada cliente — o tempo restante é o dado principal.</p></div>'
    + noteChip('Renovação leva de 3 a 5 dias úteis — o alerta de 60 dias antes garante folga real.')
    + '<div class="certdig-grid">'+cards+'</div>'
    + '</div>';
}
function bindCertificadoDigital(){
  var s = certdigState();
  document.querySelectorAll('[data-certdig-toggle]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-certdig-toggle'); s.rows[i].open = !s.rows[i].open; render(); });
  });
  document.querySelectorAll('[data-certdig-agenda]').forEach(function(el){
    el.addEventListener('change', function(){ s.rows[+el.getAttribute('data-certdig-agenda')].agendaDia = el.value; render(); });
  });
}

/* ---- Procurações (b20): carrossel instrucional ---- */
var PROCURACOES_ROWS = [
  { cliente:'Padaria do João', sistema:'e-CAC Receita Federal', validade:'12/2027', status:'Vigente' },
  { cliente:'Oficina Silva', sistema:'Gov.br', validade:'03/2027', status:'Vigente' },
  { cliente:'Clínica Rosa', sistema:'e-CAC Receita Federal', validade:'07/2026', status:'Renovação em andamento' },
  { cliente:'Mercado Bom Preço', sistema:'Gov.br', validade:'09/2027', status:'Vigente' }
];
var PROCURACOES_STEPS = [
  'Acesse o portal com seu certificado digital ou conta Gov.br',
  'Vá em "Procurações" no menu do painel',
  'Cadastre o CNPJ do escritório como procurador',
  'Selecione os serviços autorizados e confirme'
];
function procuracoesState(){ return ex('procuracoes', function(){ return { open:null }; }); }
function renderProcuracoes(){
  var s = procuracoesState();
  var rows = PROCURACOES_ROWS.map(function(r,i){
    return '<tr><td>'+r.cliente+'</td><td>'+r.sistema+'</td><td>'+r.validade+'</td><td>'+badge(r.status)+'</td><td><button class="btn-line" data-proc-open="'+i+'">Gerar Instruções de Procuração</button></td></tr>';
  }).join('');
  var modal = '';
  if (s.open !== null){
    var r = PROCURACOES_ROWS[s.open];
    modal = '<div class="modal-overlay" data-proc-close><div class="modal-box carousel-modal" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">Como outorgar procuração — '+r.sistema+'</div><div class="modal-sub">'+r.cliente+'</div></div><button class="icon-btn" data-proc-close>'+icon('x')+'</button></div>'
      + '<div class="modal-body"><div class="carousel-row">' + PROCURACOES_STEPS.map(function(t,i){ return '<div class="carousel-card"><div class="carousel-num">'+(i+1)+'</div><div class="carousel-thumb"></div><div class="carousel-text">'+t+'</div></div>'; }).join('') + '</div></div>'
      + '</div></div>';
  }
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Procurações e-CAC/Gov.br</p><h1>Procurações e-CAC/Gov.br</h1><p>Controla a validade e gera um guia passo a passo visual para o cliente outorgar a procuração sozinho.</p></div>'
    + noteChip('Sistemas diferentes exigem procurações diferentes — e-CAC (Receita Federal) e Gov.br (eSocial, Emprega) não se sobrepõem.')
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Sistema</th><th>Validade</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + modal
    + '</div>';
}
function bindProcuracoes(){
  var s = procuracoesState();
  document.querySelectorAll('[data-proc-open]').forEach(function(el){ el.addEventListener('click', function(){ s.open = +el.getAttribute('data-proc-open'); render(); }); });
  document.querySelectorAll('[data-proc-close]').forEach(function(el){ el.addEventListener('click', function(){ s.open = null; render(); }); });
}

/* ---- Regularização cadastral (c5): 1 campo por vez, 3 cliques ---- */
var REGCAD_TIPOS = { cnae:'CNAE secundário', tel:'Telefone', email:'E-mail', end:'Endereço sem mudança de contrato' };
function regcadState(){ return ex('regularizacao-cadastral', function(){ return { tipo:'', valor:'', pendentes:[
  { cliente:'Mercado Bom Preço', dado:'CNAE secundário desatualizado', status:'pendente' },
  { cliente:'Oficina Silva', dado:'Telefone e e-mail cadastral', status:'Concluída' }
] }; }); }
function renderRegularizacaoCadastral(){
  var s = regcadState();
  var pend = s.pendentes.map(function(p,i){
    return '<tr><td>'+p.cliente+'</td><td>'+p.dado+'</td><td>'+(p.status==='Concluída'?badge('Concluída'):'<button class="btn-line" data-regcad-resolve="'+i+'">Atualizar</button>')+'</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Societário</b> &gt; Regularização cadastral</p><h1>Regularização cadastral</h1><p>Telefone, e-mail ou CNAE secundário desatualizado — sem processo formal, resolvido em 3 cliques.</p></div>'
    + '<div class="card card-pad"><label class="regcad-select"><span>O que precisa atualizar?</span><select id="regcad-tipo">'
      + '<option value="">Selecione...</option>' + Object.keys(REGCAD_TIPOS).map(function(k){ return '<option value="'+k+'" '+(s.tipo===k?'selected':'')+'>'+REGCAD_TIPOS[k]+'</option>'; }).join('') + '</select></label>'
      + (s.tipo ? '<div class="regcad-field"><label>'+REGCAD_TIPOS[s.tipo]+'</label><input type="text" id="regcad-valor" value="'+esc(s.valor)+'"><button class="btn-confirm" data-regcad-confirmar>Confirmar</button></div>' : '')
      + (s.done ? '<div class="note-chip" style="margin-top:12px;">'+icon('check')+'<span>Atualizado e comprovante arquivado na pasta do cliente.</span></div>' : '')
    + '</div>'
    + '<div class="card"><div class="card-head"><h2>Pendências</h2></div><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Dado desatualizado</th><th>Ação</th></tr></thead><tbody>'+pend+'</tbody></table></div></div>'
    + '</div>';
}
function bindRegularizacaoCadastral(){
  var s = regcadState();
  var sel = document.getElementById('regcad-tipo');
  if (sel) sel.addEventListener('change', function(){ s.tipo = sel.value; s.valor = ''; s.done = false; render(); });
  var valInput = document.getElementById('regcad-valor');
  if (valInput) valInput.addEventListener('input', function(){ s.valor = valInput.value; });
  var confirmBtn = document.querySelector('[data-regcad-confirmar]');
  if (confirmBtn) confirmBtn.addEventListener('click', function(){ s.done = true; s.tipo = ''; render(); });
  document.querySelectorAll('[data-regcad-resolve]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-regcad-resolve'); s.pendentes[i].status = 'Concluída'; render(); });
  });
}

/* ============================================================================
   FINANCEIRO
   ============================================================================ */

/* ---- Honorários e boletos (a5 tela 1): disparo em massa dramatizado ---- */
var HONOR_SEED = [
  { cliente:'Padaria do João', comp:'Ago/2026', valor:890, venc:'10/08/2026', statusFinal:'Pago' },
  { cliente:'Oficina Silva', comp:'Ago/2026', valor:650, venc:'10/08/2026', statusFinal:'Pago' },
  { cliente:'Clínica Rosa', comp:'Ago/2026', valor:1480, venc:'10/08/2026', statusFinal:'Pago' },
  { cliente:'Transportes Veloz', comp:'Ago/2026', valor:720, venc:'10/08/2026', statusFinal:'Atrasado' },
  { cliente:'Mercado Bom Preço', comp:'Ago/2026', valor:810, venc:'10/08/2026', statusFinal:'Pendente' }
];
function honorState(){ return ex('honorarios-boletos', function(){ return { rows: HONOR_SEED.map(function(r){ return Object.assign({}, r, { phase:'done', visible:true }); }), emitting:false, count:0, painel:null }; }); }
function renderHonorarios(){
  var s = honorState();
  var rows = s.rows.filter(function(r){ return r.visible; }).map(function(r,idx){
    var i = s.rows.indexOf(r);
    var st = r.phase==='emitindo' ? badge('Emitindo','warn') : (r.phase==='emitido' ? badge('Emitido','ok') : badge(r.statusFinal));
    var clickable = r.phase==='done' && (r.statusFinal==='Atrasado' || r.statusFinal==='Pendente');
    return '<tr'+(clickable?' class="clickable-row" data-honor-open="'+i+'"':'')+'><td>'+r.cliente+'</td><td>'+r.comp+'</td><td>'+fmtBRL(r.valor)+'</td><td>'+r.venc+'</td><td>'+st+'</td></tr>';
  }).join('');
  var painel = '';
  if (s.painel !== null){
    var r = s.rows[s.painel];
    painel = '<div class="modal-overlay" data-honor-close><div class="modal-box" onclick="event.stopPropagation()">'
      + '<div class="modal-head"><div><div class="modal-title">'+r.cliente+'</div><div class="modal-sub">'+badge(r.statusFinal)+'</div></div><button class="icon-btn" data-honor-close>'+icon('x')+'</button></div>'
      + '<div class="modal-body"><p style="font-size:13px;color:var(--fg-muted)">Boleto de '+r.comp+' no valor de '+fmtBRL(r.valor)+', vencido em '+r.venc+'.</p>'+(s.reenviado===s.painel?'<div class="note-chip">'+icon('check')+'<span>Boleto reenviado por e-mail.</span></div>':'')+'</div>'
      + '<div class="modal-foot"><button class="btn-dark" data-honor-reenviar>Reenviar boleto</button></div></div></div>';
  }
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Financeiro</b> &gt; Honorários e boletos</p><h1>Honorários e boletos</h1><p>Gera e acompanha os boletos de honorários mensais dos clientes — a emissão em lote sai sozinha, em segundos.</p></div>'
    + '<div><button class="btn-dark" data-honor-emitir '+(s.emitting?'disabled':'')+'>'+(s.emitting?'Emitindo... '+s.count+'/'+s.rows.length:'Emitir Boletos do Mês')+'</button></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Competência</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + painel
    + '</div>';
}
function bindHonorarios(){
  var s = honorState();
  var btn = document.querySelector('[data-honor-emitir]');
  if (btn) btn.addEventListener('click', function(){
    if (s.emitting) return;
    s.emitting = true; s.count = 0;
    s.rows.forEach(function(r){ r.phase='pending'; r.visible=false; });
    render();
    function next(i){
      if (i >= s.rows.length){ s.emitting = false; render(); return; }
      var r = s.rows[i];
      r.visible = true; r.phase = 'emitindo'; s.count = i+1; render();
      setTimeout(function(){
        r.phase = 'emitido'; render();
        setTimeout(function(){ r.phase = 'done'; render(); next(i+1); }, 500);
      }, 350);
    }
    next(0);
  });
  document.querySelectorAll('[data-honor-open]').forEach(function(el){ el.addEventListener('click', function(){ s.painel = +el.getAttribute('data-honor-open'); s.reenviado = null; render(); }); });
  document.querySelectorAll('[data-honor-close]').forEach(function(el){ el.addEventListener('click', function(){ s.painel = null; render(); }); });
  var reenviar = document.querySelector('[data-honor-reenviar]');
  if (reenviar) reenviar.addEventListener('click', function(){ s.reenviado = s.painel; render(); });
}

/* ---- Cobrança de inadimplentes (a5 tela 2): timeline horizontal por cliente ---- */
var COBRANCA_TIMELINE_MARKERS = ['D-3 · aviso','D+1 · leve','D+5 · firme','D+10 · escalar'];
function cobrancaInadState(){ return ex('cobranca-inadimplentes', function(){ return { rows: [
  { cliente:'Transportes Veloz', pos:1, ultima:'2º lembrete enviado por e-mail em 19/08', notas:[], noteOpen:false, noteVal:'Cliente confirmou pagamento até 28/08.' },
  { cliente:'Mercado Bom Preço', pos:0, ultima:'Boleto de agosto ainda não confirmado', notas:[], noteOpen:false, noteVal:'Cliente pediu prazo até dia 15.' }
] }; }); }
function renderCobrancaInadimplentes(){
  var s = cobrancaInadState();
  var rows = s.rows.map(function(r,i){
    var track = '<div class="cob-timeline">' + COBRANCA_TIMELINE_MARKERS.map(function(m,mi){
      return '<div class="cob-marker cob-marker-'+(mi<=r.pos?'past':'future')+'"><span class="cob-dot"></span><span class="cob-mlabel">'+m+'</span></div>';
    }).join('') + '<div class="cob-pointer" style="left:'+(r.pos*33.33)+'%"></div></div>';
    var notes = r.notas.map(function(n){ return '<div class="cob-note">'+icon('assinatura')+' '+n+'</div>'; }).join('');
    var noteForm = r.noteOpen ? '<div class="cob-note-form"><input type="text" id="cob-note-'+i+'" placeholder="Ex: cliente pediu prazo até dia 15" value="'+esc(r.noteVal)+'"><button class="btn-confirm" data-cob-note-save="'+i+'">Salvar</button></div>' : '<button class="btn-line" data-cob-note-open="'+i+'">Registrar Contato Manual</button>';
    return '<div class="cob-card"><div class="strong">'+r.cliente+'</div><div class="cob-ultima">'+r.ultima+'</div>' + track + notes + noteForm + '</div>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Financeiro</b> &gt; Cobrança de inadimplentes</p><h1>Cobrança de inadimplentes</h1><p>Régua automática para honorários em atraso — a linha do tempo mostra exatamente em que ponto da régua cada cliente está agora.</p></div>'
    + noteChip('Régua automática: D-3 aviso, D+1 cobrança leve, D+5 firme, D+10 escala para o contador.')
    + rows
    + '</div>';
}
function bindCobrancaInadimplentes(){
  var s = cobrancaInadState();
  document.querySelectorAll('[data-cob-note-open]').forEach(function(el){ el.addEventListener('click', function(){ s.rows[+el.getAttribute('data-cob-note-open')].noteOpen = true; render(); }); });
  document.querySelectorAll('[data-cob-note-save]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-cob-note-save'); var input = document.getElementById('cob-note-'+i);
      if (input && input.value.trim()){ s.rows[i].notas.push(input.value.trim()); }
      s.rows[i].noteOpen = false; render();
    });
  });
}

/* ---- Reajuste de honorários (b5): grade editável ---- */
var REAJUSTE_INDICES = { 'IGP-M':0.048, 'IPCA':0.042, 'Fixo':0.03 };
function reajusteState(){ return ex('reajuste-honorarios', function(){ return { indice:'IGP-M', rows: [
  { cliente:'Padaria do João', atual:890, indiceRow:'IGP-M', reajustado:932.72, editado:false, editing:false },
  { cliente:'Oficina Silva', atual:650, indiceRow:'IGP-M', reajustado:681.20, editado:false, editing:false },
  { cliente:'Clínica Rosa', atual:1480, indiceRow:'IPCA', reajustado:1542.16, editado:false, editing:false }
], flashAll:false, notified:false }; }); }
function renderReajusteHonorarios(){
  var s = reajusteState();
  var chips = Object.keys(REAJUSTE_INDICES).map(function(k){ return '<button class="'+(s.indice===k?'active':'')+'" data-reaj-indice="'+k+'">'+k+'</button>'; }).join('');
  var rows = s.rows.map(function(r,i){
    var cell = r.editing ? '<input type="text" class="revnfe-edit-input" id="reaj-input-'+i+'" value="'+r.reajustado.toFixed(2)+'">' : ('<button class="reaj-cell" data-reaj-edit="'+i+'">'+fmtBRL(r.reajustado)+(r.editado?'<span class="reaj-dot"></span>':'')+'</button>');
    return '<tr class="'+(s.flashAll?'reaj-flash':'')+'"><td>'+r.cliente+'</td><td>'+r.indiceRow+'</td><td>'+fmtBRL(r.atual)+'</td><td>'+cell+'</td><td>Jan/2027</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Financeiro</b> &gt; Reajuste de honorários</p><h1>Reajuste de honorários</h1><p>Simula e aplica o reajuste anual de honorários por índice — qualquer valor editado manualmente fica travado e não é sobrescrito.</p></div>'
    + '<div class="seg">'+chips+'</div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Índice</th><th>Valor atual</th><th>Valor reajustado</th><th>Vigência</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '<div><button class="btn-dark" data-reaj-confirmar>Confirmar e Notificar</button>'+(s.notified?' <span class="badge badge-ok">Notificações disparadas</span>':'')+'</div>'
    + '</div>';
}
function bindReajusteHonorarios(){
  var s = reajusteState();
  document.querySelectorAll('[data-reaj-indice]').forEach(function(el){
    el.addEventListener('click', function(){
      var k = el.getAttribute('data-reaj-indice'); s.indice = k;
      s.rows.forEach(function(r){ if (!r.editado){ r.indiceRow = k; r.reajustado = Math.round(r.atual * (1+REAJUSTE_INDICES[k]) * 100)/100; } });
      render();
    });
  });
  document.querySelectorAll('[data-reaj-edit]').forEach(function(el){ el.addEventListener('click', function(){ s.rows[+el.getAttribute('data-reaj-edit')].editing = true; render(); }); });
  document.querySelectorAll('#reaj-input-0,#reaj-input-1,#reaj-input-2').forEach(function(){});
  s.rows.forEach(function(r,i){
    var input = document.getElementById('reaj-input-'+i);
    if (input) input.addEventListener('blur', function(){
      var v = parseFloat(input.value.replace(',','.'));
      if (!isNaN(v)){ r.reajustado = v; r.editado = true; }
      r.editing = false; render();
    });
  });
  var confirmBtn = document.querySelector('[data-reaj-confirmar]');
  if (confirmBtn) confirmBtn.addEventListener('click', function(){
    s.flashAll = true; render();
    setTimeout(function(){ s.flashAll = false; s.notified = true; render(); }, 400);
  });
}

/* ---- Renovação de contratos (b4): comparativo lado a lado ao vivo ---- */
var RENOV_INDICES = { 'IPCA':0.042, 'INPC':0.045, 'Fixo':null };
function renovState(){ return ex('renovacao-contratos', function(){ return { rows: [
  { cliente:'Padaria do João', contrato:'Honorários mensais', vig:'12 meses', venc:'31/12/2026', status:'Vigente', valor:890, open:false, indice:null, fixoVal:'', gerado:false },
  { cliente:'Oficina Silva', contrato:'Honorários mensais', vig:'12 meses', venc:'30/11/2026', status:'Vigente', valor:650, open:false, indice:null, fixoVal:'', gerado:false },
  { cliente:'Clínica Rosa', contrato:'Honorários mensais', vig:'12 meses', venc:'15/09/2026', status:'Renovação em andamento', valor:1480, open:false, indice:null, fixoVal:'', gerado:false },
  { cliente:'Transportes Veloz', contrato:'Honorários mensais', vig:'12 meses', venc:'28/02/2027', status:'Vigente', valor:720, open:false, indice:null, fixoVal:'', gerado:false }
] }; }); }
function renovNovoValor(r){
  if (!r.indice) return null;
  if (r.indice === 'Fixo') { var v = parseFloat((r.fixoVal||'').replace(',','.')); return isNaN(v) ? null : v; }
  return Math.round(r.valor * (1+RENOV_INDICES[r.indice]) * 100)/100;
}
function renderRenovacaoContratos(){
  var s = renovState();
  var rows = s.rows.map(function(r,i){
    var cmp = '';
    if (r.open){
      var novo = renovNovoValor(r);
      var opts = ['IPCA','INPC','Fixo'].map(function(k){ return '<label class="renov-radio"><input type="radio" name="renov-idx-'+i+'" data-renov-idx="'+i+':'+k+'" '+(r.indice===k?'checked':'')+'> '+k+'</label>'; }).join('');
      cmp = '<div class="renov-compare"><div class="renov-col"><div class="renov-col-title">Contrato Atual</div><div class="renov-val">'+fmtBRL(r.valor)+'</div><div class="g-lbl">Vigência '+r.vig+'</div></div>'
        + '<div class="renov-col renov-col-new"><div class="renov-col-title">Contrato Renovado</div>' + opts
        + (r.indice==='Fixo' ? '<input type="text" placeholder="Novo valor" id="renov-fixo-'+i+'" value="'+esc(r.fixoVal)+'" class="revnfe-edit-input">' : '')
        + '<div class="renov-val">'+(novo!=null?fmtBRL(novo):'—')+'</div>'
        + '<button class="btn-dark" data-renov-gerar="'+i+'" '+(novo==null?'disabled':'')+' style="margin-top:8px">'+(r.gerado?'Aditivo gerado ✓':'Gerar Aditivo')+'</button></div></div>';
    }
    return '<tr><td>'+r.cliente+'</td><td>'+r.contrato+'</td><td>'+r.vig+'</td><td>'+r.venc+'</td><td>'+badge(r.gerado?'Aditivo gerado':r.status)+'</td><td><button class="btn-line" data-renov-toggle="'+i+'">Renovar</button></td></tr>' + (r.open ? '<tr><td colspan="6">'+cmp+'</td></tr>' : '');
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Financeiro</b> &gt; Renovação de contratos</p><h1>Renovação de contratos</h1><p>Acompanha vigências e compara o contrato atual com o renovado ao vivo, conforme o índice escolhido.</p></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Contrato</th><th>Vigência</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>';
}
function bindRenovacaoContratos(){
  var s = renovState();
  document.querySelectorAll('[data-renov-toggle]').forEach(function(el){ el.addEventListener('click', function(){ var i=+el.getAttribute('data-renov-toggle'); s.rows[i].open = !s.rows[i].open; render(); }); });
  document.querySelectorAll('[data-renov-idx]').forEach(function(el){
    el.addEventListener('change', function(){ var parts = el.getAttribute('data-renov-idx').split(':'); s.rows[+parts[0]].indice = parts[1]; render(); });
  });
  s.rows.forEach(function(r,i){
    var fixo = document.getElementById('renov-fixo-'+i);
    if (fixo) fixo.addEventListener('input', function(){ r.fixoVal = fixo.value; render(); });
  });
  document.querySelectorAll('[data-renov-gerar]').forEach(function(el){
    el.addEventListener('click', function(){ var i = +el.getAttribute('data-renov-gerar'); s.rows[i].gerado = true; render(); });
  });
}

/* ---- Folha interna (sem ficha própria — tratamento leve e único) ---- */
var FOLHAINT_ROWS = [
  { func:'João Silva', cargo:'Sócio-administrador', base:8500, desc:1700, liquido:6800 },
  { func:'Carla Mendes', cargo:'Contadora', base:5200, desc:890, liquido:4310 },
  { func:'Marcos Tavares', cargo:'Analista fiscal', base:3800, desc:590, liquido:3210 },
  { func:'Ana Paula Costa', cargo:'Analista de DP', base:3600, desc:540, liquido:3060 }
];
function folhaintState(){ return ex('folha-interna', function(){ return { processed:false, processing:false }; }); }
function renderFolhaInterna(){
  var s = folhaintState();
  var total = FOLHAINT_ROWS.reduce(function(a,r){return a+r.liquido;},0);
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Financeiro</b> &gt; Folha interna</p><h1>Folha interna</h1><p>A folha do próprio escritório — sócios e equipe interna — processada automaticamente todo mês.</p></div>'
    + (!s.processed
      ? '<div class="card card-pad" style="text-align:center;"><p style="color:var(--fg-muted);font-size:13px;margin-bottom:12px;">Folha de Agosto/2026 ainda não processada.</p><button class="btn-dark" data-folhaint-processar>'+(s.processing?sp()+' Processando...':'Processar Folha Interna')+'</button></div>'
      : '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Funcionário</th><th>Cargo</th><th>Salário base</th><th>Descontos</th><th>Líquido</th><th>Status</th></tr></thead><tbody>'
        + FOLHAINT_ROWS.map(function(r){ return '<tr><td>'+r.func+'</td><td>'+r.cargo+'</td><td>'+fmtBRL(r.base)+'</td><td>'+fmtBRL(r.desc)+'</td><td class="strong">'+fmtBRL(r.liquido)+'</td><td>'+badge('Processada')+'</td></tr>'; }).join('')
        + '</tbody></table></div><div class="totals-footer"><span>Total líquido da folha interna <b class="tnum">'+fmtBRL(total)+'</b></span></div></div>')
    + '</div>';
}
function bindFolhaInterna(){
  var btn = document.querySelector('[data-folhaint-processar]');
  if (!btn) return;
  btn.addEventListener('click', function(){
    var s = folhaintState();
    if (s.processing) return;
    s.processing = true; render();
    setTimeout(function(){ s.processing = false; s.processed = true; render(); }, 1000);
  });
}

/* ============================================================================
   ATENDIMENTO
   ============================================================================ */

/* ---- Cobrança de doc pendente (b6): quadro por cliente, botão por item ---- */
function cobrancaDocState(){ return ex('cobranca-doc', function(){ return { clientes: [
  { cliente:'Padaria do João', docs:[ { nome:'Extrato bancário de julho', kind:'warn', nota:'Lembrete enviado (2x)', count:2 } ] },
  { cliente:'Mercado Bom Preço', docs:[ { nome:'Comprovantes de despesas de agosto', kind:'warn', nota:'Lembrete enviado', count:1 } ] },
  { cliente:'Oficina Silva', docs:[ { nome:'Extrato bancário de julho', kind:'ok', nota:'Recebido' } ] }
], log: [
  ['19/08','Padaria do João','Lembrete #2 enviado — extrato bancário de julho','info'],
  ['18/08','Mercado Bom Preço','Lembrete #1 enviado — comprovantes de despesas de agosto','info'],
  ['15/08','Oficina Silva','Documento recebido — extrato bancário de julho','sucesso']
] }; }); }
function docKindIcon(k){ return k==='ok' ? icon('check') : (k==='warn' ? icon('clock') : ''); }
function tickText(ts){
  var segs = Math.max(0, Math.floor((Date.now()-ts)/1000));
  if (segs < 60) return 'Lembrete enviado há ' + segs + (segs===1?' segundo':' segundos');
  var mins = Math.floor(segs/60);
  return 'Lembrete enviado há ' + mins + (mins===1?' minuto':' minutos');
}
function renderCobrancaDoc(){
  var s = cobrancaDocState();
  var cards = s.clientes.map(function(c,ci){
    var items = c.docs.map(function(d,di){
      var notaTexto = d.enviadoEm ? tickText(d.enviadoEm) : d.nota;
      var botao = (d.kind !== 'ok' && !d.enviadoEm) ? '<button class="link-btn" data-cobdoc-lembrete="'+ci+':'+di+'">Enviar lembrete agora</button>' : '';
      return '<div class="doc-item"><span class="doc-dot doc-dot-'+d.kind+'">'+docKindIcon(d.kind)+'</span><span class="doc-name">'+d.nome+'</span>'
        + botao
        + '<div class="doc-nota">'+notaTexto+'</div></div>';
    }).join('');
    return '<div class="card card-pad doc-client-card"><div class="strong" style="margin-bottom:8px;">'+c.cliente+'</div>'+items+'</div>';
  }).join('');
  var logItems = s.log.map(function(e){ return '<div class="log-item"><span class="log-dot '+e[3]+'"></span><div><div class="log-text"><b>'+e[1]+'</b> — '+e[2]+'</div><div class="log-meta">'+e[0]+'</div></div></div>'; }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Atendimento</b> &gt; Cobrança de doc pendente</p><h1>Cobrança de Documentação Pendente</h1><p>O contador não cobra ninguém — o agente mostra o que falta agora, por cliente, e reforça sozinho até o documento chegar.</p></div>'
    + '<div class="grid3">'+cards+'</div>'
    + '<div class="card"><div class="card-head"><h2>Histórico</h2></div><div class="card-pad">'+logItems+'</div></div>'
    + '</div>';
}
function bindCobrancaDoc(){
  var s = cobrancaDocState();
  document.querySelectorAll('[data-cobdoc-lembrete]').forEach(function(el){
    el.addEventListener('click', function(){
      var parts = el.getAttribute('data-cobdoc-lembrete').split(':'); var ci=+parts[0], di=+parts[1];
      var d = s.clientes[ci].docs[di];
      d.count = (d.count||0) + 1;
      d.kind = 'warn'; d.enviadoEm = Date.now();
      s.log.unshift(['23/08', s.clientes[ci].cliente, 'Lembrete #'+d.count+' enviado — '+d.nome, 'info']);
      if (!s.tickInterval){
        s.tickInterval = setInterval(function(){
          if (currentRoute() !== 'automacao/cobranca-doc'){ clearInterval(s.tickInterval); s.tickInterval = null; return; }
          render();
        }, 1000);
      }
      render();
    });
  });
}

/* ---- Relatórios periódicos (sem ficha própria — tratamento leve) ---- */
function relperiodState(){ return ex('relatorios-periodicos', function(){ return { rows: [
  { cliente:'Padaria do João', pacote:'DRE + fluxo de caixa', freq:'Mensal', proximo:'05/09/2026', status:'Configurado', sending:false },
  { cliente:'Clínica Rosa', pacote:'DRE + indicadores', freq:'Mensal', proximo:'05/09/2026', status:'Configurado', sending:false },
  { cliente:'Transportes Veloz', pacote:'DRE resumida', freq:'Quinzenal', proximo:'22/08/2026', status:'Configurado', sending:false },
  { cliente:'Mercado Bom Preço', pacote:'—', freq:'—', proximo:'—', status:'Não configurado', sending:false, configuring:false }
] }; }); }
function renderRelatoriosPeriodicos(){
  var s = relperiodState();
  var rows = s.rows.map(function(r,i){
    var action = r.status==='Não configurado'
      ? (r.configuring ? '<button class="btn-confirm" data-relperiod-configurar="'+i+'">Salvar (DRE mensal)</button>' : '<button class="btn-line" data-relperiod-abrir="'+i+'">Configurar</button>')
      : '<button class="btn-line" data-relperiod-enviar="'+i+'">'+(r.sending?sp()+' Enviando...':'Enviar agora')+'</button>';
    return '<tr><td>'+r.cliente+'</td><td>'+r.pacote+'</td><td>'+r.freq+'</td><td>'+r.proximo+'</td><td>'+badge(r.status)+'</td><td>'+action+'</td></tr>';
  }).join('');
  return '<div class="page">'
    + '<div class="page-head"><p class="crumbline"><b>Atendimento</b> &gt; Relatórios periódicos</p><h1>Relatórios periódicos</h1><p>Configura e envia o pacote de relatórios mensal de cada cliente.</p></div>'
    + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Pacote</th><th>Frequência</th><th>Próximo envio</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
    + '</div>';
}
function bindRelatoriosPeriodicos(){
  var s = relperiodState();
  document.querySelectorAll('[data-relperiod-abrir]').forEach(function(el){ el.addEventListener('click', function(){ s.rows[+el.getAttribute('data-relperiod-abrir')].configuring = true; render(); }); });
  document.querySelectorAll('[data-relperiod-configurar]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-relperiod-configurar'); var r = s.rows[i];
      r.pacote = 'DRE mensal'; r.freq = 'Mensal'; r.proximo = '05/09/2026'; r.status = 'Configurado'; r.configuring = false; render();
    });
  });
  document.querySelectorAll('[data-relperiod-enviar]').forEach(function(el){
    el.addEventListener('click', function(){
      var i = +el.getAttribute('data-relperiod-enviar'); var r = s.rows[i];
      if (r.sending) return;
      r.sending = true; render();
      setTimeout(function(){ r.sending = false; r.proximo = '23/08/2026'; render(); }, 800);
    });
  });
}

/* ---- Onboarding de clientes (c6): toggle "ver como o cliente vê" ---- */
var ONBOARDING_STEPS = [
  { texto:'Criar estrutura de pastas', status:'ok' },
  { texto:'Coletar documentos societários', status:'ok' },
  { texto:'Roteiro de procuração enviado', status:'andamento' },
  { texto:'Levantar situação fiscal (pendências do contador anterior)', status:'pendente' },
  { texto:'Cadastrar funcionários (se houver)', status:'pendente' }
];
function onboardingState(){ return ex('onboarding-clientes', function(){ return { clienteView:false }; }); }
function renderOnboarding(){
  var s = onboardingState();
  var done = ONBOARDING_STEPS.filter(function(i){return i.status==='ok';}).length;
  var pct = Math.round(done/ONBOARDING_STEPS.length*100);
  var internal = '<div class="card card-pad">'+ONBOARDING_STEPS.map(function(st){
    var ic = st.status==='ok' ? icon('checkcircle') : (st.status==='andamento' ? icon('clock') : '<span class="step-empty"></span>');
    var col = st.status==='ok' ? 'color:var(--success-600)' : (st.status==='andamento' ? 'color:var(--warning-600)' : 'color:var(--slate-400)');
    return '<div class="step-row"><span style="'+col+';display:inline-flex;">'+ic+'</span><span style="'+(st.status==='pendente'?'color:var(--slate-400)':'')+'">'+st.texto+'</span></div>';
  }).join('')+'</div>';
  var clientView = '<div class="client-view-card"><div class="progress-track" style="height:14px;"><div class="progress-fill" style="width:'+pct+'%;background:var(--brand-500)"></div></div><p class="client-view-text">Seu escritório está preparando tudo — '+pct+'% concluído</p></div>';
  return '<div class="page">'
    + '<div class="page-head-flex"><div class="page-head" style="margin:0;"><p class="crumbline"><b>Atendimento</b> &gt; Onboarding de clientes</p><h1>Salão Beleza Rara ME</h1><p>Onboarding — migração de outro contador</p></div>'
    + '<button class="btn-line" data-onboarding-toggle>'+(s.clienteView?'Ver como o contador vê':'Ver como o cliente vê')+'</button></div>'
    + (s.clienteView ? clientView : internal)
    + '</div>';
}
function bindOnboarding(){
  var btn = document.querySelector('[data-onboarding-toggle]');
  if (btn) btn.addEventListener('click', function(){ var s = onboardingState(); s.clienteView = !s.clienteView; render(); });
}

/* ============================================================================
   NÍVEL 1 — Dashboard, Efficience/ROI, Obrigações, Processos, Logs, Regras,
   Usuários, Clientes, Login
   ============================================================================ */

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
      + procMini('Abertura Nova Empresa Ltda','4/9 etapas',44)
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

function renderObrigacoes(){
  var cols = ['Obrigação','Cliente','Vencimento','Dias','Status'];
  var rows = [['DAS ago/26','Padaria do João','20/08/2026','Hoje','Vencida'],['DAS ago/26','Oficina Silva','20/08/2026','Hoje','Vencida'],['DAS ago/26','Transportes Veloz','20/08/2026','Hoje','Paga'],['DARF IRPJ tri','Clínica Rosa','25/08/2026','5 dias','Pendente'],['DCTFWeb ago/26','Mercado Bom Preço','25/08/2026','5 dias','Pendente'],['SPED Fiscal','Padaria do João','30/08/2026','10 dias','Pendente'],['EFD-Contribuições','Oficina Silva','30/08/2026','10 dias','Pendente'],['EFD-Reinf ago/26','Clínica Rosa','15/09/2026','26 dias','Pendente']];
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Obrigações</h1><div style="display:flex;gap:10px;"><span class="filter">Mês: agosto 2026</span><span class="filter">Cliente: Todos</span></div></div>'
  + '<div class="card">'+table(cols, rows)+'<div class="footnote">DAS — guia mensal do Simples Nacional (vence dia 20) · DARF — Lucro Presumido/Real · DCTF — débitos e créditos tributários federais · SPED — escrituração fiscal digital · EFD-Reinf — retenções e contribuições.</div></div></div>';
}

function renderProcessos(){
  var folha = [['Padaria do João',100,'Concluído'],['Oficina Silva',100,'Concluído'],['Clínica Rosa',100,'Concluído'],['Transportes Veloz',100,'Concluído'],['Mercado Bom Preço',30,'Em andamento']];
  var folhaRows = folha.map(function(f){ var col = f[1]===100?'var(--success-600)':'var(--warning-600)'; return '<div class="proc-row"><div class="proc-top"><span class="proc-name">'+f[0]+'</span><span style="font-size:12.5px;color:var(--fg-muted)">'+(f[1]/10)+'/10 etapas</span></div><div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:'+f[1]+'%;background:'+col+'"></div></div><span class="proc-pct tnum">'+f[1]+'%</span>'+badge(f[2])+'</div></div>'; }).join('');
  var aberturaSteps = ['Verificar viabilidade do nome empresarial','Registrar na Junta Comercial','Gerar contrato social','Obter CNPJ na Receita Federal'];
  var steps = aberturaSteps.map(function(s){ return '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slate-700);padding:3px 0;">'+icon('checkcircle')+s+'</div>'; }).join('')
    + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--slate-400);padding:3px 0;"><span class="step-empty"></span>Registrar no município (Alvará)…</div>';
  return '<div class="page"><div class="page-head"><h1>Processos</h1></div>'
  + '<div class="card card-pad"><h2 style="margin:0 0 4px;font-size:16px;font-weight:600;">Folha de agosto/2026</h2>'+folhaRows+'</div>'
  + '<div class="card card-pad"><h2 style="margin:0 0 4px;font-size:16px;font-weight:600;">Outros processos</h2>'
    + '<div class="proc-row"><div class="proc-top"><span class="proc-name">Abertura Nova Empresa Ltda</span>'+badge('4/9 · Em andamento','warn')+'</div><div class="proc-bar" style="margin-bottom:12px;"><div class="progress-track"><div class="progress-fill" style="width:44%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">44%</span></div>'+steps+'</div>'
    + '<div class="proc-row"><div class="proc-top"><span class="proc-name">Alteração contratual — Oficina Silva ME</span>'+badge('3/6 · Em andamento','warn')+'</div><div class="proc-bar"><div class="progress-track"><div class="progress-fill" style="width:50%;background:var(--warning-600)"></div></div><span class="proc-pct tnum">50%</span></div><p style="margin:6px 0 0;font-size:12.5px;color:var(--fg-muted);">Mudança de endereço + nova atividade</p></div>'
  + '</div></div>';
}

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

function renderUsuarios(){
  var rows = [['JS','João Silva','joao@escritoriopereira.com.br','Admin','Agora',false],['CM','Carla Mendes','carla@escritoriopereira.com.br','Funcionária','Hoje 14:20',true],['MT','Marcos Tavares','marcos@escritoriopereira.com.br','Funcionário','Ontem 09:15',true],['AC','Ana Paula Costa','ana@escritoriopereira.com.br','Funcionária','15/08 16:40',true]];
  var body = rows.map(function(r){ return '<tr><td><span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:var(--brand-100);color:var(--brand-800);font-size:11.5px;font-weight:700;margin-right:10px;">'+r[0]+'</span>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td>'+r[4]+'</td><td><button class="link-btn">Editar</button>'+(r[5]?'<button class="link-btn">Remover</button>':'')+'</td></tr>'; }).join('');
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Usuários</h1><button class="btn-dark">'+icon('plus')+' Novo usuário</button></div>'
  + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>'+body+'</tbody></table></div><div class="footnote">Funcionários têm acesso ao dashboard mas não gerenciam regras, usuários ou configurações.</div></div></div>';
}

function renderAdmin(){
  var body = CLIENTES.map(function(c){ return '<tr><td class="strong">'+c.nome+'</td><td class="mono">'+c.cnpj+'</td><td>'+c.regime+'</td><td>'+c.func+'</td><td>'+badge('Ativo','ok')+'</td><td><button class="link-btn">Ver detalhes</button><button class="link-btn">Editar</button></td></tr>'; }).join('');
  return '<div class="page"><div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;"><h1>Clientes do escritório</h1><button class="btn-dark">'+icon('plus')+' Novo cliente</button></div>'
  + '<div class="grid4"><div class="stat"><div class="stat-label">Clientes ativos</div><div class="stat-value tnum">5</div></div><div class="stat"><div class="stat-label">Automações este mês</div><div class="stat-value tnum">312</div></div><div class="stat"><div class="stat-label">Obrigações em atraso</div><div class="stat-value tnum" style="color:var(--danger-700)">3</div></div><div class="stat"><div class="stat-label">Licença</div><div class="stat-value" style="font-size:18px;">Válida — ago/2027</div></div></div>'
  + '<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>CNPJ</th><th>Regime tributário</th><th>Funcionários</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+body+'</tbody></table></div></div></div>';
}

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

/* ---------- router / dispatch ---------- */
var BESPOKE = {
  'escrituracao-nfe': renderEscrituracao, 'apuracao-simples': renderApuracaoSimples, 'apuracao-presumido': renderApuracaoPresumido,
  'emissao-das-darf': renderEmissaoGuias, 'retencoes-fonte': renderRetencoesFonte, 'revisao-nfe': renderRevisaoNfe,
  'ncm-cfop': renderNcmCfop, 'sped-fiscal': renderSpedFiscal, 'efd-contribuicoes': renderEfdContribuicoes,
  'dctf-web': renderDctfWeb, 'efd-reinf': renderEfdReinf, 'alerta-aliquota': renderAlertaAliquota,
  'conciliacao-bancaria': renderConciliacao, 'balancete-mensal': renderBalanceteMensal, 'relatorios-gerenciais': renderRelatoriosGerenciais,
  'depreciacao': renderDepreciacao, 'conciliacao-contas': renderConciliacaoContas, 'encerramento-exercicio': renderEncerramentoExercicio,
  'folha-pagamento': renderFolha, 'ferias': renderFerias, 'decimo-terceiro': renderDecimoTerceiro,
  'esocial': renderEsocial, 'atestados': renderAtestados, 'fgts-inss': renderFgtsInss,
  'horas-extras': renderHorasExtras, 'vt-vr': renderVtVr, 'admissao-funcionario': renderAdmissaoFuncionario,
  'abertura-empresa': renderAbertura, 'alteracao-contratual': renderAlteracaoContratual, 'baixa-empresa': renderBaixaEmpresa,
  'alvaras-licencas': renderAlvarasLicencas, 'certificado-digital': renderCertificadoDigital, 'procuracoes': renderProcuracoes,
  'regularizacao-cadastral': renderRegularizacaoCadastral,
  'honorarios-boletos': renderHonorarios, 'cobranca-inadimplentes': renderCobrancaInadimplentes, 'reajuste-honorarios': renderReajusteHonorarios,
  'renovacao-contratos': renderRenovacaoContratos, 'folha-interna': renderFolhaInterna,
  'cobranca-doc': renderCobrancaDoc, 'relatorios-periodicos': renderRelatoriosPeriodicos, 'onboarding-clientes': renderOnboarding
};
var BESPOKE_BIND = {
  'escrituracao-nfe': bindEscrituracao, 'apuracao-simples': bindApuracaoSimples, 'apuracao-presumido': bindApuracaoPresumido,
  'emissao-das-darf': bindEmissaoGuias, 'retencoes-fonte': bindRetencoesFonte, 'revisao-nfe': bindRevisaoNfe,
  'ncm-cfop': bindNcmCfop, 'sped-fiscal': bindSpedFiscal, 'efd-contribuicoes': bindEfdContribuicoes,
  'dctf-web': bindDctfWeb, 'efd-reinf': bindEfdReinf, 'alerta-aliquota': bindAlertaAliquota,
  'conciliacao-bancaria': bindConciliacao, 'balancete-mensal': bindBalanceteMensal, 'relatorios-gerenciais': bindRelatoriosGerenciais,
  'depreciacao': bindDepreciacao, 'conciliacao-contas': bindConciliacaoContas, 'encerramento-exercicio': bindEncerramentoExercicio,
  'folha-pagamento': bindFolha, 'ferias': bindFerias, 'decimo-terceiro': bindDecimoTerceiro,
  'esocial': bindEsocial, 'atestados': bindAtestados, 'fgts-inss': bindFgtsInss,
  'horas-extras': bindHorasExtras, 'vt-vr': bindVtVr, 'admissao-funcionario': bindAdmissaoFuncionario,
  'abertura-empresa': bindAbertura, 'alteracao-contratual': bindAlteracaoContratual, 'baixa-empresa': bindBaixaEmpresa,
  'alvaras-licencas': bindAlvarasLicencas, 'certificado-digital': bindCertificadoDigital, 'procuracoes': bindProcuracoes,
  'regularizacao-cadastral': bindRegularizacaoCadastral,
  'honorarios-boletos': bindHonorarios, 'cobranca-inadimplentes': bindCobrancaInadimplentes, 'reajuste-honorarios': bindReajusteHonorarios,
  'renovacao-contratos': bindRenovacaoContratos, 'folha-interna': bindFolhaInterna,
  'cobranca-doc': bindCobrancaDoc, 'relatorios-periodicos': bindRelatoriosPeriodicos, 'onboarding-clientes': bindOnboarding
};
function currentRoute(){ return (location.hash || '#dashboard').slice(1); }
function pageFor(route){
  if (route.indexOf('automacao/') === 0){
    var a = AUT_BY_ID[route.slice('automacao/'.length)];
    if (!a || !BESPOKE[a.id]) return renderDashboard();
    return BESPOKE[a.id]();
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

  /* render() substitui o innerHTML inteiro a cada chamada — sem isso, todo
     campo de texto perde o foco a cada tecla digitada (o handler de input
     chama render() pra validar/atualizar a tela em tempo real). Guarda o
     campo focado (pelos atributos data- e id) e a posição do cursor antes
     de substituir o DOM, e restaura depois de religar os binds. */
  var focusInfo = null;
  var activeEl = document.activeElement;
  if (activeEl && app.contains(activeEl) && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')){
    var sel = activeEl.tagName.toLowerCase();
    if (activeEl.id) sel += '#' + CSS.escape(activeEl.id);
    for (var i=0;i<activeEl.attributes.length;i++){
      var attr = activeEl.attributes[i];
      if (attr.name.indexOf('data-') === 0) sel += '[' + attr.name + '="' + CSS.escape(attr.value) + '"]';
    }
    focusInfo = { sel: sel, start: activeEl.selectionStart, end: activeEl.selectionEnd };
  }

  var route = currentRoute();
  app.innerHTML = '<div class="shell">' + renderSidebar(activeNavKey(route)) + '<div class="main">' + renderTopbar(activeNavKey(route)) + '<div class="scroll">' + pageFor(route) + '</div></div></div>';
  bindShell();
  if (route.indexOf('automacao/') === 0){
    var a = AUT_BY_ID[route.slice(10)];
    if (a && BESPOKE_BIND[a.id]) BESPOKE_BIND[a.id]();
  }

  if (focusInfo){
    try {
      var el = document.querySelector(focusInfo.sel);
      if (el){
        el.focus();
        if (typeof focusInfo.start === 'number' && el.setSelectionRange) el.setSelectionRange(focusInfo.start, focusInfo.end);
      }
    } catch(e){}
  }
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
  if (logoutBtn) logoutBtn.addEventListener('click', function(){ STATE.user = null; STATE.exec = {}; location.hash = '#dashboard'; render(); });

  document.querySelectorAll('[data-roi-period]').forEach(function(el){
    el.addEventListener('click', function(){ roiPeriod = el.getAttribute('data-roi-period'); render(); });
  });
}

window.addEventListener('hashchange', render);
render();
