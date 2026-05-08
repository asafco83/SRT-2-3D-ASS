import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnAsync } from './binary-runner.js';

export interface GrabOptions {
  videoPath: string;
  timeMs: number;
  ffmpegBin: string;
  quality?: number; // JPEG quality 1–31, lower = better; default 3
}

// Pure helper — builds the ffmpeg arg list without touching the filesystem.
export function buildGrabArgs(opts: GrabOptions, outPath: string): string[] {
  const { videoPath, timeMs, quality = 3 } = opts;
  return [
    '-ss', String(timeMs / 1000),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', String(quality),
    '-y',
    outPath,
  ];
}

export function makeFramePath(timeMs: number): string {
  return join(tmpdir(), `srt3d-frame-${timeMs}-${Date.now()}.jpg`);
}

export async function grabFrame(opts: GrabOptions): Promise<string> {
  const outPath = makeFramePath(opts.timeMs);
  const args = buildGrabArgs(opts, outPath);
  const result = await spawnAsync(opts.ffmpegBin, args);
  if (result.code !== 0) {
    throw new Error(`ffmpeg exited ${result.code}: ${result.stderr.slice(-200)}`);
  }
  return outPath;
}
