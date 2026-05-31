// Efficience Co — app chrome: Logo, Sidebar (dark rail + agent card), Topbar
const { useState } = React;

function Logo({ size = 30 }) {
  return <img src="../../assets/logo-mark.svg" width={size} height={size} alt="Efficience Co" style={{ display: 'block' }} />;
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard', Icon: IcoDashboard },
  { key: 'obrigacoes', label: 'Obrigações', Icon: IcoObrigacoes },
  { key: 'processos', label: 'Processos', Icon: IcoProcessos },
  { key: 'regras', label: 'Regras', Icon: IcoRegras },
  { key: 'logs', label: 'Logs do agente', Icon: IcoLogs },
];
const NAV_GESTAO = [
  { key: 'clientes', label: 'Clientes', Icon: IcoClientes },
  { key: 'usuarios', label: 'Usuários', Icon: IcoUsuarios },
];
const NAV_EFFICIENCE = [
  { key: 'escritorios', label: 'Escritórios', Icon: IcoBuilding2 },
];

function NavItem({ item, active, onClick }) {
  const { Icon } = item;
  return (
    <button className={'ni' + (active ? ' active' : '')} onClick={onClick}>
      <Icon />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge ? <span className="nbadge">{item.badge}</span> : null}
    </button>
  );
}

function AgentCard() {
  // weekly automation heights (relative)
  const spark = [38, 52, 44, 70, 60, 88, 100];
  return (
    <div className="agent-card">
      <div className="agent-top">
        <span className="heartbeat" />
        <span className="agent-name">Agente local</span>
        <span className="agent-state">Online</span>
      </div>
      <div className="agent-meta">Sincronizou há 2 min · 1.243 automações hoje</div>
      <div className="agent-spark">
        {spark.map((h, i) => <i key={i} style={{ height: h + '%' }} />)}
      </div>
    </div>
  );
}

function Sidebar({ route, onNavigate, onLogout, user }) {
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <Logo size={30} />
        <div className="sb-wm">Efficience <span className="co">Co</span></div>
      </div>
      <nav className="sb-nav">
        {NAV.map((it) => <NavItem key={it.key} item={it} active={route === it.key} onClick={() => onNavigate(it.key)} />)}
        <div className="sb-section">Gestão · admin do escritório</div>
        {NAV_GESTAO.map((it) => <NavItem key={it.key} item={it} active={route === it.key} onClick={() => onNavigate(it.key)} />)}
        <div className="sb-section">Efficience · suporte</div>
        {NAV_EFFICIENCE.map((it) => <NavItem key={it.key} item={it} active={route === it.key} onClick={() => onNavigate(it.key)} />)}
      </nav>
      <AgentCard />
      <div className="sb-user">
        <span className="avatar">{(user?.nome || 'VA').slice(0, 2).toUpperCase()}</span>
        <div style={{ flex: 1 }}>
          <div className="sb-uname">{user?.nome || 'Victor Almeida'}</div>
          <div className="sb-umail">{user?.email || 'victor@efficience.co'}</div>
        </div>
        <button className="sb-logout" title="Sair" onClick={onLogout}><IcoLogout /></button>
      </div>
    </aside>
  );
}

const TITLES = {
  dashboard: 'Dashboard', obrigacoes: 'Obrigações', processos: 'Processos',
  regras: 'Regras', logs: 'Logs do agente', usuarios: 'Usuários', clientes: 'Clientes',
  escritorios: 'Escritórios', notificacoes: 'Notificações',
};

function Topbar({ route, unread, onBellClick }) {
  return (
    <header className="topbar">
      <div className="crumb">
        <span>Plataforma</span>
        <span className="sep">/</span>
        <span className="here">{TITLES[route] || 'Dashboard'}</span>
      </div>
      <div className="tb-actions">
        <div className="competencia"><IcoObrigacoes /> Competência · Maio 2026</div>
        <div className="icon-btn" title="Buscar"><IcoSearch /></div>
        <div className="icon-btn" title="Notificações" onClick={onBellClick}><IcoBell />{unread ? <span className="ping" /> : null}</div>
      </div>
    </header>
  );
}

Object.assign(window, { Logo, Sidebar, Topbar, NAV, NAV_GESTAO, NAV_EFFICIENCE });
