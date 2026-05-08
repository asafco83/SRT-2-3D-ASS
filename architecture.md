# SRT 2 3D ASS - System Architecture & Documentation

## Overview
**SRT 2 3D ASS** is an Electron-based desktop application (using `electron-vite` and React 19) designed to convert standard `.srt` subtitle files into Advanced SubStation Alpha (`.ass`) format specifically tailored for 3D stereoscopic video playback (Side-by-Side (SBS) and Top-and-Bottom (TAB)). 

It uses `ffprobe` to automatically detect video metadata (resolution, aspect ratio, stereoscopy mode) and track information, generates a stereoscopically accurate `.ass` script, and uses `mkvmerge` to mux the new subtitles directly into an MKV container.

## Key Features
- **SRT to ASS Conversion**: Parses SRT timecodes and converts basic HTML formatting to ASS tags.
- **3D Subtitle Formatting**: Duplicates each subtitle line for the left and right eye, offsetting them based on user-defined depth and vertical offset.
- **Stereoscopy Support**: Handles Half-SBS, Full-SBS, Half-TAB, and Full-TAB. Supports anamorphic squeezing compensation for "half" modes so the player can stretch the video without distorting the subtitles.
- **Auto-Detection**: Uses `ffprobe` to infer 3D layout and video dimensions.
- **Direct MKV Muxing**: Utilizes `mkvmerge` to bundle the original video, the new ASS subtitles, and selected audio/subtitle tracks into a new file without re-encoding the video.
- **Preview System**: Integrates `mpv` for video and subtitle previewing, including anaglyph preview generation.

## Project Structure
The application follows a standard `electron-vite` structure:
- `src/main/`: Electron main process (IPC handlers, OS interactions, binary execution).
- `src/renderer/`: React frontend.
- `src/`: Core business logic (shared across main and renderer, or used purely by main).

## Core Modules & Data Flow

### 1. Types & Configuration (`src/types.ts`)
Defines the core data structures used throughout the app.
- `VideoMetadata`: Extracted by ffprobe (resolution, fps, codec, detected SBS type, etc.).
- `SrtCue`: Represents a parsed subtitle block (index, start/end time, text lines).
- `AssConfig`: Contains all formatting options (font, colors, depth offset, margins, stereoscopy mode, timing offsets, etc.).
- `MuxRequest` & `ExportMkvRequest`: Payloads for IPC communication when muxing.

### 2. Video Analysis (`src/ffprobe.ts`)
Spawns `ffprobe` to probe the video file.
- `extractMetadata`: Extracts dimensions, format, duration, and infers if it's SBS based on aspect ratio (e.g., > 2.5 aspect ratio = Full-SBS, 1.4-2.1 = Half-SBS).
- `extractTracks`: Lists video, audio, and subtitle streams to allow users to pick which tracks to keep during muxing.

### 3. Parsing & Conversion (`src/srt-parser.ts` & `src/ass-generator.ts`)
- **`parseSrt`**: Reads raw SRT text, extracts timecodes, and converts simple HTML tags (`<b>`, `<i>`, `<u>`, `<font>`) to ASS inline tags.
- **`generateAss`**: The core layout engine.
  - Determines `PlayResX` and `PlayResY` mapped 1:1 to the video resolution.
  - Generates the `[Script Info]` and `[V4+ Styles]` headers.
  - Loops over `SrtCue`s and duplicates each into a Left Eye and Right Eye `Dialogue` line using the `\pos(x,y)` ASS tag.
  - Uses the `depthOffset` and `verticalOffset` to separate the coordinates.
  - Supports `anaglyphPreview` mode (overriding colors to Red/Cyan) for 2D previews.

### 4. File Output & Muxing (`src/exporter.ts` & `src/mkvmerge.ts`)
- **`exporter.ts`**: Handles writing the generated ASS string to disk with proper UTF-8 BOM encoding and naming conventions (`.3D.HalfSBS.ass`, etc.).
- **`mkvmerge.ts`**: Constructs CLI arguments for `mkvmerge`.
  - Supports track selection (filtering out unwanted audio/subs).
  - Can rename tracks via `--track-name`.
  - Emits progress via `#GUI#progress` parsing.

### 5. IPC Bridge (`src/main/ipc-handlers.ts`)
Exposes Node.js and binary functionality to the React frontend.
- `video:metadata` / `video:tracks`: Probes video.
- `srt:read`: Reads and parses SRT.
- `ass:export`: Just saves the ASS file.
- `mkv:mux` / `mkv:export`: Creates a temporary ASS file, runs `mkvmerge`, streams progress back, and cleans up the temp file.

### 6. Subtitle Layout for Canvas (`src/subtitle-layout.ts`)
A helper module for the renderer process.
- Calculates exact canvas positions (`leftX`, `rightX`, `y`) for drawing subtitle previews directly on an HTML5 `<canvas>` mimicking how the ASS player would render them.

## Key Workflows

### Generating standalone ASS
1. User drops Video and SRT.
2. App probes video -> sets default `AssConfig` (scaling margins/font size by video height).
3. App parses SRT -> `SrtCue[]`.
4. User clicks Export ASS.
5. IPC `ass:export` -> `exportAss()` -> writes file.

### Muxing MKV
1. User configures options, selects tracks.
2. User clicks Export MKV.
3. IPC `mkv:export` is called with video path, cues, config, and track selections.
4. Main process writes a temporary `srt3d-export-....ass` file.
5. Main process spawns `mkvmerge` combining video, selected tracks, and the temp ASS.
6. Progress events are sent to the renderer.
7. Temp file is unlinked.

## Binaries
The app relies on external binaries bundled via the `bin/` directory or system path (handled via `bin-path.ts` and `binary-runner.ts`):
- `ffprobe`: Probing video.
- `ffmpeg`: Video frame extraction/processing (referenced in `ffmpeg.ts`).
- `mkvmerge`: Muxing MKV containers.
- `mpv`: Used for robust video playback and previewing.
