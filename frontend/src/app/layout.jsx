import './globals.css';

export const metadata = { title: 'Efficience Co' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
