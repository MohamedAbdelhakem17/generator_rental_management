import type { Metadata } from 'next';

import { plexSans, plexSansArabic, plexMono } from '@/lib/fonts';
import { LocaleProvider } from '@/lib/i18n/locale-provider';
import { DevSessionProvider } from '@/lib/session/dev-session-provider';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Generator Rental Management',
  description: 'Internal business management platform for a generator rental company.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexSansArabic.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <LocaleProvider>
          <DevSessionProvider>
            <QueryProvider>{children}</QueryProvider>
          </DevSessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
