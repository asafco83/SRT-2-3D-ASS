import { contextBridge, ipcRenderer } from 'electron';
import type {
  AssConfig, SrtCue, VideoMetadata, TrackInfo,
  MuxRequest, ExportMkvRequest, StereoscopyMode, ViewOrder,
} from '../types.js';

const api = {
  openFile: (filters: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open-file', filters),

  saveFile: (defaultPath: string, filters: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-file', defaultPath, filters),

  getVideoMetadata: (videoPath: string): Promise<VideoMetadata> =>
    ipcRenderer.invoke('video:metadata', videoPath),

  getVideoTracks: (videoPath: string): Promise<TrackInfo[]> =>
    ipcRenderer.invoke('video:tracks', videoPath),

  readSrt: (srtPath: string): Promise<SrtCue[]> =>
    ipcRenderer.invoke('srt:read', srtPath),

  exportAss: (outputPath: string, config: AssConfig, cues: SrtCue[], is2D?: boolean): Promise<void> =>
    ipcRenderer.invoke('ass:export', outputPath, config, cues, is2D),

  muxToMkv: (req: MuxRequest): Promise<string> =>
    ipcRenderer.invoke('mkv:mux', req),

  exportToMkv: (req: ExportMkvRequest): Promise<string> =>
    ipcRenderer.invoke('mkv:export', req),

  // Subscribe to mkvmerge progress percentage (0–100). Returns an unsubscribe
  // function; remember to call it when the export completes/cancels.
  onMkvExportProgress: (cb: (percent: number) => void): (() => void) => {
    const listener = (_e: unknown, percent: number) => cb(percent);
    ipcRenderer.on('mkv:export-progress', listener);
    return () => ipcRenderer.removeListener('mkv:export-progress', listener);
  },

  // ── Embedded mpv player ──────────────────────────────────────────────────
  // The renderer drives an mpv process running in a child OS window placed
  // over a placeholder div. All control is via IPC; mpv renders directly to
  // the screen, bypassing the DOM.
  mpv: {
    open: (payload: {
      videoPath: string;
      tracks: TrackInfo[];
      vstream: number | null;
      astream: number | null;
      config: AssConfig;
      cues: SrtCue[];
      anaglyph: boolean;
    }): Promise<void> => ipcRenderer.invoke('mpv:open', payload),

    close:       (): Promise<void> => ipcRenderer.invoke('mpv:close'),
    play:        (): Promise<void> => ipcRenderer.invoke('mpv:play'),
    pause:       (): Promise<void> => ipcRenderer.invoke('mpv:pause'),
    seek:        (ms: number): Promise<void> => ipcRenderer.invoke('mpv:seek', ms),
    setVolume:   (v: number):  Promise<void> => ipcRenderer.invoke('mpv:set-volume', v),
    setMuted:    (m: boolean): Promise<void> => ipcRenderer.invoke('mpv:set-muted', m),
    setSubtitles:(p: { config: AssConfig; cues: SrtCue[]; anaglyph: boolean }): Promise<void> =>
                   ipcRenderer.invoke('mpv:set-subtitles', p),
    setStereo:   (p: { mode: StereoscopyMode; eyeOrder: ViewOrder; anaglyph: boolean }): Promise<void> =>
                   ipcRenderer.invoke('mpv:set-stereo', p),
    setStreams:  (p: { tracks: TrackInfo[]; vstream: number | null; astream: number | null }): Promise<void> =>
                   ipcRenderer.invoke('mpv:set-streams', p),
    onEvent:     (cb: (evt: { name: string; data: unknown }) => void): (() => void) => {
      const listener = (_e: unknown, evt: { name: string; data: unknown }) => cb(evt);
      ipcRenderer.on('mpv:event', listener);
      return () => ipcRenderer.removeListener('mpv:event', listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
