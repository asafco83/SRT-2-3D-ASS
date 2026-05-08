import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnAsync, spawnAsyncStreaming } from './binary-runner.js';

export interface TrackSelection {
  audio: number[];      // track IDs from source to include
  subtitles: number[];  // track IDs from source to include
}

export interface MuxOptions {
  mkvmergeBin: string;
  videoPath: string;
  assPath: string;
  outputPath: string;
  language: string;         // ISO 639-2/B, e.g. 'eng'
  trackName: string;        // name of the new ASS subtitle track
  isDefault: boolean;
  isForced: boolean;
  includeTracks: TrackSelection;
  // Map of source-track ID → custom name. Applied to the source file via
  // mkvmerge's `--track-name N:NAME` so existing tracks can be renamed at
  // mux time without re-encoding.
  trackNameOverrides?: Record<number, string>;
  // Optional progress callback. When provided, mkvmerge is launched with
  // --gui-mode so it emits machine-parseable `#GUI#progress NN` lines, and
  // the callback receives the percent (0–100) on each update.
  onProgress?: (percent: number) => void;
}

export function getSafeOutputPath(desired: string): string {
  if (!existsSync(desired)) return desired;
  const ext = extname(desired);
  const base = desired.slice(0, desired.length - ext.length);
  let n = 2;
  while (existsSync(`${base}_${n}${ext}`)) n++;
  return `${base}_${n}${ext}`;
}

// Pure arg builder — testable without a binary.
export function buildMuxArgs(opts: MuxOptions, safePath: string): string[] {
  const { videoPath, assPath, language, trackName, isDefault, isForced,
          includeTracks, trackNameOverrides, onProgress } = opts;
  const args: string[] = ['--output', safePath];
  if (onProgress) args.push('--gui-mode');

  if (includeTracks.audio.length > 0) {
    args.push('--audio-tracks', includeTracks.audio.join(','));
  } else {
    args.push('--no-audio');
  }

  if (includeTracks.subtitles.length > 0) {
    args.push('--subtitle-tracks', includeTracks.subtitles.join(','));
  } else {
    args.push('--no-subtitles');
  }

  // Per-source-track name overrides — must come BEFORE the source file path.
  if (trackNameOverrides) {
    for (const [id, name] of Object.entries(trackNameOverrides)) {
      if (name && name.trim()) args.push('--track-name', `${id}:${name}`);
    }
  }

  args.push(videoPath);

  args.push(
    '--language', `0:${language}`,
    '--track-name', `0:${trackName}`,
    '--default-track', `0:${isDefault ? 'yes' : 'no'}`,
    '--forced-track', `0:${isForced ? 'yes' : 'no'}`,
    assPath,
  );

  return args;
}

export async function muxToMkv(opts: MuxOptions): Promise<string> {
  const safePath = getSafeOutputPath(opts.outputPath);
  const args = buildMuxArgs(opts, safePath);
  const result = opts.onProgress
    ? await spawnAsyncStreaming(opts.mkvmergeBin, args, (line) => {
        // --gui-mode emits `#GUI#progress NN%` for progress updates.
        const m = /^#GUI#progress\s+(\d+)/.exec(line);
        if (m) opts.onProgress!(Math.min(100, parseInt(m[1], 10)));
      })
    : await spawnAsync(opts.mkvmergeBin, args);
  // mkvmerge exits 1 for warnings (non-fatal), 2 for errors
  if (result.code === 2) {
    throw new Error(`mkvmerge failed: ${result.stdout.slice(-400)}`);
  }
  return safePath;
}
