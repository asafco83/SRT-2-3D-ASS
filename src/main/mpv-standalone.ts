import { type WebContents, BrowserWindow } from 'electron';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MpvController } from './mpv.js';
import { getBinPath } from '../bin-path.js';
import { exportAss } from '../exporter.js';
import type { AssConfig, SrtCue, TrackInfo, StereoscopyMode, ViewOrder } from '../types.js';

interface OpenOpts {
  videoPath: string;
  tracks: TrackInfo[];
  vstream: number | null;     // absolute ffprobe stream index
  astream: number | null;
  config: AssConfig;
  cues: SrtCue[];
  anaglyph: boolean;
}

// ── Filter chain helpers ─────────────────────────────────────────────────

// Stereo crop / scale segment — a single-eye view at correct aspect.
function buildStereoSegment(mode: StereoscopyMode, eyeOrder: ViewOrder): string {
  const isSbs = mode === 'half-sbs' || mode === 'full-sbs';
  const isTab = mode === 'half-tab' || mode === 'full-tab';
  if (isSbs) {
    const cropX = eyeOrder === 'right-first' ? 'iw/2' : '0';
    const base  = `crop=iw/2:ih:${cropX}:0`;
    return mode === 'half-sbs' ? `${base},scale=iw*2:ih,setsar=1` : `${base},setsar=1`;
  }
  if (isTab) {
    const cropY = eyeOrder === 'right-first' ? 'ih/2' : '0';
    const base  = `crop=iw:ih/2:0:${cropY}`;
    return mode === 'half-tab' ? `${base},scale=iw:ih*2,setsar=1` : `${base},setsar=1`;
  }
  return 'setsar=1';
}

export function buildVfChain(mode: StereoscopyMode, eyeOrder: ViewOrder, _anaglyph: boolean): string {
  return buildStereoSegment(mode, eyeOrder);
}

// lavfi parses `:` as the option separator inside the `subtitles` filter, so
// the drive colon on Windows must be escaped as `\:`. Also normalise to
// forward slashes — backslashes get eaten by lavfi's tokeniser.
function escapeForLavfi(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function trackIndexFor(tracks: TrackInfo[], type: 'video' | 'audio', absIndex: number | null): number | undefined {
  if (absIndex === null) return undefined;
  const list = tracks.filter(t => t.type === type);
  const i = list.findIndex(t => t.index === absIndex);
  return i >= 0 ? i + 1 : undefined;
}

// ── StandaloneMpv ─────────────────────────────────────────────────────────
//
// Always drives mpv via --lavfi-complex. This unifies anaglyph and plain
// stereo rendering through a single property, so toggling between them is
// just a graph string swap — mpv keeps the same VO window.
//
// Each ASS rewrite produces freshly-timestamped temp files so the graph
// string (which embeds the file paths) is always new. mpv detects the
// difference and rebuilds the `subtitles` filter, which is the only way to
// pick up updated subtitle content (the filter caches the file at init).
//
// In anaglyph mode the graph splits the post-stereo video into a base copy
// plus two transparent canvases, renders red.ass onto one and cyan.ass onto
// the other, blends those two sub-layers with `lighten` (per-channel max ⇒
// red+cyan = white in the overlap region — the correct anaglyph compositor),
// then overlays the merged sub-layer onto the base.

export class StandaloneMpv {
  private mpv: MpvController | null = null;
  private tempAssPath:     string | null = null;     // non-anaglyph: combined
  private tempAssRedPath:  string | null = null;     // anaglyph: left-eye only
  private tempAssCyanPath: string | null = null;     // anaglyph: right-eye only

  private anaglyph = false;
  private mode: StereoscopyMode = 'half-sbs';
  private eyeOrder: ViewOrder = 'left-first';
  private currentConfig: AssConfig | null = null;
  private currentCues: SrtCue[] = [];
  private writeCounter = 0;
  // Linked-visibility: BrowserWindow we should raise when mpv gets focus.
  private editorWindow: BrowserWindow | null = null;

  isOpen(): boolean {
    return this.mpv !== null;
  }

  async open(sender: WebContents, opts: OpenOpts): Promise<void> {
    this.anaglyph = opts.anaglyph;
    this.mode = opts.config.stereoscopyMode;
    this.eyeOrder = opts.config.viewOrder;
    this.currentConfig = opts.config;
    this.currentCues = opts.cues;

    await this.writeAssFiles();

    const vid = trackIndexFor(opts.tracks, 'video', opts.vstream);
    const aid = trackIndexFor(opts.tracks, 'audio', opts.astream);
    const graph = this.buildCurrentGraph();

    if (this.mpv) {
      this.editorWindow = BrowserWindow.fromWebContents(sender);
      await this.mpv.setProperty('vid', vid !== undefined ? vid : 'auto');
      await this.mpv.setProperty('aid', aid !== undefined ? aid : 'auto');
      await this.mpv.setProperty('lavfi-complex', graph);
      await this.mpv.command(['loadfile', opts.videoPath]);
      await this.mpv.setProperty('pause', true);
      await this.raiseWindow();
    } else {
      this.mpv = new MpvController();
      
      this.mpv.on('exit', () => {
        this.mpv = null;
        this.editorWindow = null;
      });

      await this.mpv.launch(opts.videoPath, getBinPath('mpv'), {
        vid, aid, lavfiComplex: graph,
      });

      this.editorWindow = BrowserWindow.fromWebContents(sender);

      this.mpv.observeProperty('time-pos', 1).catch(() => { /**/ });
      this.mpv.observeProperty('pause',    2).catch(() => { /**/ });
      this.mpv.observeProperty('duration', 3).catch(() => { /**/ });
      this.mpv.observeProperty('volume',   4).catch(() => { /**/ });
      this.mpv.observeProperty('mute',     5).catch(() => { /**/ });
      // Linked visibility: when mpv reports it became focused, raise the
      // editor window without stealing focus back. The complementary
      // direction (editor focus → raise mpv) lives in raiseWindow() and is
      // wired from main/index.ts via the BrowserWindow's 'focus' event.
      this.mpv.observeProperty('focused', 6).catch(() => { /**/ });
      this.mpv.on('property-change', (data) => {
        const evt = data as { name: string; data: unknown };
        if (evt.name === 'focused') {
          // Diagnostic — written to mpv log via process stderr is noisy, so
          // route through electron's main-process console.
          console.log('[mpv] focused →', evt.data);
          if (evt.data === true && this.editorWindow && !this.editorWindow.isDestroyed()) {
            // moveTop alone doesn't always raise on Windows when another app
            // just took foreground; toggling alwaysOnTop is the same trick we
            // use for mpv and reliably brings the window to the top of the
            // z-order without stealing focus from mpv.
            const w = this.editorWindow;
            w.setAlwaysOnTop(true);
            setImmediate(() => { if (!w.isDestroyed()) w.setAlwaysOnTop(false); });
          }
        }
        if (sender.isDestroyed()) return;
        sender.send('mpv:event', evt);
      });
    }
  }

  // Bring the mpv window to the top of the z-order without stealing focus
  // from whatever window is currently active. mpv has no explicit "raise"
  // input command, but toggling its `ontop` property makes the WM raise
  // the window — we immediately turn it back off so the always-on-top
  // state isn't sticky.
  async raiseWindow(): Promise<void> {
    if (!this.mpv) return;
    try {
      await this.mpv.setProperty('ontop', true);
      await this.mpv.setProperty('ontop', false);
    } catch { /* mpv may have closed — ignore */ }
  }

  async close(): Promise<void> {
    if (this.mpv) {
      this.mpv.quit();
      this.mpv = null;
    }
    this.editorWindow = null;
    await this.cleanupAllAssFiles();
  }

  async setSubtitles(config: AssConfig, cues: SrtCue[], anaglyph: boolean): Promise<void> {
    if (!this.mpv) return;
    this.anaglyph = anaglyph;
    this.currentConfig = config;
    this.currentCues = cues;
    await this.writeAssFiles();
    await this.applyGraph();
  }

  async setStereo(mode: StereoscopyMode, eyeOrder: ViewOrder, anaglyph: boolean): Promise<void> {
    if (!this.mpv) return;
    const wasAnaglyph = this.anaglyph;
    this.anaglyph = anaglyph;
    this.mode = mode;
    this.eyeOrder = eyeOrder;
    if (anaglyph !== wasAnaglyph) {
      // Switching set of ASS files (combined ↔ red+cyan)
      await this.writeAssFiles();
    }
    await this.applyGraph();
  }

  async setStreams(tracks: TrackInfo[], vstream: number | null, astream: number | null): Promise<void> {
    if (!this.mpv) return;
    const vid = trackIndexFor(tracks, 'video', vstream);
    const aid = trackIndexFor(tracks, 'audio', astream);
    if (vid !== undefined) await this.mpv.setProperty('vid', vid);
    if (aid !== undefined) await this.mpv.setProperty('aid', aid);
  }

  play():           Promise<void> { return this.mpv?.play()   ?? Promise.resolve(); }
  pause():          Promise<void> { return this.mpv?.pause()  ?? Promise.resolve(); }
  seek(ms: number): Promise<void> { return this.mpv?.seek(ms) ?? Promise.resolve(); }

  setVolume(v: number): Promise<void> {
    if (!this.mpv) return Promise.resolve();
    return this.mpv.setProperty('volume', Math.max(0, Math.min(100, v)));
  }
  setMuted(m: boolean): Promise<void> {
    if (!this.mpv) return Promise.resolve();
    return this.mpv.setProperty('mute', m);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private buildCurrentGraph(): string {
    const stereo = buildStereoSegment(this.mode, this.eyeOrder);
    if (this.anaglyph && this.tempAssRedPath && this.tempAssCyanPath) {
      const r = escapeForLavfi(this.tempAssRedPath);
      const c = escapeForLavfi(this.tempAssCyanPath);
      return [
        `[vid1]${stereo},split=3[main][bgR][bgC]`,
        `[bgR]format=yuva420p,colorchannelmixer=aa=0,subtitles=filename='${r}':alpha=1[subR]`,
        `[bgC]format=yuva420p,colorchannelmixer=aa=0,subtitles=filename='${c}':alpha=1[subC]`,
        `[subR][subC]blend=all_mode=lighten:shortest=0[subs]`,
        `[main][subs]overlay=format=auto[vo]`,
      ].join(';');
    }
    if (this.tempAssPath) {
      const f = escapeForLavfi(this.tempAssPath);
      return `[vid1]${stereo},subtitles=filename='${f}'[vo]`;
    }
    return `[vid1]${stereo}[vo]`;
  }

  private async applyGraph(): Promise<void> {
    if (!this.mpv) return;
    await this.mpv.setProperty('lavfi-complex', this.buildCurrentGraph());
  }

  // Each call writes to fresh-named files and unlinks the previous ones.
  // The new paths cause the lavfi graph string to differ, forcing mpv to
  // rebuild the `subtitles` filter — this is what makes depth-offset and
  // other live edits actually take effect.
  private async writeAssFiles(): Promise<void> {
    if (!this.currentConfig) return;
    const stamp = `${process.pid}-${Date.now()}-${++this.writeCounter}`;
    const oldPaths = [this.tempAssPath, this.tempAssRedPath, this.tempAssCyanPath];
    this.tempAssPath = this.tempAssRedPath = this.tempAssCyanPath = null;

    // The lavfi pipeline crops to one eye and scales it back to full size;
    // the visible viewer-eye depends on viewOrder. ASS files are generated
    // in singleEye mode so the subs are centered in the visible eye-frame
    // (with depth shift) rather than positioned at the full-SBS-frame
    // eye-quarters.
    const visibleEye: 'left' | 'right' = this.eyeOrder === 'right-first' ? 'right' : 'left';
    if (this.anaglyph) {
      this.tempAssRedPath  = join(tmpdir(), `srt3d-mpv-red-${stamp}.ass`);
      this.tempAssCyanPath = join(tmpdir(), `srt3d-mpv-cyan-${stamp}.ass`);
      await exportAss(this.tempAssRedPath,  this.currentConfig, this.currentCues, true, 'left',  true);
      await exportAss(this.tempAssCyanPath, this.currentConfig, this.currentCues, true, 'right', true);
    } else {
      this.tempAssPath = join(tmpdir(), `srt3d-mpv-${stamp}.ass`);
      await exportAss(this.tempAssPath, this.currentConfig, this.currentCues, false, visibleEye, true);
    }

    // Cleanup the prior generation after the new files are in place.
    for (const p of oldPaths) {
      if (p) { try { await unlink(p); } catch { /**/ } }
    }
  }

  private async cleanupAllAssFiles(): Promise<void> {
    const paths = [this.tempAssPath, this.tempAssRedPath, this.tempAssCyanPath];
    this.tempAssPath = this.tempAssRedPath = this.tempAssCyanPath = null;
    for (const p of paths) {
      if (p) { try { await unlink(p); } catch { /**/ } }
    }
  }
}
