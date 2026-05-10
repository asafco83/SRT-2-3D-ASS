import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { createWriteStream, type WriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMpvCommand, parseMpvMessage } from '../mpv-protocol.js';
import type { MpvResponse } from '../mpv-protocol.js';

const MPV_LOG_PATH = join(tmpdir(), 'srt3d-mpv.log');

export { buildMpvCommand, parseMpvMessage };
export type { MpvResponse, MpvEvent, MpvMessage } from '../mpv-protocol.js';

// ── MpvController ─────────────────────────────────────────────────────────────

export class MpvController {
  private proc: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private pending = new Map<number, (r: MpvResponse) => void>();
  private nextId = 1;
  private buffer = '';
  private eventHandlers = new Map<string, ((data: unknown) => void)[]>();

  private get pipePath(): string {
    return process.platform === 'win32'
      ? '\\\\.\\pipe\\mpv-srt3d'
      : '/tmp/mpv-srt3d.sock';
  }

  async launch(
    videoPath: string,
    mpvBin: string,
    opts: { wid?: string; vid?: number; aid?: number; vf?: string; lavfiComplex?: string } = {},
  ): Promise<void> {
    const args = [
      '--no-config',
      '--idle=yes',
      '--pause',
      `--input-ipc-server=${this.pipePath}`,
      '--no-osc',
      '--no-osd-bar',
      '--no-input-default-bindings',
      '--input-vo-keyboard=no',
      '--keep-open=yes',
      // Don't auto-load sidecar subtitle files — the editor renders only
      // the user-loaded SRT through the lavfi subtitles filter.
      '--sub-auto=no',
      '--sid=no',
      '--msg-level=all=v',
      '--autofit=50%',
    ];
    if (opts.wid) args.push(`--wid=${opts.wid}`);
    if (opts.vid !== undefined) args.push(`--vid=${opts.vid}`);
    if (opts.aid !== undefined) args.push(`--aid=${opts.aid}`);
    if (opts.vf) args.push(`--vf=${opts.vf}`);
    if (opts.lavfiComplex) args.push(`--lavfi-complex=${opts.lavfiComplex}`);
    args.push(videoPath);

    const log: WriteStream = createWriteStream(MPV_LOG_PATH, { flags: 'w' });
    log.write(`=== mpv launch ${new Date().toISOString()} ===\n`);
    log.write(`bin: ${mpvBin}\n`);
    log.write(`args: ${args.join(' ')}\n\n`);

    this.proc = spawn(mpvBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc.stdout?.on('data', d => log.write(`[out] ${d}`));
    this.proc.stderr?.on('data', d => log.write(`[err] ${d}`));
    this.proc.on('exit', (code, sig) => {
      log.write(`\n=== mpv exit code=${code} sig=${sig} ===\n`);
      log.end();
      for (const h of this.eventHandlers.get('exit') ?? []) h({ code, sig });
    });

    // Give mpv time to create the socket/pipe
    await new Promise((r) => setTimeout(r, 800));
    await this.connectSocket();
  }

  private connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      sock.connect(this.pipePath as unknown as number, () => {
        this.socket = sock;
        resolve();
      });
      sock.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString('utf8');
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = parseMpvMessage(line);
          if (!msg) continue;
          if (msg.type === 'response') {
            this.pending.get(msg.requestId)?.(msg);
            this.pending.delete(msg.requestId);
          } else {
            for (const h of this.eventHandlers.get(msg.event) ?? []) h(msg.data);
          }
        }
      });
      sock.on('error', reject);
    });
  }

  command(args: unknown[]): Promise<MpvResponse> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.socket?.write(buildMpvCommand(args, id));
    });
  }

  async seek(ms: number): Promise<void> {
    await this.command(['seek', ms / 1000, 'absolute']);
  }

  async play(): Promise<void> {
    await this.setProperty('pause', false);
  }

  async pause(): Promise<void> {
    await this.setProperty('pause', true);
  }

  async getTimeMs(): Promise<number> {
    const r = await this.getProperty('time-pos');
    return (Number(r) || 0) * 1000;
  }

  async getDurationMs(): Promise<number> {
    const r = await this.getProperty('duration');
    return (Number(r) || 0) * 1000;
  }

  async setProperty(name: string, value: unknown): Promise<void> {
    await this.command(['set_property', name, value]);
  }

  async getProperty(name: string): Promise<unknown> {
    const r = await this.command(['get_property', name]);
    return r.data;
  }

  on(event: string, handler: (data: unknown) => void): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
    this.eventHandlers.get(event)!.push(handler);
  }

  async observeProperty(name: string, id: number): Promise<void> {
    await this.command(['observe_property', id, name]);
  }

  quit(): void {
    this.socket?.destroy();
    this.proc?.kill();
    this.socket = null;
    this.proc = null;
    this.pending.clear();
  }
}
