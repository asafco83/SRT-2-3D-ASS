export interface VideoMetadata {
  width: number;
  height: number;
  dar: string;
  fps: number;
  codec: string;
  durationMs: number;
  stereoMode: string | undefined;
  eyeOrder: 'left-first' | 'right-first';
  detectedSbsType: 'half-sbs' | 'full-sbs' | 'unknown';
}

export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  lines: string[];
}

export type StereoscopyMode = 'half-sbs' | 'full-sbs' | 'half-tab' | 'full-tab';
export type ViewOrder = 'left-first' | 'right-first';
export type Encoding = 'utf-8' | 'utf-8-bom';

export interface AssConfig {
  videoWidth: number;
  videoHeight: number;
  stereoscopyMode: StereoscopyMode;
  viewOrder: ViewOrder;

  fontName: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;

  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;

  primaryColor: string;
  primaryAlpha: number;
  outlineColor: string;
  outlineAlpha: number;
  backColor: string;
  backAlpha: number;

  borderStyle: 1 | 3;
  outline: number;
  shadow: number;

  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;

  wrapStyle: 0 | 1 | 2 | 3;

  depthOffset: number;
  verticalOffset: number;

  timingOffsetMs: number;
  timingSpeedMultiplier: number;

  encoding: Encoding;
}

export interface TrackInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle' | 'other';
  codec: string;
  language?: string;
  title?: string;
  width?: number;
  height?: number;
  channels?: number;
  isDefault: boolean;
  isForced: boolean;
}

// Renderer-side mux request (no binary paths — main process injects those)
export interface MuxRequest {
  videoPath: string;
  assPath: string;
  outputPath: string;
  language: string;
  trackName: string;
  isDefault: boolean;
  isForced: boolean;
  includeTracks: {
    audio: number[];
    subtitles: number[];
  };
  // Per-source-track name overrides keyed by ffprobe track index
  trackNameOverrides?: Record<number, string>;
}

// One-shot "generate ASS + mux into MKV" request — main process writes a
// temp ASS, runs mkvmerge, and cleans up.
export interface ExportMkvRequest {
  videoPath: string;
  outputPath: string;
  config: AssConfig;
  cues: SrtCue[];
  language: string;
  trackName: string;
  isDefault: boolean;
  isForced: boolean;
  includeTracks: {
    audio: number[];
    subtitles: number[];
  };
  trackNameOverrides?: Record<number, string>;
}

// Derive sensible defaults from detected metadata. The "video height" anchors
// the typographic scale: a 1080p reference uses fontSize 70 / marginV 150 /
// outline 2 / shadow 2; everything scales linearly with height. Stereo mode and
// eye order come straight from ffprobe's detection.
export function inferConfigFromMetadata(meta: VideoMetadata): Partial<AssConfig> {
  const REF_HEIGHT = 1080;
  const k = meta.height / REF_HEIGHT;
  const round = (n: number, q = 1) => Math.round(n / q) * q;

  const out: Partial<AssConfig> = {
    videoWidth: meta.width,
    videoHeight: meta.height,
    fontSize: round(70 * k),
    marginV: round(150 * k, 5),
    outline: Math.max(1, round(2 * k * 2) / 2),  // 0.5 px steps
    shadow: Math.max(1, round(2 * k * 2) / 2),
    viewOrder: meta.eyeOrder,
  };
  if (meta.detectedSbsType !== 'unknown') out.stereoscopyMode = meta.detectedSbsType;
  return out;
}

export const defaultConfig: Omit<AssConfig, 'videoWidth' | 'videoHeight'> = {
  stereoscopyMode: 'half-sbs',
  viewOrder: 'left-first',
  fontName: 'Arial',
  fontSize: 70,
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
  scaleX: 100,
  scaleY: 100,
  spacing: 0,
  angle: 0,
  primaryColor: '#FFFFFF',
  primaryAlpha: 0,
  outlineColor: '#000000',
  outlineAlpha: 0,
  backColor: '#000000',
  backAlpha: 0.753,
  borderStyle: 1,
  outline: 2,
  shadow: 2,
  alignment: 2,
  marginL: 0,
  marginR: 0,
  marginV: 150,
  wrapStyle: 2,
  depthOffset: 0,
  verticalOffset: 0,
  timingOffsetMs: 0,
  timingSpeedMultiplier: 1.0,
  encoding: 'utf-8-bom',
};
