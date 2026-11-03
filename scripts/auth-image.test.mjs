import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const root = 'http://127.0.0.1:3000';
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`${root}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { ready = true; break; }
  } catch (error) {
    if (attempt === 59) throw error;
  }
  await setTimeout(1000);
}
assert.ok(ready, 'Production image did not become ready');
for (const pathname of ['/', '/accounts', '/categories', '/transactions', '/profile']) {
  const response = await fetch(`${root}${pathname}`, { redirect: 'manual' });
  assert.equal(response.status, 303, pathname);
  assert.equal(new URL(response.headers.get('location'), root).pathname, '/login');
}
for (const pathname of ['/login', '/register']) {
  assert.equal((await fetch(`${root}${pathname}`)).status, 200, pathname);
}
assert.equal((await fetch(`${root}/api/exchange-rates`)).status, 401);
assert.equal((await fetch(`${root}/api/wechat-import`, { method: 'POST' })).status, 401);
assert.equal((await fetch(`${root}/accounts`, {
  redirect: 'manual', headers: { cookie: `__Host-accounting_session=${'x'.repeat(43)}` },
})).status, 303);
console.log('Production image authentication and protected-route checks passed.');
