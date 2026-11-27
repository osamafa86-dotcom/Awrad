import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { ReactNode } from 'react';

import { ar } from '../src/messages/ar';

// Web-only root document for static rendering: Arabic, right-to-left from the first paint.
// `headNodes`/`bodyNodes` carry the exported CSS and JS bundles (expo-router 58); without them the
// static pages never hydrate (caught by the Task 2.8 web smoke test).
export default function Root({ children }: { children: ReactNode }) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>{ar.app.name}</title>
        <ScrollViewStyleReset />
        {/* Canvas colour from the token variables (global.css) so dark mode never flashes white. */}
        <style dangerouslySetInnerHTML={{ __html: 'body { background-color: var(--bg-canvas); }' }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
