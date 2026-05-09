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

  ipcMain.handle('ass:export', async (_e, outputPath: string, config: AssConfig, cues: SrtCue[], is2D?: boolean) => {
    if (is2D) {
      await exportAss(outputPath, config, cues, false, 'left', true);
    } else {
      await exportAss(outputPath, config, cues);
    }
  });

  ipcMain.handle('mkv:mux', async (_e, req: MuxRequest) => {
    return muxToMkv({ ...req, mkvmergeBin: getBinPath('mkvmerge') });
  });

  // One-shot Export MKV: write a temp ASS, mux it in alongside the selected
  // source tracks, then delete the temp ASS regardless of outcome. Streams
  // mkvmerge progress back to the renderer via 'mkv:export-progress' events.
  ipcMain.handle('mkv:export', async (e, req: ExportMkvRequest) => {
    const tempAss3D = req.include3D ? join(tmpdir(), `srt3d-export-${process.pid}-${Date.now()}-3d.ass`) : null;
    const tempAss2D = req.include2D ? join(tmpdir(), `srt3d-export-${process.pid}-${Date.now()}-2d.ass`) : null;

    try {
      const newSubtitleTracks = [];
      if (tempAss3D) {
        await exportAss(tempAss3D, req.config, req.cues);
        newSubtitleTracks.push({
          path: tempAss3D,
          name: req.trackName3D,
          isDefault: req.isDefault3D,
          isForced: req.isForced3D,
        });
      }
      if (tempAss2D) {
        await exportAss(tempAss2D, req.config, req.cues, false, 'left', true);
        newSubtitleTracks.push({
          path: tempAss2D,
          name: req.trackName2D,
          isDefault: req.isDefault2D,
          isForced: req.isForced2D,
        });
      }

      return await muxToMkv({
        videoPath:           req.videoPath,
        outputPath:          req.outputPath,
        fileTitle:           req.fileTitle,
        language:            req.language,
        newSubtitleTracks,
        includeTracks:       req.includeTracks,
        trackNameOverrides:  req.trackNameOverrides,
        mkvmergeBin:         getBinPath('mkvmerge'),
        onProgress: (percent) => {
          if (!e.sender.isDestroyed()) e.sender.send('mkv:export-progress', percent);
        },
      });
    } finally {
      if (tempAss3D) try { unlinkSync(tempAss3D); } catch {}
      if (tempAss2D) try { unlinkSync(tempAss2D); } catch {}
    }
  });
}
