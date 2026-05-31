// Efficience Co — marketing site: features, how-it-works, pricing, CTA, footer
const FEATURES = [
  [IcoObrigacoes, 'Obrigações no prazo', 'Calendário fiscal e acessório centralizado. O sistema avisa antes do vencimento e marca o que já foi entregue — nada escapa.'],
  [IcoProcessos, 'Processos sem gargalo', 'Aberturas, alterações e baixas acompanhadas de ponta a ponta, com visão clara do que está em atraso.'],
  [IcoRegras, 'Automação por regras', 'Você define a regra uma vez; o agente local executa o trabalho repetitivo no escritório, em segundo plano.'],
  [IcoBolt, 'Agente local 24/7', 'Roda na máquina do escritório, importa documentos, concilia lançamentos e reporta eventos — sem ninguém clicando.'],
  [IcoLicense, 'Licença simples', 'Uma mensalidade pela licença e manutenção contínua. Pagamento via Stripe, sem surpresa.'],
  [IcoUsuarios, 'Feito sob medida', 'Mapeamos o seu fluxo real e entregamos o que o seu escritório precisa — não um sistema genérico.'],
];

function Features() {
  return (
    <section className="section" id="produto">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-eyebrow">O produto</div>
          <h2>Tudo que o escritório repete, resolvido em um só lugar.</h2>
          <p>Da obrigação que vence ao lançamento que precisa ser conciliado — a plataforma e o agente local cuidam do operacional para a sua equipe focar no que importa.</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map(([Icon, t, d], i) => (
            <article className="feat" key={i}>
              <div className="feat-ico"><Icon /></div>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ['01', 'Mapeamento', 'Levantamos com você como o escritório funciona hoje e onde estão os gargalos reais.'],
  ['02', 'Documentação funcional', 'Definimos com clareza o que o sistema deve fazer antes de escrever uma linha.'],
  ['03', 'Prototipação', 'Fluxos e telas validados rápido — você vê antes de construir.'],
  ['04', 'Desenvolvimento', 'Sprints curtas com entregas parciais. Nada de caixa-preta.'],
  ['05', 'Homologação', 'Você valida em conjunto antes de qualquer coisa ir para produção.'],
  ['06', 'Deploy & manutenção', 'Entrega em produção e suporte contínuo — a licença cobre a evolução.'],
];

function HowItWorks() {
  return (
    <section className="section how" id="como">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-eyebrow">Como funciona</div>
          <h2>Do diagnóstico ao software rodando.</h2>
          <p>Um processo direto, sem etapa inútil. Você acompanha cada entrega.</p>
        </div>
        <div className="steps">
          {STEPS.map(([n, t, d], i) => (
            <div className="step" key={i}>
              <div className="step-n">{n}</div>
              <div><h3>{t}</h3><p>{d}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const incl = ['Plataforma web + agente local', 'Mapeamento e software sob medida', 'Manutenção e evolução contínuas', 'Suporte e homologação conjunta', 'Dados com RLS e conformidade LGPD'];
  return (
    <section className="section" id="planos">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-eyebrow">Planos</div>
          <h2>Uma licença. Tudo incluído.</h2>
          <p>Sem módulos avulsos nem cobrança por clique. A mensalidade cobre a licença, a manutenção e a evolução do seu sistema.</p>
        </div>
        <div className="price-card">
          <div className="price-left">
            <h3>Licença + Manutenção</h3>
            <p>Para escritórios de contabilidade, administração e gestão que querem parar de operar no manual.</p>
            <ul className="price-list">
              {incl.map((t, i) => <li key={i}><IcoCheck /> {t}</li>)}
            </ul>
          </div>
          <div className="price-right">
            <span className="tag">a partir de</span>
            <div className="price-amt"><span className="big">R$ 1.890</span><span className="per">/ mês</span></div>
            <div className="note">Valor final definido após o diagnóstico, conforme o porte e os fluxos do escritório.</div>
            <a className="btn btn-primary btn-lg" href="#contato">Agendar diagnóstico</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="section cta" id="contato">
      <div className="wrap">
        <h2>Pronto para tirar o escritório do retrabalho?</h2>
        <p>Agende um diagnóstico gratuito. Mapeamos seus gargalos e mostramos exatamente o que dá para automatizar.</p>
        <div className="hero-cta" style={{ marginTop: '30px' }}>
          <a className="btn btn-primary btn-lg" href="#"><IcoBolt /> Agendar diagnóstico</a>
          <a className="btn btn-ghost-dark btn-lg" href="../plataforma/index.html">Ver a plataforma</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-top">
          <div className="ftr-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="../../assets/logo-mark.svg" width="28" height="28" alt="" />
              <span className="wm">Efficience Co</span>
            </div>
            <p>Software sob medida para escritórios. Menos retrabalho, mais resultado.</p>
          </div>
          <div className="ftr-cols">
            <div className="ftr-col"><h4>Produto</h4><a href="#produto">Plataforma</a><a href="#produto">Agente local</a><a href="#planos">Planos</a></div>
            <div className="ftr-col"><h4>Empresa</h4><a href="#como">Como funciona</a><a href="#contato">Contato</a><a href="#">Carreiras</a></div>
            <div className="ftr-col"><h4>Legal</h4><a href="#">Privacidade</a><a href="#">LGPD</a><a href="#">Termos</a></div>
          </div>
        </div>
        <div className="ftr-bottom">
          <span>© 2026 Efficience Co. Todos os direitos reservados.</span>
          <span>Feito no Brasil · contato@efficience.co</span>
        </div>
      </div>
    </footer>
  );
}

function SiteApp() {
  return (
    <React.Fragment>
      <SiteHeader />
      <Hero />
      <LogosStrip />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTA />
      <Footer />
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SiteApp />);
