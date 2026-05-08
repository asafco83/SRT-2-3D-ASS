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

  // Packaged app path (electron-builder places extraResources in process.resourcesPath)
  const packagedPath = (process as any).resourcesPath ? join((process as any).resourcesPath, 'bin', platformSubdir(), name + ext) : '';
  if (packagedPath && existsSync(packagedPath)) return packagedPath;

  // Local development path
  const localPath = join(repoRoot, 'bin', platformSubdir(), name + ext);
  if (existsSync(localPath)) return localPath;

  throw new Error(`Binary not found: ${name}${ext} — place it in bin/${platformSubdir()}/`);
}
