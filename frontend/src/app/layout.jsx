import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata = { title: 'Efficience Co' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
