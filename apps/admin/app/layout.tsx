import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Markazi_Text } from 'next/font/google';
import type { ReactNode } from 'react';

import { ar } from '@/messages/ar';

import './globals.css';

// Both families are self-hosted by next/font; globals.css feeds these variables into the token stacks
// --font-ui and --font-display.
const plexArabic = IBM_Plex_Sans_Arabic({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-plex-arabic',
});

const markazi = Markazi_Text({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-markazi',
});

export const metadata: Metadata = {
  title: ar.app.title,
  description: ar.app.tagline,
};

// D20: the theme follows the system and can be forced with data-theme on <html>. Runs before
// hydration so the first paint already has the right theme, and follows later system changes.
const THEME_SCRIPT = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.setAttribute('data-theme',m.matches?'dark':'light')};a();m.addEventListener('change',a)}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // why: the inline script sets data-theme before React hydrates, so the attribute differs from the
    // server HTML by design.
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${markazi.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas text-fg-primary antialiased">{children}</body>
    </html>
  );
}
