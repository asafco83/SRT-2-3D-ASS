import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSrt } from '../src/srt-parser.js';
import { generateAss, withBom } from '../src/ass-generator.js';
import { defaultConfig, type AssConfig } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'test', 'fixtures');
const srtPath = join(fixturesDir, 'sample.srt');
const outPath = join(fixturesDir, 'sample.3D.HalfSBS.ass');

const srt = readFileSync(srtPath, 'utf8');
const cues = parseSrt(srt);

const config: AssConfig = {
  ...defaultConfig,
  videoWidth: 1920,
  videoHeight: 1080,
};

const ass = generateAss(config, cues);
writeFileSync(outPath, withBom(ass, config.encoding), 'utf8');

console.log(`Parsed ${cues.length} cues from ${srtPath}`);
console.log(`Wrote ${outPath}`);
console.log('\n--- ASS preview (first 40 lines) ---');
console.log(ass.split('\n').slice(0, 40).join('\n'));
