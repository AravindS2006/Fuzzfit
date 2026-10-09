import type { Metadata } from 'next';
import './globals.css';
import { TimeProvider } from '@/components/time-provider';
export const metadata: Metadata = {
  title: 'Geez Squad — Move better, together.',
  description:
    'Your premium live coaching studio. Human guidance, real-time movement insights, and progress that matters.',
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TimeProvider>{children}</TimeProvider>
      </body>
    </html>
  );
}
