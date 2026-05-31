// Efficience Co — line icon set (1.8 stroke, 24px grid, currentColor)
// Mirrors the product's hand-authored SVGs; Lucide-compatible style.
const I = ({ d, children, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

const IcoDashboard = (p) => (<I {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.4"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/></I>);
const IcoObrigacoes = (p) => (<I {...p}><path d="M7 3.5v3"/><path d="M17 3.5v3"/><rect x="4" y="6.5" width="16" height="14" rx="2"/><path d="M4 10.5h16"/><path d="M12.5 14.5l-3 3-1.5-1.5"/></I>);
const IcoProcessos = (p) => (<I {...p}><rect x="3.5" y="4" width="17" height="16.5" rx="2"/><path d="M3.5 8h17"/><path d="M8 12h8"/><path d="M8 15.5h5"/></I>);
const IcoLogs = (p) => (<I {...p}><path d="M5 5.5h14"/><path d="M5 12h14"/><path d="M5 18.5h9"/></I>);
const IcoRegras = (p) => (<I {...p}><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/><path d="M7 9.4v5.2a2 2 0 0 0 2 2h5.6"/><path d="M14.6 16.6l-2 0M14.6 16.6l0-2"/></I>);
const IcoUsuarios = (p) => (<I {...p}><circle cx="9" cy="8.5" r="3"/><path d="M3.8 19c0-2.6 2.3-4.5 5.2-4.5s5.2 1.9 5.2 4.5"/><path d="M16.5 7.6a2.6 2.6 0 0 1 0 5.1"/><path d="M17.5 14.7c1.9.5 3.2 1.9 3.2 3.8"/></I>);
const IcoBell = (p) => (<I {...p}><path d="M12 4a5 5 0 0 0-5 5v3l-1.5 2.3v.7h13v-.7L17 12V9a5 5 0 0 0-5-5Z"/><path d="M9.5 18a2.5 2.5 0 0 0 5 0"/></I>);
const IcoBuilding = (p) => (<I {...p}><rect x="4.5" y="3.5" width="15" height="17" rx="1.6"/><path d="M8.5 7.5h2M13.5 7.5h2M8.5 11.5h2M13.5 11.5h2M8.5 15.5h7"/></I>);
const IcoLicense = (p) => (<I {...p}><path d="M12 3.2l6.5 2.4v5.1c0 4-2.8 6.6-6.5 8-3.7-1.4-6.5-4-6.5-8V5.6L12 3.2Z"/><path d="M9 12l2 2 4-4.2"/></I>);
const IcoSearch = (p) => (<I {...p}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></I>);
const IcoPlus = (p) => (<I {...p}><path d="M12 5v14M5 12h14"/></I>);
const IcoRefresh = (p) => (<I {...p}><path d="M20 11a8 8 0 0 0-13.7-5.2L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.7 5.2L20 16"/><path d="M20 20v-4h-4"/></I>);
const IcoLogout = (p) => (<I {...p}><path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/></I>);
const IcoChevron = (p) => (<I {...p}><path d="M9 6l6 6-6 6"/></I>);
const IcoBolt = (p) => (<I {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/></I>);
const IcoCheck = (p) => (<I {...p}><path d="M5 12.5l4.5 4.5L19 7"/></I>);
const IcoClock = (p) => (<I {...p}><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></I>);

Object.assign(window, {
  IcoDashboard, IcoObrigacoes, IcoProcessos, IcoLogs, IcoRegras, IcoUsuarios,
  IcoBell, IcoBuilding, IcoLicense, IcoSearch, IcoPlus, IcoRefresh, IcoLogout,
  IcoChevron, IcoBolt, IcoCheck, IcoClock,
});
