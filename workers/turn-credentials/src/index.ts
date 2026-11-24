export interface Env {
  TURN_KEY_ID: string;
  TURN_KEY_API_TOKEN: string;
  TURN_TTL_SECONDS?: string;
  ALLOWED_ORIGINS?: string;
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  const allowed = (env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    allowed.includes('*') || allowed.includes(origin) ? (allowed.includes('*') ? '*' : origin) : allowed[0] || '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      return new Response(JSON.stringify({ error: 'TURN credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ttl = Math.min(86400, Math.max(60, Number(env.TURN_TTL_SECONDS || '14400') || 14400));
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`;

    try {
      const cfRes = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl }),
      });

      if (!cfRes.ok) {
        const text = await cfRes.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: 'Cloudflare TURN API error', status: cfRes.status, detail: text.slice(0, 200) }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          }
        );
      }

      const data = (await cfRes.json()) as { iceServers?: RTCIceServer[] };
      return new Response(JSON.stringify({ iceServers: data.iceServers ?? [], ttl }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to fetch TURN credentials', detail: String(err) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  },
};
