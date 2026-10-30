const txt = new TextEncoder();
const hex = v => Uint8Array.from({ length: v.length / 2 }, (_, i) =>
  Number.parseInt(v.slice(i * 2, i * 2 + 2), 16));
const b64url = v => btoa(String.fromCharCode(...v))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function getKey(v, keepTag = false) {
  const str = String(v || '').trim().toLowerCase();
  if (!/^(?:[0-9a-f]{32}|(?:dd|ee|ef)[0-9a-f]{32})$/.test(str)) throw Error();
  return hex(keepTag && str.length === 34 && str.startsWith('dd') ? str : str.slice(-32));
}
function hostOf(v) {
  const host = String(v || '').trim().toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (!host.includes('.') || host.length > 253 || host.includes(':') ||
      labels.some(l => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) throw Error();
  return host;
}

const capKeys = new Map();
function capKey(secret) {
  const id = String(secret).trim().toLowerCase();
  let key = capKeys.get(id);
  if (!key) capKeys.set(id, key = crypto.subtle.importKey('raw', getKey(secret, true),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  return key;
}
async function mkCap(secret, host) {
  const msg = txt.encode(`tdesktop-web-proxy-bridge-v1\n${hostOf(host)}`);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await capKey(secret), msg));
  return b64url(sig);
}

export default {
  async fetch(request, env) {
    let rawHost = String(env.HOST || '').trim();
    rawHost = rawHost.replace(/^https?:\/\//i, ''); 
    const HOST = rawHost.split('/')[0].split(':')[0];
    const url = new URL(request.url);
    const originalHost = url.hostname;

    if (url.pathname === '/' && url.search.startsWith('?bridge=') && env.SECRET) {
      const cand = url.search.slice(8);
      if (/^[A-Za-z0-9_-]{43}$/.test(cand)) {
        try {
          const want = await mkCap(env.SECRET, originalHost);
          let diff = cand.length ^ want.length;
          for (let i = 0; i < want.length; i++) diff |= cand.charCodeAt(i) ^ want.charCodeAt(i);
          if (diff === 0) {
            url.search = `?bridge=${await mkCap(env.SECRET, HOST)}`;
          }
        } catch {}
      }
    }

    url.hostname = HOST;
    url.port = '';
    url.protocol = 'https:';

    const isWs = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
    const headers = new Headers(request.headers);
    headers.delete('Host');

    if (isWs) {
      const incomingOrigin = headers.get('Origin');
      if (incomingOrigin && incomingOrigin !== `https://${originalHost}`) {
        return new Response(null, { status: 404 });
      }
      if (incomingOrigin) headers.set('Origin', `https://${HOST}`);
    }

    let response;
    try {
      response = await fetch(url.toString(), {
        method: request.method, headers, body: request.body, redirect: 'manual',
      });
    } catch {
      return new Response('Bad Gateway', { status: 502 });
    }

    if (response.status === 101) return response;

    const h = new Headers(response.headers);

    if (response.status >= 300 && response.status < 400 && h.has('Location')) {
      const u = new URL(h.get('Location'), url);
      if (u.hostname === HOST) {
        u.hostname = originalHost; u.port = ''; u.protocol = 'https:';
      }
      h.set('Location', u.toString());
      return new Response(response.body, {
        status: response.status, statusText: response.statusText, headers: h,
      });
    }

    const ct = (h.get('Content-Type') || '').toLowerCase();

    if (ct.includes('text/html') && request.method !== 'HEAD') {
      let text = await response.text();
      text = text
        .replaceAll(`https://${HOST}`, `https://${originalHost}`)
        .replaceAll(`wss://${HOST}`, `wss://${originalHost}`);
      const csp = h.get('Content-Security-Policy');
      if (csp) h.set('Content-Security-Policy',
        csp.replaceAll(`wss://${HOST}`, `wss://${originalHost}`));
      h.delete('Content-Length');
      h.delete('Content-Encoding');
      h.delete('ETag');
      h.delete('Last-Modified');
      h.delete('Content-MD5');
      h.delete('Digest');
      h.delete('Content-Range');
      return new Response(text, {
        status: response.status, statusText: response.statusText, headers: h,
      });
    }

    return response;
  },
};
