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
const IcoClientes = (p) => (<I {...p}><path d="M3.5 20.5V8l6-4 6 4v12.5"/><path d="M15.5 11l5 3v6.5"/><path d="M3.5 20.5h17"/><path d="M7 11h2M7 14.5h2M11.5 11h.5M11.5 14.5h.5"/></I>);
const IcoLicense = (p) => (<I {...p}><path d="M12 3.2l6.5 2.4v5.1c0 4-2.8 6.6-6.5 8-3.7-1.4-6.5-4-6.5-8V5.6L12 3.2Z"/><path d="M9 12l2 2 4-4.2"/></I>);
const IcoSearch = (p) => (<I {...p}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></I>);
const IcoPlus = (p) => (<I {...p}><path d="M12 5v14M5 12h14"/></I>);
const IcoRefresh = (p) => (<I {...p}><path d="M20 11a8 8 0 0 0-13.7-5.2L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.7 5.2L20 16"/><path d="M20 20v-4h-4"/></I>);
const IcoLogout = (p) => (<I {...p}><path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/></I>);
const IcoChevron = (p) => (<I {...p}><path d="M9 6l6 6-6 6"/></I>);
const IcoChevDown = (p) => (<I {...p}><path d="M6 9l6 6 6-6"/></I>);
const IcoChevLeft = (p) => (<I {...p}><path d="M15 6l-6 6 6 6"/></I>);
const IcoChevRight = (p) => (<I {...p}><path d="M9 6l6 6-6 6"/></I>);
const IcoBolt = (p) => (<I {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/></I>);
const IcoCheck = (p) => (<I {...p}><path d="M5 12.5l4.5 4.5L19 7"/></I>);
const IcoClock = (p) => (<I {...p}><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></I>);
const IcoFilter = (p) => (<I {...p}><path d="M4 5.5h16l-6 7v5l-4 2v-7L4 5.5Z"/></I>);
const IcoUpload = (p) => (<I {...p}><path d="M12 15.5V4M12 4 7.5 8.5M12 4l4.5 4.5"/><path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/></I>);
const IcoEdit = (p) => (<I {...p}><path d="M16.5 4.5l3 3L8 19l-4 1 1-4 11.5-11.5Z"/><path d="M14.5 6.5l3 3"/></I>);
const IcoTrash = (p) => (<I {...p}><path d="M4.5 6.5h15M9 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5"/><path d="M6.5 6.5 7.5 19a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12.5"/><path d="M10 10v6M14 10v6"/></I>);
const IcoX = (p) => (<I {...p}><path d="M6 6l12 12M18 6 6 18"/></I>);
const IcoCalendarGrid = (p) => (<I {...p}><path d="M7 3.5v3M17 3.5v3"/><rect x="4" y="6.5" width="16" height="14" rx="2"/><path d="M4 10.5h16"/></I>);
const IcoList = (p) => (<I {...p}><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/></I>);
const IcoFile = (p) => (<I {...p}><path d="M6 3.5h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M13 3.5V9h5"/></I>);
const IcoFolder = (p) => (<I {...p}><path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h3.4a1.5 1.5 0 0 1 1.1.5l1 1.1H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5Z"/></I>);
const IcoArrowRight = (p) => (<I {...p}><path d="M5 12h14M13 6l6 6-6 6"/></I>);
const IcoUserPlus = (p) => (<I {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-2.7 2.4-4.7 5.5-4.7 1 0 2 .2 2.8.6"/><path d="M17.5 13v5M15 15.5h5"/></I>);
const IcoCheckCircle = (p) => (<I {...p}><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/></I>);
const IcoXCircle = (p) => (<I {...p}><circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></I>);
const IcoAlert = (p) => (<I {...p}><path d="M12 4.5 21 19H3L12 4.5Z"/><path d="M12 10v4M12 16.5h.01"/></I>);
const IcoPower = (p) => (<I {...p}><path d="M12 4v8"/><path d="M7.5 7a7 7 0 1 0 9 0"/></I>);
const IcoMail = (p) => (<I {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 5.5L19.5 7"/></I>);
const IcoShield = (p) => (<I {...p}><path d="M12 3.2l6.5 2.4v5.1c0 4-2.8 6.6-6.5 8-3.7-1.4-6.5-4-6.5-8V5.6L12 3.2Z"/></I>);
const IcoDots = (p) => (<I {...p}><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></I>);
const IcoBuilding2 = (p) => (<I {...p}><rect x="4" y="8" width="9" height="12.5" rx="1.2"/><path d="M13 11.5h6a1 1 0 0 1 1 1v8H13"/><path d="M7 11.5h2M7 15h2M7 18.5h2M16 14.5h1M16 17.5h1"/><path d="M4 8 8.5 4 13 8"/></I>);
const IcoLink = (p) => (<I {...p}><path d="M9.5 14.5l5-5"/><path d="M8 10.5 6.5 12a3.2 3.2 0 0 0 4.5 4.5l1.5-1.5"/><path d="M16 13.5 17.5 12A3.2 3.2 0 0 0 13 7.5L11.5 9"/></I>);

/* ---- Área-nav icons (mirrors real Sidebar.jsx, issue #358) ---- */
const IcoFiscal = (p) => (<I {...p}><path d="M6 3.5h9l3 3v13.5H6z"/><path d="M15 3.5V7h3"/><path d="M9 12.5h6"/><path d="M9 16h6"/></I>);
const IcoContabil = (p) => (<I {...p}><rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 9.5h17"/><path d="M8 14.5l2.5 2.5L16 12"/></I>);
const IcoDp = (p) => (<I {...p}><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6"/></I>);
const IcoSocietario = (p) => (<I {...p}><path d="M12 3.5 4 7v2h16V7z"/><path d="M5.5 9v9"/><path d="M9.5 9v9"/><path d="M14.5 9v9"/><path d="M18.5 9v9"/><path d="M4 20.5h16"/></I>);
const IcoFinanceiro = (p) => (<I {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M9.5 10a2.2 2.2 0 0 1 2.2-1.7h.6A2.1 2.1 0 0 1 14.5 10c0 1.2-.9 1.7-2.5 2.2s-2.5 1-2.5 2.2a2.1 2.1 0 0 0 2.2 1.7h.6a2.2 2.2 0 0 0 2.2-1.7"/></I>);
const IcoAtendimento = (p) => (<I {...p}><path d="M4 12a8 8 0 0 1 16 0v4.5a2 2 0 0 1-2 2h-1"/><rect x="3.5" y="12" width="4" height="5.5" rx="1.2"/><rect x="16.5" y="12" width="4" height="5.5" rx="1.2"/><path d="M14.5 18.5a2 2 0 0 1-2 2h-1.5"/></I>);

/* ---- Automation-card icons (mirrors frontend/src/components/icons/AutomacaoIcons.jsx, issue #358 followup) ---- */
const IcoAutDocumento = (p) => (<I {...p}><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5V7.5h4"/><path d="M9.5 13h5"/><path d="M9.5 16.5h5"/></I>);
const IcoAutCalculadora = (p) => (<I {...p}><rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M8 7.5h8"/><path d="M8.2 12h1.2M12 12h1.2M15.6 12h1.2"/><path d="M8.2 15.5h1.2M12 15.5h1.2M15.6 15.5h1.2"/></I>);
const IcoAutGuia = (p) => (<I {...p}><rect x="4.5" y="6" width="15" height="12" rx="1.5"/><path d="M4.5 10h15"/><path d="M8 13.5h3"/><path d="M8 16h6"/></I>);
const IcoAutPasta = (p) => (<I {...p}><path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h7A1.5 1.5 0 0 1 20 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z"/></I>);
const IcoAutTransmissao = (p) => (<I {...p}><circle cx="12" cy="12" r="2"/><path d="M8.3 15.7a5.2 5.2 0 0 1 0-7.4"/><path d="M15.7 8.3a5.2 5.2 0 0 1 0 7.4"/><path d="M5.6 18.4a9.2 9.2 0 0 1 0-12.8"/><path d="M18.4 5.6a9.2 9.2 0 0 1 0 12.8"/></I>);
const IcoAutEtiqueta = (p) => (<I {...p}><path d="M11.2 4H6a1.5 1.5 0 0 0-1.5 1.5v5.2c0 .4.16.78.44 1.06l7.6 7.6a1.5 1.5 0 0 0 2.12 0l5.2-5.2a1.5 1.5 0 0 0 0-2.12l-7.6-7.6A1.5 1.5 0 0 0 11.2 4z"/><circle cx="8.5" cy="8.5" r="1.2"/></I>);
const IcoAutCifrao = (p) => (<I {...p}><path d="M12 4v16"/><path d="M15.5 7.5a3 3 0 0 0-3-1.5h-1a2.6 2.6 0 0 0 0 5.2h1a2.6 2.6 0 0 1 0 5.2h-1a3 3 0 0 1-3-1.5"/></I>);
const IcoAutLupa = (p) => (<I {...p}><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15 20 20"/></I>);
const IcoAutSino = (p) => (<I {...p}><path d="M6 17v-5.5a6 6 0 0 1 12 0V17l1.5 2h-15z"/><path d="M10.3 20.5a1.8 1.8 0 0 0 3.4 0"/></I>);
const IcoAutPredio = (p) => (<I {...p}><rect x="5" y="3.5" width="10" height="17" rx="1"/><rect x="15" y="9.5" width="4.5" height="11" rx="1"/><path d="M8 7.5h1.5M11.5 7.5H13M8 11h1.5M11.5 11H13M8 14.5h1.5M11.5 14.5H13"/></I>);
const IcoAutSelo = (p) => (<I {...p}><circle cx="12" cy="9.5" r="5.5"/><path d="M9 14.5 8 20.5l4-2 4 2-1-6"/></I>);
const IcoAutEscudo = (p) => (<I {...p}><path d="M12 3.5 5 6v6c0 4.4 2.9 7.6 7 8.5 4.1-.9 7-4.1 7-8.5V6z"/><path d="M9.2 12 11 13.8 15 9.8"/></I>);
const IcoAutAssinatura = (p) => (<I {...p}><path d="M4 17.5c2-3.5 3.6-5.6 4.8-6.1 1-.4 1.2.7.6 1.6-.8 1.2-.6 1.9.5 1.4 1.7-.8 3.6-2.7 4.8-4.4.9-1.3-.2-2.3-1.3-1.2-1.6 1.6-2.4 3.7-1.6 4.9.7 1 2.6.6 4.2-.6"/><path d="M4 20.5h16"/></I>);
const IcoAutCiclo = (p) => (<I {...p}><path d="M19 12a7 7 0 0 1-11.9 5"/><path d="M5 12a7 7 0 0 1 11.9-5"/><path d="M17.5 4.5v3.2h-3.2"/><path d="M6.5 19.5v-3.2h3.2"/></I>);
const IcoAutComprovante = (p) => (<I {...p}><path d="M6.5 3.5h11v17l-2-1.3-1.8 1.3-1.7-1.3-1.8 1.3-1.7-1.3-2 1.3z"/><path d="M9 8h6"/><path d="M9 11.2h6"/><path d="M9 14.4h3.5"/></I>);
const IcoAutCalendario = (p) => (<I {...p}><rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 9.5h16"/><path d="M8 3.5v3M16 3.5v3"/><path d="M8 13h1.5M12 13h1.5M16 13h.01"/></I>);
const IcoAutPessoa = (p) => (<I {...p}><circle cx="12" cy="8.2" r="3.2"/><path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6"/></I>);
const IcoAutCruzMedica = (p) => (<I {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M8.5 12h7"/></I>);
const IcoAutRelogio = (p) => (<I {...p}><circle cx="12" cy="12.5" r="7.5"/><path d="M12 8.5V13l3 2"/><path d="M9.5 2.5h5"/></I>);
const IcoAutOnibus = (p) => (<I {...p}><rect x="4" y="5.5" width="16" height="11" rx="2"/><path d="M4 11h16"/><circle cx="8" cy="19" r="1.3"/><circle cx="16" cy="19" r="1.3"/></I>);
const IcoAutTelefone = (p) => (<I {...p}><path d="M6 3.5c1 0 2.5 2.5 2.5 3.5S7 8.5 7 9.5c0 2.5 4 6.5 6.5 6.5 1 0 1.5-1.5 2.5-1.5s3.5 1.5 3.5 2.5c0 1.5-1.5 3-3 3-6 0-13-7-13-13 0-1.5 1.5-3 2.5-3z"/></I>);
const IcoAutGrafico = (p) => (<I {...p}><path d="M4 20.5h16"/><path d="M7 20.5v-6M12 20.5V8M17 20.5v-9.5"/><path d="M5.5 11 10 6.5l3 3 5.5-5.5"/><path d="M15.5 4h3v3"/></I>);
const IcoAutEnvelope = (p) => (<I {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 6.5 12 13l8-6.5"/></I>);
const IcoAutEntrada = (p) => (<I {...p}><path d="M10 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H10"/><path d="M15 16l5-4-5-4"/><path d="M20 12H10"/></I>);

Object.assign(window, {
  IcoDashboard, IcoObrigacoes, IcoProcessos, IcoLogs, IcoRegras, IcoUsuarios,
  IcoBell, IcoBuilding, IcoClientes, IcoLicense, IcoSearch, IcoPlus, IcoRefresh, IcoLogout,
  IcoChevron, IcoChevDown, IcoChevLeft, IcoChevRight, IcoBolt, IcoCheck, IcoClock,
  IcoFilter, IcoUpload, IcoEdit, IcoTrash, IcoX, IcoCalendarGrid, IcoList, IcoFile,
  IcoFolder, IcoArrowRight, IcoUserPlus, IcoCheckCircle, IcoXCircle, IcoAlert, IcoPower,
  IcoMail, IcoShield, IcoDots, IcoBuilding2, IcoLink,
  IcoFiscal, IcoContabil, IcoDp, IcoSocietario, IcoFinanceiro, IcoAtendimento,
  IcoAutDocumento, IcoAutCalculadora, IcoAutGuia, IcoAutPasta, IcoAutTransmissao,
  IcoAutEtiqueta, IcoAutCifrao, IcoAutLupa, IcoAutSino, IcoAutPredio, IcoAutSelo,
  IcoAutEscudo, IcoAutAssinatura, IcoAutCiclo, IcoAutComprovante, IcoAutCalendario,
  IcoAutPessoa, IcoAutCruzMedica, IcoAutRelogio, IcoAutOnibus, IcoAutTelefone,
  IcoAutGrafico, IcoAutEnvelope, IcoAutEntrada,
});
