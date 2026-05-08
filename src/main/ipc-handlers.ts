import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBinPath } from '../bin-path.js';
import { extractMetadata, extractTracks } from '../ffprobe.js';
import { exportAss } from '../exporter.js';
import { muxToMkv } from '../mkvmerge.js';
import { parseSrt } from '../srt-parser.js';
import type { AssConfig, SrtCue, MuxRequest, ExportMkvRequest } from '../types.js';

export function registerIpcHandlers(): void {

  ipcMain.handle('dialog:open-file', async (e, filters: Electron.FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:save-file', async (e, defaultPath: string, filters: Electron.FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath, filters })
      : await dialog.showSaveDialog({ defaultPath, filters });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('video:metadata', async (_e, videoPath: string) => {
    return extractMetadata(videoPath, getBinPath('ffprobe'));
  });

  ipcMain.handle('video:tracks', async (_e, videoPath: string) => {
    return extractTracks(videoPath, getBinPath('ffprobe'));
  });

  ipcMain.handle('srt:read', async (_e, srtPath: string) => {
    const raw = readFileSync(srtPath, 'utf8');
    return parseSrt(raw);
  });

  ipcMain.handle('ass:export', async (_e, outputPath: string, config: AssConfig, cues: SrtCue[]) => {
    await exportAss(outputPath, config, cues);
  });

  ipcMain.handle('mkv:mux', async (_e, req: MuxRequest) => {
    return muxToMkv({ ...req, mkvmergeBin: getBinPath('mkvmerge') });
  });

  // One-shot Export MKV: write a temp ASS, mux it in alongside the selected
  // source tracks, then delete the temp ASS regardless of outcome. Streams
  // mkvmerge progress back to the renderer via 'mkv:export-progress' events.
  ipcMain.handle('mkv:export', async (e, req: ExportMkvRequest) => {
    const tempAss = join(tmpdir(), `srt3d-export-${process.pid}-${Date.now()}.ass`);
    try {
      await exportAss(tempAss, req.config, req.cues);
      return await muxToMkv({
        videoPath:           req.videoPath,
        assPath:             tempAss,
        outputPath:          req.outputPath,
        language:            req.language,
        trackName:           req.trackName,
        isDefault:           req.isDefault,
        isForced:            req.isForced,
        includeTracks:       req.includeTracks,
        trackNameOverrides:  req.trackNameOverrides,
        mkvmergeBin:         getBinPath('mkvmerge'),
        onProgress: (percent) => {
          if (!e.sender.isDestroyed()) e.sender.send('mkv:export-progress', percent);
        },
      });
    } finally {
      try { unlinkSync(tempAss); } catch { /* best-effort cleanup */ }
    }
  });
}
