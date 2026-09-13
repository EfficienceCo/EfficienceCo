'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';

function deveExibirSidebar(pathname, isAuthenticated) {
  if (!isAuthenticated) {
    return false;
  }

  if (!pathname) {
    return false;
  }

  return pathname !== '/';
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-5 w-5"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const exibirSidebar = deveExibirSidebar(pathname, isAuthenticated);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  if (!exibirSidebar) {
    return children;
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={menuAberto}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50"
        >
          <MenuIcon />
        </button>
        <img src="/logo.svg" alt="Efficience Co" className="h-6 w-6 rounded" />
        <p className="text-sm font-semibold text-slate-900">Efficience Co</p>
      </header>

      <Sidebar aberta={menuAberto} aoFechar={() => setMenuAberto(false)} />

      <div className="min-w-0 flex-1 md:ml-[264px]">{children}</div>
    </div>
  );
}
