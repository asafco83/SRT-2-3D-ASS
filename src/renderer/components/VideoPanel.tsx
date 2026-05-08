/// <reference path="../env.d.ts" />
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssConfig, SrtCue, TrackInfo, VideoMetadata } from '../../types.js';

interface Props {
  videoPath: string | null;
  config: AssConfig;
  onConfigChange: (c: AssConfig) => void;
  cues: SrtCue[];
  timeMs: number;
  durationMs: number;
  tracks: TrackInfo[];
  trackNameOverrides: Map<number, string>;
  metadata: VideoMetadata | null;
  anaglyphPreview: boolean;
  onAnaglyphChange: (v: boolean) => void;
  onSeek: (ms: number) => void;
  onDurationDetected?: (ms: number) => void;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function defaultTrackIndex(tracks: TrackInfo[], type: 'video' | 'audio'): number | null {
  const filtered = tracks.filter(t => t.type === type);
  if (filtered.length === 0) return null;
  return (filtered.find(t => t.isDefault) ?? filtered[0]).index;
}

function trackLabel(t: TrackInfo, overrides: Map<number, string>): string {
  const bits: string[] = [`#${t.index}`, t.codec];
  if (t.type === 'video' && t.width && t.height) bits.push(`${t.width}×${t.height}`);
  if (t.type === 'audio' && t.channels)          bits.push(`${t.channels}ch`);
  if (t.language) bits.push(t.language);
  const name = overrides.get(t.index) ?? t.title;
  if (name) bits.push(`"${name}"`);
  return bits.join(' ');
}

export function VideoPanel({
  videoPath, config, onConfigChange, cues, timeMs, durationMs, tracks,
  trackNameOverrides, metadata, anaglyphPreview, onAnaglyphChange, onSeek, onDurationDetected,
}: Props) {
  const playingRef = useRef(false);
  // Last time-pos value mpv reported. Used to break the seek echo loop.
  const incomingTimeMsRef = useRef<number>(-1);

  const [playing, setPlaying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [vStream, setVStream] = useState<number | null>(null);
  const [aStream, setAStream] = useState<number | null>(null);
  const [volume,  setVolume]  = useState(80);
  const [muted,   setMuted]   = useState(false);

  const videoTracks = useMemo(() => tracks.filter(t => t.type === 'video'), [tracks]);
  const audioTracks = useMemo(() => tracks.filter(t => t.type === 'audio'), [tracks]);
  const defaultV    = useMemo(() => defaultTrackIndex(tracks, 'video'), [tracks]);
  const defaultA    = useMemo(() => defaultTrackIndex(tracks, 'audio'), [tracks]);

  useEffect(() => { setVStream(defaultV); setAStream(defaultA); }, [videoPath, defaultV, defaultA]);

  // ── Open / close mpv when video changes ─────────────────────────────────
  useEffect(() => {
    if (!videoPath) { window.api.mpv.close().catch(() => { /**/ }); return; }
    let cancelled = false;
    setOpening(true);
    setError(null);
    window.api.mpv.open({
      videoPath, tracks,
      vstream: vStream, astream: aStream,
      config, cues, anaglyph: anaglyphPreview,
    }).then(() => {
      if (!cancelled) setOpening(false);
    }).catch(e => {
      if (cancelled) return;
      console.error('[VideoPanel] mpv:open failed', e);
      setError(String(e));
      setOpening(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoPath]);

  // ── Subscribe to mpv events ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.api.mpv.onEvent(({ name, data }) => {
      if (name === 'time-pos' && typeof data === 'number') {
        const ms = Math.round(data * 1000);
        incomingTimeMsRef.current = ms;
        onSeek(ms);
      } else if (name === 'pause' && typeof data === 'boolean') {
        setPlaying(!data);
        playingRef.current = !data;
      } else if (name === 'duration' && typeof data === 'number' && data > 0) {
        onDurationDetected?.(Math.round(data * 1000));
      } else if (name === 'volume' && typeof data === 'number') {
        setVolume(Math.round(data));
      } else if (name === 'mute' && typeof data === 'boolean') {
        setMuted(data);
      }
    });
    return unsub;
  }, [onSeek, onDurationDetected]);

  // ── Push subtitle changes (debounced) ───────────────────────────────────
  useEffect(() => {
    if (!videoPath || opening) return;
    const t = setTimeout(() => {
      window.api.mpv.setSubtitles({ config, cues, anaglyph: anaglyphPreview }).catch(() => { /**/ });
    }, 150);
    return () => clearTimeout(t);
  }, [config, cues, videoPath, opening, anaglyphPreview]);

  // ── Push stereo / anaglyph changes ──────────────────────────────────────
  useEffect(() => {
    if (!videoPath || opening) return;
    window.api.mpv.setStereo({
      mode:     config.stereoscopyMode,
      eyeOrder: config.viewOrder,
      anaglyph: anaglyphPreview,
    }).catch(() => { /**/ });
  }, [config.stereoscopyMode, config.viewOrder, anaglyphPreview, videoPath, opening]);

  // ── Push stream changes ─────────────────────────────────────────────────
  useEffect(() => {
    if (!videoPath || opening) return;
    window.api.mpv.setStreams({ tracks, vstream: vStream, astream: aStream }).catch(() => { /**/ });
  }, [vStream, aStream, tracks, videoPath, opening]);

  const upd = <K extends keyof AssConfig>(key: K, value: AssConfig[K]) =>
    onConfigChange({ ...config, [key]: value });

  const userSeek = (ms: number) => {
    onSeek(ms);
    window.api.mpv.seek(ms).catch(() => { /**/ });
  };
  const step = (delta: number) =>
    userSeek(Math.max(0, Math.min(durationMs || timeMs + delta, timeMs + delta)));

  const togglePlay = () => {
    if (playingRef.current) window.api.mpv.pause().catch(() => { /**/ });
    else                    window.api.mpv.play().catch(() => { /**/ });
  };

  const seekable = durationMs > 0;
  const streamsOverridden =
    (vStream !== null && vStream !== defaultV) ||
    (aStream !== null && aStream !== defaultA);

  const volIcon = (muted || volume === 0) ? '🔇' : volume < 33 ? '🔈' : volume < 66 ? '🔉' : '🔊';

  return (
    <div className="player-remote">
      <div className="player-remote-glow" aria-hidden="true" />
      <div className="player-remote-inner">
        <div className="player-status">
          <div className="player-status-dot" data-state={!videoPath ? 'idle' : opening ? 'loading' : playing ? 'playing' : 'paused'} />
          <span className="player-status-label">
            {!videoPath ? 'no video — open a file' :
             opening    ? 'opening mpv…' :
             error      ? 'error' :
             playing    ? 'playing' : 'paused'}
          </span>
          {error && <span className="player-status-error">{error}</span>}
          {(videoTracks.length > 1 || audioTracks.length > 1) && videoPath && (
            <div className="player-streams">
              {videoTracks.length > 1 && (
                <label className="stream-pick">
                  <span>Video</span>
                  <select value={vStream ?? ''} onChange={e => setVStream(parseInt(e.target.value))}>
                    {videoTracks.map(t => (
                      <option key={t.index} value={t.index}>{trackLabel(t, trackNameOverrides)}</option>
                    ))}
                  </select>
                </label>
              )}
              {audioTracks.length > 1 && (
                <label className="stream-pick">
                  <span>Audio</span>
                  <select value={aStream ?? ''} onChange={e => setAStream(parseInt(e.target.value))}>
                    {audioTracks.map(t => (
                      <option key={t.index} value={t.index}>{trackLabel(t, trackNameOverrides)}</option>
                    ))}
                  </select>
                </label>
              )}
              {streamsOverridden && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '3px 8px', fontSize: 10 }}
                  onClick={() => { setVStream(defaultV); setAStream(defaultA); }}
                >reset</button>
              )}
            </div>
          )}
        </div>

        <div className="scrubber-bar">
          <button
            className="icon-btn primary lg"
            onClick={togglePlay}
            disabled={!videoPath || opening}
            title={playing ? 'Pause' : 'Play'}
          >{playing ? '⏸' : '▶'}</button>
          <button className="icon-btn" onClick={() => step(-10000)} disabled={!videoPath} title="−10s">⏮</button>
          <button className="icon-btn" onClick={() => step(-1000)} disabled={!videoPath} title="−1s">◀</button>
          <span className="scrubber-time">{formatTime(timeMs)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, timeMs, 1)}
            step={Math.max(1, Math.round((durationMs || 1) / 1000))}
            value={timeMs}
            disabled={!seekable}
            onChange={e => userSeek(parseInt(e.target.value))}
          />
          <span className="scrubber-time">{formatTime(durationMs)}</span>
          <button className="icon-btn" onClick={() => step(1000)} disabled={!videoPath} title="+1s">▶</button>
          <button className="icon-btn" onClick={() => step(10000)} disabled={!videoPath} title="+10s">⏭</button>

          <div className="volume-group">
            <button
              className="icon-btn"
              onClick={() => { const m = !muted; setMuted(m); window.api.mpv.setMuted(m).catch(() => { /**/ }); }}
              title={muted ? 'Unmute' : 'Mute'}
              disabled={!videoPath}
            >{volIcon}</button>
            <input
              type="range" min={0} max={100} step={1}
              value={muted ? 0 : volume}
              disabled={!videoPath}
              onChange={e => {
                const v = parseInt(e.target.value);
                setVolume(v);
                if (muted && v > 0) { setMuted(false); window.api.mpv.setMuted(false).catch(() => { /**/ }); }
                window.api.mpv.setVolume(v).catch(() => { /**/ });
              }}
            />
          </div>
        </div>

        <div className="player-deck">
          <div className="player-deck-section">
            <div className="deck-label">Video info</div>
            {videoPath && (
              <div className="video-filename">{videoPath.split(/[\\/]/).pop()}</div>
            )}
            {metadata ? (
              <dl className="info-grid">
                <dt>Resolution</dt>
                <dd>{metadata.width}×{metadata.height}</dd>
                <dt>Codec</dt>
                <dd>{metadata.codec} · {metadata.fps}fps</dd>
                <dt>DAR</dt>
                <dd>{metadata.dar}</dd>
                <dt>Detected</dt>
                <dd>{metadata.detectedSbsType}{metadata.stereoMode ? ` · ${metadata.stereoMode}` : ''}</dd>
              </dl>
            ) : (
              <div className="info-empty">Open a video to view metadata</div>
            )}
          </div>

          <div className="player-deck-section">
            <div className="deck-label">3D · Stereo</div>
            <div className="row">
              <div className="field">
                <label>Mode</label>
                <select
                  value={config.stereoscopyMode}
                  onChange={e => upd('stereoscopyMode', e.target.value as AssConfig['stereoscopyMode'])}
                >
                  <option value="half-sbs">Half SBS</option>
                  <option value="full-sbs">Full SBS</option>
                  <option value="half-tab">Half T&B</option>
                  <option value="full-tab">Full T&B</option>
                </select>
              </div>
              <div className="field">
                <label>Eye order</label>
                <select
                  value={config.viewOrder}
                  onChange={e => upd('viewOrder', e.target.value as AssConfig['viewOrder'])}
                >
                  <option value="left-first">Left first</option>
                  <option value="right-first">Right first</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>
                Depth offset
                <span className="field-value accent">
                  {config.depthOffset > 0 ? '+' : ''}{config.depthOffset}px
                </span>
              </label>
              <input
                type="range" min={-20} max={20} step={0.5}
                value={config.depthOffset}
                onChange={e => upd('depthOffset', parseFloat(e.target.value))}
              />
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox" checked={anaglyphPreview}
                onChange={e => onAnaglyphChange(e.target.checked)}
              />
              Anaglyph preview (red / cyan)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
