import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function load(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = {
    exports: {}, require: name => dependencies[name] ?? {},
    AbortController, AbortSignal: {}, DOMException, setTimeout, clearTimeout,
    Headers, Response, performance, process: { env: {} }, ...globals,
  };
  vm.runInNewContext(code, context);
  return context.exports;
}

test('creditor PDF POST works without AbortSignal.timeout or AbortSignal.any', async () => {
  const timeout = await load('app/lib/requestTimeout.ts');
  let request;
  const { api } = await load('app/lib/api.ts', {
    './requestTimeout': timeout,
    './i18n/core': { msg: value => value },
    './loadingBar': { beginRequest() {}, endRequest() {} },
    './concurrentEdits': { editRequestHeaders: async () => ({}), rememberEditViews() {} },
    './apiTelemetry': { recordAPI() {} },
  }, {
    fetch: async (url, init) => {
      request = { url, init };
      return new Response('%PDF-1.7\npreview', { headers: { 'content-type': 'application/pdf' } });
    },
  });
  const form = { first_name: 'Test', account_no: '1234567890' };
  const pdf = await api.post('/me/creditor-form/preview.pdf', form);
  assert.equal(request.url, '/api/v1/me/creditor-form/preview.pdf');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.body, JSON.stringify(form));
  assert.equal(request.init.credentials, 'include');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.equal(pdf.type, 'application/pdf');
  assert.match(await pdf.text(), /^%PDF/);
});

test('fallback timeout aborts slow requests and preserves caller cancellation', async () => {
  const { requestTimeout } = await load('app/lib/requestTimeout.ts');
  const slow = requestTimeout(5);
  await new Promise(resolve => slow.signal.addEventListener('abort', resolve, { once: true }));
  assert.equal(slow.timedOut(), true);
  assert.equal(slow.signal.reason.name, 'TimeoutError');
  slow.dispose();

  const parent = new AbortController();
  const cancelled = requestTimeout(1000, parent.signal);
  parent.abort();
  assert.equal(cancelled.signal.aborted, true);
  assert.equal(cancelled.timedOut(), false);
  cancelled.dispose();

  const alreadyCancelled = requestTimeout(1000, parent.signal);
  assert.equal(alreadyCancelled.signal.aborted, true);
  alreadyCancelled.dispose();
});

test('completed requests release the timeout', async () => {
  const { requestTimeout } = await load('app/lib/requestTimeout.ts');
  const completed = requestTimeout(5);
  completed.dispose();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(completed.signal.aborted, false);
});
