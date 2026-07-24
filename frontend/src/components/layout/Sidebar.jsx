'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useNotificacoes } from '../../context/NotificacoesContext';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: DashboardIcon,
    exact: true,
  },
  {
    href: '/dashboard/obrigacoes',
    label: 'Obrigações',
    icon: ObrigacoesIcon,
  },
  {
    href: '/dashboard/processos',
    label: 'Processos',
    icon: ProcessosIcon,
  },
  {
    href: '/dashboard/folha/upload',
    label: 'Folha',
    icon: FolhaIcon,
    activePrefix: '/dashboard/folha',
  },
  {
    href: '/dashboard/logs',
    label: 'Logs',
    icon: LogsIcon,
  },
  {
    href: '/dashboard/regras',
    label: 'Regras',
    icon: RegrasIcon,
  },
  {
    href: '/dashboard/usuarios',
    label: 'Usuários',
    icon: UsuariosIcon,
  },
  {
    href: '/dashboard/comunicacao',
    label: 'Comunicação',
    icon: NotificacoesIcon,
    badge: true,
  },
  {
    href: '/admin/clientes',
    label: 'Admin Clientes',
    icon: EmpresaIcon,
  },
];

function isRouteActive(pathname, item) {
  const { href, exact, activePrefix } = item;
  const routeBase = activePrefix || href;

  if (!pathname) {
    return false;
  }

  if (pathname === href || pathname === routeBase) {
    return true;
  }

  if (exact) {
    return false;
  }

  return pathname.startsWith(`${routeBase}/`);
}

function sidebarLinkClasses(ativo) {
  if (ativo) {
    return 'bg-sky-100 text-sky-900 ring-1 ring-sky-300';
  }

  return 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';
}

function badgeClasses(total) {
  if (total > 0) {
    return 'bg-rose-600 text-white';
  }

  return 'bg-slate-200 text-slate-700';
}

export default function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { naoLidas } = useNotificacoes();

  return (
    <aside className="w-full border-b border-slate-200 bg-white md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Efficience Co
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">Plataforma</p>
          <p className="mt-2 truncate text-sm text-slate-500">
            {user?.nome || user?.email || 'Usuário autenticado'}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="grid gap-1">
            {NAV_ITEMS.map((item) => {
              const ativo = isRouteActive(pathname, item);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${sidebarLinkClasses(ativo)}`}
                  >
                    <Icon />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${badgeClasses(
                          naoLidas,
                        )}`}
                      >
                        {naoLidas}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-slate-200 px-4 py-4">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
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
      className="h-4 w-4 shrink-0"
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

function ObrigacoesIcon() {
  return (
    <IconBase>
      <path d="M7 3.5v3" />
      <path d="M17 3.5v3" />
      <rect x="4" y="6.5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
    </IconBase>
  );
}

function ProcessosIcon() {
  return (
    <IconBase>
      <path d="M3.5 7.5h17" />
      <rect x="3.5" y="4" width="17" height="16.5" rx="2" />
      <path d="M8 12h8" />
      <path d="M8 15.5h5" />
    </IconBase>
  );
}

function FolhaIcon() {
  return (
    <IconBase>
      <path d="M7 3.5h7l3.5 3.5v13.5H7z" />
      <path d="M14 3.5V7h3.5" />
      <path d="M9.5 11h5" />
      <path d="M9.5 14h5" />
      <path d="M9.5 17h3" />
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

function RegrasIcon() {
  return (
    <IconBase>
      <circle cx="8" cy="8" r="2.2" />
      <circle cx="16" cy="16" r="2.2" />
      <path d="M9.7 9.7l4.6 4.6" />
      <path d="M14.3 9.7l-4.6 4.6" />
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

function NotificacoesIcon() {
  return (
    <IconBase>
      <path d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v2.7L6 14v1h12v-1l-1.5-2.3V9A4.5 4.5 0 0 0 12 4.5Z" />
      <path d="M9.5 17.5a2.5 2.5 0 0 0 5 0" />
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
