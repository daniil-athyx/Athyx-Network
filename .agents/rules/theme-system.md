# Athyx Network Theme & Styling Rules

### 1. Mandatory Theme System Integration (`themes.js` & `themes.css`)
- **NEVER hardcode arbitrary colors, gradients, or separate styling palettes** across the site (e.g. do NOT use hardcoded `#6366f1`, `#a855f7`, custom purple/blue/cyan palettes unless defined through CSS variables).
- ALL styles, pages, dialogs, overlays, cards, forms, buttons, and navigation elements MUST strictly use Athyx Network's dynamic CSS custom properties defined in `themes.js` and `themes.css`.
- The site supports multiple themes (Midnight, Dracula, Rose Pine, Nord, Matrix, Gruvbox, Cyberpunk, AMOLED, Pure White, custom user color themes, etc.) powered by `js/themes.js`. Every UI element must dynamically change when the active theme changes.

### 2. Required CSS Custom Properties
Always use the following standardized design tokens:
- **Backgrounds**:
  - `var(--bg)`: Main page/window background.
  - `var(--bg-base)`: Base underlay.
  - Background grid texture: `radial-gradient(rgba(255, 255, 255, 0.08) 1.25px, transparent 1.25px)` with size `22px 22px`.
- **Surfaces & Cards**:
  - `var(--surface)`: Standard card / modal / panel background.
  - `var(--surface-hover)`: Hover surface state.
  - `var(--surface-active)`: Active/pressed surface state.
  - `var(--dock-bg)`: Translucent floating panels or dropdown background.
- **Borders**:
  - `var(--border)`: Normal border (`1px solid var(--border)`).
  - `var(--border-hover)`: Border on hover.
  - `var(--border-light)`: Subtle divider borders.
- **Typography & Text Colors**:
  - `var(--text-main)` / `var(--text)`: Primary text color.
  - `var(--text-muted)`: Secondary / subtitle text color.
  - `var(--text-dim)`: Dim / tertiary text color.
  - Font families: `"Plus Jakarta Sans", system-ui, sans-serif` for body; `"Outfit", sans-serif` for headings, brands, buttons.
- **Accents & Action Buttons**:
  - `var(--accent)`: Primary accent color (dynamically set by active theme).
  - `var(--accent-hover)`: Accent hover color.
  - `var(--accent-text)`: Text color that contrasts against `--accent` (`#000000` or `#ffffff`).
  - `var(--accent-dim)`: Low-opacity accent for backgrounds, chips, or focus rings.
  - `var(--accent-glow)`: Glow shadow color.
  - Primary buttons: `background: var(--accent); color: var(--accent-text); border: none;`
  - Primary button hover: `background: var(--accent-hover); box-shadow: 0 0 20px var(--accent-glow);`
- **Shadows & Blurs**:
  - `var(--shadow-soft)`: Soft elevation shadow.
  - `var(--shadow-glow)`: Accent glow on active/focused cards.
  - `backdrop-filter: blur(20px) saturate(180%);`
  - Border radius standard: `18px` for cards/inputs/buttons, `12px` for small chips/tabs.
