import { app, BrowserWindow, session, ipcMain } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { registerIpcHandlers } from './ipc-handlers.js';
import { StandaloneMpv } from './mpv-standalone.js';
import type { AssConfig, SrtCue, TrackInfo, StereoscopyMode, ViewOrder } from '../types.js';

const PROD_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'none'",
  "connect-src 'none'",
].join('; ');

const mpv = new StandaloneMpv();

function resolveIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../../resources/icon.ico'),
    join(process.resourcesPath ?? '', 'icon.ico'),
  ];
  return candidates.find(p => existsSync(p));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 800,
    minWidth: 600,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    icon: resolveIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Linked window visibility: when the editor window is activated, raise the
  // mpv player so both come to the front together. mpv's focus → editor is
  // handled in StandaloneMpv via the `focused` property observer.
  win.on('focus', () => { mpv.raiseWindow().catch(() => { /**/ }); });

  win.on('closed', () => { mpv.close().catch(() => { /**/ }); });

  return win;
}

function registerMpvIpc(): void {
  ipcMain.handle('mpv:open', async (e, payload: {
    videoPath: string;
    tracks: TrackInfo[];
    vstream: number | null;
    astream: number | null;
    config: AssConfig;
    cues: SrtCue[];
    anaglyph: boolean;
  }) => {
    await mpv.open(e.sender, payload);
  });

  ipcMain.handle('mpv:close',         () => mpv.close());
  ipcMain.handle('mpv:play',          () => mpv.play());
  ipcMain.handle('mpv:pause',         () => mpv.pause());
  ipcMain.handle('mpv:seek',          (_e, ms: number) => mpv.seek(ms));
  ipcMain.handle('mpv:set-volume',    (_e, v: number)  => mpv.setVolume(v));
  ipcMain.handle('mpv:set-muted',     (_e, m: boolean) => mpv.setMuted(m));
  ipcMain.handle('mpv:set-subtitles', (_e, p: { config: AssConfig; cues: SrtCue[]; anaglyph: boolean }) => {
    return mpv.setSubtitles(p.config, p.cues, p.anaglyph);
  });
  ipcMain.handle('mpv:set-stereo',    (_e, p: { mode: StereoscopyMode; eyeOrder: ViewOrder; anaglyph: boolean }) => {
    return mpv.setStereo(p.mode, p.eyeOrder, p.anaglyph);
  });
  ipcMain.handle('mpv:set-streams',   (_e, p: { tracks: TrackInfo[]; vstream: number | null; astream: number | null }) => {
    return mpv.setStreams(p.tracks, p.vstream, p.astream);
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  registerMpvIpc();

  if (!process.env['ELECTRON_RENDERER_URL']) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [PROD_CSP],
        },
      });
    });
  }

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback((permission as string) === 'local-fonts');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  mpv.close().catch(() => { /**/ });
  if (process.platform !== 'darwin') app.quit();
});
