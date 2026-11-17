import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createPlaygroundAPI } from './fixtures/request-playground.mjs';

const port = Number(process.env.REQUEST_PLAYGROUND_PORT || 3330);
const apiPort = Number(process.env.REQUEST_PLAYGROUND_API_PORT || 3331);
const api = createServer(createPlaygroundAPI());
api.listen(apiPort, '127.0.0.1', () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    stdio: 'inherit', env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}`, REQUEST_PLAYGROUND: '1', NEXT_PUBLIC_API_ORIGIN: '', NEXT_PUBLIC_ERROR_REPORTING_ENABLED: 'false' },
  });
  console.log(`\nRequest form playground: http://localhost:${port}/dev/request-preview\nData is isolated in memory. Restart to reset.\n`);
  const stop = () => { child.kill('SIGTERM'); api.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  child.on('exit', code => { api.close(); process.exitCode = code ?? 0; });
});
api.on('error', e => { console.error(e.message); process.exitCode = 1; });
