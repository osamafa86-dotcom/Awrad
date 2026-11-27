import { signOut } from '@/actions/auth';
import { AuthCard } from '@/components/AuthCard';
import { Button } from '@/components/ui/button';
import { getCurrentProfile } from '@/lib/supabase/server';
import { ar } from '@/messages/ar';

/** a30: a signed-in account that may not use the dashboard (proxy.ts sends it here). */
export default async function UnauthorizedPage() {
  const profile = await getCurrentProfile();
  const inactive = profile?.isActive === false;
  return (
    <AuthCard
      title={inactive ? ar.unauthorized.inactiveTitle : ar.unauthorized.staffOnlyTitle}
      subtitle={inactive ? ar.unauthorized.inactiveBody : ar.unauthorized.staffOnlyBody}
    >
      <form action={signOut} className="flex flex-col">
        <Button type="submit" variant="secondary">
          {ar.auth.signOut}
        </Button>
      </form>
    </AuthCard>
  );
}
