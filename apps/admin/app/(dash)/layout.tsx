import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { signOut } from '@/actions/auth';
import { DashShell } from '@/components/DashShell';
import { getCurrentProfile } from '@/lib/supabase/server';

export default async function DashLayout({ children }: { children: ReactNode }) {
  // proxy.ts already routed everyone else away; this keeps the layout honest if it is bypassed.
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'student' || !profile.isActive) redirect('/unauthorized');

  return (
    <DashShell role={profile.role} fullName={profile.fullName} signOut={signOut}>
      {children}
    </DashShell>
  );
}
