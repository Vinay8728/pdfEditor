import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  metadataBase: new URL('https://vinaybi.in'),
  title: {
    default: 'pdfEditor — Edit PDFs in your browser',
    template: '%s — pdfEditor',
  },
  description:
    'Merge, split, edit, sign, protect and convert PDF files. Everything runs in your browser — your files never leave your device.',
  applicationName: 'pdfEditor',
  keywords: [
    'pdf editor', 'merge pdf', 'split pdf', 'sign pdf', 'compress pdf',
    'redact pdf', 'ocr pdf', 'pdf to jpg', 'protect pdf',
  ],
  openGraph: {
    type: 'website',
    title: 'pdfEditor — Edit PDFs in your browser',
    description:
      'A complete PDF toolkit that runs entirely on your device. No uploads, no accounts, no waiting.',
    siteName: 'pdfEditor',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1117' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
