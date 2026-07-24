/* @ds-bundle: {"format":4,"namespace":"EfficienceCoDesignSystem_ba188a","components":[],"sourceHashes":{"ui_kits/plataforma/App.jsx":"0bf7ffdae835","ui_kits/plataforma/Chrome.jsx":"dc6ebbf75960","ui_kits/plataforma/Dashboard.jsx":"5e96cc19ce85","ui_kits/plataforma/Icons.jsx":"e877e85f76d2","ui_kits/plataforma/Logs.jsx":"96e2121f139a","ui_kits/plataforma/Notificacoes.jsx":"884e44a9547e","ui_kits/plataforma/Obrigacoes.jsx":"df164e780f80","ui_kits/plataforma/Pessoas.jsx":"11d17db6f0e9","ui_kits/plataforma/Processos.jsx":"fa5da7fd1e16","ui_kits/plataforma/Regras.jsx":"f58769384742","ui_kits/plataforma/ui.jsx":"4690de2525ad","ui_kits/site/Icons.jsx":"7c21c7a16be8","ui_kits/site/SiteBody.jsx":"7e2a73b7db41","ui_kits/site/SiteTop.jsx":"0e7930287ed2"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.EfficienceCoDesignSystem_ba188a = window.EfficienceCoDesignSystem_ba188a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/plataforma/App.jsx
try { (() => {
// Efficience Co — Login (dark glass) + App shell wiring
const {
  useState: useStateApp
} = React;
function Login({
  onLogin
}) {
  const [email, setEmail] = useStateApp('victor@andradecontabil.com.br');
  const [senha, setSenha] = useStateApp('demo1234');
  const [loading, setLoading] = useStateApp(false);
  const submit = e => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin({
        nome: 'Victor Almeida',
        email
      });
    }, 600);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "login"
  }, /*#__PURE__*/React.createElement("form", {
    className: "login-card",
    onSubmit: submit
  }, /*#__PURE__*/React.createElement("div", {
    className: "login-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "34",
    height: "34",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "wm"
  }, "Efficience Co")), /*#__PURE__*/React.createElement("div", {
    className: "login-eyebrow"
  }, "Plataforma"), /*#__PURE__*/React.createElement("h1", {
    className: "login-h"
  }, "Entrar na plataforma"), /*#__PURE__*/React.createElement("p", {
    className: "login-sub"
  }, "Use seu e-mail e senha para acessar sua conta."), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "E-mail"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: email,
    placeholder: "voce@empresa.com",
    onChange: e => setEmail(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "Senha"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: senha,
    placeholder: "Digite sua senha",
    onChange: e => setSenha(e.target.value)
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    type: "submit",
    disabled: loading
  }, loading ? 'Entrando…' : 'Entrar'), /*#__PURE__*/React.createElement("div", {
    className: "login-hint"
  }, "Protegido por JWT \xB7 dados tratados conforme a LGPD")));
}
function App() {
  const [user, setUser] = useStateApp(null);
  const [route, setRoute] = useStateApp('dashboard');
  const notifs = useNotifs();
  if (!user) return /*#__PURE__*/React.createElement(Login, {
    onLogin: u => {
      setUser(u);
      setRoute('dashboard');
    }
  });
  let content;
  switch (route) {
    case 'dashboard':
      content = /*#__PURE__*/React.createElement(DashboardPage, {
        onNavigate: setRoute
      });
      break;
    case 'obrigacoes':
      content = /*#__PURE__*/React.createElement(ObrigacoesPage, null);
      break;
    case 'processos':
      content = /*#__PURE__*/React.createElement(ProcessosPage, null);
      break;
    case 'regras':
      content = /*#__PURE__*/React.createElement(RegrasPage, null);
      break;
    case 'logs':
      content = /*#__PURE__*/React.createElement(LogsPage, null);
      break;
    case 'clientes':
      content = /*#__PURE__*/React.createElement(ClientesPage, null);
      break;
    case 'usuarios':
      content = /*#__PURE__*/React.createElement(UsuariosPage, null);
      break;
    case 'escritorios':
      content = /*#__PURE__*/React.createElement(EscritoriosPage, null);
      break;
    case 'notificacoes':
      content = /*#__PURE__*/React.createElement(NotificacoesPage, {
        store: notifs
      });
      break;
    default:
      content = /*#__PURE__*/React.createElement(DashboardPage, {
        onNavigate: setRoute
      });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement(Sidebar, {
    route: route,
    user: user,
    onNavigate: setRoute,
    onLogout: () => setUser(null)
  }), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, /*#__PURE__*/React.createElement(Topbar, {
    route: route,
    unread: notifs.unread,
    onBellClick: () => setRoute('notificacoes')
  }), /*#__PURE__*/React.createElement("div", {
    className: "scroll"
  }, content)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Chrome.jsx
try { (() => {
// Efficience Co — app chrome: Logo, Sidebar (dark rail + agent card), Topbar
const {
  useState
} = React;
function Logo({
  size = 30
}) {
  return /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: size,
    height: size,
    alt: "Efficience Co",
    style: {
      display: 'block'
    }
  });
}
const NAV = [{
  key: 'dashboard',
  label: 'Dashboard',
  Icon: IcoDashboard
}, {
  key: 'obrigacoes',
  label: 'Obrigações',
  Icon: IcoObrigacoes
}, {
  key: 'processos',
  label: 'Processos',
  Icon: IcoProcessos
}, {
  key: 'regras',
  label: 'Regras',
  Icon: IcoRegras
}, {
  key: 'logs',
  label: 'Logs do agente',
  Icon: IcoLogs
}];
const NAV_GESTAO = [{
  key: 'clientes',
  label: 'Clientes',
  Icon: IcoClientes
}, {
  key: 'usuarios',
  label: 'Usuários',
  Icon: IcoUsuarios
}];
const NAV_EFFICIENCE = [{
  key: 'escritorios',
  label: 'Escritórios',
  Icon: IcoBuilding2
}];
function NavItem({
  item,
  active,
  onClick
}) {
  const {
    Icon
  } = item;
  return /*#__PURE__*/React.createElement("button", {
    className: 'ni' + (active ? ' active' : ''),
    onClick: onClick
  }, /*#__PURE__*/React.createElement(Icon, null), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, item.label), item.badge ? /*#__PURE__*/React.createElement("span", {
    className: "nbadge"
  }, item.badge) : null);
}
function AgentCard() {
  // weekly automation heights (relative)
  const spark = [38, 52, 44, 70, 60, 88, 100];
  return /*#__PURE__*/React.createElement("div", {
    className: "agent-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "agent-top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "heartbeat"
  }), /*#__PURE__*/React.createElement("span", {
    className: "agent-name"
  }, "Agente local"), /*#__PURE__*/React.createElement("span", {
    className: "agent-state"
  }, "Online")), /*#__PURE__*/React.createElement("div", {
    className: "agent-meta"
  }, "Sincronizou h\xE1 2 min \xB7 1.243 automa\xE7\xF5es hoje"), /*#__PURE__*/React.createElement("div", {
    className: "agent-spark"
  }, spark.map((h, i) => /*#__PURE__*/React.createElement("i", {
    key: i,
    style: {
      height: h + '%'
    }
  }))));
}
function Sidebar({
  route,
  onNavigate,
  onLogout,
  user
}) {
  return /*#__PURE__*/React.createElement("aside", {
    className: "sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-brand"
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 30
  }), /*#__PURE__*/React.createElement("div", {
    className: "sb-wm"
  }, "Efficience ", /*#__PURE__*/React.createElement("span", {
    className: "co"
  }, "Co"))), /*#__PURE__*/React.createElement("nav", {
    className: "sb-nav"
  }, NAV.map(it => /*#__PURE__*/React.createElement(NavItem, {
    key: it.key,
    item: it,
    active: route === it.key,
    onClick: () => onNavigate(it.key)
  })), /*#__PURE__*/React.createElement("div", {
    className: "sb-section"
  }, "Gest\xE3o \xB7 admin do escrit\xF3rio"), NAV_GESTAO.map(it => /*#__PURE__*/React.createElement(NavItem, {
    key: it.key,
    item: it,
    active: route === it.key,
    onClick: () => onNavigate(it.key)
  })), /*#__PURE__*/React.createElement("div", {
    className: "sb-section"
  }, "Efficience \xB7 suporte"), NAV_EFFICIENCE.map(it => /*#__PURE__*/React.createElement(NavItem, {
    key: it.key,
    item: it,
    active: route === it.key,
    onClick: () => onNavigate(it.key)
  }))), /*#__PURE__*/React.createElement(AgentCard, null), /*#__PURE__*/React.createElement("div", {
    className: "sb-user"
  }, /*#__PURE__*/React.createElement("span", {
    className: "avatar"
  }, (user?.nome || 'VA').slice(0, 2).toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sb-uname"
  }, user?.nome || 'Victor Almeida'), /*#__PURE__*/React.createElement("div", {
    className: "sb-umail"
  }, user?.email || 'victor@efficience.co')), /*#__PURE__*/React.createElement("button", {
    className: "sb-logout",
    title: "Sair",
    onClick: onLogout
  }, /*#__PURE__*/React.createElement(IcoLogout, null))));
}
const TITLES = {
  dashboard: 'Dashboard',
  obrigacoes: 'Obrigações',
  processos: 'Processos',
  regras: 'Regras',
  logs: 'Logs do agente',
  usuarios: 'Usuários',
  clientes: 'Clientes',
  escritorios: 'Escritórios',
  notificacoes: 'Notificações'
};
function Topbar({
  route,
  unread,
  onBellClick
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crumb"
  }, /*#__PURE__*/React.createElement("span", null, "Plataforma"), /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "here"
  }, TITLES[route] || 'Dashboard')), /*#__PURE__*/React.createElement("div", {
    className: "tb-actions"
  }, /*#__PURE__*/React.createElement("div", {
    className: "competencia"
  }, /*#__PURE__*/React.createElement(IcoObrigacoes, null), " Compet\xEAncia \xB7 Maio 2026"), /*#__PURE__*/React.createElement("div", {
    className: "icon-btn",
    title: "Buscar"
  }, /*#__PURE__*/React.createElement(IcoSearch, null)), /*#__PURE__*/React.createElement("div", {
    className: "icon-btn",
    title: "Notifica\xE7\xF5es",
    onClick: onBellClick
  }, /*#__PURE__*/React.createElement(IcoBell, null), unread ? /*#__PURE__*/React.createElement("span", {
    className: "ping"
  }) : null)));
}
Object.assign(window, {
  Logo,
  Sidebar,
  Topbar,
  NAV,
  NAV_GESTAO,
  NAV_EFFICIENCE
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Dashboard.jsx
try { (() => {
// Efficience Co — Dashboard cockpit
function Card2({
  title,
  tico: Tico,
  desc,
  action,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "card2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "card2-title"
  }, Tico ? /*#__PURE__*/React.createElement("span", {
    className: "tico"
  }, /*#__PURE__*/React.createElement(Tico, null)) : null, title), desc ? /*#__PURE__*/React.createElement("div", {
    className: "card2-desc"
  }, desc) : null), action || null), children);
}

/* ---- Focus: next critical deadline ---- */
function FocusCard({
  onPrep
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "focus"
  }, /*#__PURE__*/React.createElement("div", {
    className: "focus-eyebrow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), " Pr\xF3ximo vencimento cr\xEDtico"), /*#__PURE__*/React.createElement("div", {
    className: "focus-name"
  }, "DAS \u2014 Simples Nacional"), /*#__PURE__*/React.createElement("div", {
    className: "focus-sub"
  }, "Contabilidade Andrade ME \xB7 14 guias a emitir"), /*#__PURE__*/React.createElement("div", {
    className: "focus-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "countdown"
  }, /*#__PURE__*/React.createElement("span", {
    className: "big tnum"
  }, "3"), /*#__PURE__*/React.createElement("span", {
    className: "lbl"
  }, "dias")), /*#__PURE__*/React.createElement("div", {
    className: "focus-meta"
  }, /*#__PURE__*/React.createElement("span", null, "Vence em ", /*#__PURE__*/React.createElement("b", null, "20/05/2026")), /*#__PURE__*/React.createElement("span", null, "Compet\xEAncia ", /*#__PURE__*/React.createElement("b", null, "04/2026")), /*#__PURE__*/React.createElement("span", null, "Valor estimado ", /*#__PURE__*/React.createElement("b", null, "R$ 18.420,00")))), /*#__PURE__*/React.createElement("div", {
    className: "focus-cta"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, /*#__PURE__*/React.createElement(IcoBolt, null), " Preparar guias"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-onfocus"
  }, "Ver obriga\xE7\xE3o")));
}
function Kpi({
  Icon,
  label,
  value,
  trend,
  dir
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi-ico"
  }, /*#__PURE__*/React.createElement(Icon, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "kpi-label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "kpi-value tnum"
  }, value)), /*#__PURE__*/React.createElement("div", {
    className: 'kpi-trend ' + dir
  }, trend));
}
function KpiStack() {
  return /*#__PURE__*/React.createElement("div", {
    className: "kpi-stack"
  }, /*#__PURE__*/React.createElement(Kpi, {
    Icon: IcoObrigacoes,
    label: "Obriga\xE7\xF5es abertas",
    value: "38",
    trend: "\u22126",
    dir: "up"
  }), /*#__PURE__*/React.createElement(Kpi, {
    Icon: IcoProcessos,
    label: "Processos ativos",
    value: "142",
    trend: "+12",
    dir: "flat"
  }), /*#__PURE__*/React.createElement(Kpi, {
    Icon: IcoBolt,
    label: "Horas poupadas / m\xEAs",
    value: "96h",
    trend: "+18%",
    dir: "up"
  }));
}

/* ---- Obligations calendar (May 2026, today = 17) ---- */
const MARKS = {
  8: 'ok',
  15: 'err',
  20: 'warn',
  23: 'warn',
  28: 'ok',
  31: 'warn'
};
function buildMonth() {
  // May 2026 starts on Friday (index 5, Sun=0). 31 days.
  const lead = 5,
    days = 31;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({
    n: 26 + i,
    muted: true
  });
  for (let d = 1; d <= days; d++) cells.push({
    n: d
  });
  let nx = 1;
  while (cells.length % 7 !== 0) cells.push({
    n: nx++,
    muted: true
  });
  return cells;
}
function ObligationsCalendar() {
  const cells = buildMonth();
  const dow = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  return /*#__PURE__*/React.createElement(Card2, {
    title: "Calend\xE1rio de obriga\xE7\xF5es",
    tico: IcoObrigacoes,
    desc: "Maio \xB7 2026"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cal-grid"
  }, dow.map((d, i) => /*#__PURE__*/React.createElement("div", {
    className: "cal-dow",
    key: 'h' + i
  }, d)), cells.map((c, i) => {
    const mk = !c.muted ? MARKS[c.n] : null;
    const today = !c.muted && c.n === 17;
    return /*#__PURE__*/React.createElement("div", {
      className: 'cal-day' + (c.muted ? ' muted' : '') + (today ? ' today' : ''),
      key: i
    }, c.n, mk ? /*#__PURE__*/React.createElement("span", {
      className: 'mk ' + mk
    }) : null);
  })), /*#__PURE__*/React.createElement("div", {
    className: "cal-legend"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--success-500)'
    }
  }), " Entregue"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--warning-500)'
    }
  }), " A vencer"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
    style: {
      background: 'var(--danger-500)'
    }
  }), " Em atraso"))));
}

/* ---- Agent automation activity ---- */
const WEEK = [['seg', 62], ['ter', 88], ['qua', 71], ['qui', 96], ['sex', 120], ['sáb', 34], ['hoje', 142]];
function AgentActivity() {
  const max = 150;
  return /*#__PURE__*/React.createElement(Card2, {
    title: "Atividade do agente",
    tico: IcoBolt,
    desc: "Automa\xE7\xF5es executadas \xB7 \xFAltimos 7 dias",
    action: /*#__PURE__*/React.createElement("span", {
      className: "badge badge-ok"
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot"
    }), "conectado")
  }, /*#__PURE__*/React.createElement("div", {
    className: "activity"
  }, /*#__PURE__*/React.createElement("div", {
    className: "activity-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "activity-num tnum"
  }, "613"), /*#__PURE__*/React.createElement("span", {
    className: "activity-cap"
  }, "automa\xE7\xF5es na semana \xB7 +18% vs. anterior")), /*#__PURE__*/React.createElement("div", {
    className: "bars"
  }, WEEK.map(([d, v], i) => /*#__PURE__*/React.createElement("div", {
    className: 'col' + (i === WEEK.length - 1 ? ' peak' : ''),
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "bar",
    style: {
      height: Math.round(v / max * 96) + 'px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "dlabel"
  }, d))))));
}

/* ---- Processos ---- */
const PROC = [['Abertura · Padaria Lopes', 'em andamento', 'var(--brand-500)'], ['Alteração contratual · Vértice', 'em revisão', 'var(--slate-400)'], ['Baixa MEI · J. Santos', 'em atraso', 'var(--danger-500)'], ['Parcelamento · Nova Gestão', 'em andamento', 'var(--brand-500)']];
function Processos({
  onSee
}) {
  return /*#__PURE__*/React.createElement(Card2, {
    title: "Processos",
    tico: IcoProcessos,
    desc: "Andamentos abertos nos escrit\xF3rios.",
    action: /*#__PURE__*/React.createElement("button", {
      className: "btn btn-secondary btn-sm",
      onClick: onSee
    }, "Ver todos")
  }, PROC.map((p, i) => /*#__PURE__*/React.createElement("div", {
    className: "lrow",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "lrow-l"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lrow-tick",
    style: {
      background: p[2]
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lrow-name"
  }, p[0]))), /*#__PURE__*/React.createElement("span", {
    className: 'badge ' + (p[1] === 'em atraso' ? 'badge-err' : 'badge-neutral')
  }, p[1]))));
}

/* ---- Agent event terminal ---- */
const EVENTS = [['10:42', 'OK', '#34D399', 'licença validada · próxima verificação em 24h'], ['10:31', 'INFO', '#94A3B8', 'importou 14 NFS-e do portal municipal'], ['09:58', 'WARN', '#FBBF24', '3 obrigações vencem em < 48h'], ['09:12', 'INFO', '#94A3B8', 'conciliou 212 lançamentos bancários'], ['08:40', 'OK', '#34D399', 'backup automático concluído']];
function AgentEvents() {
  return /*#__PURE__*/React.createElement(Card2, {
    title: "Eventos do agente",
    tico: IcoLogs,
    desc: "Log em tempo real da m\xE1quina do escrit\xF3rio."
  }, /*#__PURE__*/React.createElement("div", {
    className: "terminal"
  }, EVENTS.map((e, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#7DD3FC'
    }
  }, e[0]), ' ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: e[2],
      fontWeight: 600
    }
  }, e[1]), '  ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#CBD5E1'
    }
  }, e[3])))));
}
function DashboardPage({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-head"
  }, /*#__PURE__*/React.createElement("h1", null, "Bom dia, Victor."), /*#__PURE__*/React.createElement("p", null, "3 obriga\xE7\xF5es pedem aten\xE7\xE3o esta semana \u2014 o agente j\xE1 adiantou o operacional.")), /*#__PURE__*/React.createElement("div", {
    className: "cockpit"
  }, /*#__PURE__*/React.createElement(FocusCard, null), /*#__PURE__*/React.createElement(KpiStack, null)), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement(ObligationsCalendar, null), /*#__PURE__*/React.createElement(AgentActivity, null)), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement(Processos, {
    onSee: () => onNavigate('processos')
  }), /*#__PURE__*/React.createElement(AgentEvents, null)));
}
Object.assign(window, {
  Card2,
  DashboardPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Icons.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Efficience Co — line icon set (1.8 stroke, 24px grid, currentColor)
// Mirrors the product's hand-authored SVGs; Lucide-compatible style.
const I = ({
  d,
  children,
  ...p
}) => /*#__PURE__*/React.createElement("svg", _extends({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, p), d ? /*#__PURE__*/React.createElement("path", {
  d: d
}) : children);
const IcoDashboard = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "3.5",
  width: "7",
  height: "7",
  rx: "1.4"
}), /*#__PURE__*/React.createElement("rect", {
  x: "13.5",
  y: "3.5",
  width: "7",
  height: "5",
  rx: "1.4"
}), /*#__PURE__*/React.createElement("rect", {
  x: "13.5",
  y: "11.5",
  width: "7",
  height: "9",
  rx: "1.4"
}), /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "13.5",
  width: "7",
  height: "7",
  rx: "1.4"
}));
const IcoObrigacoes = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M7 3.5v3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M17 3.5v3"
}), /*#__PURE__*/React.createElement("rect", {
  x: "4",
  y: "6.5",
  width: "16",
  height: "14",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 10.5h16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12.5 14.5l-3 3-1.5-1.5"
}));
const IcoProcessos = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "4",
  width: "17",
  height: "16.5",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.5 8h17"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 12h8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 15.5h5"
}));
const IcoLogs = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 5.5h14"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 12h14"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 18.5h9"
}));
const IcoRegras = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "7",
  cy: "7",
  r: "2.4"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "17",
  cy: "17",
  r: "2.4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7 9.4v5.2a2 2 0 0 0 2 2h5.6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M14.6 16.6l-2 0M14.6 16.6l0-2"
}));
const IcoUsuarios = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "8.5",
  r: "3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.8 19c0-2.6 2.3-4.5 5.2-4.5s5.2 1.9 5.2 4.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16.5 7.6a2.6 2.6 0 0 1 0 5.1"
}), /*#__PURE__*/React.createElement("path", {
  d: "M17.5 14.7c1.9.5 3.2 1.9 3.2 3.8"
}));
const IcoBell = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 4a5 5 0 0 0-5 5v3l-1.5 2.3v.7h13v-.7L17 12V9a5 5 0 0 0-5-5Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9.5 18a2.5 2.5 0 0 0 5 0"
}));
const IcoBuilding = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "4.5",
  y: "3.5",
  width: "15",
  height: "17",
  rx: "1.6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8.5 7.5h2M13.5 7.5h2M8.5 11.5h2M13.5 11.5h2M8.5 15.5h7"
}));
const IcoClientes = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M3.5 20.5V8l6-4 6 4v12.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M15.5 11l5 3v6.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.5 20.5h17"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7 11h2M7 14.5h2M11.5 11h.5M11.5 14.5h.5"
}));
const IcoLicense = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 3.2l6.5 2.4v5.1c0 4-2.8 6.6-6.5 8-3.7-1.4-6.5-4-6.5-8V5.6L12 3.2Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9 12l2 2 4-4.2"
}));
const IcoSearch = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "6.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M20 20l-3.5-3.5"
}));
const IcoPlus = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 5v14M5 12h14"
}));
const IcoRefresh = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 11a8 8 0 0 0-13.7-5.2L4 8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 4v4h4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 13a8 8 0 0 0 13.7 5.2L20 16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M20 20v-4h-4"
}));
const IcoLogout = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M14 8l4 4-4 4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M18 12H9"
}));
const IcoChevron = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 6l6 6-6 6"
}));
const IcoChevDown = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M6 9l6 6 6-6"
}));
const IcoChevLeft = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M15 6l-6 6 6 6"
}));
const IcoChevRight = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 6l6 6-6 6"
}));
const IcoBolt = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M13 3 5 13h6l-1 8 8-10h-6l1-8Z"
}));
const IcoCheck = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 12.5l4.5 4.5L19 7"
}));
const IcoClock = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 7.5V12l3 2"
}));
const IcoFilter = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 5.5h16l-6 7v5l-4 2v-7L4 5.5Z"
}));
const IcoUpload = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 15.5V4M12 4 7.5 8.5M12 4l4.5 4.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"
}));
const IcoEdit = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M16.5 4.5l3 3L8 19l-4 1 1-4 11.5-11.5Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M14.5 6.5l3 3"
}));
const IcoTrash = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M4.5 6.5h15M9 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M6.5 6.5 7.5 19a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M10 10v6M14 10v6"
}));
const IcoX = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M6 6l12 12M18 6 6 18"
}));
const IcoCalendarGrid = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M7 3.5v3M17 3.5v3"
}), /*#__PURE__*/React.createElement("rect", {
  x: "4",
  y: "6.5",
  width: "16",
  height: "14",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 10.5h16"
}));
const IcoList = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 6.5h11M9 12h11M9 17.5h11"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"
}));
const IcoFile = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M13 3.5V9h5"
}));
const IcoFolder = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M4 6.5a1.5 1.5 0 0 1 1.5-1.5h3.4a1.5 1.5 0 0 1 1.1.5l1 1.1H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5Z"
}));
const IcoArrowRight = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 12h14M13 6l6 6-6 6"
}));
const IcoUserPlus = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "8",
  r: "3.2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.5 19c0-2.7 2.4-4.7 5.5-4.7 1 0 2 .2 2.8.6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M17.5 13v5M15 15.5h5"
}));
const IcoCheckCircle = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "8.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8.5 12.2l2.4 2.4 4.6-4.8"
}));
const IcoXCircle = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "8.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"
}));
const IcoAlert = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 4.5 21 19H3L12 4.5Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 10v4M12 16.5h.01"
}));
const IcoPower = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 4v8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7.5 7a7 7 0 1 0 9 0"
}));
const IcoMail = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "5.5",
  width: "17",
  height: "13",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "m4.5 7 7.5 5.5L19.5 7"
}));
const IcoShield = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 3.2l6.5 2.4v5.1c0 4-2.8 6.6-6.5 8-3.7-1.4-6.5-4-6.5-8V5.6L12 3.2Z"
}));
const IcoDots = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "6",
  cy: "12",
  r: "1.4"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "1.4"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "18",
  cy: "12",
  r: "1.4"
}));
const IcoBuilding2 = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "4",
  y: "8",
  width: "9",
  height: "12.5",
  rx: "1.2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M13 11.5h6a1 1 0 0 1 1 1v8H13"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7 11.5h2M7 15h2M7 18.5h2M16 14.5h1M16 17.5h1"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 8 8.5 4 13 8"
}));
const IcoLink = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9.5 14.5l5-5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 10.5 6.5 12a3.2 3.2 0 0 0 4.5 4.5l1.5-1.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16 13.5 17.5 12A3.2 3.2 0 0 0 13 7.5L11.5 9"
}));
Object.assign(window, {
  IcoDashboard,
  IcoObrigacoes,
  IcoProcessos,
  IcoLogs,
  IcoRegras,
  IcoUsuarios,
  IcoBell,
  IcoBuilding,
  IcoClientes,
  IcoLicense,
  IcoSearch,
  IcoPlus,
  IcoRefresh,
  IcoLogout,
  IcoChevron,
  IcoChevDown,
  IcoChevLeft,
  IcoChevRight,
  IcoBolt,
  IcoCheck,
  IcoClock,
  IcoFilter,
  IcoUpload,
  IcoEdit,
  IcoTrash,
  IcoX,
  IcoCalendarGrid,
  IcoList,
  IcoFile,
  IcoFolder,
  IcoArrowRight,
  IcoUserPlus,
  IcoCheckCircle,
  IcoXCircle,
  IcoAlert,
  IcoPower,
  IcoMail,
  IcoShield,
  IcoDots,
  IcoBuilding2,
  IcoLink
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Logs.jsx
try { (() => {
// Efficience Co — Logs do Agente: histórico + filtros + paginação
const {
  useState: useStateLg
} = React;
const LOG_TYPES = {
  sucesso: {
    badge: 'ok',
    label: 'Sucesso',
    Icon: IcoCheckCircle,
    color: 'var(--success-600)'
  },
  erro: {
    badge: 'err',
    label: 'Erro',
    Icon: IcoXCircle,
    color: 'var(--danger-600)'
  },
  info: {
    badge: 'neutral',
    label: 'Info',
    Icon: IcoFile,
    color: 'var(--slate-500)'
  }
};
function genLogs() {
  const base = [['sucesso', 'Arquivo movido', 'NFe_2026_0512.xml → /clientes/padaria-do-joao/nfe', 'Organizar NF-e recebidas'], ['info', 'Relatório gerado', 'folha_pagamento_andrade_maio.pdf', 'Backup de folhas de pagamento'], ['sucesso', 'Arquivo renomeado', 'extrato (3).pdf → extrato_lopes_2026-05.pdf', 'Renomear extratos bancários'], ['erro', 'Falha ao mover', 'permissão negada em /entrada/guias — arquivo em uso', 'Arquivar guias pagas'], ['sucesso', 'Licença validada', 'token EFC-2F9A-77C1-B0E4 · próxima verificação em 24h', null], ['sucesso', '212 lançamentos conciliados', 'conta corrente · Mercado Lopes ME', null], ['info', 'Sincronização concluída', '14 documentos importados do portal municipal', null], ['erro', 'CNAE inválido', 'abertura Padaria do João II — revisar formulário', 'Separar documentos de abertura']];
  const rows = [];
  for (let i = 0; i < 24; i++) {
    const b = base[i % base.length];
    const h = (10 - Math.floor(i / 4)).toString().padStart(2, '0');
    const m = (59 - i * 7 % 60).toString().padStart(2, '0');
    rows.push({
      id: i + 1,
      tipo: b[0],
      titulo: b[1],
      detalhe: b[2],
      regra: b[3],
      hora: `17/05 ${h}:${m}`
    });
  }
  return rows;
}
const ALL_LOGS = genLogs();
function LogsPage() {
  const [tipo, setTipo] = useStateLg('all');
  const [page, setPage] = useStateLg(1);
  const perPage = 8;
  const filtered = ALL_LOGS.filter(l => tipo === 'all' || l.tipo === tipo);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const setFilter = t => {
    setTipo(t);
    setPage(1);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Logs do agente",
    sub: "Tudo que o agente local executou na m\xE1quina do escrit\xF3rio."
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Eventos (24h)"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "1.243")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Sucessos"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--success-700)'
    }
  }, "1.231")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Erros"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--danger-700)'
    }
  }, "12")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "\xDAltima sincroniza\xE7\xE3o"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      fontSize: '20px'
    }
  }, "h\xE1 2 min"))), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement(FilterChips, {
    options: [{
      value: 'all',
      label: 'Todos'
    }, {
      value: 'sucesso',
      label: 'Sucesso'
    }, {
      value: 'erro',
      label: 'Erro'
    }, {
      value: 'info',
      label: 'Info'
    }],
    value: tipo,
    onChange: setFilter
  }), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(Dropdown, {
    value: "hoje",
    onChange: () => {},
    options: [{
      value: 'hoje',
      label: 'Hoje'
    }, {
      value: '7d',
      label: 'Últimos 7 dias'
    }, {
      value: '30d',
      label: 'Últimos 30 dias'
    }]
  }), /*#__PURE__*/React.createElement(Search, {
    placeholder: "Buscar no log\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: '120px'
    }
  }, "Tipo"), /*#__PURE__*/React.createElement("th", null, "Evento"), /*#__PURE__*/React.createElement("th", null, "Regra"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: '130px'
    }
  }, "Quando"))), /*#__PURE__*/React.createElement("tbody", null, pageRows.map(l => {
    const T = LOG_TYPES[l.tipo];
    return /*#__PURE__*/React.createElement("tr", {
      key: l.id
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        color: T.color,
        fontWeight: 600,
        fontSize: '12.5px'
      }
    }, /*#__PURE__*/React.createElement(T.Icon, {
      width: "17",
      height: "17",
      style: {
        stroke: 'currentColor',
        fill: 'none',
        strokeWidth: 1.8
      }
    }), T.label)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "cell-name"
    }, l.titulo), /*#__PURE__*/React.createElement("div", {
      className: "cell-sub",
      style: {
        fontFamily: 'var(--font-mono)'
      }
    }, l.detalhe)), /*#__PURE__*/React.createElement("td", null, l.regra ? /*#__PURE__*/React.createElement("span", {
      className: "cell-sub"
    }, l.regra) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--slate-300)'
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("td", {
      className: "cell-mono"
    }, l.hora));
  }))), /*#__PURE__*/React.createElement(Pager, {
    page: page,
    pages: pages,
    total: filtered.length,
    onPage: setPage
  })));
}
Object.assign(window, {
  LogsPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Logs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Notificacoes.jsx
try { (() => {
// Efficience Co — Central de Notificações
const {
  useState: useStateNt
} = React;
const NOTIF_SEED = [{
  id: 1,
  tipo: 'warn',
  titulo: 'Obrigação vencendo',
  desc: 'DAS — Simples Nacional (Padaria do João) vence em 3 dias.',
  time: 'há 12 min',
  unread: true
}, {
  id: 2,
  tipo: 'err',
  titulo: 'Processo parado',
  desc: 'Baixa de MEI — J. Santos está sem movimentação há 5 dias.',
  time: 'há 1 h',
  unread: true
}, {
  id: 3,
  tipo: 'info',
  titulo: 'Arquivo recebido',
  desc: 'O agente importou 14 NF-e do portal municipal.',
  time: 'há 2 h',
  unread: true
}, {
  id: 4,
  tipo: 'ok',
  titulo: 'Pagamento confirmado',
  desc: 'Licença renovada até 12/06/2026.',
  time: 'há 3 h',
  unread: false
}, {
  id: 5,
  tipo: 'warn',
  titulo: 'Obrigação vencendo',
  desc: 'DCTFWeb (Mercado Lopes ME) vence em 6 dias.',
  time: 'ontem',
  unread: false
}, {
  id: 6,
  tipo: 'ok',
  titulo: 'Folha concluída',
  desc: 'Folha de pagamento — Maio (Bella Moda) finalizada.',
  time: 'ontem',
  unread: false
}];
const NOTIF_ICON = {
  warn: IcoAlert,
  err: IcoXCircle,
  info: IcoFile,
  ok: IcoCheckCircle
};
function useNotifs() {
  const [items, setItems] = useStateNt(NOTIF_SEED);
  const unread = items.filter(n => n.unread).length;
  const markAll = () => setItems(is => is.map(n => ({
    ...n,
    unread: false
  })));
  const markOne = id => setItems(is => is.map(n => n.id === id ? {
    ...n,
    unread: false
  } : n));
  return {
    items,
    unread,
    markAll,
    markOne
  };
}
function NotificacoesPage({
  store
}) {
  const {
    items,
    unread,
    markAll,
    markOne
  } = store;
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Notifica\xE7\xF5es",
    sub: "Alertas de obriga\xE7\xF5es, processos e atividade do agente."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary",
    onClick: markAll,
    disabled: !unread
  }, /*#__PURE__*/React.createElement(IcoCheck, null), " Marcar todas como lidas")), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement(FilterChips, {
    options: [{
      value: 'all',
      label: `Todas (${items.length})`
    }, {
      value: 'unread',
      label: `Não lidas (${unread})`
    }],
    value: "all",
    onChange: () => {}
  })), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "notif-list"
  }, items.map(n => {
    const Icon = NOTIF_ICON[n.tipo];
    return /*#__PURE__*/React.createElement("div", {
      key: n.id,
      className: 'notif-item' + (n.unread ? ' unread' : ''),
      onClick: () => markOne(n.id)
    }, /*#__PURE__*/React.createElement("div", {
      className: 'notif-ico ' + n.tipo
    }, /*#__PURE__*/React.createElement(Icon, null)), /*#__PURE__*/React.createElement("div", {
      className: "notif-main"
    }, /*#__PURE__*/React.createElement("div", {
      className: "notif-t"
    }, n.titulo), /*#__PURE__*/React.createElement("div", {
      className: "notif-d"
    }, n.desc)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "notif-time"
    }, n.time), n.unread ? /*#__PURE__*/React.createElement("span", {
      className: "notif-unreaddot"
    }) : null));
  }))));
}
Object.assign(window, {
  NotificacoesPage,
  useNotifs
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Notificacoes.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Obrigacoes.jsx
try { (() => {
// Efficience Co — Obrigações Fiscais: lista + calendário + criar/editar + concluir
const {
  useState: useStateOb
} = React;
const CLIENTES_OPT = [{
  value: 'all',
  label: 'Todos os clientes'
}, {
  value: 'padaria',
  label: 'Padaria do João'
}, {
  value: 'lopes',
  label: 'Mercado Lopes ME'
}, {
  value: 'andrade',
  label: 'Andrade Transportes'
}, {
  value: 'bella',
  label: 'Bella Moda Ltda'
}];
const MES_OPT = [{
  value: '2026-05',
  label: 'Maio · 2026'
}, {
  value: '2026-04',
  label: 'Abril · 2026'
}, {
  value: '2026-06',
  label: 'Junho · 2026'
}];
const STATUS_OPT = [{
  value: 'all',
  label: 'Todas'
}, {
  value: 'pendente',
  label: 'Pendentes'
}, {
  value: 'concluida',
  label: 'Concluídas'
}, {
  value: 'vencida',
  label: 'Vencidas'
}];
const OBRIG_SEED = [{
  id: 1,
  nome: 'DAS — Simples Nacional',
  cliente: 'Padaria do João',
  tipo: 'Tributária',
  venc: '20/05/2026',
  dia: 20,
  status: 'pendente'
}, {
  id: 2,
  nome: 'DCTFWeb — comp. 04',
  cliente: 'Mercado Lopes ME',
  tipo: 'Acessória',
  venc: '23/05/2026',
  dia: 23,
  status: 'pendente'
}, {
  id: 3,
  nome: 'FGTS Digital',
  cliente: 'Andrade Transportes',
  tipo: 'Trabalhista',
  venc: '28/05/2026',
  dia: 28,
  status: 'pendente'
}, {
  id: 4,
  nome: 'EFD-Reinf',
  cliente: 'Bella Moda Ltda',
  tipo: 'Acessória',
  venc: '15/05/2026',
  dia: 15,
  status: 'vencida'
}, {
  id: 5,
  nome: 'ISS — Nota Carioca',
  cliente: 'Padaria do João',
  tipo: 'Municipal',
  venc: '10/05/2026',
  dia: 10,
  status: 'concluida'
}, {
  id: 6,
  nome: 'GPS — INSS',
  cliente: 'Mercado Lopes ME',
  tipo: 'Trabalhista',
  venc: '08/05/2026',
  dia: 8,
  status: 'concluida'
}, {
  id: 7,
  nome: 'DEFIS anual',
  cliente: 'Andrade Transportes',
  tipo: 'Acessória',
  venc: '31/05/2026',
  dia: 31,
  status: 'pendente'
}];
const STATUS_BADGE = {
  pendente: ['warn', 'Pendente'],
  concluida: ['ok', 'Concluída'],
  vencida: ['err', 'Vencida']
};
function ObrigacoesPage() {
  const [tab, setTab] = useStateOb('lista');
  const [status, setStatus] = useStateOb('all');
  const [cliente, setCliente] = useStateOb('all');
  const [mes, setMes] = useStateOb('2026-05');
  const [rows, setRows] = useStateOb(OBRIG_SEED);
  const [editing, setEditing] = useStateOb(null); // obj or 'new' or null
  const [completing, setCompleting] = useStateOb(null);
  const filtered = rows.filter(r => (status === 'all' || r.status === status) && (cliente === 'all' || CLIENTES_OPT.find(c => c.value === cliente)?.label === r.cliente));
  const markDone = id => setRows(rs => rs.map(r => r.id === id ? {
    ...r,
    status: 'concluida'
  } : r));
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Obriga\xE7\xF5es fiscais",
    sub: "Calend\xE1rio fiscal e acess\xF3rio dos clientes do escrit\xF3rio."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setEditing('new')
  }, /*#__PURE__*/React.createElement(IcoPlus, null), " Nova obriga\xE7\xE3o")), /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Pendentes"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--warning-700)'
    }
  }, rows.filter(r => r.status === 'pendente').length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Vencem < 7 dias"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "03")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Vencidas"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--danger-700)'
    }
  }, rows.filter(r => r.status === 'vencida').length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Conclu\xEDdas / m\xEAs"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--success-700)'
    }
  }, rows.filter(r => r.status === 'concluida').length.toString().padStart(2, '0')))), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement(PageTabs, {
    tabs: [{
      key: 'lista',
      label: 'Lista',
      Icon: IcoList
    }, {
      key: 'calendario',
      label: 'Calendário',
      Icon: IcoCalendarGrid
    }],
    active: tab,
    onChange: setTab
  }), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(Dropdown, {
    value: mes,
    onChange: setMes,
    options: MES_OPT
  }), /*#__PURE__*/React.createElement(Dropdown, {
    value: cliente,
    onChange: setCliente,
    options: CLIENTES_OPT
  })), tab === 'lista' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement(FilterChips, {
    options: STATUS_OPT,
    value: status,
    onChange: setStatus
  }), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(Search, {
    placeholder: "Buscar obriga\xE7\xE3o\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Obriga\xE7\xE3o"), /*#__PURE__*/React.createElement("th", null, "Cliente"), /*#__PURE__*/React.createElement("th", null, "Tipo"), /*#__PURE__*/React.createElement("th", null, "Vencimento"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "cell-name"
  }, r.nome), /*#__PURE__*/React.createElement("td", null, r.cliente), /*#__PURE__*/React.createElement("td", null, r.tipo), /*#__PURE__*/React.createElement("td", {
    className: "cell-mono"
  }, r.venc), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: STATUS_BADGE[r.status][0],
    dot: true
  }, STATUS_BADGE[r.status][1])), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rowactions"
  }, r.status !== 'concluida' ? /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm",
    onClick: () => setCompleting(r)
  }, /*#__PURE__*/React.createElement(IcoCheck, null), " Concluir") : /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Comprovante"
  }, /*#__PURE__*/React.createElement(IcoFile, null)), /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Editar",
    onClick: () => setEditing(r)
  }, /*#__PURE__*/React.createElement(IcoEdit, null)))))))), filtered.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    Icon: IcoObrigacoes,
    title: "Nenhuma obriga\xE7\xE3o",
    sub: "Nenhuma obriga\xE7\xE3o para este filtro."
  }) : null)) : /*#__PURE__*/React.createElement(ObrigCalendar, {
    rows: rows
  }), editing ? /*#__PURE__*/React.createElement(ObrigForm, {
    row: editing === 'new' ? null : editing,
    onClose: () => setEditing(null)
  }) : null, completing ? /*#__PURE__*/React.createElement(ConcluirModal, {
    row: completing,
    onClose: () => setCompleting(null),
    onDone: () => {
      markDone(completing.id);
      setCompleting(null);
    }
  }) : null);
}

/* ---- Calendar tab ---- */
function ObrigCalendar({
  rows
}) {
  const byDay = {};
  rows.forEach(r => {
    (byDay[r.dia] = byDay[r.dia] || []).push(r);
  });
  const lead = 5,
    days = 31;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const kindOf = s => s === 'concluida' ? 'ok' : s === 'vencida' ? 'err' : 'warn';
  return /*#__PURE__*/React.createElement("div", {
    className: "card2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tico"
  }, /*#__PURE__*/React.createElement(IcoCalendarGrid, null)), "Maio \xB7 2026")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap: '8px'
    }
  }, dow.map(d => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      color: 'var(--slate-400)',
      textAlign: 'center',
      paddingBottom: '4px'
    }
  }, d)), cells.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      minHeight: '92px',
      borderRadius: 'var(--r-md)',
      border: '1px solid var(--border)',
      background: d === 17 ? 'var(--brand-50)' : '#fff',
      padding: '7px 8px',
      opacity: d ? 1 : .4
    }
  }, d ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '12px',
      fontWeight: d === 17 ? 700 : 500,
      color: d === 17 ? 'var(--brand-800)' : 'var(--slate-500)',
      marginBottom: '5px'
    }
  }, d) : null, (byDay[d] || []).map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    className: 'badge badge-' + kindOf(r.status),
    style: {
      display: 'flex',
      width: '100%',
      justifyContent: 'flex-start',
      marginBottom: '4px',
      fontSize: '10.5px',
      padding: '3px 7px',
      borderRadius: '6px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, r.nome.split(' — ')[0])))))));
}

/* ---- Create / edit modal ---- */
function ObrigForm({
  row,
  onClose
}) {
  const [rec, setRec] = useStateOb(row?.rec || 'mensal');
  return /*#__PURE__*/React.createElement(Modal, {
    title: row ? 'Editar obrigação' : 'Nova obrigação',
    subtitle: "Defina os dados da obriga\xE7\xE3o fiscal.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onClose
    }, row ? 'Salvar alterações' : 'Criar obrigação'))
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Nome",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.nome,
    placeholder: "Ex.: DAS \u2014 Simples Nacional"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Tipo",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: row?.tipo || 'Tributária'
  }, /*#__PURE__*/React.createElement("option", null, "Tribut\xE1ria"), /*#__PURE__*/React.createElement("option", null, "Acess\xF3ria"), /*#__PURE__*/React.createElement("option", null, "Trabalhista"), /*#__PURE__*/React.createElement("option", null, "Municipal"))), /*#__PURE__*/React.createElement(Field, {
    label: "Cliente",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: row?.cliente
  }, CLIENTES_OPT.filter(c => c.value !== 'all').map(c => /*#__PURE__*/React.createElement("option", {
    key: c.value
  }, c.label)))), /*#__PURE__*/React.createElement(Field, {
    label: "Data de vencimento",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    type: "text",
    defaultValue: row?.venc,
    placeholder: "dd/mm/aaaa"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Recorr\xEAncia"
  }, /*#__PURE__*/React.createElement(SegRadio, {
    value: rec,
    onChange: setRec,
    options: [{
      value: 'unica',
      label: 'Única'
    }, {
      value: 'mensal',
      label: 'Mensal'
    }, {
      value: 'anual',
      label: 'Anual'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Observa\xE7\xF5es",
    full: true
  }, /*#__PURE__*/React.createElement(Textarea, {
    placeholder: "Notas internas (opcional)"
  }))));
}

/* ---- Complete with upload ---- */
function ConcluirModal({
  row,
  onClose,
  onDone
}) {
  const [file, setFile] = useStateOb(null);
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Concluir obriga\xE7\xE3o",
    subtitle: row.nome + ' · ' + row.cliente,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onDone
    }, /*#__PURE__*/React.createElement(IcoCheck, null), " Marcar como conclu\xEDda"))
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Comprovante de entrega",
    help: "Anexe o PDF ou imagem do comprovante (DARF, recibo, protocolo)."
  }, !file ? /*#__PURE__*/React.createElement("div", {
    className: "dropzone",
    onClick: () => setFile({
      name: 'DARF_DAS_05-2026.pdf',
      size: '184 KB'
    })
  }, /*#__PURE__*/React.createElement("div", {
    className: "dz-ico"
  }, /*#__PURE__*/React.createElement(IcoUpload, null)), /*#__PURE__*/React.createElement("div", {
    className: "dz-t"
  }, "Arraste o arquivo ou clique para enviar"), /*#__PURE__*/React.createElement("div", {
    className: "dz-s"
  }, "PDF, PNG ou JPG \xB7 at\xE9 10 MB")) : /*#__PURE__*/React.createElement("div", {
    className: "file-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fi"
  }, /*#__PURE__*/React.createElement(IcoFile, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fn"
  }, file.name), /*#__PURE__*/React.createElement("div", {
    className: "fs"
  }, file.size)), /*#__PURE__*/React.createElement("button", {
    className: "iconaction danger",
    onClick: () => setFile(null)
  }, /*#__PURE__*/React.createElement(IcoTrash, null)))), /*#__PURE__*/React.createElement(Field, {
    label: "Data da entrega"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "text",
    defaultValue: "17/05/2026"
  })));
}
Object.assign(window, {
  ObrigacoesPage,
  CLIENTES_OPT
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Obrigacoes.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Pessoas.jsx
try { (() => {
// Efficience Co — Gestão: Usuários (admin_cliente), Clientes (admin_cliente),
// Escritórios (admin_efficience). CRUD-style list + create/edit/remove modals.
const {
  useState: useStatePe
} = React;

/* ============ Usuários do escritório ============ */
const USERS_SEED = [{
  id: 1,
  nome: 'Victor Almeida',
  email: 'victor@andradecontabil.com.br',
  perfil: 'admin',
  status: 'ativo'
}, {
  id: 2,
  nome: 'Marina Reis',
  email: 'marina@andradecontabil.com.br',
  perfil: 'funcionario',
  status: 'ativo'
}, {
  id: 3,
  nome: 'Caio Nunes',
  email: 'caio@andradecontabil.com.br',
  perfil: 'funcionario',
  status: 'ativo'
}, {
  id: 4,
  nome: 'Beatriz Lima',
  email: 'beatriz@andradecontabil.com.br',
  perfil: 'funcionario',
  status: 'inativo'
}];
const PERFIL_BADGE = {
  admin: ['brand', 'Admin'],
  funcionario: ['neutral', 'Funcionário']
};
function UsuariosPage() {
  const [rows, setRows] = useStatePe(USERS_SEED);
  const [editing, setEditing] = useStatePe(null);
  const [removing, setRemoving] = useStatePe(null);
  const remove = id => {
    setRows(rs => rs.filter(r => r.id !== id));
    setRemoving(null);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Usu\xE1rios",
    sub: "Equipe do escrit\xF3rio e permiss\xF5es por perfil."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setEditing('new')
  }, /*#__PURE__*/React.createElement(IcoUserPlus, null), " Novo usu\xE1rio")), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Usu\xE1rio"), /*#__PURE__*/React.createElement("th", null, "E-mail"), /*#__PURE__*/React.createElement("th", null, "Perfil"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(u => /*#__PURE__*/React.createElement("tr", {
    key: u.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cell-user"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: u.nome
  }), /*#__PURE__*/React.createElement("span", {
    className: "cell-name"
  }, u.nome))), /*#__PURE__*/React.createElement("td", {
    className: "cell-mono"
  }, u.email), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: PERFIL_BADGE[u.perfil][0]
  }, PERFIL_BADGE[u.perfil][1])), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: u.status === 'ativo' ? 'ok' : 'neutral',
    dot: true
  }, u.status === 'ativo' ? 'Ativo' : 'Inativo')), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rowactions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Editar",
    onClick: () => setEditing(u)
  }, /*#__PURE__*/React.createElement(IcoEdit, null)), /*#__PURE__*/React.createElement("button", {
    className: "iconaction danger",
    title: "Remover",
    onClick: () => setRemoving(u)
  }, /*#__PURE__*/React.createElement(IcoTrash, null))))))))), editing ? /*#__PURE__*/React.createElement(UsuarioForm, {
    row: editing === 'new' ? null : editing,
    onClose: () => setEditing(null)
  }) : null, removing ? /*#__PURE__*/React.createElement(ConfirmRemove, {
    name: removing.nome,
    kind: "usu\xE1rio",
    onClose: () => setRemoving(null),
    onConfirm: () => remove(removing.id)
  }) : null);
}
function UsuarioForm({
  row,
  onClose
}) {
  const [perfil, setPerfil] = useStatePe(row?.perfil || 'funcionario');
  return /*#__PURE__*/React.createElement(Modal, {
    title: row ? 'Editar usuário' : 'Novo usuário',
    subtitle: "Membros da equipe acessam a plataforma com e-mail e senha.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onClose
    }, row ? 'Salvar' : 'Criar usuário'))
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Nome completo",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.nome,
    placeholder: "Nome do funcion\xE1rio"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "E-mail",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    type: "email",
    defaultValue: row?.email,
    placeholder: "nome@escritorio.com.br"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Perfil",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(SegRadio, {
    value: perfil,
    onChange: setPerfil,
    options: [{
      value: 'admin',
      label: 'Admin'
    }, {
      value: 'funcionario',
      label: 'Funcionário'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: row ? 'Nova senha' : 'Senha provisória',
    required: !row,
    full: true,
    help: row ? 'Deixe em branco para manter a senha atual.' : 'O usuário troca no primeiro acesso.'
  }, /*#__PURE__*/React.createElement(Input, {
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  }))));
}

/* ============ Clientes do escritório ============ */
const CLI_SEED = [{
  id: 1,
  nome: 'Padaria do João',
  cnpj: '12.345.678/0001-90',
  regime: 'Simples Nacional',
  resp: 'Marina Reis',
  status: 'ativo'
}, {
  id: 2,
  nome: 'Mercado Lopes ME',
  cnpj: '23.456.789/0001-12',
  regime: 'Simples Nacional',
  resp: 'Caio Nunes',
  status: 'ativo'
}, {
  id: 3,
  nome: 'Andrade Transportes',
  cnpj: '34.567.890/0001-34',
  regime: 'Lucro Presumido',
  resp: 'Victor Almeida',
  status: 'ativo'
}, {
  id: 4,
  nome: 'Bella Moda Ltda',
  cnpj: '45.678.901/0001-56',
  regime: 'Lucro Real',
  resp: 'Marina Reis',
  status: 'ativo'
}, {
  id: 5,
  nome: 'J. Santos MEI',
  cnpj: '56.789.012/0001-78',
  regime: 'MEI',
  resp: 'Caio Nunes',
  status: 'inativo'
}];
function ClientesPage() {
  const [rows, setRows] = useStatePe(CLI_SEED);
  const [editing, setEditing] = useStatePe(null);
  const toggleStatus = id => setRows(rs => rs.map(r => r.id === id ? {
    ...r,
    status: r.status === 'ativo' ? 'inativo' : 'ativo'
  } : r));
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Clientes",
    sub: "As empresas que o escrit\xF3rio atende."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setEditing('new')
  }, /*#__PURE__*/React.createElement(IcoPlus, null), " Novo cliente")), /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Total"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, rows.length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Ativos"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--success-700)'
    }
  }, rows.filter(r => r.status === 'ativo').length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Simples Nacional"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, rows.filter(r => r.regime === 'Simples Nacional').length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Obriga\xE7\xF5es / m\xEAs"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "64"))), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(Search, {
    placeholder: "Buscar cliente\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Cliente"), /*#__PURE__*/React.createElement("th", null, "CNPJ"), /*#__PURE__*/React.createElement("th", null, "Regime"), /*#__PURE__*/React.createElement("th", null, "Respons\xE1vel"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(c => /*#__PURE__*/React.createElement("tr", {
    key: c.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cell-user"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cell-av",
    style: {
      borderRadius: '8px',
      background: 'var(--slate-200)',
      color: 'var(--slate-600)'
    }
  }, /*#__PURE__*/React.createElement(IcoClientes, {
    width: "16",
    height: "16",
    style: {
      stroke: 'currentColor',
      fill: 'none',
      strokeWidth: 1.8
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "cell-name"
  }, c.nome))), /*#__PURE__*/React.createElement("td", {
    className: "cell-mono"
  }, c.cnpj), /*#__PURE__*/React.createElement("td", null, c.regime), /*#__PURE__*/React.createElement("td", null, c.resp), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: c.status === 'ativo' ? 'ok' : 'neutral',
    dot: true
  }, c.status === 'ativo' ? 'Ativo' : 'Inativo')), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rowactions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Editar",
    onClick: () => setEditing(c)
  }, /*#__PURE__*/React.createElement(IcoEdit, null)), /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: c.status === 'ativo' ? 'Desativar' : 'Ativar',
    onClick: () => toggleStatus(c.id)
  }, /*#__PURE__*/React.createElement(IcoPower, null))))))))), editing ? /*#__PURE__*/React.createElement(ClienteForm, {
    row: editing === 'new' ? null : editing,
    onClose: () => setEditing(null)
  }) : null);
}
function ClienteForm({
  row,
  onClose
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: row ? 'Editar cliente' : 'Novo cliente',
    subtitle: "Empresa atendida pelo escrit\xF3rio.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onClose
    }, row ? 'Salvar' : 'Criar cliente'))
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Raz\xE3o social / Nome",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.nome,
    placeholder: "Ex.: Padaria do Jo\xE3o"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "CNPJ",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.cnpj,
    placeholder: "00.000.000/0001-00"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Regime tribut\xE1rio",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: row?.regime
  }, /*#__PURE__*/React.createElement("option", null, "Simples Nacional"), /*#__PURE__*/React.createElement("option", null, "Lucro Presumido"), /*#__PURE__*/React.createElement("option", null, "Lucro Real"), /*#__PURE__*/React.createElement("option", null, "MEI"))), /*#__PURE__*/React.createElement(Field, {
    label: "Respons\xE1vel no escrit\xF3rio",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: row?.resp
  }, /*#__PURE__*/React.createElement("option", null, "Victor Almeida"), /*#__PURE__*/React.createElement("option", null, "Marina Reis"), /*#__PURE__*/React.createElement("option", null, "Caio Nunes")))));
}

/* ============ Escritórios (admin Efficience) ============ */
const ESC_SEED = [{
  id: 1,
  nome: 'Andrade Contabilidade',
  plano: 'Licença + Manutenção',
  usuarios: 8,
  licenca: 'ativa',
  validade: '12/06/2026'
}, {
  id: 2,
  nome: 'Prisma Contábil Ltda',
  plano: 'Licença + Manutenção',
  usuarios: 5,
  licenca: 'ativa',
  validade: '03/06/2026'
}, {
  id: 3,
  nome: 'Nova Gestão Assessoria',
  plano: 'Licença',
  usuarios: 3,
  licenca: 'suspensa',
  validade: '28/04/2026'
}, {
  id: 4,
  nome: 'Escritório Vértice',
  plano: 'Licença',
  usuarios: 2,
  licenca: 'inativa',
  validade: '15/03/2026'
}];
const LIC_BADGE = {
  ativa: ['ok', 'Ativa'],
  suspensa: ['warn', 'Suspensa'],
  inativa: ['err', 'Inativa']
};
function EscritoriosPage() {
  const [rows] = useStatePe(ESC_SEED);
  const [editing, setEditing] = useStatePe(null);
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Escrit\xF3rios",
    sub: "\xC1rea Efficience \u2014 gest\xE3o de licen\xE7as e suporte aos escrit\xF3rios."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-dark",
    onClick: () => setEditing('new')
  }, /*#__PURE__*/React.createElement(IcoPlus, null), " Novo escrit\xF3rio")), /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Escrit\xF3rios"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "128")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Licen\xE7as ativas"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--success-700)'
    }
  }, "119")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Suspensas"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--warning-700)'
    }
  }, "06")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "MRR estimado"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      fontSize: '24px'
    }
  }, "R$ 241k"))), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(Search, {
    placeholder: "Buscar escrit\xF3rio\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Escrit\xF3rio"), /*#__PURE__*/React.createElement("th", null, "Plano"), /*#__PURE__*/React.createElement("th", null, "Usu\xE1rios"), /*#__PURE__*/React.createElement("th", null, "Licen\xE7a"), /*#__PURE__*/React.createElement("th", null, "Validade"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(e => /*#__PURE__*/React.createElement("tr", {
    key: e.id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cell-user"
  }, /*#__PURE__*/React.createElement("span", {
    className: "cell-av",
    style: {
      borderRadius: '8px'
    }
  }, /*#__PURE__*/React.createElement(IcoBuilding2, {
    width: "16",
    height: "16",
    style: {
      stroke: 'currentColor',
      fill: 'none',
      strokeWidth: 1.8
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "cell-name"
  }, e.nome))), /*#__PURE__*/React.createElement("td", null, e.plano), /*#__PURE__*/React.createElement("td", {
    className: "cell-mono"
  }, e.usuarios), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: LIC_BADGE[e.licenca][0],
    dot: true
  }, LIC_BADGE[e.licenca][1])), /*#__PURE__*/React.createElement("td", {
    className: "cell-mono"
  }, e.validade), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rowactions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Acessar como suporte"
  }, /*#__PURE__*/React.createElement(IcoLink, null)), /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Editar",
    onClick: () => setEditing(e)
  }, /*#__PURE__*/React.createElement(IcoEdit, null))))))))), editing ? /*#__PURE__*/React.createElement(EscritorioForm, {
    row: editing === 'new' ? null : editing,
    onClose: () => setEditing(null)
  }) : null);
}
function EscritorioForm({
  row,
  onClose
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: row ? 'Editar escritório' : 'Novo escritório',
    subtitle: "Cadastro de um escrit\xF3rio cliente da Efficience.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-dark",
      onClick: onClose
    }, row ? 'Salvar' : 'Cadastrar'))
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Nome do escrit\xF3rio",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.nome,
    placeholder: "Ex.: Andrade Contabilidade"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Plano",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: row?.plano
  }, /*#__PURE__*/React.createElement("option", null, "Licen\xE7a + Manuten\xE7\xE3o"), /*#__PURE__*/React.createElement("option", null, "Licen\xE7a"))), /*#__PURE__*/React.createElement(Field, {
    label: "Limite de usu\xE1rios",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    type: "number",
    defaultValue: row?.usuarios || 5
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Admin respons\xE1vel",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "email@escritorio.com.br"
  }))));
}

/* ============ shared confirm ============ */
function ConfirmRemove({
  name,
  kind,
  onClose,
  onConfirm
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: 'Remover ' + kind,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-dark",
      style: {
        background: 'var(--danger-600)'
      },
      onClick: onConfirm
    }, /*#__PURE__*/React.createElement(IcoTrash, null), " Remover"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '14px',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      borderRadius: 'var(--r-md)',
      background: 'var(--danger-50)',
      color: 'var(--danger-600)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(IcoAlert, {
    width: "22",
    height: "22",
    style: {
      stroke: 'currentColor',
      fill: 'none',
      strokeWidth: 1.8
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '14px',
      color: 'var(--slate-700)',
      lineHeight: 1.55
    }
  }, "Tem certeza que deseja remover ", /*#__PURE__*/React.createElement("b", null, name), "? Esta a\xE7\xE3o n\xE3o pode ser desfeita.")));
}
Object.assign(window, {
  UsuariosPage,
  ClientesPage,
  EscritoriosPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Pessoas.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Processos.jsx
try { (() => {
// Efficience Co — Processos e Checklists: lista + detalhe + criar + abertura de empresa
const {
  useState: useStatePr
} = React;
const PROC_SEED = [{
  id: 1,
  nome: 'Folha de pagamento — Maio',
  tipo: 'Folha de pagamento',
  cliente: 'Andrade Transportes',
  resp: 'Marina Reis',
  status: 'em_andamento',
  prog: 60
}, {
  id: 2,
  nome: 'Abertura — Padaria do João II',
  tipo: 'Abertura de empresa',
  cliente: 'Padaria do João',
  resp: 'Victor Almeida',
  status: 'em_andamento',
  prog: 40
}, {
  id: 3,
  nome: 'Folha de pagamento — Maio',
  tipo: 'Folha de pagamento',
  cliente: 'Bella Moda Ltda',
  resp: 'Marina Reis',
  status: 'concluido',
  prog: 100
}, {
  id: 4,
  nome: 'Baixa de MEI — J. Santos',
  tipo: 'Baixa de empresa',
  cliente: 'Mercado Lopes ME',
  resp: 'Caio Nunes',
  status: 'parado',
  prog: 25
}, {
  id: 5,
  nome: 'Alteração contratual',
  tipo: 'Alteração societária',
  cliente: 'Bella Moda Ltda',
  resp: 'Victor Almeida',
  status: 'em_andamento',
  prog: 75
}];
const PROC_STATUS = {
  em_andamento: ['neutral', 'Em andamento'],
  concluido: ['ok', 'Concluído'],
  parado: ['err', 'Parado']
};
const PTIPO_OPT = [{
  value: 'all',
  label: 'Todos os tipos'
}, {
  value: 'Folha de pagamento',
  label: 'Folha de pagamento'
}, {
  value: 'Abertura de empresa',
  label: 'Abertura de empresa'
}, {
  value: 'Baixa de empresa',
  label: 'Baixa de empresa'
}, {
  value: 'Alteração societária',
  label: 'Alteração societária'
}];
const STEPS_SEED = [{
  t: 'Coletar documentos dos sócios',
  who: 'Marina Reis',
  done: true
}, {
  t: 'Consultar viabilidade na Junta Comercial',
  who: 'Marina Reis',
  done: true
}, {
  t: 'Registrar contrato social',
  who: 'Victor Almeida',
  done: true
}, {
  t: 'Emitir CNPJ na Receita Federal',
  who: null,
  done: false
}, {
  t: 'Inscrição municipal e alvará',
  who: null,
  done: false
}, {
  t: 'Configurar regras no agente local',
  who: null,
  done: false
}];
function ProcessosPage() {
  const [detail, setDetail] = useStatePr(null);
  const [creating, setCreating] = useStatePr(null); // 'new' | 'abertura' | null
  const [tipo, setTipo] = useStatePr('all');
  const [status, setStatus] = useStatePr('all');
  const [rows] = useStatePr(PROC_SEED);
  if (detail) return /*#__PURE__*/React.createElement(ProcessoDetail, {
    proc: detail,
    onBack: () => setDetail(null)
  });
  const filtered = rows.filter(r => (tipo === 'all' || r.tipo === tipo) && (status === 'all' || r.status === status));
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Processos e checklists",
    sub: "Folha, aberturas, baixas e altera\xE7\xF5es \u2014 acompanhadas etapa a etapa."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary",
    onClick: () => setCreating('abertura')
  }, /*#__PURE__*/React.createElement(IcoBuilding2, null), " Abertura de empresa"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setCreating('new')
  }, /*#__PURE__*/React.createElement(IcoPlus, null), " Novo processo")), /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Em andamento"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, rows.filter(r => r.status === 'em_andamento').length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Parados"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--danger-700)'
    }
  }, rows.filter(r => r.status === 'parado').length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Conclu\xEDdos / m\xEAs"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--success-700)'
    }
  }, "18")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Prazo m\xE9dio"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "6", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '16px',
      color: 'var(--slate-400)'
    }
  }, " dias")))), /*#__PURE__*/React.createElement("div", {
    className: "toolbar"
  }, /*#__PURE__*/React.createElement(FilterChips, {
    options: [{
      value: 'all',
      label: 'Todos'
    }, {
      value: 'em_andamento',
      label: 'Em andamento'
    }, {
      value: 'parado',
      label: 'Parados'
    }, {
      value: 'concluido',
      label: 'Concluídos'
    }],
    value: status,
    onChange: setStatus
  }), /*#__PURE__*/React.createElement("div", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement(Dropdown, {
    value: tipo,
    onChange: setTipo,
    options: PTIPO_OPT
  }), /*#__PURE__*/React.createElement(Search, {
    placeholder: "Buscar processo\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Processo"), /*#__PURE__*/React.createElement("th", null, "Cliente"), /*#__PURE__*/React.createElement("th", null, "Respons\xE1vel"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: '180px'
    }
  }, "Progresso"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    style: {
      cursor: 'pointer'
    },
    onClick: () => setDetail(r)
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cell-name"
  }, r.nome), /*#__PURE__*/React.createElement("div", {
    className: "cell-sub"
  }, r.tipo)), /*#__PURE__*/React.createElement("td", null, r.cliente), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cell-user"
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: r.resp
  }), /*#__PURE__*/React.createElement("span", null, r.resp))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Progress, {
    value: r.prog,
    done: r.prog === 100
  })), /*#__PURE__*/React.createElement("span", {
    className: "cell-mono",
    style: {
      fontSize: '11.5px'
    }
  }, r.prog, "%"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: PROC_STATUS[r.status][0],
    dot: true
  }, PROC_STATUS[r.status][1])), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconaction"
  }, /*#__PURE__*/React.createElement(IcoArrowRight, null)))))))), creating === 'new' ? /*#__PURE__*/React.createElement(ProcessoForm, {
    onClose: () => setCreating(null)
  }) : null, creating === 'abertura' ? /*#__PURE__*/React.createElement(AberturaForm, {
    onClose: () => setCreating(null)
  }) : null);
}

/* ---- Detail with checklist ---- */
function ProcessoDetail({
  proc,
  onBack
}) {
  const [steps, setSteps] = useStatePr(STEPS_SEED.map(s => ({
    ...s
  })));
  const toggle = i => setSteps(ss => ss.map((s, j) => j === i ? {
    ...s,
    done: !s.done,
    who: !s.done ? 'Victor Almeida' : s.who
  } : s));
  const doneCount = steps.filter(s => s.done).length;
  const prog = Math.round(doneCount / steps.length * 100);
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "detail-head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "back-btn",
    onClick: onBack
  }, /*#__PURE__*/React.createElement(IcoChevLeft, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: '28px',
      letterSpacing: '-0.02em',
      margin: 0
    }
  }, proc.nome), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '14px',
      color: 'var(--fg-muted)',
      margin: '7px 0 0'
    }
  }, proc.tipo, " \xB7 ", proc.cliente)), /*#__PURE__*/React.createElement(Badge, {
    kind: PROC_STATUS[proc.status][0],
    dot: true
  }, PROC_STATUS[proc.status][1])), /*#__PURE__*/React.createElement("div", {
    className: "card2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "k"
  }, "Cliente"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, proc.cliente)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "k"
  }, "Respons\xE1vel"), /*#__PURE__*/React.createElement("div", {
    className: "v"
  }, proc.resp)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "k"
  }, "Aberto em"), /*#__PURE__*/React.createElement("div", {
    className: "v mono"
  }, "02/05/2026")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "k"
  }, "Prazo"), /*#__PURE__*/React.createElement("div", {
    className: "v mono"
  }, "30/05/2026")))), /*#__PURE__*/React.createElement("div", {
    className: "grid2",
    style: {
      gridTemplateColumns: '1.6fr 1fr'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tico"
  }, /*#__PURE__*/React.createElement(IcoCheck, null)), "Etapas do processo"), /*#__PURE__*/React.createElement("span", {
    className: "cell-sub"
  }, doneCount, " de ", steps.length, " conclu\xEDdas")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Progress, {
    value: prog,
    done: prog === 100
  })), /*#__PURE__*/React.createElement("span", {
    className: "cell-mono",
    style: {
      fontWeight: 600
    }
  }, prog, "%")), /*#__PURE__*/React.createElement("div", {
    className: "checklist"
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'check-item' + (s.done ? ' done' : '')
  }, /*#__PURE__*/React.createElement("button", {
    className: 'checkbox' + (s.done ? ' on' : ''),
    onClick: () => toggle(i)
  }, /*#__PURE__*/React.createElement(IcoCheck, null)), /*#__PURE__*/React.createElement("div", {
    className: "check-main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "check-title"
  }, s.t), /*#__PURE__*/React.createElement("div", {
    className: "check-meta"
  }, s.done && s.who ? /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, /*#__PURE__*/React.createElement("span", {
    className: "av"
  }, s.who.split(' ').map(x => x[0]).join('')), s.who) : /*#__PURE__*/React.createElement("span", null, "Pendente"))), s.done ? /*#__PURE__*/React.createElement(IcoCheckCircle, {
    width: "18",
    height: "18",
    style: {
      color: 'var(--success-500)',
      stroke: 'currentColor',
      fill: 'none',
      strokeWidth: 1.8
    }
  }) : null)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "block-label"
  }, "Documentos"), /*#__PURE__*/React.createElement("div", {
    className: "file-row",
    style: {
      marginBottom: '8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fi"
  }, /*#__PURE__*/React.createElement(IcoFile, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fn"
  }, "contrato_social.pdf"), /*#__PURE__*/React.createElement("div", {
    className: "fs"
  }, "312 KB"))), /*#__PURE__*/React.createElement("div", {
    className: "file-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fi"
  }, /*#__PURE__*/React.createElement(IcoFile, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fn"
  }, "rg_socios.pdf"), /*#__PURE__*/React.createElement("div", {
    className: "fs"
  }, "1.1 MB"))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-secondary btn-sm",
    style: {
      width: '100%',
      justifyContent: 'center',
      marginTop: '12px'
    }
  }, /*#__PURE__*/React.createElement(IcoUpload, null), " Anexar documento")), /*#__PURE__*/React.createElement("div", {
    className: "card2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "block-label"
  }, "Automa\xE7\xE3o vinculada"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '13px',
      color: 'var(--slate-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 8,
      background: 'var(--brand-50)',
      color: 'var(--brand-600)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(IcoBolt, {
    width: "18",
    height: "18",
    style: {
      stroke: 'currentColor',
      fill: 'none',
      strokeWidth: 1.8
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      color: 'var(--slate-900)'
    }
  }, "Organizar documentos de abertura"), /*#__PURE__*/React.createElement("div", {
    className: "cell-sub"
  }, "Regra ativa \xB7 executa ao concluir etapa")))))));
}

/* ---- Create process modal ---- */
function ProcessoForm({
  onClose
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Novo processo",
    subtitle: "Crie um processo manual a partir de um modelo.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onClose
    }, "Criar processo"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Tipo de processo",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Select, null, PTIPO_OPT.filter(t => t.value !== 'all').map(t => /*#__PURE__*/React.createElement("option", {
    key: t.value
  }, t.label)))), /*#__PURE__*/React.createElement(Field, {
    label: "Cliente",
    required: true
  }, /*#__PURE__*/React.createElement(Select, null, CLIENTES_OPT.filter(c => c.value !== 'all').map(c => /*#__PURE__*/React.createElement("option", {
    key: c.value
  }, c.label)))), /*#__PURE__*/React.createElement(Field, {
    label: "Respons\xE1vel",
    required: true
  }, /*#__PURE__*/React.createElement(Select, null, /*#__PURE__*/React.createElement("option", null, "Victor Almeida"), /*#__PURE__*/React.createElement("option", null, "Marina Reis"), /*#__PURE__*/React.createElement("option", null, "Caio Nunes"))), /*#__PURE__*/React.createElement(Field, {
    label: "Prazo"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "text",
    placeholder: "dd/mm/aaaa"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Nome do processo",
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Ex.: Folha de pagamento \u2014 Maio"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "help"
  }, "As etapas do checklist s\xE3o geradas automaticamente conforme o tipo selecionado."));
}

/* ---- Abertura de empresa form ---- */
function AberturaForm({
  onClose
}) {
  const [regime, setRegime] = useStatePr('simples');
  return /*#__PURE__*/React.createElement(Modal, {
    size: "lg",
    title: "Abertura de empresa",
    subtitle: "Os dados abaixo disparam o processo e a automa\xE7\xE3o no agente local.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onClose
    }, /*#__PURE__*/React.createElement(IcoBolt, null), " Iniciar abertura"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "block-label"
  }, "Dados da empresa"), /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Raz\xE3o social",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Ex.: Padaria do Jo\xE3o II Ltda"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Nome fantasia"
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Padaria do Jo\xE3o II"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "CNAE principal",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "1091-1/02 \u2014 Padaria"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Regime tribut\xE1rio",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(SegRadio, {
    value: regime,
    onChange: setRegime,
    options: [{
      value: 'simples',
      label: 'Simples Nacional'
    }, {
      value: 'presumido',
      label: 'Lucro Presumido'
    }, {
      value: 'real',
      label: 'Lucro Real'
    }]
  }))), /*#__PURE__*/React.createElement("div", {
    className: "block-label",
    style: {
      marginTop: '6px'
    }
  }, "S\xF3cios"), /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "S\xF3cio 1 \u2014 nome",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Nome completo"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "S\xF3cio 1 \u2014 CPF",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "000.000.000-00"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "S\xF3cio 2 \u2014 nome"
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Nome completo (opcional)"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "S\xF3cio 2 \u2014 CPF"
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "000.000.000-00"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "block-label",
    style: {
      marginTop: '6px'
    }
  }, "Endere\xE7o"), /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Logradouro",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Rua, n\xFAmero, complemento"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Cidade / UF",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Rio de Janeiro / RJ"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "CEP",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "00000-000"
  }))));
}
Object.assign(window, {
  ProcessosPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Processos.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/Regras.jsx
try { (() => {
// Efficience Co — Regras de Automação: lista + toggle + criar/editar
const {
  useState: useStateRg
} = React;
const REGRAS_SEED = [{
  id: 1,
  nome: 'Organizar NF-e recebidas',
  origem: '/entrada/nfe',
  destino: '/clientes/{cliente}/nfe',
  cond: 'arquivo .xml',
  acao: 'mover',
  cliente: 'Padaria do João',
  on: true
}, {
  id: 2,
  nome: 'Renomear extratos bancários',
  origem: '/entrada/extratos',
  destino: '/clientes/{cliente}/extratos',
  cond: 'nome contém "extrato"',
  acao: 'renomear',
  cliente: 'Mercado Lopes ME',
  on: true
}, {
  id: 3,
  nome: 'Arquivar guias pagas',
  origem: '/entrada/guias',
  destino: '/arquivo/{ano}/guias',
  cond: 'arquivo .pdf',
  acao: 'mover',
  cliente: 'Todos',
  on: true
}, {
  id: 4,
  nome: 'Separar documentos de abertura',
  origem: '/entrada/abertura',
  destino: '/processos/abertura',
  cond: 'pasta nova',
  acao: 'mover',
  cliente: 'Andrade Transportes',
  on: false
}, {
  id: 5,
  nome: 'Backup de folhas de pagamento',
  origem: '/clientes/{cliente}/folha',
  destino: '/backup/folha',
  cond: 'fim do mês',
  acao: 'copiar',
  cliente: 'Todos',
  on: true
}];
const ACAO_BADGE = {
  mover: 'brand',
  renomear: 'neutral',
  copiar: 'neutral'
};
function RegrasPage() {
  const [rows, setRows] = useStateRg(REGRAS_SEED);
  const [editing, setEditing] = useStateRg(null);
  const toggle = id => setRows(rs => rs.map(r => r.id === id ? {
    ...r,
    on: !r.on
  } : r));
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement(PageHead, {
    title: "Regras de automa\xE7\xE3o",
    sub: "O que o agente local executa sozinho na m\xE1quina do escrit\xF3rio."
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setEditing('new')
  }, /*#__PURE__*/React.createElement(IcoPlus, null), " Nova regra")), /*#__PURE__*/React.createElement("div", {
    className: "grid4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Regras ativas"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--success-700)'
    }
  }, rows.filter(r => r.on).length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Inativas"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, rows.filter(r => !r.on).length.toString().padStart(2, '0'))), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Execu\xE7\xF5es hoje"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value"
  }, "1.2k")), /*#__PURE__*/React.createElement("div", {
    className: "stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stat-label"
  }, "Falhas (24h)"), /*#__PURE__*/React.createElement("div", {
    className: "stat-value",
    style: {
      color: 'var(--danger-700)'
    }
  }, "02"))), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: '56px'
    }
  }, "Ativa"), /*#__PURE__*/React.createElement("th", null, "Regra"), /*#__PURE__*/React.createElement("th", null, "Origem \u2192 destino"), /*#__PURE__*/React.createElement("th", null, "A\xE7\xE3o"), /*#__PURE__*/React.createElement("th", null, "Cliente"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    style: {
      opacity: r.on ? 1 : .6
    }
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Toggle, {
    on: r.on,
    onChange: () => toggle(r.id)
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "cell-name"
  }, r.nome), /*#__PURE__*/React.createElement("div", {
    className: "cell-sub"
  }, "condi\xE7\xE3o: ", r.cond)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11.5px',
      color: 'var(--slate-600)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--slate-100)',
      padding: '2px 7px',
      borderRadius: '5px'
    }
  }, r.origem), /*#__PURE__*/React.createElement(IcoArrowRight, {
    width: "14",
    height: "14",
    style: {
      stroke: 'var(--slate-400)',
      fill: 'none',
      strokeWidth: 2
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--slate-100)',
      padding: '2px 7px',
      borderRadius: '5px'
    }
  }, r.destino))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Badge, {
    kind: ACAO_BADGE[r.acao]
  }, r.acao)), /*#__PURE__*/React.createElement("td", null, r.cliente), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "rowactions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "iconaction",
    title: "Editar",
    onClick: () => setEditing(r)
  }, /*#__PURE__*/React.createElement(IcoEdit, null)), /*#__PURE__*/React.createElement("button", {
    className: "iconaction danger",
    title: "Excluir"
  }, /*#__PURE__*/React.createElement(IcoTrash, null))))))))), editing ? /*#__PURE__*/React.createElement(RegraForm, {
    row: editing === 'new' ? null : editing,
    onClose: () => setEditing(null)
  }) : null);
}
function RegraForm({
  row,
  onClose
}) {
  const [acao, setAcao] = useStateRg(row?.acao || 'mover');
  return /*#__PURE__*/React.createElement(Modal, {
    title: row ? 'Editar regra' : 'Nova regra de automação',
    subtitle: "O agente aplica a regra quando a condi\xE7\xE3o for satisfeita.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onClose
    }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: onClose
    }, row ? 'Salvar regra' : 'Criar regra'))
  }, /*#__PURE__*/React.createElement("div", {
    className: "form-grid"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Nome da regra",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.nome,
    placeholder: "Ex.: Organizar NF-e recebidas"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Pasta de origem",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.origem,
    placeholder: "/entrada/nfe"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Pasta de destino",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.destino,
    placeholder: "/clientes/{cliente}/nfe"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Condi\xE7\xE3o",
    required: true,
    full: true
  }, /*#__PURE__*/React.createElement(Input, {
    defaultValue: row?.cond,
    placeholder: "Ex.: arquivo .xml \xB7 nome cont\xE9m \"extrato\""
  })), /*#__PURE__*/React.createElement(Field, {
    label: "A\xE7\xE3o",
    required: true
  }, /*#__PURE__*/React.createElement(SegRadio, {
    value: acao,
    onChange: setAcao,
    options: [{
      value: 'mover',
      label: 'Mover'
    }, {
      value: 'renomear',
      label: 'Renomear'
    }, {
      value: 'copiar',
      label: 'Copiar'
    }]
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Cliente associado"
  }, /*#__PURE__*/React.createElement(Select, {
    defaultValue: row?.cliente
  }, /*#__PURE__*/React.createElement("option", null, "Todos"), CLIENTES_OPT.filter(c => c.value !== 'all').map(c => /*#__PURE__*/React.createElement("option", {
    key: c.value
  }, c.label))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '11px',
      padding: '12px 14px',
      background: 'var(--brand-50)',
      border: '1px solid var(--brand-200)',
      borderRadius: 'var(--r-md)'
    }
  }, /*#__PURE__*/React.createElement(IcoBolt, {
    width: "18",
    height: "18",
    style: {
      stroke: 'var(--brand-600)',
      fill: 'none',
      strokeWidth: 1.8,
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: 'var(--brand-800)'
    }
  }, "A regra entra em vigor assim que o agente local sincronizar (at\xE9 24h).")));
}
Object.assign(window, {
  RegrasPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/Regras.jsx", error: String((e && e.message) || e) }); }

// ui_kits/plataforma/ui.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Efficience Co — shared UI primitives
const {
  useState: useStateUI
} = React;
function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: 'modal' + (size === 'lg' ? ' lg' : ''),
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, title), subtitle ? /*#__PURE__*/React.createElement("p", null, subtitle) : null), /*#__PURE__*/React.createElement("button", {
    className: "modal-x",
    onClick: onClose,
    "aria-label": "Fechar"
  }, /*#__PURE__*/React.createElement(IcoX, null))), /*#__PURE__*/React.createElement("div", {
    className: "modal-body"
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    className: "modal-foot"
  }, footer) : null));
}
function Field({
  label,
  required,
  children,
  help,
  full
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'form-field' + (full ? ' full' : '')
  }, label ? /*#__PURE__*/React.createElement("label", {
    className: "form-label"
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, " *") : null) : null, children, help ? /*#__PURE__*/React.createElement("span", {
    className: "help"
  }, help) : null);
}
function Input(props) {
  return /*#__PURE__*/React.createElement("input", _extends({
    className: "input"
  }, props));
}
function Textarea(props) {
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: "textarea"
  }, props));
}
function Select({
  children,
  ...p
}) {
  return /*#__PURE__*/React.createElement("select", _extends({
    className: "select-input"
  }, p), children);
}
function SegRadio({
  options,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "segradio"
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    className: value === o.value ? 'on' : '',
    onClick: () => onChange(o.value),
    type: "button"
  }, o.label)));
}
function Toggle({
  on,
  onChange
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'toggle' + (on ? ' on' : ''),
    onClick: () => onChange(!on),
    type: "button",
    "aria-pressed": on
  });
}
function PageTabs({
  tabs,
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ptabs"
  }, tabs.map(t => {
    const Icon = t.Icon;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      className: 'ptab' + (active === t.key ? ' active' : ''),
      onClick: () => onChange(t.key)
    }, Icon ? /*#__PURE__*/React.createElement(Icon, null) : null, t.label);
  }));
}
function Search({
  placeholder
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "searchbox"
  }, /*#__PURE__*/React.createElement(IcoSearch, null), /*#__PURE__*/React.createElement("input", {
    placeholder: placeholder || 'Buscar…'
  }));
}
function Dropdown({
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "select"
  }, /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    className: "chev"
  }, /*#__PURE__*/React.createElement(IcoChevDown, null)));
}
function FilterChips({
  options,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "fchips"
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    className: 'fchip' + (value === o.value ? ' active' : ''),
    onClick: () => onChange(o.value)
  }, o.label)));
}
function Pager({
  page,
  pages,
  total,
  onPage
}) {
  const nums = [];
  for (let i = 1; i <= pages; i++) nums.push(i);
  return /*#__PURE__*/React.createElement("div", {
    className: "pager"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pager-info"
  }, "Mostrando p\xE1gina ", page, " de ", pages, " \xB7 ", total, " registros"), /*#__PURE__*/React.createElement("div", {
    className: "pager-ctrl"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pbtn",
    disabled: page === 1,
    onClick: () => onPage(page - 1)
  }, /*#__PURE__*/React.createElement(IcoChevLeft, null)), nums.map(n => /*#__PURE__*/React.createElement("button", {
    key: n,
    className: 'pbtn' + (n === page ? ' active' : ''),
    onClick: () => onPage(n)
  }, n)), /*#__PURE__*/React.createElement("button", {
    className: "pbtn",
    disabled: page === pages,
    onClick: () => onPage(page + 1)
  }, /*#__PURE__*/React.createElement(IcoChevRight, null))));
}
function Progress({
  value,
  done
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "progress"
  }, /*#__PURE__*/React.createElement("div", {
    className: 'progress-bar' + (done ? ' done' : ''),
    style: {
      width: value + '%'
    }
  }));
}
function Badge({
  kind,
  children,
  dot
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'badge badge-' + kind
  }, dot ? /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }) : null, children);
}
function Avatar({
  name,
  cls
}) {
  const init = (name || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return /*#__PURE__*/React.createElement("span", {
    className: cls || 'cell-av'
  }, init);
}
function EmptyState({
  Icon,
  title,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ei"
  }, /*#__PURE__*/React.createElement(Icon, null)), /*#__PURE__*/React.createElement("div", {
    className: "et"
  }, title), sub ? /*#__PURE__*/React.createElement("div", {
    className: "es"
  }, sub) : null);
}
function PageHead({
  title,
  sub,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-head",
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, title), sub ? /*#__PURE__*/React.createElement("p", null, sub) : null), children ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px',
      alignItems: 'center'
    }
  }, children) : null);
}
Object.assign(window, {
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  SegRadio,
  Toggle,
  PageTabs,
  Search,
  Dropdown,
  FilterChips,
  Pager,
  Progress,
  Badge,
  Avatar,
  EmptyState,
  PageHead
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/plataforma/ui.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/Icons.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Efficience Co — line icon set (1.8 stroke, 24px grid, currentColor)
// Mirrors the product's hand-authored SVGs; Lucide-compatible style.
const I = ({
  d,
  children,
  ...p
}) => /*#__PURE__*/React.createElement("svg", _extends({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, p), d ? /*#__PURE__*/React.createElement("path", {
  d: d
}) : children);
const IcoDashboard = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "3.5",
  width: "7",
  height: "7",
  rx: "1.4"
}), /*#__PURE__*/React.createElement("rect", {
  x: "13.5",
  y: "3.5",
  width: "7",
  height: "5",
  rx: "1.4"
}), /*#__PURE__*/React.createElement("rect", {
  x: "13.5",
  y: "11.5",
  width: "7",
  height: "9",
  rx: "1.4"
}), /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "13.5",
  width: "7",
  height: "7",
  rx: "1.4"
}));
const IcoObrigacoes = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M7 3.5v3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M17 3.5v3"
}), /*#__PURE__*/React.createElement("rect", {
  x: "4",
  y: "6.5",
  width: "16",
  height: "14",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 10.5h16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12.5 14.5l-3 3-1.5-1.5"
}));
const IcoProcessos = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "3.5",
  y: "4",
  width: "17",
  height: "16.5",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.5 8h17"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 12h8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8 15.5h5"
}));
const IcoLogs = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 5.5h14"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 12h14"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 18.5h9"
}));
const IcoRegras = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "7",
  cy: "7",
  r: "2.4"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "17",
  cy: "17",
  r: "2.4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M7 9.4v5.2a2 2 0 0 0 2 2h5.6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M14.6 16.6l-2 0M14.6 16.6l0-2"
}));
const IcoUsuarios = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "8.5",
  r: "3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3.8 19c0-2.6 2.3-4.5 5.2-4.5s5.2 1.9 5.2 4.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16.5 7.6a2.6 2.6 0 0 1 0 5.1"
}), /*#__PURE__*/React.createElement("path", {
  d: "M17.5 14.7c1.9.5 3.2 1.9 3.2 3.8"
}));
const IcoBell = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 4a5 5 0 0 0-5 5v3l-1.5 2.3v.7h13v-.7L17 12V9a5 5 0 0 0-5-5Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9.5 18a2.5 2.5 0 0 0 5 0"
}));
const IcoBuilding = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("rect", {
  x: "4.5",
  y: "3.5",
  width: "15",
  height: "17",
  rx: "1.6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M8.5 7.5h2M13.5 7.5h2M8.5 11.5h2M13.5 11.5h2M8.5 15.5h7"
}));
const IcoLicense = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 3.2l6.5 2.4v5.1c0 4-2.8 6.6-6.5 8-3.7-1.4-6.5-4-6.5-8V5.6L12 3.2Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9 12l2 2 4-4.2"
}));
const IcoSearch = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "6.5"
}), /*#__PURE__*/React.createElement("path", {
  d: "M20 20l-3.5-3.5"
}));
const IcoPlus = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M12 5v14M5 12h14"
}));
const IcoRefresh = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 11a8 8 0 0 0-13.7-5.2L4 8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 4v4h4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 13a8 8 0 0 0 13.7 5.2L20 16"
}), /*#__PURE__*/React.createElement("path", {
  d: "M20 20v-4h-4"
}));
const IcoLogout = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M14 8l4 4-4 4"
}), /*#__PURE__*/React.createElement("path", {
  d: "M18 12H9"
}));
const IcoChevron = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M9 6l6 6-6 6"
}));
const IcoBolt = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M13 3 5 13h6l-1 8 8-10h-6l1-8Z"
}));
const IcoCheck = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 12.5l4.5 4.5L19 7"
}));
const IcoClock = p => /*#__PURE__*/React.createElement(I, p, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 7.5V12l3 2"
}));
Object.assign(window, {
  IcoDashboard,
  IcoObrigacoes,
  IcoProcessos,
  IcoLogs,
  IcoRegras,
  IcoUsuarios,
  IcoBell,
  IcoBuilding,
  IcoLicense,
  IcoSearch,
  IcoPlus,
  IcoRefresh,
  IcoLogout,
  IcoChevron,
  IcoBolt,
  IcoCheck,
  IcoClock
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteBody.jsx
try { (() => {
// Efficience Co — marketing site: features, how-it-works, pricing, CTA, footer
const FEATURES = [[IcoObrigacoes, 'Obrigações no prazo', 'Calendário fiscal e acessório centralizado. O sistema avisa antes do vencimento e marca o que já foi entregue — nada escapa.'], [IcoProcessos, 'Processos sem gargalo', 'Aberturas, alterações e baixas acompanhadas de ponta a ponta, com visão clara do que está em atraso.'], [IcoRegras, 'Automação por regras', 'Você define a regra uma vez; o agente local executa o trabalho repetitivo no escritório, em segundo plano.'], [IcoBolt, 'Agente local 24/7', 'Roda na máquina do escritório, importa documentos, concilia lançamentos e reporta eventos — sem ninguém clicando.'], [IcoLicense, 'Licença simples', 'Uma mensalidade pela licença e manutenção contínua. Pagamento via Stripe, sem surpresa.'], [IcoUsuarios, 'Feito sob medida', 'Mapeamos o seu fluxo real e entregamos o que o seu escritório precisa — não um sistema genérico.']];
function Features() {
  return /*#__PURE__*/React.createElement("section", {
    className: "section",
    id: "produto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-eyebrow"
  }, "O produto"), /*#__PURE__*/React.createElement("h2", null, "Tudo que o escrit\xF3rio repete, resolvido em um s\xF3 lugar."), /*#__PURE__*/React.createElement("p", null, "Da obriga\xE7\xE3o que vence ao lan\xE7amento que precisa ser conciliado \u2014 a plataforma e o agente local cuidam do operacional para a sua equipe focar no que importa.")), /*#__PURE__*/React.createElement("div", {
    className: "feat-grid"
  }, FEATURES.map(([Icon, t, d], i) => /*#__PURE__*/React.createElement("article", {
    className: "feat",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "feat-ico"
  }, /*#__PURE__*/React.createElement(Icon, null)), /*#__PURE__*/React.createElement("h3", null, t), /*#__PURE__*/React.createElement("p", null, d))))));
}
const STEPS = [['01', 'Mapeamento', 'Levantamos com você como o escritório funciona hoje e onde estão os gargalos reais.'], ['02', 'Documentação funcional', 'Definimos com clareza o que o sistema deve fazer antes de escrever uma linha.'], ['03', 'Prototipação', 'Fluxos e telas validados rápido — você vê antes de construir.'], ['04', 'Desenvolvimento', 'Sprints curtas com entregas parciais. Nada de caixa-preta.'], ['05', 'Homologação', 'Você valida em conjunto antes de qualquer coisa ir para produção.'], ['06', 'Deploy & manutenção', 'Entrega em produção e suporte contínuo — a licença cobre a evolução.']];
function HowItWorks() {
  return /*#__PURE__*/React.createElement("section", {
    className: "section how",
    id: "como"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-eyebrow"
  }, "Como funciona"), /*#__PURE__*/React.createElement("h2", null, "Do diagn\xF3stico ao software rodando."), /*#__PURE__*/React.createElement("p", null, "Um processo direto, sem etapa in\xFAtil. Voc\xEA acompanha cada entrega.")), /*#__PURE__*/React.createElement("div", {
    className: "steps"
  }, STEPS.map(([n, t, d], i) => /*#__PURE__*/React.createElement("div", {
    className: "step",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "step-n"
  }, n), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, t), /*#__PURE__*/React.createElement("p", null, d)))))));
}
function Pricing() {
  const incl = ['Plataforma web + agente local', 'Mapeamento e software sob medida', 'Manutenção e evolução contínuas', 'Suporte e homologação conjunta', 'Dados com RLS e conformidade LGPD'];
  return /*#__PURE__*/React.createElement("section", {
    className: "section",
    id: "planos"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-eyebrow"
  }, "Planos"), /*#__PURE__*/React.createElement("h2", null, "Uma licen\xE7a. Tudo inclu\xEDdo."), /*#__PURE__*/React.createElement("p", null, "Sem m\xF3dulos avulsos nem cobran\xE7a por clique. A mensalidade cobre a licen\xE7a, a manuten\xE7\xE3o e a evolu\xE7\xE3o do seu sistema.")), /*#__PURE__*/React.createElement("div", {
    className: "price-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "price-left"
  }, /*#__PURE__*/React.createElement("h3", null, "Licen\xE7a + Manuten\xE7\xE3o"), /*#__PURE__*/React.createElement("p", null, "Para escrit\xF3rios de contabilidade, administra\xE7\xE3o e gest\xE3o que querem parar de operar no manual."), /*#__PURE__*/React.createElement("ul", {
    className: "price-list"
  }, incl.map((t, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, /*#__PURE__*/React.createElement(IcoCheck, null), " ", t)))), /*#__PURE__*/React.createElement("div", {
    className: "price-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tag"
  }, "a partir de"), /*#__PURE__*/React.createElement("div", {
    className: "price-amt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "big"
  }, "R$ 1.890"), /*#__PURE__*/React.createElement("span", {
    className: "per"
  }, "/ m\xEAs")), /*#__PURE__*/React.createElement("div", {
    className: "note"
  }, "Valor final definido ap\xF3s o diagn\xF3stico, conforme o porte e os fluxos do escrit\xF3rio."), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-primary btn-lg",
    href: "#contato"
  }, "Agendar diagn\xF3stico")))));
}
function CTA() {
  return /*#__PURE__*/React.createElement("section", {
    className: "section cta",
    id: "contato"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("h2", null, "Pronto para tirar o escrit\xF3rio do retrabalho?"), /*#__PURE__*/React.createElement("p", null, "Agende um diagn\xF3stico gratuito. Mapeamos seus gargalos e mostramos exatamente o que d\xE1 para automatizar."), /*#__PURE__*/React.createElement("div", {
    className: "hero-cta",
    style: {
      marginTop: '30px'
    }
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn-primary btn-lg",
    href: "#"
  }, /*#__PURE__*/React.createElement(IcoBolt, null), " Agendar diagn\xF3stico"), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-ghost-dark btn-lg",
    href: "../plataforma/index.html"
  }, "Ver a plataforma"))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "ftr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ftr-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ftr-brand"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "28",
    height: "28",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "wm"
  }, "Efficience Co")), /*#__PURE__*/React.createElement("p", null, "Software sob medida para escrit\xF3rios. Menos retrabalho, mais resultado.")), /*#__PURE__*/React.createElement("div", {
    className: "ftr-cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ftr-col"
  }, /*#__PURE__*/React.createElement("h4", null, "Produto"), /*#__PURE__*/React.createElement("a", {
    href: "#produto"
  }, "Plataforma"), /*#__PURE__*/React.createElement("a", {
    href: "#produto"
  }, "Agente local"), /*#__PURE__*/React.createElement("a", {
    href: "#planos"
  }, "Planos")), /*#__PURE__*/React.createElement("div", {
    className: "ftr-col"
  }, /*#__PURE__*/React.createElement("h4", null, "Empresa"), /*#__PURE__*/React.createElement("a", {
    href: "#como"
  }, "Como funciona"), /*#__PURE__*/React.createElement("a", {
    href: "#contato"
  }, "Contato"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Carreiras")), /*#__PURE__*/React.createElement("div", {
    className: "ftr-col"
  }, /*#__PURE__*/React.createElement("h4", null, "Legal"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Privacidade"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "LGPD"), /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, "Termos")))), /*#__PURE__*/React.createElement("div", {
    className: "ftr-bottom"
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Efficience Co. Todos os direitos reservados."), /*#__PURE__*/React.createElement("span", null, "Feito no Brasil \xB7 contato@efficience.co"))));
}
function SiteApp() {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SiteHeader, null), /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(LogosStrip, null), /*#__PURE__*/React.createElement(Features, null), /*#__PURE__*/React.createElement(HowItWorks, null), /*#__PURE__*/React.createElement(Pricing, null), /*#__PURE__*/React.createElement(CTA, null), /*#__PURE__*/React.createElement(Footer, null));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(SiteApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteBody.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteTop.jsx
try { (() => {
// Efficience Co — marketing site sections
function SiteHeader() {
  return /*#__PURE__*/React.createElement("header", {
    className: "hdr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap hdr-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hdr-brand"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "30",
    height: "30",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "wm"
  }, "Efficience Co")), /*#__PURE__*/React.createElement("nav", {
    className: "hdr-nav"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#produto"
  }, "Produto"), /*#__PURE__*/React.createElement("a", {
    href: "#como"
  }, "Como funciona"), /*#__PURE__*/React.createElement("a", {
    href: "#planos"
  }, "Planos"), /*#__PURE__*/React.createElement("a", {
    href: "#contato"
  }, "Contato")), /*#__PURE__*/React.createElement("div", {
    className: "hdr-cta"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn-ghost-dark",
    href: "../plataforma/index.html"
  }, "Entrar"), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-primary",
    href: "#planos"
  }, "Agendar diagn\xF3stico"))));
}
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-eyebrow"
  }, "Software sob medida para escrit\xF3rios"), /*#__PURE__*/React.createElement("h1", null, "Menos retrabalho,", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "accent"
  }, "mais resultado.")), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "Entramos no seu escrit\xF3rio, mapeamos como tudo funciona e entregamos um software que resolve os gargalos reais do dia a dia \u2014 com um agente que automatiza o trabalho manual em segundo plano."), /*#__PURE__*/React.createElement("div", {
    className: "hero-cta"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn-primary btn-lg",
    href: "#planos"
  }, /*#__PURE__*/React.createElement(IcoBolt, null), " Agendar diagn\xF3stico"), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-ghost-dark btn-lg",
    href: "#como"
  }, "Ver como funciona")), /*#__PURE__*/React.createElement("div", {
    className: "hero-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(IcoCheck, null), " Sem retrabalho manual"), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(IcoCheck, null), " Agente local 24/7"), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement(IcoCheck, null), " Dados conforme a LGPD")), /*#__PURE__*/React.createElement(HeroPreview, null)));
}
function HeroPreview() {
  return /*#__PURE__*/React.createElement("div", {
    className: "hero-preview"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hero-preview-bar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      background: '#ef5f57'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      background: '#febc2e'
    }
  }), /*#__PURE__*/React.createElement("i", {
    style: {
      background: '#28c840'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "hero-shot",
    style: {
      padding: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: '12px'
    }
  }, [['Obrigações abertas', '38', 'var(--slate-900)'], ['Processos ativos', '142', 'var(--slate-900)'], ['Automações / dia', '1.2k', 'var(--brand-600)'], ['Horas poupadas', '96', 'var(--success-700)']].map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "stat",
    style: {
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: '10px',
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      color: 'var(--slate-500)'
    }
  }, s[0]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: '30px',
      letterSpacing: '-.02em',
      color: s[2],
      marginTop: '6px',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums'
    }
  }, s[1]))), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / -1',
      background: 'var(--slate-900)',
      borderRadius: 'var(--r-md)',
      padding: '12px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      lineHeight: 1.8,
      color: 'var(--slate-400)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#7DD3FC'
    }
  }, "10:42"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#34D399',
      fontWeight: 600
    }
  }, "OK"), "  licen\xE7a validada \xB7 pr\xF3xima em 24h"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#7DD3FC'
    }
  }, "10:31"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#94A3B8',
      fontWeight: 600
    }
  }, "INFO"), "  importou 14 NFS-e do portal municipal"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#7DD3FC'
    }
  }, "09:58"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#FBBF24',
      fontWeight: 600
    }
  }, "WARN"), "  3 obriga\xE7\xF5es vencem em < 48h"))));
}
function LogosStrip() {
  return /*#__PURE__*/React.createElement("div", {
    className: "logos"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap logos-in"
  }, /*#__PURE__*/React.createElement("span", {
    className: "lbl"
  }, "Escrit\xF3rios que rodam na Efficience"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Andrade ME"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Prisma Cont\xE1bil"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Nova Gest\xE3o"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "V\xE9rtice"), /*#__PURE__*/React.createElement("span", {
    className: "name"
  }, "Lopes & Assoc.")));
}
Object.assign(window, {
  SiteHeader,
  Hero,
  LogosStrip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteTop.jsx", error: String((e && e.message) || e) }); }

})();
