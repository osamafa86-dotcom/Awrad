// CORS for Edge Functions called from a browser. The admin calls invite-user from a Server Action
// (server to server), so this only keeps a direct browser call from failing on its preflight.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** The answer to an OPTIONS preflight. */
export function preflight(): Response {
  return new Response('ok', { headers: corsHeaders });
}

/** A JSON response with the CORS headers. */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
