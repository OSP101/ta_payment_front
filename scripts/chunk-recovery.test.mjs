import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile('app/lib/chunkRecovery.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function browser({ storage = new Map(), blocked = false, now = Date.now() } = {}) {
  let reloads = 0;
  const handlers = {}, bars = [];
  const document = {
    documentElement: { lang: 'th' },
    body: { appendChild: bar => bars.push(bar) },
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  };
  const window = {
    sessionStorage: {
      getItem: key => { if (blocked) throw Error('denied'); return storage.get(key) ?? null; },
      setItem: (key, value) => storage.set(key, value),
    },
    location: { reload: () => reloads++ },
    addEventListener: (name, fn) => handlers[name] = fn,
  };
  const context = vm.createContext({ exports: {}, window, document, Date: { now: () => now } });
  vm.runInContext(source, context);
  vm.runInContext(context.exports.buildChunkRecoveryScript(), context);
  return { fire: (type, event) => handlers[type](event), reloads: () => reloads, bars, recover: context.exports.reloadAfterChunkFailure };
}
for (const message of ['ChunkLoadError', 'Failed to load chunk', 'Loading chunk 123 failed', 'Loading CSS chunk 123 failed', 'Failed to fetch dynamically imported module', 'error loading dynamically imported module', 'Importing a module script failed']) {
  test(`recovers before hydration: ${message}`, () => {
    const page = browser();
    page.fire('unhandledrejection', { reason: Error(message) });
    assert.equal(page.reloads(), 1);
  });
}
test('resource failure recovers once across inline errors, error boundary and page reload', () => {
  const storage = new Map(), now = Date.now();
  const page = browser({ storage, now });
  page.fire('error', { target: { tagName: 'SCRIPT', src: '/_next/static/chunks/old.js' } });
  assert.equal(page.reloads(), 1);
  assert.equal(page.recover(), false);
  page.fire('unhandledrejection', { reason: Error('ChunkLoadError') });
  assert.equal(page.reloads(), 1);
  assert.equal(page.bars.length, 1);
  const refreshed = browser({ storage, now: now + 1000 });
  refreshed.fire('unhandledrejection', { reason: Error('ChunkLoadError') });
  assert.equal(refreshed.reloads(), 0);
  assert.equal(refreshed.bars.length, 1);
  const later = browser({ storage, now: now + 120001 });
  assert.equal(later.recover(), true);
});
test('blocked storage leaves manual recovery without reloading', () => {
  const page = browser({ blocked: true });
  page.fire('unhandledrejection', { reason: Error('ChunkLoadError') });
  assert.equal(page.reloads(), 0);
  assert.equal(page.bars.length, 1);
});
test('unrelated app, network and image errors do not reload', () => {
  const page = browser();
  page.fire('unhandledrejection', { reason: Error('Network request failed') });
  page.fire('error', { target: { tagName: 'IMG', src: '/api/v1/users/test/avatar' } });
  assert.equal(page.reloads(), 0);
  assert.equal(page.bars.length, 0);
});
