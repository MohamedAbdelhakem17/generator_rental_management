import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Generator Rental Management',
  description: 'Internal business management platform for a generator rental company.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
