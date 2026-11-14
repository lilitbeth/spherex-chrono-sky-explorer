// Supabase Edge Function: server-side proxy for api.nasa.gov.
// The NASA key lives only in the Supabase secret NASA_API_KEY and never reaches the browser.
//
// Deploy:  supabase secrets set NASA_API_KEY=<your key>
//          supabase functions deploy nasa-proxy
// Call:    GET <SUPABASE_URL>/functions/v1/nasa-proxy?path=neo/rest/v1/feed&start_date=...&end_date=...
//          (with the anon key in the Authorization / apikey headers)

// Only the endpoints the app needs can be proxied.
const ALLOWED = [
  /^neo\/rest\/v1\/feed$/,
  /^neo\/rest\/v1\/neo\/\d+$/,
  /^neo\/rest\/v1\/stats$/,
  /^DONKI\/notifications$/,
];

// Only these sites may use the proxy (and the project's NASA quota) from a browser.
// Override with the ALLOWED_ORIGINS secret (comma-separated) if the app is hosted elsewhere.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://lilitbeth.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const isAllowedOrigin = (origin: string) =>
  ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } });
  }
  const CORS = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: CORS });

  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '';
  if (!ALLOWED.some((re) => re.test(path))) {
    return new Response(JSON.stringify({ error: 'Path not allowed' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const params = new URLSearchParams(url.searchParams);
  params.delete('path');
  params.delete('api_key');
  params.set('api_key', Deno.env.get('NASA_API_KEY') ?? 'DEMO_KEY');

  const upstream = await fetch(`https://api.nasa.gov/${path}?${params}`);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
      'X-RateLimit-Remaining': upstream.headers.get('X-RateLimit-Remaining') ?? '',
    },
  });
});
