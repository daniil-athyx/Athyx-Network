# Game Architecture and Integration Rules

### 0. STRICT CDN POLICY: jsDelivr ONLY (NO raw.githubusercontent.com)
- **NEVER use `raw.githubusercontent.com` under any circumstance.**
- **NEVER use any CDN or source other than jsDelivr (`https://cdn.jsdelivr.net`).**
- jsDelivr is the **ONLY** authorized CDN for all games, launchers, icons, game data, scripts, and assets.
- Any attempt to use `raw.githubusercontent.com`, Statically, or other third-party mirrors is strictly forbidden.

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
- **Icon Sourcing Workflow (When Adding Games)**:
  - When the user asks the AI to add a game, the AI must search and source a high-quality icon for that game from Google / the web.
  - **Physical Square Verification**: The AI must physically verify that the icon is square (1:1 aspect ratio, e.g. 512x512). If it is not square, the AI must center-crop or pad it to an exact 1:1 square.
  - **Visual Match Verification**: The AI must physically inspect the image and verify that the icon accurately matches the specific game being added (accurate branding, artwork, and version—never a generic placeholder or wrong title).
  - **Conversion to WebP**: Whichever image format is found (PNG, JPG, SVG, etc.), the AI must convert/translate it to `.webp` format and save it directly into `ubg-assets/icons/<game_name>.webp`.
  - Only execute this icon sourcing workflow when the user explicitly requests to add a game.

### 4. Game Assets & Data Files (`athyx-game-lib`)
- All actual game files, assets, audio, engines, and data files belong exclusively in `athyx-game-lib` under `athyx-game-lib/<Game Name>/`.
- NEVER store game files, builds, or assets inside `Athyx-Network` (no `games/` folder).
- **18 MB File Size Limit**: Every single file pushed to GitHub must strictly be $\le 18\text{ MB}$ to avoid jsDelivr limits (20MB) and GitHub transfer issues. If any file exceeds 18 MB, split it into chunks $\le 18\text{ MB}$ (e.g., `.part1`, `.part2`) and reassemble into a Blob at runtime in the launcher HTML.
- Launcher HTMLs in `ubg-assets` use `<base href="https://cdn.jsdelivr.net/gh/daniil-athyx/athyx-game-lib@main/<Game Name>/">` to load their game files through jsDelivr.

### 5. Game Database (`ubg-assets/games.json`)
- `games.json` lives ONLY in `ubg-assets/games.json`.
- There is NO `games.json` in `Athyx-Network`. `pages/g.html` dynamically fetches `games.json` directly from `ubg-assets` via CDN.
- To register, add, or edit any game, modify ONLY `ubg-assets/games.json`:
  ```json
  {
    "name": "Game Name",
    "path": "Game Name.html",
    "icon": "icons/game_icon.webp"
  }
  ```
- `pages/g.html` automatically reads `games.json` from `ubg-assets`, renders the cards, and launches the game executable from `ubg-assets` seamlessly.

### 6. Dual-Repository & Architecture Synchronization on Game Fixes & Updates
- Whenever an AI agent adds, fixes, patches, or updates any game:
  - **Always Update Both Repositories**: You must update `ubg-assets` (launchers, `games.json`, `.webp` icons) AND `athyx-game-lib` (game directories, stitched/split asset chunks, scripts, engines) consistently.
  - **Always Update Game Architecture Rules**: Whenever game architectures, chunking logic, loader patterns, or directory paths evolve, immediately update the game architecture rule files (`.agents/rules/game-architecture.md` and global rules) so all future agent turns follow the exact current system.
  - **Never Update One in Isolation**: Never patch `ubg-assets` without ensuring `athyx-game-lib` contains the matching mirrored assets, and never modify `athyx-game-lib` without updating the corresponding launcher in `ubg-assets`.
  - **Commit, Push & Pin SHAs**: Commit and push both repos. When updating `athyx-game-lib` or `ubg-assets`, verify whether commit SHAs in `cdn-config.js` or launcher HTMLs need updating, and ensure changes are deployed to Firebase Hosting.
