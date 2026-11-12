import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function moduleAt(path, sentry = {}) {
  const code = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, require: () => sentry, window: {}, performance: { now: () => 100 }, Error, Headers };
  vm.runInNewContext(code, context);
  return context.exports;
}

test('API failures carry validated references and exclude bodies and query strings', async () => {
  const breadcrumbs = [], events = [];
  const telemetry = await moduleAt('app/lib/apiTelemetry.ts', { isInitialized: () => true, addBreadcrumb: b => breadcrumbs.push(b), captureMessage: (...args) => events.push(args) });
  const id = '550e8400-e29b-41d4-a716-446655440000';
  telemetry.recordAPI(`/claims/${id}?citizen_id=1100000000001`, 'POST', 0, new Response('secret response body', { status: 500, headers: { 'x-request-id': id, 'x-trace-id': 'a'.repeat(32) } }));
  assert.equal(events.length, 1);
  assert.equal(events[0][1].tags.request_id, id);
  assert.equal(events[0][1].tags.route, '/claims/:id');
  assert.ok(!JSON.stringify({ breadcrumbs, events }).includes('1100000000001'));
  assert.ok(!JSON.stringify({ breadcrumbs, events }).includes('secret response body'));
  assert.equal(telemetry.responseReference(new Headers({ 'x-request-id': 'forged' })).requestId, undefined);
  telemetry.recordAPI('/auth/heartbeat', 'POST', 0, new Response(null, {status: 401}));
  telemetry.recordAPI('/claims', 'GET', 0, undefined, Object.assign(new Error('cancel'), {name: 'AbortError'}));
  assert.equal(events.length, 1);
});

test('browser scrubbing removes private links, console text, DOM text, extras and locals', async () => {
  const { scrubEvent, stripQuery, maskDigits } = await moduleAt('app/lib/errorReporting.ts');
  assert.equal(stripQuery('/p/progress/bearer-secret?email=private'), '/p/[redacted]');
  const event = scrubEvent({ extra: { bank_account: 'private' }, request: {url: '/api/public/token?secret=value', headers: { Cookie: 'secret-cookie' }, data: 'body'}, exception: { values: [{value: 'person@example.com 1100000000001', stacktrace: { frames: [{vars: { form: 'secret-form' }}] }}]}, breadcrumbs: [{ category: 'console', message: 'secret-console' }, { category: 'ui.click', message: 'secret-name' }] });
  const serialized = JSON.stringify(event);
  for (const secret of ['bearer-secret','secret-cookie','secret-form','secret-console','secret-name','person@example.com','1100000000001']) assert.ok(!serialized.includes(secret), secret);
  assert.equal(maskDigits('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000');
});
