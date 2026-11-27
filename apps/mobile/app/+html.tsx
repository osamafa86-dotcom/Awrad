import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

// Web-only root document for static rendering: Arabic, right-to-left from the first paint.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        {/* Canvas colour from the token variables (global.css) so dark mode never flashes white. */}
        <style dangerouslySetInnerHTML={{ __html: 'body { background-color: var(--bg-canvas); }' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
