# Connect

[**Live Demo**](https://betanumeric.github.io/connect/)

Connect is a physics-based drawing puzzle game built with p5.js and Planck.js.
Draw lines to guide a blue and a yellow ball to collide while navigating platforms, curved obstacles, rigid groups, and rotors.

## Gameplay

Each level starts with two player balls (A and B). The goal is to make them touch.
Draw lines on the canvas; when you release, each line becomes a physical body affected by gravity and collisions.
Use fewer lines and less time to beat records.

## Tech Stack

- [p5.js](https://p5js.org/) for rendering and input
- [Planck.js](https://github.com/shakiba/planck.js/) for 2D physics

## Run Locally

Use a local static server (recommended, so JSON files can be fetched).

```bash
python -m http.server 8000
```

Then open:

- Game: `http://localhost:8000/index.html`
- Editor: `http://localhost:8000/editor.html`

## Level Data

The runtime loads levels from:

1. `data/levels/index.json` (manifest) + per-level files in `data/levels/` (for example `level_3.json`)
2. `data/levels/levels.json` (legacy fallback)
3. `data/levels/levels-data.js` / `CONNECT_LEVEL_DATA` (fallback, including `file://` usage)

Notes:

- Level coordinates/sizes are stored as relative values (0..1 against base width/height).
- Supported object types: `circle`, `box`, `arcbox`, `shape`, `rigid_group`, `rotor`.
- Previews for unbeaten levels are generated from geometry at runtime (no default PNG files needed).
- On win, the level card preview is replaced by the saved in-game screenshot.

### ArcBox Fields

`arcbox` supports both inward and outward arcs and multiple arc sides:

- `cut`: signed depth scale in `[-0.95, 0.95]`
  - positive = inward
  - negative = outward
- `sides`: array of sides, any subset of `["top", "right", "bottom", "left"]`
- `side`: still accepted for backward compatibility (single-side legacy field)

### Legacy Script Data Refresh

If you still use `data/levels/levels.json` and want to refresh `data/levels/levels-data.js`:

```bash
node -e "const fs=require('fs');const p='data/levels/levels.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));fs.writeFileSync('data/levels/levels-data.js','window.CONNECT_LEVEL_DATA = '+JSON.stringify(d,null,2)+';\\n');"
```

## Level Editor

A standalone editor is available at `editor.html`.

### Current Features

- Exactly two mandatory player circles (A/B) are always present.
- Add/edit `box`, `arcbox`, `shape`, and `rotor` objects.
- Drag, resize, rotate directly on canvas (including resize/rotate handles).
- Grid snapping + value mode switching (pixels / ratio / percent).
- Multi-select non-player objects, combine into `rigid_group`, and ungroup.
- Attach selected objects (including rigid groups) to a selected rotor via `Add To Rotor`.
- Configure rotor motor (`enable`, `speed`, `direction`, `torque`).
- Arc Box editing:
  - signed depth (`+` inward / `-` outward)
  - per-side toggles (multiple sides can be active)
- Export:
  - JSON level file (`level_<n>.json`)
  - code snippet (`buildLevel`-style case block)
- Import JSON from both editor and runtime-style object payloads.
- One-click `Test` opens the game in editor test mode using current editor payload.

### Quick Workflow

1. Open `editor.html`.
2. Build/tune the level.
3. Set level number and click `Download JSON` (`level_<n>.json`).
4. Put that file in `data/levels/`.
5. Add the filename to `data/levels/index.json`.
6. Reload the game and test from the level menu.
