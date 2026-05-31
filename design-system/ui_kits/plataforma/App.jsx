// Efficience Co — Login (dark glass) + App shell wiring
const { useState: useStateApp } = React;

function Login({ onLogin }) {
  const [email, setEmail] = useStateApp('victor@andradecontabil.com.br');
  const [senha, setSenha] = useStateApp('demo1234');
  const [loading, setLoading] = useStateApp(false);
  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin({ nome: 'Victor Almeida', email }); }, 600);
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="../../assets/logo-mark.svg" width="34" height="34" alt="" />
          <span className="wm">Efficience Co</span>
        </div>
        <div className="login-eyebrow">Plataforma</div>
        <h1 className="login-h">Entrar na plataforma</h1>
        <p className="login-sub">Use seu e-mail e senha para acessar sua conta.</p>
        <div className="field">
          <label>E-mail</label>
          <input type="email" value={email} placeholder="voce@empresa.com" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" value={senha} placeholder="Digite sua senha" onChange={(e) => setSenha(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <div className="login-hint">Protegido por JWT · dados tratados conforme a LGPD</div>
      </form>
    </div>
  );
}

function App() {
  const [user, setUser] = useStateApp(null);
  const [route, setRoute] = useStateApp('dashboard');
  const notifs = useNotifs();

  if (!user) return <Login onLogin={(u) => { setUser(u); setRoute('dashboard'); }} />;

  let content;
  switch (route) {
    case 'dashboard': content = <DashboardPage onNavigate={setRoute} />; break;
    case 'obrigacoes': content = <ObrigacoesPage />; break;
    case 'processos': content = <ProcessosPage />; break;
    case 'regras': content = <RegrasPage />; break;
    case 'logs': content = <LogsPage />; break;
    case 'clientes': content = <ClientesPage />; break;
    case 'usuarios': content = <UsuariosPage />; break;
    case 'escritorios': content = <EscritoriosPage />; break;
    case 'notificacoes': content = <NotificacoesPage store={notifs} />; break;
    default: content = <DashboardPage onNavigate={setRoute} />;
  }

  return (
    <div className="shell">
      <Sidebar route={route} user={user} onNavigate={setRoute} onLogout={() => setUser(null)} />
      <div className="main">
        <Topbar route={route} unread={notifs.unread} onBellClick={() => setRoute('notificacoes')} />
        <div className="scroll">{content}</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
