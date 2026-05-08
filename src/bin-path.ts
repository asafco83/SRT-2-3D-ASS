import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const repoRoot = join(fileURLToPath(import.meta.url), '..', '..', '..');

function platformSubdir(): string {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

export function getBinPath(name: string): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const local = join(repoRoot, 'bin', platformSubdir(), name + ext);
  if (existsSync(local)) return local;
  // In a packaged Electron app this will be overridden; for now throw early.
  throw new Error(`Binary not found: ${local} — place ${name}${ext} in bin/${platformSubdir()}/`);
}
