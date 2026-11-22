# Game Architecture and Integration Rules

### 1. NEVER Edit `pages/g.html` When Adding or Modifying Games
- `pages/g.html` is the core launcher UI and must NEVER be edited when adding, updating, fixing, or modifying games.
- Do NOT add hardcoded game `if` checks, redirects, or custom iframe routes into `pages/g.html`.

### 2. Game Launchers (`ubg-assets`)
- All executable game HTML files live in the `ubg-assets` repository root: `ubg-assets/<Game Name>.html`.
- These HTML files are loaded at runtime through jsDelivr: `https://cdn.jsdelivr.net/gh/daniil-athyx/ubg-assets@main/<Game Name>.html`.

### 3. Game Icons (`ubg-assets/icons/`)
- All game icons live exclusively in `ubg-assets/icons/` as `.webp` files (e.g. `ubg-assets/icons/<name>.webp`).
- DO NOT mirror game icons to Athyx Network. Game icons are hosted in `ubg-assets` and loaded via CDN.
- All entries in `games.json` must strictly reference `.webp` icons (`"icons/<name>.webp"`). Old formats (`.png`, `.jpg`, `.svg`) must never be added.

### 4. Game Assets & Data Files (`athyx-game-lib`)
- All actual game files, assets, audio, engines, and data files belong exclusively in `athyx-game-lib` under `athyx-game-lib/<Game Name>/`.
- NEVER store game files, builds, or assets inside `Athyx-Network` (no `games/` folder).
- **18 MB File Size Limit**: Every single file pushed to GitHub must strictly be $\le 18\text{ MB}$ to avoid jsDelivr limits (20MB) and GitHub transfer issues. If any file exceeds 18 MB, split it into chunks $\le 18\text{ MB}$ (e.g., `.part1`, `.part2`) and reassemble into a Blob at runtime in the launcher HTML.
- Launcher HTMLs in `ubg-assets` use `<base href="https://cdn.jsdelivr.net/gh/daniil-athyx/athyx-game-lib@main/<Game Name>/">` to load their game files through jsDelivr.

### 5. Game Database (`games.json`)
- To register or edit any game, only update `assets/games.json` (and `ubg-assets/games.json`):
  ```json
  {
    "name": "Game Name",
    "path": "Game Name.html",
    "icon": "icons/game_icon.webp"
  }
  ```
- `pages/g.html` automatically reads `games.json`, renders the cards, and launches the game executable from `ubg-assets` seamlessly.
