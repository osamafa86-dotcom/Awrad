import type { TypedClient } from '@awrad/supabase-client';

import type { Role } from '../access';

export interface CurrentProfile {
  id: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  groupId: string | null;
}

/** The user's own profile row (RLS lets everyone read their own), or null when it is missing. */
export async function fetchProfile(client: TypedClient, userId: string): Promise<CurrentProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, role, is_active, group_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role,
    isActive: data.is_active,
    groupId: data.group_id,
  };
}
