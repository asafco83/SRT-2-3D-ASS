/// <reference path="../env.d.ts" />
import { useState, useEffect, useCallback } from 'react';
import appIcon from '../../../resources/icon.png';

export function AboutDialog() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ productName: string; version: string } | null>(null);

  useEffect(() => {
    const unsub = window.api.onShowAbout(() => {
      setOpen(true);
    });
    return unsub;
  }, []);

  // Fetch app info once when first opened
  useEffect(() => {
    if (open && !info) {
      window.api.getAppInfo().then(setInfo).catch(() => {
        setInfo({ productName: 'SRT 2 3D ASS', version: '?.?.?' });
      });
    }
  }, [open, info]);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  if (!open) return null;

  const displayName = info ? `${info.productName} v${info.version}` : 'Loading…';

  return (
    <div className="about-overlay" onClick={close}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="about-close" onClick={close} aria-label="Close">✕</button>

        <img src={appIcon} className="about-logo" alt="App Logo" />

        <h2 className="about-name">{displayName}</h2>

        <div className="about-links">
          <p>
            For more info and instructions visit:{' '}
            <a
              href="https://github.com/asafco83/SRT-2-3D-ASS"
              target="_blank"
              rel="noopener noreferrer"
              className="about-link"
            >
              github.com/asafco83/SRT-2-3D-ASS
            </a>
          </p>
          <p>
            For latest version and other download links visit:{' '}
            <a
              href="https://github.com/asafco83/SRT-2-3D-ASS/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="about-link"
            >
              github.com/asafco83/SRT-2-3D-ASS/releases/latest
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
