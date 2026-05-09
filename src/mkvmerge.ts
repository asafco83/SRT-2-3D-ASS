import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnAsync, spawnAsyncStreaming } from './binary-runner.js';

export interface TrackSelection {
  video: number[];
  audio: number[];      // track IDs from source to include
  subtitles: number[];  // track IDs from source to include
}

export interface MuxOptions {
  mkvmergeBin: string;
  videoPath: string;
  outputPath: string;
  fileTitle?: string;
  language: string;         // ISO 639-2/B, e.g. 'eng'
  newSubtitleTracks: {
    path: string;
    name: string;
    isDefault: boolean;
    isForced: boolean;
  }[];
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

// Pure arg builder — testable without a binary.
export function buildMuxArgs(opts: MuxOptions, safePath: string): string[] {
  const { videoPath, fileTitle, newSubtitleTracks, language,
          includeTracks, trackNameOverrides, onProgress } = opts;
  const args: string[] = ['--output', safePath];
  if (onProgress) args.push('--gui-mode');

  if (fileTitle !== undefined && fileTitle.trim() !== '') {
    args.push('--title', fileTitle.trim());
  }

  if (includeTracks.video.length > 0) {
    args.push('--video-tracks', includeTracks.video.join(','));
  } else {
    args.push('--no-video');
  }

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

  for (const track of newSubtitleTracks) {
    args.push(
      '--language', `0:${language}`,
      '--track-name', `0:${track.name}`,
      '--default-track', `0:${track.isDefault ? 'yes' : 'no'}`,
      '--forced-track', `0:${track.isForced ? 'yes' : 'no'}`,
      track.path,
    );
  }

  return args;
}

export async function muxToMkv(opts: MuxOptions): Promise<string> {
  if (opts.outputPath === opts.videoPath) {
    throw new Error('Cannot overwrite the source video file while reading it.');
  }
  const safePath = opts.outputPath;
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
