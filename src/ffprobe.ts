import { spawnAsync } from './binary-runner.js';
import type { TrackInfo, VideoMetadata } from './types.js';

export type { VideoMetadata } from './types.js';

// Parses a DAR string like "16:9" or "32:9" into a decimal ratio.
export function parseDar(dar: string): number {
  const [n, d] = dar.split(':').map(Number);
  if (!n || !d || d === 0) return NaN;
  return n / d;
}

// Parses an avg_frame_rate string like "24000/1001" or "25/1".
export function parseFps(avgFrameRate: string): number {
  const [n, d] = avgFrameRate.split('/').map(Number);
  if (!n || !d || d === 0) return 0;
  return Math.round((n / d) * 1000) / 1000;
}

// Infers SBS type from pixel dimensions. DAR is intentionally ignored — it can
// match either type (full-SBS at 3840×1080 may be tagged DAR 32:9 or 16:9
// depending on encoder). The frame width is what reliably distinguishes them:
// double-wide → full-SBS, normal-wide → half-SBS.
export function inferSbsType(
  width: number,
  height: number,
  _dar: string,
): 'half-sbs' | 'full-sbs' | 'unknown' {
  if (width <= 0 || height <= 0) return 'unknown';
  const aspect = width / height;
  if (aspect > 2.5) return 'full-sbs';                 // e.g., 3840×1080 ≈ 3.56
  if (aspect >= 1.4 && aspect <= 2.1) return 'half-sbs'; // 16:9-ish, anamorphic
  return 'unknown';
}

// Parses the raw JSON output from ffprobe -print_format json -show_streams -show_format.
// Separated so it can be unit-tested without spawning a process.
export function parseProbeJson(json: string): VideoMetadata {
  const data = JSON.parse(json);
  const streams: Record<string, unknown>[] = Array.isArray(data.streams) ? data.streams : [];
  const video = streams.find((s) => s['codec_type'] === 'video');
  if (!video) throw new Error('ffprobe: no video stream found');

  const width = Number(video['width']);
  const height = Number(video['height']);
  const dar = String(video['display_aspect_ratio'] ?? `${width}:${height}`);
  const fps = parseFps(String(video['avg_frame_rate'] ?? '25/1'));
  const codec = String(video['codec_name'] ?? 'unknown');

  const tags = (video['tags'] ?? {}) as Record<string, string>;
  const stereoMode: string | undefined = tags['stereo_mode'] ?? undefined;
  const eyeOrder: VideoMetadata['eyeOrder'] =
    stereoMode === '11' || stereoMode === 'right_left' ? 'right-first' : 'left-first';

  // Duration may live in format.duration (seconds) or video.duration (seconds)
  const format = (data.format ?? {}) as Record<string, unknown>;
  const durationSec = Number(format['duration'] ?? video['duration'] ?? 0);
  const durationMs = isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec * 1000) : 0;

  return {
    width,
    height,
    dar,
    fps,
    codec,
    durationMs,
    stereoMode,
    eyeOrder,
    detectedSbsType: inferSbsType(width, height, dar),
  };
}

export function parseTracksJson(json: string): TrackInfo[] {
  const data = JSON.parse(json);
  const streams: Record<string, unknown>[] = Array.isArray(data.streams) ? data.streams : [];
  return streams.map((s, i) => {
    const codecType = String(s['codec_type'] ?? 'other');
    const type: TrackInfo['type'] =
      codecType === 'video' ? 'video' :
      codecType === 'audio' ? 'audio' :
      codecType === 'subtitle' ? 'subtitle' : 'other';

    const tags = (s['tags'] ?? {}) as Record<string, string>;
    const disp = (s['disposition'] ?? {}) as Record<string, number>;

    const track: TrackInfo = {
      index: Number(s['index'] ?? i),
      type,
      codec: String(s['codec_name'] ?? 'unknown'),
      language: tags['language'] || undefined,
      title: tags['title'] || undefined,
      isDefault: Boolean(disp['default']),
      isForced: Boolean(disp['forced']),
    };
    if (type === 'video') {
      const w = Number(s['width'] ?? 0);
      const h = Number(s['height'] ?? 0);
      if (w > 0) track.width = w;
      if (h > 0) track.height = h;
    }
    if (type === 'audio') {
      const ch = Number(s['channels'] ?? 0);
      if (ch > 0) track.channels = ch;
    }
    return track;
  });
}

export async function extractTracks(
  videoPath: string,
  ffprobeBin: string,
): Promise<TrackInfo[]> {
  const result = await spawnAsync(ffprobeBin, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    videoPath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe exited ${result.code}: ${result.stderr.trim()}`);
  }
  return parseTracksJson(result.stdout);
}

export async function extractMetadata(
  videoPath: string,
  ffprobeBin: string,
): Promise<VideoMetadata> {
  const result = await spawnAsync(ffprobeBin, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    videoPath,
  ]);
  if (result.code !== 0) {
    throw new Error(`ffprobe exited ${result.code}: ${result.stderr.trim()}`);
  }
  return parseProbeJson(result.stdout);
}
