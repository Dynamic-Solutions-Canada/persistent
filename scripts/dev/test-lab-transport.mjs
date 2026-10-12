/** Public JSON health through the owned demo container's normal DNS, without host resolver changes. */
import { execFileSync } from 'node:child_process'

/** Fail with a safe transport category; never expose response bodies, cookies or shell output. */
export function assertPublicDemoHealth(container, origin) {
  const url = new URL(origin)
  if (!/^[a-f0-9]{64}$/.test(container) || url.protocol !== 'https:' || url.username || url.password
    || url.hostname === 'persistent.dynamic-solutions.ca' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid isolated public health identity.')
  }
  const expression = `try {
    const response = await fetch(${JSON.stringify(url.origin + '/api/health')}, { signal: AbortSignal.timeout(5000) });
    const json = response.headers.get('content-type')?.includes('application/json');
    const ok = response.ok && json && (await response.json()).ok === true;
    console.log(JSON.stringify({ ok, status: response.status, json }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, category: error.name, code: error.cause?.code }));
  }`
  const result = JSON.parse(execFileSync('docker', ['exec', container, 'node', '--input-type=module', '-e', expression], {
    encoding: 'utf8', timeout: 10_000
  }))
  if (!result.ok) {
    const transport = result.code ?? result.category ?? `HTTP ${result.status}, JSON ${result.json === true}`
    throw new Error(`Isolated public JSON health failed (${transport}).`)
  }
}

/** Allow a fresh tunnel name to propagate, retrying only DNS failures before any request was sent. */
export async function fetchAfterDnsPropagation(url, options = {}, fetchRequest = fetch, wait = (ms) => new Promise((ready) => setTimeout(ready, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchRequest(url, { ...options, signal: AbortSignal.timeout(5000) })
    } catch (error) {
      // Timeout, connection reset and HTTP/auth errors do not establish an unsent POST.
      const dnsFailure = ['ENOTFOUND', 'EAI_AGAIN'].includes(error.cause?.code)
      if (!dnsFailure || attempt === 2) throw error
      await wait(1000)
    }
  }
  throw new Error('Bounded DNS propagation failed.')
}
