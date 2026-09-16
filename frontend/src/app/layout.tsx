import type { Metadata } from 'next';
import { Toaster } from 'sonner';

import { plexSans, plexSansArabic, plexMono } from '@/lib/fonts';
import { LocaleProvider } from '@/lib/i18n/locale-provider';
import { SessionProvider } from '@/lib/session/session-provider';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Generator Rental Management',
  description: 'Internal business management platform for a generator rental company.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexSans.variable} ${plexSansArabic.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <LocaleProvider defaultLocale="ar">
          <QueryProvider>
            <SessionProvider>
              {children}
              <Toaster position="bottom-right" />
            </SessionProvider>
          </QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
