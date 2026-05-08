import { writeFile } from 'node:fs/promises';
import { dirname, basename, extname, join } from 'node:path';
import type { AssConfig, SrtCue } from './types.js';
import { generateAss, type AnaglyphEye } from './ass-generator.js';

const SUFFIX_MAP: Record<string, string> = {
  'half-sbs': '3D.HalfSBS',
  'full-sbs': '3D.SBS',
  'half-tab': '3D.HalfOU',
  'full-tab': '3D.OU',
};

export function getFilenameSuffix(mode: AssConfig['stereoscopyMode']): string {
  return SUFFIX_MAP[mode] ?? '3D';
}

export function buildDefaultOutputPath(videoPath: string, config: Pick<AssConfig, 'stereoscopyMode'>): string {
  const dir = dirname(videoPath);
  const base = basename(videoPath, extname(videoPath));
  const suffix = getFilenameSuffix(config.stereoscopyMode);
  return join(dir, `${base}.${suffix}.ass`);
}

export function buildAssContent(
  config: AssConfig,
  cues: SrtCue[],
  anaglyphPreview = false,
  eyeFilter?: AnaglyphEye,
  singleEye = false,
): string {
  const raw = generateAss(config, cues, anaglyphPreview, eyeFilter, singleEye);
  return config.encoding === 'utf-8-bom' ? '﻿' + raw : raw;
}

export async function exportAss(
  outputPath: string,
  config: AssConfig,
  cues: SrtCue[],
  anaglyphPreview = false,
  eyeFilter?: AnaglyphEye,
  singleEye = false,
): Promise<void> {
  const content = buildAssContent(config, cues, anaglyphPreview, eyeFilter, singleEye);
  await writeFile(outputPath, content, 'utf8');
}
