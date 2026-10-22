const IP_SOURCE_URL = '你的优选IP API地址';
const ZONE_VAR = 'CF_ZONE_ID';

const ZONE_ROOT = '你的优选域名';
const RECORD_NAMES = [
  { label: '@', fqdn: '你的优选域名' },
  { label: '*', fqdn: '*.你的优选域名' }
];

async function fetchTargetIPs() {
  const resp = await fetch(IP_SOURCE_URL);
  if (!resp.ok) {
    throw new Error(`拉取 IP 源失败: HTTP ${resp.status}`);
  }
  const text = await resp.text();

  const entries = text.split(/\s+/).filter(Boolean);
  const ips = new Set();

  for (const entry of entries) {
    const ipPort = entry.split('#')[0];
    if (!ipPort) continue;

    const colonIndex = ipPort.lastIndexOf(':');
    if (colonIndex === -1) continue;

    const ip = ipPort.slice(0, colonIndex);
    const port = ipPort.slice(colonIndex + 1);

    if (port === '443') {
      ips.add(ip);
    }
  }

  return [...ips];
}

async function getCurrentARecords(env, zoneId, fqdn) {
  const allRecords = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(fqdn)}&page=${page}&per_page=${perPage}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    const body = await resp.json();
    if (!body.success) {
      throw new Error(`获取 A 记录失败: ${JSON.stringify(body.errors)}`);
    }

    allRecords.push(...body.result);

    const totalPages = body.result_info?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allRecords;
}

async function deleteRecord(env, zoneId, recordId) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
  });
  const body = await resp.json();
  if (!body.success && !body.errors?.some(e => e.code === 81044)) {
    throw new Error(`删除失败: ${JSON.stringify(body.errors)}`);
  }
}

async function createARecord(env, zoneId, fqdn, ip) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'A',
      name: fqdn,
      content: ip,
      ttl: 60
    })
  });
  const body = await resp.json();
  if (!body.success && !body.errors?.some(e => e.code === 81058)) {
    throw new Error(`创建失败: ${JSON.stringify(body.errors)}`);
  }
}

async function syncOneRecord(env, zoneId, targetIPs, rec) {
  const currentRecords = await getCurrentARecords(env, zoneId, rec.fqdn);
  const currentIPs = currentRecords.map(r => r.content);
  const currentSet = new Set(currentIPs);
  const targetSet = new Set(targetIPs);

  const toDelete = currentRecords.filter(r => !targetSet.has(r.content));
  const toAdd = targetIPs.filter(ip => !currentSet.has(ip));

  if (toDelete.length === 0 && toAdd.length === 0) {
    return { name: rec.label, status: '已最新', errors: [] };
  }

  const errors = [];
  for (const r of toDelete) {
    try {
      await deleteRecord(env, zoneId, r.id);
    } catch (e) {
      errors.push(`删除 ${r.content}: ${e.message}`);
    }
  }

  for (const ip of toAdd) {
    try {
      await createARecord(env, zoneId, rec.fqdn, ip);
    } catch (e) {
      errors.push(`创建 ${ip}: ${e.message}`);
    }
  }

  return { name: rec.label, status: errors.length ? '部分失败' : '成功', errors };
}

async function syncDNS(env) {
  let targetIPs;
  try {
    targetIPs = await fetchTargetIPs();
  } catch (e) {
    return { result: `拉取 IP 源失败: ${e.message}`, details: [] };
  }

  if (targetIPs.length === 0) {
    console.log('目标 IP 列表为空');
    return { result: '目标 IP 列表为空，跳过所有同步', details: [] };
  }

  const results = [];
  for (const rec of RECORD_NAMES) {
    try {
      const r = await syncOneRecord(env, env[ZONE_VAR], targetIPs, rec);
      results.push(r);
    } catch (e) {
      results.push({ name: rec.label, status: '失败', errors: [e.message] });
    }
  }

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const summary = results.map(r => `${r.name}: ${r.status}`).join('; ');
  console.log(summary);

  return {
    result: totalErrors ? `同步完成，但有 ${totalErrors} 个错误` : '全部同步成功，@ 和 * 记录一致',
    details: results
  };
}

export default {
  async fetch(request, env, ctx) {
    if (!env.CF_API_TOKEN) return new Response('缺少 CF_API_TOKEN', { status: 500 });
    try {
      const res = await syncDNS(env);
      return new Response(JSON.stringify(res, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  },

  async scheduled(controller, env, ctx) {
    if (!env.CF_API_TOKEN || !env[ZONE_VAR]) return;
    ctx.waitUntil(syncDNS(env));
  }
};