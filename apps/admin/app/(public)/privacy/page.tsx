import type { Metadata } from 'next';

import { Markdown } from '@/components/Markdown';
import { readPrivacyPolicy } from '@/lib/privacy-policy';
import { ar } from '@/messages/ar';

export const metadata: Metadata = { title: ar.publicPage.privacyTitle };

// Built once from docs/privacy-policy.md; public (resolveAccess lets anyone in), no session read.
export const dynamic = 'force-static';

/** F-80: the public privacy policy the mobile app's Settings and the store listings link to. */
export default function PrivacyPage() {
  return (
    <article>
      <Markdown source={readPrivacyPolicy()} />
    </article>
  );
}
