import type React from 'react';
import type { TrackInfo } from '../../types.js';

export interface MuxOptions {
  language: string;

  include3D: boolean;
  trackName3D: string;
  trackName3DTouched: boolean;
  isDefault3D: boolean;
  isForced3D: boolean;

  fileTitle: string;
  
  include2D: boolean;
  trackName2D: string;
  trackName2DTouched: boolean;
  isDefault2D: boolean;
  isForced2D: boolean;

  selectedVideo: Set<number>;
  selectedAudio: Set<number>;
  selectedSubs: Set<number>;
  trackNameOverrides: Map<number, string>;  // source-track index → custom name
}

interface Props {
  tracks: TrackInfo[];
  options: MuxOptions;
  onChange: (next: MuxOptions) => void;
}

const LANG_CODES = [
  { code: 'und', label: 'Undetermined' },
  { code: 'eng', label: 'English' },
  { code: 'heb', label: 'Hebrew' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'zho', label: 'Chinese' },
  { code: 'ara', label: 'Arabic' },
  { code: 'kor', label: 'Korean' },
  { code: 'nld', label: 'Dutch' },
  { code: 'pol', label: 'Polish' },
  { code: 'swe', label: 'Swedish' },
];

const LANG_LABEL = new Map(LANG_CODES.map(l => [l.code, l.label]));

function defaultNameForLang(code: string, is3D: boolean): string {
  if (code === 'und') return is3D ? 'Subtitle 3D' : 'Subtitle';
  const name = LANG_LABEL.get(code) ?? code;
  return is3D ? `${name} 3D` : name;
}

function trackInfoLine(t: TrackInfo): string {
  const parts: string[] = [t.codec];
  if (t.type === 'video' && t.width && t.height) parts.push(`${t.width}×${t.height}`);
  if (t.type === 'audio' && t.channels)         parts.push(`${t.channels}ch`);
  return parts.join(' · ');
}

// Inline SVG icons — small, neutral, sit nicely at 14px.
function TrackIcon({ type }: { type: TrackInfo['type'] | 'new' }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
                   stroke: 'currentColor', strokeWidth: 1.6,
                   strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (type === 'video') return (
    <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></svg>
  );
  if (type === 'audio') return (
    <svg {...common}><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></svg>
  );
  if (type === 'subtitle') return (
    <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="7" y1="12" x2="13" y2="12" /><line x1="7" y1="16" x2="17" y2="16" /></svg>
  );
  // 'new' — subtitle with a plus
  return (
    <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="7" y1="12" x2="11" y2="12" /><line x1="7" y1="16" x2="13" y2="16" /><line x1="17" y1="9" x2="17" y2="13" /><line x1="15" y1="11" x2="19" y2="11" /></svg>
  );
}

function TypeBadge({ type }: { type: TrackInfo['type'] | 'new' }) {
  const tag = type === 'video' ? 'VID' : type === 'audio' ? 'AUD' : type === 'subtitle' ? 'SUB' : 'NEW';
  return <span className={`mux-badge mux-badge--${type}`}>{tag}</span>;
}

export function MuxPanel({ tracks, options, onChange }: Props) {
  const upd = <K extends keyof MuxOptions>(key: K, value: MuxOptions[K]) =>
    onChange({ ...options, [key]: value });

  const toggleSet = (set: Set<number>, idx: number, checked: boolean): Set<number> => {
    const s = new Set(set);
    if (checked) s.add(idx); else s.delete(idx);
    return s;
  };

  const onLanguageChange = (code: string) => {
    onChange({
      ...options,
      language: code,
      trackName3D: options.trackName3DTouched ? options.trackName3D : defaultNameForLang(code, true),
      trackName2D: options.trackName2DTouched ? options.trackName2D : defaultNameForLang(code, false),
    });
  };

  const onTrackNameChange = (name: string, is3D: boolean) => {
    if (name.trim() === '') {
      if (is3D) {
        onChange({ ...options, trackName3D: defaultNameForLang(options.language, true), trackName3DTouched: false });
      } else {
        onChange({ ...options, trackName2D: defaultNameForLang(options.language, false), trackName2DTouched: false });
      }
    } else {
      if (is3D) {
        onChange({ ...options, trackName3D: name, trackName3DTouched: true });
      } else {
        onChange({ ...options, trackName2D: name, trackName2DTouched: true });
      }
    }
  };

  const toggleFlag = (flag: 'default' | 'forced', is3D: boolean) => {
    const next = { ...options };
    if (flag === 'default') {
      const v = is3D ? !options.isDefault3D : !options.isDefault2D;
      if (is3D) {
        next.isDefault3D = v;
        if (v) next.isDefault2D = false;
      } else {
        next.isDefault2D = v;
        if (v) next.isDefault3D = false;
      }
    } else {
      const v = is3D ? !options.isForced3D : !options.isForced2D;
      if (is3D) {
        next.isForced3D = v;
        if (v) next.isForced2D = false;
      } else {
        next.isForced2D = v;
        if (v) next.isForced3D = false;
      }
    }
    onChange(next);
  };

  const setOverride = (idx: number, name: string) => {
    const m = new Map(options.trackNameOverrides);
    if (name.trim() === '' || name === (tracks.find(t => t.index === idx)?.title ?? '')) {
      m.delete(idx);
    } else {
      m.set(idx, name);
    }
    upd('trackNameOverrides', m);
  };

  const videoTracks = tracks.filter(t => t.type === 'video');
  const audioTracks = tracks.filter(t => t.type === 'audio');
  const subTracks   = tracks.filter(t => t.type === 'subtitle');

  const renderRow = (t: TrackInfo, locked: boolean) => {
    const checked = locked ? true
      : t.type === 'video'    ? options.selectedVideo.has(t.index)
      : t.type === 'audio'    ? options.selectedAudio.has(t.index)
      : t.type === 'subtitle' ? options.selectedSubs.has(t.index)
      : true;
    const onCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (locked) return;
      if (t.type === 'video') upd('selectedVideo', toggleSet(options.selectedVideo, t.index, e.target.checked));
      if (t.type === 'audio') upd('selectedAudio', toggleSet(options.selectedAudio, t.index, e.target.checked));
      if (t.type === 'subtitle') upd('selectedSubs',  toggleSet(options.selectedSubs,  t.index, e.target.checked));
    };
    const overrideName = options.trackNameOverrides.get(t.index);
    return (
      <div key={t.index} className={`tracks-row ${!checked ? 'tracks-row--off' : ''}`}>
        <input
          type="checkbox" checked={checked} disabled={locked} onChange={onCheck}
          title={locked ? 'Always included' : 'Include this track'}
        />
        <span className="tracks-icon"><TrackIcon type={t.type} /></span>
        <TypeBadge type={t.type} />
        <span className={`tracks-lang ${!t.language ? 'tracks-lang--empty' : ''}`}>
          {t.language || '—'}
        </span>
        <span className="tracks-info" title={trackInfoLine(t)}>{trackInfoLine(t)}</span>
        <input
          type="text"
          className="tracks-name-input"
          value={overrideName ?? t.title ?? ''}
          placeholder={t.title || '(no name)'}
          onChange={e => setOverride(t.index, e.target.value)}
          title="Edit the track name embedded in the output MKV"
        />
      </div>
    );
  };

  return (
    <>
      {/* Tracks to include — wide card */}
      <div className="card mux-tracks-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Tracks to include in</span>
          <input
            type="text"
            className="tracks-name-input"
            style={{ flex: 1, minWidth: 0, fontWeight: 'normal', fontSize: '13px' }}
            value={options.fileTitle}
            onChange={e => upd('fileTitle', e.target.value)}
            placeholder="File title (optional)"
          />
        </div>
        {tracks.length > 0 ? (
          <div className="tracks-table">
            {videoTracks.map(t => renderRow(t, false))}
            {audioTracks.map(t => renderRow(t, false))}
            {subTracks.map(t => renderRow(t, false))}
            {/* New 3D ASS subtitle row */}
            <div className={`tracks-row tracks-row--new ${!options.include3D ? 'tracks-row--off' : ''}`}>
              <input type="checkbox" checked={options.include3D} onChange={e => upd('include3D', e.target.checked)} />
              <span className="tracks-icon"><TrackIcon type="new" /></span>
              <TypeBadge type="new" />
              <span className="tracks-lang">{options.language}</span>
              <span className="tracks-info">3D ASS subtitle (generated)</span>
              <span className="tracks-name-readonly">{options.trackName3D || defaultNameForLang(options.language, true)}</span>
            </div>
            {/* New 2D ASS subtitle row */}
            <div className={`tracks-row tracks-row--new ${!options.include2D ? 'tracks-row--off' : ''}`}>
              <input type="checkbox" checked={options.include2D} onChange={e => upd('include2D', e.target.checked)} />
              <span className="tracks-icon"><TrackIcon type="new" /></span>
              <TypeBadge type="new" />
              <span className="tracks-lang">{options.language}</span>
              <span className="tracks-info">2D ASS subtitle (generated)</span>
              <span className="tracks-name-readonly">{options.trackName2D || defaultNameForLang(options.language, false)}</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>
            Open a video to list its tracks.
          </div>
        )}
      </div>

      {/* New subtitles metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
      <div className="card">
        <div className="card-title">New subtitles</div>
        <div className="row">
          <div className="field" style={{ flex: 'none', width: '150px' }}>
            <label>Language</label>
            <select value={options.language} onChange={e => onLanguageChange(e.target.value)}>
              {LANG_CODES.map(l => (
                <option key={l.code} value={l.code}>{l.code} — {l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: '12px', alignItems: 'flex-end', opacity: options.include3D ? 1 : 0.4, transition: 'opacity 0.2s' }}>
          <div className="field">
            <label style={{ whiteSpace: 'nowrap' }}>
              <span>3D Track name{' '}
              {!options.trackName3DTouched && (
                <span className="field-hint">auto from language</span>
              )}</span>
            </label>
            <input type="text" value={options.trackName3D} onChange={e => onTrackNameChange(e.target.value, true)} />
          </div>
          <div className="segmented" style={{ marginBottom: '2px' }}>
            <button
              className={options.isDefault3D ? 'active' : ''}
              onClick={() => toggleFlag('default', true)}
            >Default</button>
            <button
              className={options.isForced3D ? 'active' : ''}
              onClick={() => toggleFlag('forced', true)}
            >Forced</button>
          </div>
        </div>

        <div className="row" style={{ marginTop: '12px', alignItems: 'flex-end', opacity: options.include2D ? 1 : 0.4, transition: 'opacity 0.2s' }}>
          <div className="field">
            <label style={{ whiteSpace: 'nowrap' }}>
              <span>Track name{' '}
              {!options.trackName2DTouched && (
                <span className="field-hint">auto from language</span>
              )}</span>
            </label>
            <input type="text" value={options.trackName2D} onChange={e => onTrackNameChange(e.target.value, false)} />
          </div>
          <div className="segmented" style={{ marginBottom: '2px' }}>
            <button
              className={options.isDefault2D ? 'active' : ''}
              onClick={() => toggleFlag('default', false)}
            >Default</button>
            <button
              className={options.isForced2D ? 'active' : ''}
              onClick={() => toggleFlag('forced', false)}
            >Forced</button>
          </div>
        </div>
      </div>
      </div>{/* end config-cards-grid */}

    </>
  );
}
