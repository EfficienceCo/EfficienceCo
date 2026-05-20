import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { NotificacoesProvider } from '../context/NotificacoesContext';
import AppShell from '../components/layout/AppShell';

export const metadata = { title: 'Efficience Co' };

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
