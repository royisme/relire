/** Owns rooted Wrangler invocation and proxy options; does not execute commands or authorize publication. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function requireInteractiveTerminal(stdinIsTTY: boolean, stdoutIsTTY: boolean): void {
  if (!stdinIsTTY || !stdoutIsTTY) throw new Error('Remote publication requires TTY stdin and stdout');
}

export function d1ExecuteSpawn(root: string | URL, remote: boolean, ...args: string[]) {
  const worker = resolve(typeof root === 'string' ? root : fileURLToPath(root), 'worker');
  return {
    cmd: [
      'node',
      '--no-warnings',
      '--',
      resolve(worker, 'node_modules/wrangler/wrangler-dist/cli.js'),
      ...args,
      remote ? '--remote' : '--local',
      '--config',
      resolve(worker, remote ? 'wrangler.deploy.jsonc' : 'wrangler.jsonc'),
      ...(!remote ? ['--persist-to', resolve(worker, '.wrangler/state')] : []),
      '--env-file',
      '.no-env-files',
    ],
    cwd: worker,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_HIDE_BANNER: 'true' },
  };
}

export function platformProxyOptions(root: string | URL, remote: boolean) {
  const worker = resolve(typeof root === 'string' ? root : fileURLToPath(root), 'worker');
  return {
    configPath: resolve(worker, remote ? 'wrangler.deploy.jsonc' : 'wrangler.jsonc'),
    remoteBindings: remote,
    persist: remote ? (false as const) : { path: resolve(worker, '.wrangler/state/v3') },
    envFiles: ['.no-env-files'],
  };
}
