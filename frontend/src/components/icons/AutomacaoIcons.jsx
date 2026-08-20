function IconBase({ children, className = 'h-5 w-5' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function DocumentoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5V7.5h4" />
      <path d="M9.5 13h5" />
      <path d="M9.5 16.5h5" />
    </IconBase>
  );
}

export function CalculadoraIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" />
      <path d="M8 7.5h8" />
      <path d="M8.2 12h1.2M12 12h1.2M15.6 12h1.2" />
      <path d="M8.2 15.5h1.2M12 15.5h1.2M15.6 15.5h1.2" />
    </IconBase>
  );
}

export function GuiaIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="4.5" y="6" width="15" height="12" rx="1.5" />
      <path d="M4.5 10h15" />
      <path d="M8 13.5h3" />
      <path d="M8 16h6" />
    </IconBase>
  );
}

export function PastaIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h7A1.5 1.5 0 0 1 20 8.7v9.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5z" />
    </IconBase>
  );
}

export function TransmissaoIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.3 15.7a5.2 5.2 0 0 1 0-7.4" />
      <path d="M15.7 8.3a5.2 5.2 0 0 1 0 7.4" />
      <path d="M5.6 18.4a9.2 9.2 0 0 1 0-12.8" />
      <path d="M18.4 5.6a9.2 9.2 0 0 1 0 12.8" />
    </IconBase>
  );
}

export function EtiquetaIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M11.2 4H6a1.5 1.5 0 0 0-1.5 1.5v5.2c0 .4.16.78.44 1.06l7.6 7.6a1.5 1.5 0 0 0 2.12 0l5.2-5.2a1.5 1.5 0 0 0 0-2.12l-7.6-7.6A1.5 1.5 0 0 0 11.2 4z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </IconBase>
  );
}

export function CifraoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 4v16" />
      <path d="M15.5 7.5a3 3 0 0 0-3-1.5h-1a2.6 2.6 0 0 0 0 5.2h1a2.6 2.6 0 0 1 0 5.2h-1a3 3 0 0 1-3-1.5" />
    </IconBase>
  );
}

export function LupaIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 20 20" />
    </IconBase>
  );
}

export function SinoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 17v-5.5a6 6 0 0 1 12 0V17l1.5 2h-15z" />
      <path d="M10.3 20.5a1.8 1.8 0 0 0 3.4 0" />
    </IconBase>
  );
}

export function PredioIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="5" y="3.5" width="10" height="17" rx="1" />
      <rect x="15" y="9.5" width="4.5" height="11" rx="1" />
      <path d="M8 7.5h1.5M11.5 7.5H13M8 11h1.5M11.5 11H13M8 14.5h1.5M11.5 14.5H13" />
    </IconBase>
  );
}

export function SeloIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="9.5" r="5.5" />
      <path d="M9 14.5 8 20.5l4-2 4 2-1-6" />
    </IconBase>
  );
}

export function EscudoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 5 6v6c0 4.4 2.9 7.6 7 8.5 4.1-.9 7-4.1 7-8.5V6z" />
      <path d="M9.2 12 11 13.8 15 9.8" />
    </IconBase>
  );
}

export function AssinaturaIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 17.5c2-3.5 3.6-5.6 4.8-6.1 1-.4 1.2.7.6 1.6-.8 1.2-.6 1.9.5 1.4 1.7-.8 3.6-2.7 4.8-4.4.9-1.3-.2-2.3-1.3-1.2-1.6 1.6-2.4 3.7-1.6 4.9.7 1 2.6.6 4.2-.6" />
      <path d="M4 20.5h16" />
    </IconBase>
  );
}

export function CicloIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M19 12a7 7 0 0 1-11.9 5" />
      <path d="M5 12a7 7 0 0 1 11.9-5" />
      <path d="M17.5 4.5v3.2h-3.2" />
      <path d="M6.5 19.5v-3.2h3.2" />
    </IconBase>
  );
}

export function ComprovanteIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6.5 3.5h11v17l-2-1.3-1.8 1.3-1.7-1.3-1.8 1.3-1.7-1.3-2 1.3z" />
      <path d="M9 8h6" />
      <path d="M9 11.2h6" />
      <path d="M9 14.4h3.5" />
    </IconBase>
  );
}

export function CalendarioIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="15" rx="1.5" />
      <path d="M4 9.5h16" />
      <path d="M8 3.5v3M16 3.5v3" />
      <path d="M8 13h1.5M12 13h1.5M16 13h.01" />
    </IconBase>
  );
}

export function PessoaIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" />
    </IconBase>
  );
}

export function CruzMedicaIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.5v7M8.5 12h7" />
    </IconBase>
  );
}

export function RelogioIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12.5" r="7.5" />
      <path d="M12 8.5V13l3 2" />
      <path d="M9.5 2.5h5" />
    </IconBase>
  );
}

export function OnibusIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5.5" width="16" height="11" rx="2" />
      <path d="M4 11h16" />
      <circle cx="8" cy="19" r="1.3" />
      <circle cx="16" cy="19" r="1.3" />
    </IconBase>
  );
}

export function TelefoneIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 3.5c1 0 2.5 2.5 2.5 3.5S7 8.5 7 9.5c0 2.5 4 6.5 6.5 6.5 1 0 1.5-1.5 2.5-1.5s3.5 1.5 3.5 2.5c0 1.5-1.5 3-3 3-6 0-13-7-13-13 0-1.5 1.5-3 2.5-3z" />
    </IconBase>
  );
}

export function GraficoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 20.5h16" />
      <path d="M7 20.5v-6M12 20.5V8M17 20.5v-9.5" />
      <path d="M5.5 11 10 6.5l3 3 5.5-5.5" />
      <path d="M15.5 4h3v3" />
    </IconBase>
  );
}

export function EnvelopeIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M4 6.5 12 13l8-6.5" />
    </IconBase>
  );
}

export function EntradaIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M10 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H10" />
      <path d="M15 16l5-4-5-4" />
      <path d="M20 12H10" />
    </IconBase>
  );
}
