// Efficience Co — shared UI primitives
const { useState: useStateUI } = React;

function Modal({ title, subtitle, onClose, children, footer, size }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={'modal' + (size === 'lg' ? ' lg' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><IcoX /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

function Field({ label, required, children, help, full }) {
  return (
    <div className={'form-field' + (full ? ' full' : '')}>
      {label ? <label className="form-label">{label}{required ? <span className="req"> *</span> : null}</label> : null}
      {children}
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}

function Input(props) { return <input className="input" {...props} />; }
function Textarea(props) { return <textarea className="textarea" {...props} />; }
function Select({ children, ...p }) { return <select className="select-input" {...p}>{children}</select>; }

function SegRadio({ options, value, onChange }) {
  return (
    <div className="segradio">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">{o.label}</button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return <button className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} type="button" aria-pressed={on} />;
}

function PageTabs({ tabs, active, onChange }) {
  return (
    <div className="ptabs">
      {tabs.map((t) => {
        const Icon = t.Icon;
        return (
          <button key={t.key} className={'ptab' + (active === t.key ? ' active' : '')} onClick={() => onChange(t.key)}>
            {Icon ? <Icon /> : null}{t.label}
          </button>
        );
      })}
    </div>
  );
}

function Search({ placeholder }) {
  return (
    <div className="searchbox"><IcoSearch /><input placeholder={placeholder || 'Buscar…'} /></div>
  );
}

function Dropdown({ value, onChange, options }) {
  return (
    <div className="select">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="chev"><IcoChevDown /></span>
    </div>
  );
}

function FilterChips({ options, value, onChange }) {
  return (
    <div className="fchips">
      {options.map((o) => (
        <button key={o.value} className={'fchip' + (value === o.value ? ' active' : '')} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Pager({ page, pages, total, onPage }) {
  const nums = [];
  for (let i = 1; i <= pages; i++) nums.push(i);
  return (
    <div className="pager">
      <div className="pager-info">Mostrando página {page} de {pages} · {total} registros</div>
      <div className="pager-ctrl">
        <button className="pbtn" disabled={page === 1} onClick={() => onPage(page - 1)}><IcoChevLeft /></button>
        {nums.map((n) => <button key={n} className={'pbtn' + (n === page ? ' active' : '')} onClick={() => onPage(n)}>{n}</button>)}
        <button className="pbtn" disabled={page === pages} onClick={() => onPage(page + 1)}><IcoChevRight /></button>
      </div>
    </div>
  );
}

function Progress({ value, done }) {
  return <div className="progress"><div className={'progress-bar' + (done ? ' done' : '')} style={{ width: value + '%' }} /></div>;
}

function Badge({ kind, children, dot }) {
  return <span className={'badge badge-' + kind}>{dot ? <span className="dot" /> : null}{children}</span>;
}

function Avatar({ name, cls }) {
  const init = (name || '').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return <span className={cls || 'cell-av'}>{init}</span>;
}

function EmptyState({ Icon, title, sub }) {
  return (
    <div className="empty">
      <div className="ei"><Icon /></div>
      <div className="et">{title}</div>
      {sub ? <div className="es">{sub}</div> : null}
    </div>
  );
}

function PageHead({ title, sub, children }) {
  return (
    <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
      <div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
      {children ? <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>{children}</div> : null}
    </div>
  );
}

Object.assign(window, {
  Modal, Field, Input, Textarea, Select, SegRadio, Toggle, PageTabs, Search,
  Dropdown, FilterChips, Pager, Progress, Badge, Avatar, EmptyState, PageHead,
});
