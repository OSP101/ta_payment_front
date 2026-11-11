import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Render the real modal with mocked HTTP, never a real account/database.
const port = Number(process.env.USERS_TEST_PORT || 3321);
const route = `users-avatar-regression-${process.pid}`;
const dir = path.resolve('app', route);
const fixture = path.resolve('app/staff/users', `avatar-fixture-${process.pid}.tsx`);
const id = '7a71ae1b-e38a-44ba-bb87-41acd4ca0001';
const user = { id, email: 'avatar@example.test', first_name: 'Avatar', last_name: 'Test', roles: ['ta'], is_active: true };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, server, log = '';
try {
  await mkdir(dir);
  const source = await readFile('app/staff/users/page.tsx', 'utf8');
  await writeFile(fixture, source.replace('function CreateUserModal(', 'export function CreateUserModal('));
  await writeFile(path.join(dir, 'page.tsx'), `"use client";
import {useState} from 'react';
import useSWR from 'swr';
import {CreateUserModal} from '../staff/users/avatar-fixture-${process.pid}';
export default function Test(){const [open,setOpen]=useState(true);const {data}=useSWR<{items:{avatar_url?:string}[]}>('/users?avatar-test=1');return <main><button onClick={()=>setOpen(true)}>Create test user</button><output data-testid="saved-avatar">{data?.items[0]?.avatar_url??'none'}</output><CreateUserModal open={open} onClose={()=>setOpen(false)}/></main>}`);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', d => log += d); server.stderr.on('data', d => log += d);
  for (let i = 0; ; i++) {
    if (server.exitCode !== null || i > 120) throw Error(log);
    try { if ((await fetch(`http://localhost:${port}/${route}`, { signal: AbortSignal.timeout(4000) })).ok) break; } catch {}
    await pause(500);
  }
  browser = await chromium.launch({ channel: process.env.USERS_CHROME_CHANNEL || 'chrome' });
  for (const outcome of ['success', 'failure', 'no-photo']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__cspErrors = [];
      document.addEventListener('securitypolicyviolation', event => {
        if (event.effectiveDirective === 'script-src-elem') window.__cspErrors.push(event.blockedURI);
      });
    });
    let created = false, uploaded = false, started = false, exactRead = false, creates = 0;
    let finishUpload;
    const gate = new Promise(resolve => finishUpload = resolve);
    const events = [];
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/api/v1/auth/heartbeat') return route.fulfill({ json: { ok: true } });
      if (url.pathname === '/api/v1/users' && request.method() === 'POST') {
        creates++; created = true; events.push('create');
        return route.fulfill({ json: { user, temp_password: 'test-password-only' } });
      }
      if (url.pathname === `/api/v1/users/${id}`) {
        exactRead = true; events.push('read');
        return route.fulfill({ json: user, headers: { 'X-Edit-Views': JSON.stringify({ [`user:${id}`]: 'created-view' }) } });
      }
      if (url.pathname === `/api/v1/users/${id}/avatar`) {
        const views = JSON.parse(request.headers()['x-edit-views'] || '{}');
        expect(views[`user:${id}`]).toBe('created-view');
        expect(exactRead).toBe(true);
        expect(request.postDataBuffer().length).toBeGreaterThan(0);
        started = true; events.push('upload-start');
        await gate;
        uploaded = outcome === 'success'; events.push('upload-end');
        return route.fulfill(outcome === 'failure'
          ? { status: 500, json: { error: 'upload failed' } }
          : { json: { avatar_url: `/api/v1/users/${id}/avatar?v=1` } });
      }
      if (url.pathname === '/api/v1/users') {
        if (url.searchParams.has('avatar-test')) events.push(created ? 'list-after-create' : 'initial-list');
        return route.fulfill({ json: { items: created && !url.searchParams.has('q') ? [{ ...user, avatar_url: uploaded ? `/api/v1/users/${id}/avatar?v=1` : null }] : [] },
          headers: { 'X-Edit-Views': JSON.stringify({ 'user:*': created ? 'new-list' : 'old-list' }) } });
      }
      return route.fulfill({ json: {} });
    });
    const response = await page.goto(`http://localhost:${port}/${route}`);
    const csp = response.headers()['content-security-policy'];
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(await page.locator('script[src*="/_next/"]').evaluateAll(scripts => scripts.every(script => !!script.nonce))).toBe(true);
    await expect(page.getByTestId('saved-avatar')).toHaveText('none');
    await page.getByRole('textbox', { name: /อีเมล/ }).fill(user.email);
    await page.getByRole('textbox', { name: /^ชื่อ/ }).fill(user.first_name);
    await page.getByRole('textbox', { name: /^นามสกุล/ }).fill(user.last_name);
    if (outcome !== 'no-photo') {
      const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d'); context.fillStyle = '#078'; context.fillRect(0, 0, 128, 128);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.locator('input[type=file]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
      await page.getByRole('button', { name: 'บันทึกรูป', exact: true }).click();
    }
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    if (outcome !== 'no-photo') {
      await expect.poll(() => started).toBe(true);
      await pause(200);
      expect(events).not.toContain('list-after-create');
      await expect(page.getByRole('button', { name: 'บันทึก', exact: true })).toBeDisabled();
      finishUpload();
    }
    await expect(page.getByRole('heading', { name: 'สร้างผู้ใช้สำเร็จ', exact: true })).toBeVisible();
    await expect.poll(() => events.includes('list-after-create')).toBe(true);
    expect(creates).toBe(1);
    await expect(page.getByTestId('saved-avatar')).toHaveText(outcome === 'success' ? `/api/v1/users/${id}/avatar?v=1` : 'none');
    if (outcome === 'no-photo') expect(exactRead).toBe(false);
    expect(await page.evaluate(() => window.__cspErrors)).toEqual([]);
    expect(errors).toEqual([]);
    console.log(`PASS ${outcome}: correct snapshot, upload/list order, credentials, script nonce and working controls`);
    await page.close();
  }
} catch (error) {
  console.error(log.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM'); await exited;
  }
  await rm(dir, { recursive: true, force: true });
  await rm(fixture, { force: true });
  // Next dev leaves generated imports of the temporary route after shutdown.
  // Remove only those generated validators; Next recreates them on startup.
  for (const file of [path.resolve('.next/dev/types/validator.ts'), path.resolve('.next/dev/types/app', route, 'page.ts')]) {
    await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
