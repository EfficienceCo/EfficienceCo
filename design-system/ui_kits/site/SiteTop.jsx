// Efficience Co — marketing site sections
function SiteHeader() {
  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <div className="hdr-brand">
          <img src="../../assets/logo-mark.svg" width="30" height="30" alt="" />
          <span className="wm">Efficience Co</span>
        </div>
        <nav className="hdr-nav">
          <a href="#produto">Produto</a>
          <a href="#como">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#contato">Contato</a>
        </nav>
        <div className="hdr-cta">
          <a className="btn btn-ghost-dark" href="../plataforma/index.html">Entrar</a>
          <a className="btn btn-primary" href="#planos">Agendar diagnóstico</a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-eyebrow">Software sob medida para escritórios</div>
        <h1>Menos retrabalho,<br /><span className="accent">mais resultado.</span></h1>
        <p className="lead">Entramos no seu escritório, mapeamos como tudo funciona e entregamos um software que resolve os gargalos reais do dia a dia — com um agente que automatiza o trabalho manual em segundo plano.</p>
        <div className="hero-cta">
          <a className="btn btn-primary btn-lg" href="#planos"><IcoBolt /> Agendar diagnóstico</a>
          <a className="btn btn-ghost-dark btn-lg" href="#como">Ver como funciona</a>
        </div>
        <div className="hero-meta">
          <div className="row"><IcoCheck /> Sem retrabalho manual</div>
          <div className="row"><IcoCheck /> Agente local 24/7</div>
          <div className="row"><IcoCheck /> Dados conforme a LGPD</div>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="hero-preview">
      <div className="hero-preview-bar">
        <i style={{ background: '#ef5f57' }} /><i style={{ background: '#febc2e' }} /><i style={{ background: '#28c840' }} />
      </div>
      <div className="hero-shot" style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {[['Obrigações abertas', '38', 'var(--slate-900)'], ['Processos ativos', '142', 'var(--slate-900)'], ['Automações / dia', '1.2k', 'var(--brand-600)'], ['Horas poupadas', '96', 'var(--success-700)']].map((s, i) => (
          <div key={i} className="stat" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-sm)', padding: '14px 16px' }}>
            <div style={{ fontWeight: 600, fontSize: '10px', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--slate-500)' }}>{s[0]}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '30px', letterSpacing: '-.02em', color: s[2], marginTop: '6px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s[1]}</div>
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1', background: 'var(--slate-900)', borderRadius: 'var(--r-md)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.8, color: 'var(--slate-400)' }}>
          <div><span style={{ color: '#7DD3FC' }}>10:42</span> <span style={{ color: '#34D399', fontWeight: 600 }}>OK</span>  licença validada · próxima em 24h</div>
          <div><span style={{ color: '#7DD3FC' }}>10:31</span> <span style={{ color: '#94A3B8', fontWeight: 600 }}>INFO</span>  importou 14 NFS-e do portal municipal</div>
          <div><span style={{ color: '#7DD3FC' }}>09:58</span> <span style={{ color: '#FBBF24', fontWeight: 600 }}>WARN</span>  3 obrigações vencem em &lt; 48h</div>
        </div>
      </div>
    </div>
  );
}

function LogosStrip() {
  return (
    <div className="logos">
      <div className="wrap logos-in">
        <span className="lbl">Escritórios que rodam na Efficience</span>
        <span className="name">Andrade ME</span>
        <span className="name">Prisma Contábil</span>
        <span className="name">Nova Gestão</span>
        <span className="name">Vértice</span>
        <span className="name">Lopes &amp; Assoc.</span>
      </div>
    </div>
  );
}

Object.assign(window, { SiteHeader, Hero, LogosStrip });
