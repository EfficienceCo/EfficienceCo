import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { NotificacoesProvider } from '../context/NotificacoesContext';
import AppShell from '../components/layout/AppShell';

// /logo.svg já existe em public/; metadata injeta <link rel="icon">.
// public/favicon.ico (mesma arte) cobre o pedido clássico do navegador (BUG-APUR-17).
export const metadata = {
  title: 'Efficience Co',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <NotificacoesProvider>
            <AppShell>{children}</AppShell>
          </NotificacoesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
