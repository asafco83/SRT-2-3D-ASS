# SRT 2 3D ASS - System Architecture & Documentation

## Overview
**SRT 2 3D ASS** is an Electron-based desktop application (using `electron-vite` and React 19) designed to convert standard `.srt` subtitle files into Advanced SubStation Alpha (`.ass`) format specifically tailored for 3D stereoscopic video playback (Side-by-Side (SBS) and Top-and-Bottom (TAB)).

It uses `ffprobe` to automatically detect video metadata (resolution, aspect ratio, stereoscopy mode) and track information, generates a stereoscopically accurate `.ass` script, and uses `mkvmerge` to mux the new subtitles directly into an MKV container.

While the app is built around 3D, it also supports a flat **Non-3D** mode that re-uses the same SRT loader, timing calibrator, styling, and ASS export to produce a single full-frame subtitle track for ordinary 2D videos.

## Key Features
- **SRT to ASS Conversion**: Parses SRT timecodes and converts basic HTML formatting to ASS tags.
- **3D Subtitle Formatting**: Duplicates each subtitle line for the left and right eye, offsetting them based on user-defined depth and vertical offset.
- **Stereoscopy Support**: Handles Half-SBS, Full-SBS, Half-TAB, and Full-TAB. Supports anamorphic squeezing compensation for "half" modes so the player can stretch the video without distorting the subtitles.
- **Non-3D Mode**: A `'none'` value on `stereoscopyMode` short-circuits the layout engine to a single full-frame dialogue per cue (no eye duplication, no scale halving, no depth offset). The player skips the stereo crop/scale lavfi segment, the export header collapses to a single ASS button, and the MKV mux only adds one full-frame subtitle track.
- **Auto-Detection**: Uses `ffprobe` to infer 3D layout and video dimensions. When stereoscopy is undetected the inferred mode is left untouched, so the user-selected mode (including Non-3D) sticks across video opens.
- **Direct MKV Muxing**: Utilizes `mkvmerge` to bundle the original video, the new ASS subtitles, and selected audio/subtitle tracks into a new file without re-encoding the video.
- **Preview System**: Integrates `mpv` for video and subtitle previewing, including anaglyph preview generation. Sidecar subtitles (`--sub-auto=no`) and embedded subtitle tracks (`--sid=no`) are disabled — only the SRT the user loaded is rendered through the lavfi `subtitles=` filter.
- **Timing Calibration**: One- or two-anchor calibrator — locking a cue against the current video time computes either a pure offset or a (clamped) speed+offset fit.

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
- `StereoscopyMode`: `'half-sbs' | 'full-sbs' | 'half-tab' | 'full-tab' | 'none'`. The `'none'` value is the Non-3D mode and is treated as a first-class branch by the generator, the mpv pipeline, the header export button, and the mux IPC.
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
  - For 3D modes: loops over `SrtCue`s and duplicates each into a Left Eye and Right Eye `Dialogue` line using the `\pos(x,y)` ASS tag, separating the coordinates with `depthOffset` and `verticalOffset`. Pre-squeezes the font scale (`\fscx`/`\fscy`) for `half-sbs`/`half-tab` so the player's stretch doesn't distort glyphs.
  - For Non-3D mode (`stereoscopyMode === 'none'`): emits a single full-frame `Dialogue` per cue using the style's normal alignment and `MarginV` — no eye duplication, no scale halving, no depth/vertical offset, and the `singleEye` / `eyeFilter` arguments are ignored.
  - Supports `anaglyphPreview` mode (overriding colors to Red/Cyan) for 2D previews. Anaglyph is forced off in Non-3D mode by the player.

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
- `ass:export`: Saves the ASS file. With `is2D=true` the export uses the single-eye half-frame layout for 3D videos; in Non-3D mode the generator's `'none'` short-circuit produces a full-frame ASS regardless of `is2D`.
- `mkv:mux` / `mkv:export`: Creates the temp ASS file(s), runs `mkvmerge`, streams progress back, and cleans up. When `config.stereoscopyMode === 'none'`, the 3D temp ASS is skipped unconditionally (defense in depth — the renderer also forces `include3D=false`) and the 2D temp ASS is generated full-frame (`singleEye=false`).

### 5b. Player Pipeline (`src/main/mpv-standalone.ts` & `src/main/mpv.ts`)
- Drives a standalone `mpv` window via `--input-ipc-server` and `--lavfi-complex`.
- The lavfi graph is `[vid1]<stereo segment>,subtitles=filename='<temp.ass>'[vo]`. The stereo segment crops to one eye and rescales to full size for 3D modes; for Non-3D it falls through to `setsar=1` (no crop, no scale) so the user sees the untouched frame.
- Each subtitle update writes a freshly-named temp ASS — embedding a new path in the graph string is what forces mpv to reload the `subtitles` filter (which otherwise caches the file).
- mpv is launched with `--no-config`, `--sub-auto=no`, and `--sid=no` to ensure only the user-loaded SRT (rendered through the lavfi graph) is shown — sidecar files and embedded subtitle tracks are ignored.

### 6. Subtitle Layout for Canvas (`src/subtitle-layout.ts`)
A helper module for the renderer process.
- Calculates exact canvas positions (`leftX`, `rightX`, `y`) for drawing subtitle previews directly on an HTML5 `<canvas>` mimicking how the ASS player would render them.

## Key Workflows

### Generating standalone ASS
1. User drops Video and SRT.
2. App probes video -> sets default `AssConfig` (scaling margins/font size by video height). Inferred `stereoscopyMode` is only overridden when ffprobe detects an SBS/T&B layout — undetected videos keep the user's mode (including Non-3D).
3. App parses SRT -> `SrtCue[]`.
4. User clicks Export ASS.
   - In 3D modes the header shows a dropdown with `3D ASS` (full stereoscopic layout) and `ASS` (single-eye half-frame).
   - In Non-3D mode the header shows a single button that exports the full-frame ASS.
5. IPC `ass:export` -> `exportAss()` -> writes file.

### Muxing MKV
1. User configures options, selects tracks. The MUX panel hides the 3D-subtitle row and 3D track-name section when `stereoscopyMode === 'none'`.
2. User clicks Export MKV.
3. IPC `mkv:export` is called with video path, cues, config, and track selections.
4. Main process writes the temp ASS file(s):
   - 3D modes: a 3D temp ASS (full stereoscopic layout) and/or a 2D single-eye temp ASS, per `include3D`/`include2D`.
   - Non-3D mode: only a single full-frame temp ASS — `include3D` is ignored at the IPC layer for safety.
5. Main process spawns `mkvmerge` combining video, selected source tracks, and the new ASS subtitle track(s).
6. Progress events are sent to the renderer.
7. Temp file(s) are unlinked.

## Binaries
The app relies on external binaries bundled via the `bin/` directory or system path (handled via `bin-path.ts` and `binary-runner.ts`):
- `ffprobe`: Probing video.
- `ffmpeg`: Video frame extraction/processing (referenced in `ffmpeg.ts`).
- `mkvmerge`: Muxing MKV containers.
- `mpv`: Used for robust video playback and previewing.
