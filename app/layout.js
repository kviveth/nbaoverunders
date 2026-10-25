import './globals.css';
import SiteNav from '@/components/SiteNav';

export const metadata = {
  title: 'O/U Draft',
  description: 'NBA season win-total over/under draft with friends',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
