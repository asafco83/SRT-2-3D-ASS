import { useEffect, useRef } from 'react';
import type { SrtCue } from '../../types.js';
import type { SyncAnchors } from '../App.js';

interface Props {
  cues: SrtCue[];
  activeCueMs: number;
  selectedCueIndex?: number | null;
  syncAnchors?: SyncAnchors;
  onCueClick: (cue: SrtCue) => void;
}

function msToDisplay(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

export function CueTimeline({
  cues, activeCueMs, selectedCueIndex, syncAnchors, onCueClick,
}: Props) {
  const activeRef = useRef<HTMLLIElement>(null);
  const activeCue = cues.find(c => c.startMs <= activeCueMs && activeCueMs < c.endMs);
  const earlyIdx = syncAnchors?.early?.cueIndex ?? null;
  const lateIdx  = syncAnchors?.late?.cueIndex  ?? null;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCue?.index]);

  if (!cues.length) {
    return (
      <div className="cue-empty">
        No subtitle cues loaded — open an SRT file
      </div>
    );
  }

  return (
    <>
      <div className="cue-list-header">
        <span>{cues.length} cues</span>
        {activeCue && (
          <span className="cue-list-active">
            #{activeCue.index} · {msToDisplay(activeCue.startMs)} → {msToDisplay(activeCue.endMs)}
          </span>
        )}
      </div>
      <ul className="cue-list">
        {cues.map(cue => {
          const isActive   = cue === activeCue;
          const isSelected = cue.index === selectedCueIndex;
          const isEarly    = cue.index === earlyIdx;
          const isLate     = cue.index === lateIdx;
          const dur = ((cue.endMs - cue.startMs) / 1000).toFixed(1);
          const cls = [
            'cue-item',
            isActive   ? 'active'   : '',
            isSelected ? 'selected' : '',
            (isEarly || isLate) ? 'anchored' : '',
          ].filter(Boolean).join(' ');
          return (
            <li
              key={cue.index}
              ref={isActive ? activeRef : undefined}
              className={cls}
              onClick={() => onCueClick(cue)}
            >
              <span className="cue-anchor-tag">
                {isEarly && <span className="cue-anchor-pip cue-anchor-pip--early" title="Early sync anchor">●</span>}
                {isLate  && <span className="cue-anchor-pip cue-anchor-pip--late"  title="Late sync anchor">●</span>}
              </span>
              <span className="cue-time">{msToDisplay(cue.startMs)}</span>
              <span className="cue-dur">{dur}s</span>
              <span className="cue-text">{cue.lines.join(' ')}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
