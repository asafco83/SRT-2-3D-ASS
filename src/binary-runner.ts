import { spawn } from 'node:child_process';

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function spawnAsync(bin: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on('data', (c: Buffer) => outChunks.push(c));
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        code: code ?? 1,
      });
    });
  });
}

// Streaming variant — invokes onStdoutLine for each newline-terminated line as
// it arrives. Lines split across chunks are buffered until the next chunk.
// Used by progress-aware callers (e.g. mkvmerge --gui-mode) so they can
// surface progress to the UI in real time instead of waiting for completion.
export function spawnAsyncStreaming(
  bin: string,
  args: string[],
  onStdoutLine: (line: string) => void,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let pending = '';
    proc.stdout.on('data', (c: Buffer) => {
      outChunks.push(c);
      // mkvmerge with --gui-mode emits clean newline-delimited lines, but
      // without --gui-mode it uses \r to overwrite. Treat both as line breaks.
      pending = (pending + c.toString('utf8')).replace(/\r/g, '\n');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const l of lines) if (l) onStdoutLine(l);
    });
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (pending) onStdoutLine(pending);
      resolve({
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        code: code ?? 1,
      });
    });
  });
}
