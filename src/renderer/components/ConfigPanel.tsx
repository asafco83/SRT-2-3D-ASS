import type { AssConfig, SrtCue } from '../../types.js';
import { useFontList } from '../hooks/useFontList.js';
import type { SyncAnchors } from '../App.js';

interface Props {
  config: AssConfig;
  onChange: (c: AssConfig) => void;
  cues: SrtCue[];
  selectedCueIndex: number | null;
  currentTimeMs: number;
  syncAnchors: SyncAnchors;
  onLockAnchor: (which: 'early' | 'late') => void;
  onClearAnchor: (which: 'early' | 'late') => void;
  onResetAnchors: () => void;
}

function formatTimeMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function set<K extends keyof AssConfig>(
  config: AssConfig,
  onChange: (c: AssConfig) => void,
  key: K,
  value: AssConfig[K],
) {
  onChange({ ...config, [key]: value });
}

const NUMPAD_ORDER = [7, 8, 9, 4, 5, 6, 1, 2, 3];
const NUMPAD_LABEL: Record<number, string> = {
  7: '↖', 8: '↑', 9: '↗', 4: '←', 5: '·', 6: '→', 1: '↙', 2: '↓', 3: '↘',
};

interface ColorRowProps {
  label: string;
  color: string;
  onColor: (v: string) => void;
  alpha: number;
  onAlpha: (v: number) => void;
}

function ColorRow({ label, color, onColor, alpha, onAlpha }: ColorRowProps) {
  const pct = Math.round((1 - alpha) * 100);
  return (
    <div className="color-row">
      <div className="color-swatch-wrap">
        <input type="color" value={color} onChange={e => onColor(e.target.value)} />
      </div>
      <span className="color-row-label">{label}</span>
      <div className="color-row-slider">
        <div className="opacity-label">
          <span>opacity</span>
          <span className="field-value">{pct}%</span>
        </div>
        <input
          type="range" min={0} max={100} step={1}
          value={pct}
          onChange={e => onAlpha(1 - parseInt(e.target.value) / 100)}
        />
      </div>
    </div>
  );
}

// Combined color + size + opacity row used in the Effects panel.
// One single horizontal control surface for outline / shadow / box.
interface EffectRowProps {
  label: string;
  color: string;        onColor: (v: string) => void;
  size: number;         onSize:  (v: number) => void;
  sizeMin?: number;     sizeMax?: number;     sizeStep?: number;
  sizeUnit?: string;
  alpha: number;        onAlpha: (v: number) => void;
}

function EffectRow({
  label, color, onColor, size, onSize,
  sizeMin = 0, sizeMax = 6, sizeStep = 0.5, sizeUnit = 'px',
  alpha, onAlpha,
}: EffectRowProps) {
  const pct = Math.round((1 - alpha) * 100);
  return (
    <div className="effect-row">
      <div className="effect-head">
        <div className="color-swatch-wrap effect-swatch">
          <input type="color" value={color} onChange={e => onColor(e.target.value)} />
        </div>
        <span className="effect-label">{label}</span>
      </div>
      <div className="effect-controls">
        <div className="effect-control">
          <div className="effect-control-label">
            <span>Size</span>
            <span className="field-value">{size}{sizeUnit}</span>
          </div>
          <input
            type="range" min={sizeMin} max={sizeMax} step={sizeStep}
            value={size}
            onChange={e => onSize(parseFloat(e.target.value))}
          />
        </div>
        <div className="effect-control">
          <div className="effect-control-label">
            <span>Opacity</span>
            <span className="field-value">{pct}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={pct}
            onChange={e => onAlpha(1 - parseInt(e.target.value) / 100)}
          />
        </div>
      </div>
    </div>
  );
}

export function ConfigPanel({
  config, onChange, cues, selectedCueIndex, currentTimeMs,
  syncAnchors, onLockAnchor, onClearAnchor, onResetAnchors,
}: Props) {
  const upd = <K extends keyof AssConfig>(key: K, value: AssConfig[K]) =>
    set(config, onChange, key, value);
  const fonts = useFontList();
  const fontInList = fonts.some(f => f.toLowerCase() === config.fontName.toLowerCase());

  const selectedCue = selectedCueIndex !== null ? cues.find(c => c.index === selectedCueIndex) : null;
  const earlyCue = syncAnchors.early ? cues.find(c => c.index === syncAnchors.early!.cueIndex) : null;
  const lateCue  = syncAnchors.late  ? cues.find(c => c.index === syncAnchors.late!.cueIndex)  : null;
  const canLock = selectedCue !== null && selectedCue !== undefined;

  const renderAnchor = (which: 'early' | 'late', anchor: typeof syncAnchors.early, cue: typeof earlyCue) => (
    <div className="anchor-row">
      <div className="anchor-info">
        <div className="anchor-label">{which === 'early' ? 'Early sync' : 'Late sync'}</div>
        {anchor && cue ? (
          <div className="anchor-detail">
            cue #{cue.index} → <span className="anchor-time">{formatTimeMs(anchor.videoTimeMs)}</span>
          </div>
        ) : (
          <div className="anchor-detail anchor-detail--empty">not locked</div>
        )}
      </div>
      <div className="anchor-actions">
        <button
          className={`btn ${anchor ? 'btn-ghost' : 'btn-secondary'}`}
          onClick={() => onLockAnchor(which)}
          disabled={!canLock}
          title={canLock
            ? `Lock cue #${selectedCue!.index} at ${formatTimeMs(currentTimeMs)}`
            : 'Click a cue in the timeline first'}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >{anchor ? 'Re-lock' : 'Lock'}</button>
        {anchor && (
          <button
            className="icon-btn"
            onClick={() => onClearAnchor(which)}
            title="Clear this anchor"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >✕</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="config-cards-grid">
      {/* Typography (font + size + style + text color) */}
      <div className="card">
        <div className="card-title">Typography</div>
        <div className="field">
          <label>Font family</label>
          <select
            value={fontInList ? config.fontName : '__custom__'}
            onChange={e => { if (e.target.value !== '__custom__') upd('fontName', e.target.value); }}
            style={{ fontFamily: `"${config.fontName}", sans-serif` }}
          >
            {!fontInList && (
              <option value="__custom__" style={{ fontFamily: 'system-ui' }}>
                {config.fontName} (custom)
              </option>
            )}
            {fonts.map(f => (
              <option key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field" style={{ flex: '0 0 80px' }}>
            <label>Size</label>
            <input
              type="number" min={10} max={200} value={config.fontSize}
              onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) upd('fontSize', v); }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Style</label>
            <div className="segmented">
              {(['bold', 'italic', 'underline'] as const).map(k => (
                <button
                  key={k}
                  className={config[k] ? 'active' : ''}
                  onClick={() => upd(k, !config[k])}
                  title={k}
                  style={{
                    fontWeight: k === 'bold' ? 700 : 500,
                    fontStyle: k === 'italic' ? 'italic' : 'normal',
                    textDecoration: k === 'underline' ? 'underline' : 'none',
                  }}
                >
                  {k[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ColorRow
          label="Text"
          color={config.primaryColor} onColor={v => upd('primaryColor', v)}
          alpha={config.primaryAlpha} onAlpha={v => upd('primaryAlpha', v)}
        />
      </div>

      {/* Effects — outline + shadow OR opaque box, with combined color/size/opacity */}
      <div className="card">
        <div className="card-title">Effects</div>
        <div className="segmented">
          <button
            className={config.borderStyle === 1 ? 'active' : ''}
            onClick={() => upd('borderStyle', 1)}
          >Outline + Shadow</button>
          <button
            className={config.borderStyle === 3 ? 'active' : ''}
            onClick={() => onChange({
              ...config,
              borderStyle: 3,
              // Match the two colour slots so libass renders a single uniform box,
              // and clear the drop shadow (a filled box doesn't need one).
              outlineColor: config.backColor,
              outlineAlpha: config.backAlpha,
              shadow: 0,
            })}
          >Opaque Box</button>
        </div>
        {config.borderStyle === 1 ? (
          <>
            <EffectRow
              label="Outline"
              color={config.outlineColor} onColor={v => upd('outlineColor', v)}
              size={config.outline}       onSize={v => upd('outline', v)}
              alpha={config.outlineAlpha} onAlpha={v => upd('outlineAlpha', v)}
            />
            <EffectRow
              label="Shadow"
              color={config.backColor} onColor={v => upd('backColor', v)}
              size={config.shadow}     onSize={v => upd('shadow', v)}
              alpha={config.backAlpha} onAlpha={v => upd('backAlpha', v)}
            />
          </>
        ) : (
          <EffectRow
            label="Box"
            color={config.backColor}
            onColor={v => onChange({ ...config, backColor: v, outlineColor: v })}
            size={config.outline}
            onSize={v => upd('outline', v)}
            sizeMin={0} sizeMax={20} sizeStep={1} sizeUnit="px"
            alpha={config.backAlpha}
            onAlpha={v => onChange({ ...config, backAlpha: v, outlineAlpha: v })}
          />
        )}
      </div>

      {/* Position */}
      <div className="card">
        <div className="card-title">Position</div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '0 0 96px' }}>
            <label>Anchor</label>
            <div className="alignment-numpad">
              {NUMPAD_ORDER.map(n => (
                <button
                  key={n}
                  className={config.alignment === n ? 'active' : ''}
                  onClick={() => upd('alignment', n)}
                >
                  {NUMPAD_LABEL[n]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="field">
              <label>Vertical margin <span className="field-value">{config.marginV}px</span></label>
              <input type="range" min={0} max={400} step={5}
                value={config.marginV}
                onChange={e => upd('marginV', parseInt(e.target.value))}
              />
            </div>
            <div className="row">
              <div className="field">
                <label>Margin L</label>
                <input type="number" min={0} max={500} value={config.marginL}
                  onChange={e => upd('marginL', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="field">
                <label>Margin R</label>
                <input type="number" min={0} max={500} value={config.marginR}
                  onChange={e => upd('marginR', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timing */}
      <div className="card">
        <div className="card-title">Timing</div>
        <div className="field">
          <label>
            Shift
            <span className="field-value">
              {config.timingOffsetMs > 0 ? '+' : ''}{config.timingOffsetMs}ms
            </span>
          </label>
          <input type="range" min={-5000} max={5000} step={50}
            value={config.timingOffsetMs}
            onChange={e => upd('timingOffsetMs', parseInt(e.target.value))}
          />
        </div>
        <div className="speed-readout">
          <span className="speed-readout-label">Speed</span>
          <span className={`speed-readout-value ${config.timingSpeedMultiplier !== 1 ? 'active' : ''}`}>
            {config.timingSpeedMultiplier.toFixed(4)}×
          </span>
          <span className="speed-readout-hint">
            {config.timingSpeedMultiplier === 1
              ? 'no framerate adjustment'
              : 'auto-set by calibration'}
          </span>
        </div>

        {/* Two-anchor calibrator */}
        <div className="calibrator">
          <div className="calibrator-header">
            <span className="calibrator-title">Calibrate from cues</span>
            <span className="info-tip" tabIndex={0} aria-label="How calibration works">
              <span className="info-tip-icon">?</span>
              <div className="info-tip-bubble" role="tooltip">
                <strong>How sync calibration works</strong>
                <ol>
                  <li>Click a cue near the <em>start</em> of the movie in the timeline below.</li>
                  <li>Play the video; scrub to the exact moment the dialogue actually begins.</li>
                  <li>Click <em>Lock</em> next to “Early sync”.</li>
                  <li>Repeat near the end of the movie with <em>Late sync</em>.</li>
                </ol>
                The shift and speed values above will update automatically. Lock just one anchor for a pure shift, or both to also fix framerate drift (e.g. PAL ↔ NTSC).
              </div>
            </span>
          </div>

          <div className="calibrator-context">
            {selectedCue ? (
              <>Selected: <strong>cue #{selectedCue.index}</strong> ({formatTimeMs(selectedCue.startMs)}) · playhead at <strong>{formatTimeMs(currentTimeMs)}</strong></>
            ) : (
              <span className="calibrator-hint">Click a cue in the timeline below to begin</span>
            )}
          </div>

          {renderAnchor('early', syncAnchors.early, earlyCue)}
          {renderAnchor('late',  syncAnchors.late,  lateCue)}

          {(syncAnchors.early || syncAnchors.late) && (
            <button
              className="btn btn-ghost"
              onClick={onResetAnchors}
              style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 11 }}
            >Reset anchors</button>
          )}
        </div>
      </div>
      </div>{/* end config-cards-grid */}

      {/* Advanced */}
      <details className="adv">
        <summary>Advanced</summary>
        <div className="adv-body">
          <div className="row">
            <div className="field">
              <label>Scale X <span className="field-value">{config.scaleX}%</span></label>
              <input type="range" min={50} max={200} step={1}
                value={config.scaleX}
                onChange={e => upd('scaleX', parseInt(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Scale Y <span className="field-value">{config.scaleY}%</span></label>
              <input type="range" min={50} max={200} step={1}
                value={config.scaleY}
                onChange={e => upd('scaleY', parseInt(e.target.value))}
              />
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="field">
              <label><span>Char spacing <span className="field-hint">RTL not supported</span></span> <span className="field-value">{config.spacing}px</span></label>
              <input type="range" min={-5} max={10} step={0.5}
                value={config.spacing}
                onChange={e => upd('spacing', parseFloat(e.target.value))}
              />
            </div>
            <div className="field" style={{ justifyContent: 'space-between' }}>
              <label>Wrap style</label>
              <select value={config.wrapStyle} onChange={e => upd('wrapStyle', parseInt(e.target.value) as AssConfig['wrapStyle'])}>
                <option value={0}>0 — Smart</option>
                <option value={1}>1 — EOL</option>
                <option value={2}>2 — No wrap</option>
                <option value={3}>3 — Smart (lower)</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Video width</label>
              <input type="number" value={config.videoWidth}
                onChange={e => upd('videoWidth', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label>Video height</label>
              <input type="number" value={config.videoHeight}
                onChange={e => upd('videoHeight', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </details>
    </>
  );
}
