'use client';

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

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const exibirSidebar = deveExibirSidebar(pathname, isAuthenticated);

  if (!exibirSidebar) {
    return children;
  }

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Sidebar />
      <div className="min-w-0 flex-1 md:ml-64">{children}</div>
    </div>
  );
}
