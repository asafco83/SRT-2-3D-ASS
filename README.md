# SRT 2 3D ASS


**SRT 2 3D ASS** is a professional-grade, Electron-based desktop application designed to convert standard `.srt` subtitles into stereoscopically accurate `.ass` formats for 3D video playback.

Built for simplicity and precision, it auto-detects your video's 3D format, seamlessly applies anamorphic aspect ratio correction, and allows you to instantly mux the perfect 3D subtitles directly into a brand new MKV file—without any video re-encoding!

<img width="1701" height="1030" alt="SRT23DASS" src="https://github.com/user-attachments/assets/eadd54de-8cbb-4edf-94b2-07727a3d116b" />


## ✨ Features

- **Intelligent 3D Formatting:** Automatically duplicates and shifts subtitle lines for the left and right eyes to achieve a perfect stereoscopic depth effect.
- **Smart Format Detection:** Uses robust `ffprobe` integration to detect video resolution and aspect ratios, automatically compensating for Half-SBS, Full-SBS, Half-TAB, and Full-TAB.
- **Zero-Distortion Anamorphic Text:** Dynamically maps the Advanced SubStation Alpha (`.ass`) grid to ensure your text, borders, and character spacing stay perfectly proportional when the 3D TV stretches the image.
- **Real-Time Preview:** Powered by a built-in `mpv` player, offering live Side-by-Side and Anaglyph (Red/Cyan) previews so you can tweak the depth without guessing.
- **1-Click MKV Muxing:** Instantly bundle your video, newly generated 3D subtitles, and any audio tracks of your choosing into a new MKV file using bundled `mkvmerge`.

---

## 📖 User Guide

### 1. Load Your Files
- Launch the application and load your 3D video file and `.srt` subtitle file.
- The app will automatically analyze the video and configure the correct baseline settings.

### 2. Adjust Subtitle Layout
- **Stereoscopy Mode:** Verify the detected mode (Half-SBS, Full-TAB, etc.).
- **Depth Offset:** Increase this to push the text further 'in' or 'out' of the screen.
- **Vertical Offset & Margins:** Tweak the exact vertical position of the text to keep it out of the way of the action.
- **Styling:** Customize fonts, colors, and outline thicknesses.

### 3. Preview Your Edits
- all your changes are reflected in the preview window in real time.

### 4. Export
- **Export ASS Only:** Saves the raw `.ass` file next to your video.
- **Export MKV:** Selects the specific audio and subtitle tracks you want to keep + your generated 3D subtitles, and rapidly muxes them into a final, ready-to-watch `.mkv` container.

## 📥 Download & Installation

You can download the application from the [Releases](https://github.com/asafco83/SRT-2-3D-ASS/releases/latest) page. We provide two different versions for Windows users—choose the one that best fits your needs:

- **`SRT 2 3D ASS Setup X.X.X.exe` (Installer)**
  Download this if you want to permanently install the application on your computer. It will add shortcuts to your Start Menu and Desktop, and properly integrate the app into your system.

- **`SRT 2 3D ASS X.X.X.exe` (Portable)**
  Download this if you want a standalone application. It does not require any installation or administrator privileges—you can simply double-click it to run immediately, or carry it with you on a USB thumb drive.

---

## 🛠 Developer Setup

If you wish to run the app in development mode or build it from scratch, you must first manually provide the required media executables, as they are not tracked in Git.

1. **Create the Binaries Folder:**
   In the root of the project, create the following directory structure depending on your OS:
   - Windows: `bin/win/`
   - Mac: `bin/mac/`
   - Linux: `bin/linux/`

2. **Download Required Executables:**
   Download the following standalone `.exe` files (or platform equivalents) and place them inside the folder you just created:
   - **`ffmpeg.exe` & `ffprobe.exe`**: [Download from gyan.dev](https://www.gyan.dev/ffmpeg/builds/)
   - **`mpv.exe`**: [Download from SourceForge](https://sourceforge.net/projects/mpv-player-windows/files/)
   - **`mkvmerge.exe`**: [Download from MKVToolNix](https://mkvtoolnix.download/downloads.html)

3. **Install Dependencies & Run:**
   ```bash
   npm install
   npm run dev        # To start the dev server
   npm run dist       # To compile the final .exe installer
   ```
