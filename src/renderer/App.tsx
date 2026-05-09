/// <reference path="./env.d.ts" />
import { useState, useCallback, useEffect } from 'react';
import type { AssConfig, SrtCue, VideoMetadata, TrackInfo, ExportMkvRequest } from '../types.js';
import { defaultConfig, inferConfigFromMetadata } from '../types.js';
import { VideoPanel } from './components/VideoPanel.js';
import { ConfigPanel } from './components/ConfigPanel.js';
import { CueTimeline } from './components/CueTimeline.js';
import { MuxPanel, type MuxOptions } from './components/MuxPanel.js';
import { AboutDialog } from './components/AboutDialog.js';
import appIcon from './assets/app-icon.png';

// Inline pure path helpers — avoids importing Node.js modules in the renderer
function buildMkvPath(videoPath: string): string {
  return `${videoPath.replace(/\.[^.]+$/, '')}.mkv`;
}

type Status = { msg: string; kind: 'ok' | 'err' | '' };
type Tab = 'subtitle' | 'mkv';

export type SyncAnchor = { cueIndex: number; videoTimeMs: number };
export type SyncAnchors = { early: SyncAnchor | null; late: SyncAnchor | null };

// Solve for { speed, offset } such that
//   actual = original * speed + offset
// matches each locked anchor: anchor.videoTimeMs = cue.startMs * speed + offset.
// One anchor → pure offset (speed=1). Two anchors → fit a line through both.
function computeFromAnchors(
  anchors: SyncAnchors, cues: SrtCue[],
): { offset: number; speed: number } | null {
  if (!anchors.early) return null;
  const e = cues.find(c => c.index === anchors.early!.cueIndex);
  if (!e) return null;
  if (!anchors.late) {
    return { offset: anchors.early.videoTimeMs - e.startMs, speed: 1 };
  }
  const l = cues.find(c => c.index === anchors.late!.cueIndex);
  if (!l || l.startMs === e.startMs) return null;
  const speed = (anchors.late.videoTimeMs - anchors.early.videoTimeMs) / (l.startMs - e.startMs);
  const offset = anchors.early.videoTimeMs - e.startMs * speed;
  return {
    speed:  Math.max(0.9, Math.min(1.1, parseFloat(speed.toFixed(4)))),
    offset: Math.max(-5000, Math.min(5000, Math.round(offset))),
  };
}

const defaultMuxOptions: MuxOptions = {
  fileTitle:          '',
  language:           'und',
  include3D:          true,
  trackName3D:        'Subtitle 3D',
  trackName3DTouched: false,
  isDefault3D:        true,
  isForced3D:         false,
  include2D:          true,
  trackName2D:        'Subtitle',
  trackName2DTouched: false,
  isDefault2D:        false,
  isForced2D:         false,
  selectedVideo:      new Set(),
  selectedAudio:      new Set(),
  selectedSubs:       new Set(),
  trackNameOverrides: new Map(),
};

export function App() {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [srtPath,   setSrtPath]   = useState<string | null>(null);
  const [metadata,  setMetadata]  = useState<VideoMetadata | null>(null);
  const [tracks,    setTracks]    = useState<TrackInfo[]>([]);
  const [cues,      setCues]      = useState<SrtCue[]>([]);
  const [timeMs,    setTimeMs]    = useState(0);
  const [config,    setConfig]    = useState<AssConfig>({
    ...defaultConfig,
    videoWidth: 1920,
    videoHeight: 1080,
  });
  const [anaglyphPreview, setAnaglyphPreview] = useState(false);
  const [status,    setStatus]    = useState<Status>({ msg: '', kind: '' });
  const [muxOpts,   setMuxOpts]   = useState<MuxOptions>(defaultMuxOptions);
  const [exporting, setExporting] = useState(false);
  const [exportPercent, setExportPercent] = useState<number | null>(null);
  const [tab,       setTab]       = useState<Tab>('subtitle');
  // mpv may report a more accurate duration than ffprobe — keep an override.
  const [mpvDurationMs, setMpvDurationMs] = useState<number | null>(null);
  // Two-anchor calibrator state
  const [selectedCueIndex, setSelectedCueIndex] = useState<number | null>(null);
  const [syncAnchors, setSyncAnchors] = useState<SyncAnchors>({ early: null, late: null });
  const [showExportMenu, setShowExportMenu] = useState(false);
  // Snapshot of the timing values before the user locked their first anchor —
  // restored automatically when all anchors are cleared, so an accidental lock
  // can be undone without leaving stale calibration in place.
  const [timingBaseline, setTimingBaseline] = useState<{ offset: number; speed: number } | null>(null);

  useEffect(() => {
    const hasAnchor = syncAnchors.early !== null || syncAnchors.late !== null;

    if (!hasAnchor) {
      if (timingBaseline) {
        setConfig(c => ({
          ...c,
          timingOffsetMs: timingBaseline.offset,
          timingSpeedMultiplier: timingBaseline.speed,
        }));
        setTimingBaseline(null);
      }
      return;
    }

    if (!timingBaseline) {
      setTimingBaseline({
        offset: config.timingOffsetMs,
        speed:  config.timingSpeedMultiplier,
      });
    }
    const r = computeFromAnchors(syncAnchors, cues);
    if (!r) return;
    setConfig(c => ({ ...c, timingOffsetMs: r.offset, timingSpeedMultiplier: r.speed }));
    // We intentionally only react to anchors/cues changing — config is read
    // for the baseline snapshot but reading it on every config change would
    // turn this into a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAnchors, cues]);

  // Reset anchors when the SRT changes
  useEffect(() => {
    setSyncAnchors({ early: null, late: null });
    setSelectedCueIndex(null);
    setTimingBaseline(null);
  }, [srtPath]);

  const lockAnchor = useCallback((which: 'early' | 'late') => {
    if (selectedCueIndex === null) return;
    setSyncAnchors(a => ({ ...a, [which]: { cueIndex: selectedCueIndex, videoTimeMs: timeMs } }));
  }, [selectedCueIndex, timeMs]);
  const clearAnchor = useCallback((which: 'early' | 'late') => {
    setSyncAnchors(a => ({ ...a, [which]: null }));
  }, []);
  const resetAnchors = useCallback(() => {
    setSyncAnchors({ early: null, late: null });
  }, []);

  const flash = (msg: string, kind: Status['kind'] = 'ok') => {
    setStatus({ msg, kind });
    setTimeout(() => setStatus({ msg: '', kind: '' }), 4000);
  };

  // When tracks load, default-include all source tracks
  useEffect(() => {
    setMuxOpts(o => ({
      ...o,
      selectedVideo: new Set(tracks.filter(t => t.type === 'video').map(t => t.index)),
      selectedAudio: new Set(tracks.filter(t => t.type === 'audio').map(t => t.index)),
      selectedSubs:  new Set(tracks.filter(t => t.type === 'subtitle').map(t => t.index)),
      trackNameOverrides: new Map(),
    }));
  }, [tracks]);


  const handleOpenVideo = useCallback(async () => {
    const path = await window.api.openFile([
      { name: 'Video', extensions: ['mkv', 'mp4', 'avi', 'mov'] },
    ]);
    if (!path) return;
    setVideoPath(path);
    setTracks([]);
    setMpvDurationMs(null);
    try {
      const [meta, trackList] = await Promise.all([
        window.api.getVideoMetadata(path),
        window.api.getVideoTracks(path),
      ]);
      setMetadata(meta);
      setTracks(trackList);
      setConfig(c => ({ ...c, ...inferConfigFromMetadata(meta) }));
      setMuxOpts(o => ({ ...o, fileTitle: meta.title ?? '' }));
      flash(`Video loaded · ${meta.width}×${meta.height} · ${meta.codec} · ${meta.fps}fps`);
    } catch (e) {
      flash(String(e), 'err');
    }
  }, []);

  const handleOpenSrt = useCallback(async () => {
    const path = await window.api.openFile([
      { name: 'Subtitles', extensions: ['srt'] },
    ]);
    if (!path) return;
    setSrtPath(path);
    try {
      const parsed = await window.api.readSrt(path);
      setCues(parsed);
      flash(`Loaded ${parsed.length} cues`);
    } catch (e) {
      flash(String(e), 'err');
    }
  }, []);

  const handleExportAss = useCallback(async (is2D: boolean) => {
    if (!videoPath) { flash('Open a video first', 'err'); return; }
    if (cues.length === 0) { flash('Open an SRT file first', 'err'); return; }
    
    // "file title" "Track name"/"3D Track name".ass
    const titleBase = muxOpts.fileTitle.trim() || videoPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Subtitle';
    const trackName = is2D ? muxOpts.trackName2D : muxOpts.trackName3D;
    
    const defaultPath = videoPath.replace(/[^\\/]+$/, `${titleBase} ${trackName}.ass`);
    const savePath = await window.api.saveFile(defaultPath, [
      { name: 'ASS Subtitle', extensions: ['ass'] },
    ]);
    if (!savePath) return;
    try {
      await window.api.exportAss(savePath, config, cues, is2D);
      flash(`Exported → ${savePath.split(/[\\/]/).pop()}`);
    } catch (e) {
      flash(String(e), 'err');
    }
  }, [videoPath, config, cues, muxOpts]);

  const handleExportMkv = useCallback(async () => {
    if (!videoPath) { flash('Open a video first', 'err'); return; }
    if (cues.length === 0) { flash('Open an SRT file first', 'err'); return; }
    const savePath = await window.api.saveFile(buildMkvPath(videoPath), [
      { name: 'Matroska', extensions: ['mkv'] },
    ]);
    if (!savePath) return;
    setExporting(true);
    setExportPercent(0);
    const unsubscribe = window.api.onMkvExportProgress((p) => setExportPercent(p));
    try {
      const req: ExportMkvRequest = {
        videoPath,
        outputPath:   savePath,
        fileTitle:    muxOpts.fileTitle,
        config,
        cues,
        language:     muxOpts.language,
        include3D:    muxOpts.include3D,
        trackName3D:  muxOpts.trackName3D,
        isDefault3D:  muxOpts.isDefault3D,
        isForced3D:   muxOpts.isForced3D,
        include2D:    muxOpts.include2D,
        trackName2D:  muxOpts.trackName2D,
        isDefault2D:  muxOpts.isDefault2D,
        isForced2D:   muxOpts.isForced2D,
        includeTracks: {
          video:     Array.from(muxOpts.selectedVideo),
          audio:     Array.from(muxOpts.selectedAudio),
          subtitles: Array.from(muxOpts.selectedSubs),
        },
        trackNameOverrides: Object.fromEntries(muxOpts.trackNameOverrides),
      };
      const finalPath = await window.api.exportToMkv(req);
      flash(`Exported → ${finalPath.split(/[\\/]/).pop()}`);
    } catch (e) {
      flash(String(e), 'err');
    } finally {
      unsubscribe();
      setExporting(false);
      setExportPercent(null);
    }
  }, [videoPath, cues, config, muxOpts]);

  const handleCueClick = useCallback((cue: SrtCue) => {
    setSelectedCueIndex(cue.index);
    // Seek to where this cue WOULD play with current sync. The user can
    // then scrub to where the dialogue actually is and lock the anchor.
    const ms = Math.round(cue.startMs * config.timingSpeedMultiplier) + config.timingOffsetMs + 100;
    setTimeMs(ms);
    window.api.mpv.seek(ms).catch(() => { /**/ });
  }, [config.timingSpeedMultiplier, config.timingOffsetMs]);

  const videoName = videoPath?.split(/[\\/]/).pop();
  const srtName   = srtPath?.split(/[\\/]/).pop();
  const durationMs = mpvDurationMs ?? metadata?.durationMs ?? 0;

  return (
    <div id="root">
      <AboutDialog />
      {/* Top bar — status messages float as toasts (see below) so the
          header stays a fixed-width row of buttons. The SRT chip shrinks
          first when space is tight; everything else is flex-shrink: 0. */}
      <div className="top-bar">
        <span className="app-title"><img src={appIcon} className="app-logo-img" alt="logo" />SRT → 3D ASS</span>
        <div className="top-bar-divider" />
        <button className="btn btn-secondary" onClick={handleOpenVideo}>Open Video</button>
        <button className="btn btn-secondary" onClick={handleOpenSrt}>Open SRT</button>

        <div className="spacer" />
        <div style={{ position: 'relative', display: 'flex' }}>
          <select
            className="btn btn-ghost"
            disabled={!cues.length}
            value=""
            onChange={(e) => {
              handleExportAss(e.target.value === '2d');
              e.target.value = '';
            }}
            style={{ appearance: 'none', cursor: 'pointer' }}
          >
            <option value="" disabled hidden>Export ASS ▾</option>
            <option value="3d" style={{ background: '#111114', color: '#ECECEE', textAlign: 'left' }}>3D ASS</option>
            <option value="2d" style={{ background: '#111114', color: '#ECECEE', textAlign: 'left' }}>ASS</option>
          </select>
        </div>
        <button className="btn btn-primary export-mkv-btn" onClick={handleExportMkv} disabled={!cues.length || !videoPath || exporting}>
          {exporting && (
            <span
              className="export-progress-fill"
              style={{ width: `${exportPercent ?? 0}%` }}
            />
          )}
          <span className="export-mkv-label">
            {exporting
              ? `Exporting… ${exportPercent ?? 0}%`
              : 'Export MKV'}
          </span>
        </button>
      </div>

      {/* Toast — floats over the bottom-right of the window so transient
          status messages don't reflow the header layout. */}
      {status.msg && (
        <div className={`toast toast-${status.kind}`} role="status">
          {status.msg}
        </div>
      )}

      {/* Player remote — drives the standalone mpv window */}
      <VideoPanel
        videoPath={videoPath}
        config={config}
        onConfigChange={setConfig}
        cues={cues}
        timeMs={timeMs}
        durationMs={durationMs}
        tracks={tracks}
        trackNameOverrides={muxOpts.trackNameOverrides}
        metadata={metadata}
        anaglyphPreview={anaglyphPreview}
        onAnaglyphChange={setAnaglyphPreview}
        onSeek={setTimeMs}
        onDurationDetected={setMpvDurationMs}
      />

      {/* Settings — full-width, tabbed */}
      <div className="config-side">
        <div className="config-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'subtitle'}
            className={`config-tab ${tab === 'subtitle' ? 'active' : ''}`}
            onClick={() => setTab('subtitle')}
          >Subtitle</button>
          <button
            role="tab"
            aria-selected={tab === 'mkv'}
            className={`config-tab ${tab === 'mkv' ? 'active' : ''}`}
            onClick={() => setTab('mkv')}
          >MKV Mux</button>
          <div className="spacer" style={{ flex: 1 }} />
          <span className={`file-chip ${srtName ? '' : 'empty'}`} title={srtName ?? ''} style={{ margin: 'auto 16px auto 0' }}>
            <span className="file-chip-tag">SRT</span>
            <span className="file-chip-name">{srtName ?? 'no SRT'}</span>
          </span>
        </div>
        <div className="config-body">
          {tab === 'subtitle' ? (
            <ConfigPanel
              config={config}
              onChange={setConfig}
              cues={cues}
              selectedCueIndex={selectedCueIndex}
              currentTimeMs={timeMs}
              syncAnchors={syncAnchors}
              onLockAnchor={lockAnchor}
              onClearAnchor={clearAnchor}
              onResetAnchors={resetAnchors}
            />
          ) : (
            <MuxPanel tracks={tracks} options={muxOpts} onChange={setMuxOpts} />
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="timeline-bar">
        <CueTimeline
          cues={cues}
          activeCueMs={timeMs}
          selectedCueIndex={selectedCueIndex}
          syncAnchors={syncAnchors}
          onCueClick={handleCueClick}
        />
      </div>
    </div>
  );
}
