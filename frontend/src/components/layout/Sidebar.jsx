'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: DashboardIcon,
    exact: true,
  },
  {
    href: '/dashboard/logs',
    label: 'Logs',
    icon: LogsIcon,
  },
  {
    href: '/dashboard/efficience',
    label: 'Efficience',
    icon: EfficienceIcon,
  },
  {
    type: 'separator',
    key: 'separador-areas',
  },
  {
    href: '/dashboard/fiscal',
    label: 'Fiscal',
    icon: FiscalIcon,
  },
  {
    href: '/dashboard/contabil',
    label: 'Contábil',
    icon: ContabilIcon,
    // A tela de revisão da conciliação (/dashboard/conciliacao/[id]) continua na URL
    // antiga — só a listagem foi movida para /dashboard/contabil/conciliacao.
    extraPrefixes: ['/dashboard/conciliacao'],
  },
  {
    href: '/dashboard/dp',
    label: 'DP',
    icon: DpIcon,
  },
  {
    href: '/dashboard/dp/esocial',
    label: 'eSocial',
    icon: ESocialIcon,
  },
  {
    href: '/dashboard/societario',
    label: 'Societário',
    icon: SocietarioIcon,
  },
  {
    href: '/dashboard/financeiro',
    label: 'Financeiro',
    icon: FinanceiroIcon,
  },
  {
    href: '/dashboard/atendimento',
    label: 'Atendimento',
    icon: AtendimentoIcon,
  },
  {
    type: 'separator',
    key: 'separador-admin',
  },
  {
    href: '/dashboard/usuarios',
    label: 'Usuários',
    icon: UsuariosIcon,
  },
  {
    href: '/admin/clientes',
    label: 'Admin Clientes',
    icon: EmpresaIcon,
  },
];

function isRouteActive(pathname, item) {
  const { href, exact, activePrefix, extraPrefixes } = item;
  const routeBase = activePrefix || href;

  if (!pathname) {
    return false;
  }

  if (pathname === href || pathname === routeBase) {
    return true;
  }

  if (!exact && pathname.startsWith(`${routeBase}/`)) {
    return true;
  }

  if (exact) {
    return false;
  }

  return (extraPrefixes || []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function sidebarLinkClasses(ativo) {
  if (ativo) {
    return 'bg-sky-400/10 text-white ring-1 ring-sky-400/30 shadow-[inset_3px_0_0_var(--brand-400)]';
  }

  return 'text-slate-400 hover:bg-white/5 hover:text-white';
}

export default function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside className="nova-sidebar w-full border-b border-white/10 text-slate-300 md:fixed md:inset-y-0 md:w-[264px] md:border-b-0 md:border-r">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Efficience Co"
              className="h-8 w-8 rounded-lg shadow-brand"
            />
            <p className="font-display text-lg font-semibold text-white">
              Efficience <span className="text-slate-500">Co</span>
            </p>
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">
            Plataforma
          </p>
          <p className="mt-2 truncate text-sm text-slate-500">
            {user?.nome || user?.email || 'Usuário autenticado'}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="grid gap-1.5">
            {NAV_ITEMS.map((item) => {
              if (item.type === 'separator') {
                return (
                  <li key={item.key} aria-hidden="true" className="my-2 border-t border-white/10" />
                );
              }

              const ativo = isRouteActive(pathname, item);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${sidebarLinkClasses(ativo)}`}
                  >
                    <Icon />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}

function IconBase({ children }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px] shrink-0"
    >
      {children}
    </svg>
  );
}

function DashboardIcon() {
  return (
    <IconBase>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
    </IconBase>
  );
}

function FiscalIcon() {
  return (
    <IconBase>
      <path d="M6 3.5h9l3 3v13.5H6z" />
      <path d="M15 3.5V7h3" />
      <path d="M9 12.5h6" />
      <path d="M9 16h6" />
    </IconBase>
  );
}

function LogsIcon() {
  return (
    <IconBase>
      <path d="M4 5.5h16" />
      <path d="M4 12h16" />
      <path d="M4 18.5h10" />
    </IconBase>
  );
}

function EfficienceIcon() {
  return (
    <IconBase>
      <path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5z" />
    </IconBase>
  );
}

function ContabilIcon() {
  return (
    <IconBase>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 14.5l2.5 2.5L16 12" />
    </IconBase>
  );
}

function DpIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
    </IconBase>
  );
}

function SocietarioIcon() {
  return (
    <IconBase>
      <path d="M12 3.5 4 7v2h16V7z" />
      <path d="M5.5 9v9" />
      <path d="M9.5 9v9" />
      <path d="M14.5 9v9" />
      <path d="M18.5 9v9" />
      <path d="M4 20.5h16" />
    </IconBase>
  );
}

function FinanceiroIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8" />
      <path d="M9.5 10a2.2 2.2 0 0 1 2.2-1.7h.6A2.1 2.1 0 0 1 14.5 10c0 1.2-.9 1.7-2.5 2.2s-2.5 1-2.5 2.2a2.1 2.1 0 0 0 2.2 1.7h.6a2.2 2.2 0 0 0 2.2-1.7" />
    </IconBase>
  );
}

function AtendimentoIcon() {
  return (
    <IconBase>
      <path d="M4 12a8 8 0 0 1 16 0v4.5a2 2 0 0 1-2 2h-1" />
      <rect x="3.5" y="12" width="4" height="5.5" rx="1.2" />
      <rect x="16.5" y="12" width="4" height="5.5" rx="1.2" />
      <path d="M14.5 18.5a2 2 0 0 1-2 2h-1.5" />
    </IconBase>
  );
}

function UsuariosIcon() {
  return (
    <IconBase>
      <circle cx="9" cy="9" r="3" />
      <path d="M4.5 19c0-2.5 2-4.5 4.5-4.5S13.5 16.5 13.5 19" />
      <circle cx="17.5" cy="9.5" r="2.2" />
      <path d="M15.5 18.8c.3-2 1.9-3.6 3.9-3.9" />
    </IconBase>
  );
}

function EmpresaIcon() {
  return (
    <IconBase>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M8 7.5h2" />
      <path d="M14 7.5h2" />
      <path d="M8 11.5h2" />
      <path d="M14 11.5h2" />
      <path d="M8 15.5h8" />
    </IconBase>
  );  
}
function ESocialIcon() {
  return (
    <IconBase>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 18v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" />
      <path d="M16 11h6" />
      <path d="M19 8v6" />
    </IconBase>
  );
}
