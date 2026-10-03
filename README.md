# Soundsite

A browser-based music composer: sketch melodies, chords and beats, then mix them. Everything runs client-side, and every sound is synthesized live with [Tone.js](https://tonejs.github.io/), so there are no samples to load.

## Features

- **Multi-track song:** add instrument tracks (Lead, Bass, Pad, Keys, Pluck, Bell) and drum tracks. Rename, recolor, reorder, mute and solo them.
- **Piano roll** for instrument tracks:
  - Click to draw a note and drag it to move. Drag the right edge to resize.
  - Right-click or double-click deletes a note.
  - Box-select with the Select tool, or Shift+drag.
  - Notes from the other tracks show faintly in the background as ghost notes.
- **Drum step sequencer** with nine synthesized voices. Click or drag to paint steps. Shift+click toggles an accent.
- **Scale and chord helpers:**
  - Pick the song's key and scale; in-key rows are tinted.
  - **Snap to scale** keeps drawn, dragged and transposed notes in key.
  - **Chord mode** stamps diatonic triads or 7ths (the right chord for each scale degree), or a fixed quality (maj, min, 7, maj7, …), with inversions. The chord name and roman numeral (e.g. `Fm · iv`) are shown in the toolbar.
- **Mixer and effects:**
  - Per-track volume, pan, mute/solo, and reverb and delay sends.
  - A shared reverb (decay and level) and a tempo-synced delay (time and feedback).
  - A master bus with a compressor and limiter.
- **Transport:** play/stop, tempo (40–240 BPM), swing, song length (1–16 bars, looped), and live editing while the song plays.
- **Undo/redo** for every edit. A whole drag counts as one step.
- **Save and load:**
  - **Autosave:** your song is saved in the browser as you work and restored when you come back.
  - **Song files:** **Save** (Ctrl+S) downloads the song as a `.soundsite.json` file, named after the song. **Open** (Ctrl+O), or dropping a file anywhere on the page, loads one back.
  - **New:** start a blank song (keys + drums) or reopen the demo.
  - Opening a file or starting a new song can be undone (Ctrl+Z, or **Undo** in the notification), so nothing is lost by accident.
  - Files are checked when opened: values out of range are repaired, unknown instruments fall back to a default, and files from a newer version are refused with a clear message.

> Autosave uses this browser's local storage, so it doesn't follow you to another browser or device. Use **Save** to keep a copy or share a song. WAV/MIDI export is not built yet.

## Getting started

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Then open the URL Vite prints. Browsers only allow audio after a user gesture, so press **Play** (or click a note) once to enable sound.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` (a static site you can host anywhere) |
| `npm run preview` | Serve the production build |
| `npm test` | Run the unit tests (Vitest) |
| `npm run lint` | Lint with oxlint |

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Space | Play / stop |
| D / S | Draw / select tool |
| Ctrl+S / Ctrl+O | Save the song to a file / open a song file |
| Ctrl+Z, Ctrl+Shift+Z (or Ctrl+Y) | Undo, redo |
| Ctrl+A | Select all notes in the track |
| Ctrl+D | Duplicate the selection right after itself |
| Delete / Backspace | Delete the selected notes |
| ↑ / ↓ | Transpose a semitone, or a scale step when snap-to-scale is on. Hold Shift for an octave. |
| ← / → | Nudge by the snap value |
| Esc | Clear the selection |

## How it's built

React 19 + TypeScript + Vite, with Zustand and Immer for state and Tone.js for audio.

```
src/
  model/       Pure data and music theory: song types, scales, chords, presets, demo song,
               serialize.ts (song file format and validation)
  state/       Zustand stores
               songStore: the song, every edit action, undo/redo with transactions
               uiStore: tool, snap, selection, chord mode, zoom
               playheadStore: the high-frequency playback position
               persistence: autosave to localStorage
               songFiles: save/open song files, new song
  audio/       engine.ts      mirrors the song store into Tone.js nodes (tracks, sends, master)
               scheduler.ts   16th-note transport loop that reads the song live
               instruments.ts synth presets
               drums.ts       synthesized drum kit
  components/  TransportBar, TrackList, EditorToolbar, PianoRoll/, StepSequencer/, Mixer/, common/
  hooks/       Keyboard shortcuts, playhead following
```

Two design choices hold this together:

- **The song store is the single source of truth.** The UI only dispatches store actions. The audio engine subscribes to the store and reconciles its Tone.js nodes, creating and disposing synths and ramping mixer parameters. Immer's structural sharing lets it skip anything that didn't change.
- **The scheduler reads state live.** It doesn't pre-schedule notes. A single `Transport.scheduleRepeat` callback runs every 16th note and triggers whatever starts on that step, so edits made during playback are heard on the next pass.
