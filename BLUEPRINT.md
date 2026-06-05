# Kadonk — Blueprint

A reference for how this page is built, so it can be rebuilt or extended from scratch.

Kadonk is a **two-player, hot-seat dice bluffing game** — a variant of *Mia* / *Liar's Dice*. It is a single static page with no build step, no dependencies, and no framework: just `index.html`, `styles.css`, and `script.js`.

---

## 1. File structure

```
kadonk-online/
├── index.html      Semantic markup + font/stylesheet links
├── styles.css      Design system (CSS custom properties) + all styling
├── script.js       Game state machine + DOM rendering (vanilla JS)
├── BLUEPRINT.md    This document
└── README.md
```

There is **no bundler, transpiler, or package manager**. Open `index.html` in any browser and it runs. This is deliberate — the whole app is ~3 small files and benefits from zero tooling.

---

## 2. The game

### Rolls
Each shake is two dice, sorted high-low into a two-digit number (e.g. a 5 and a 3 → `53`). There are 21 distinct combinations.

### Ranking (`RANKING` in `script.js`)
From weakest to strongest:

```
31 32 41 42 43 51 52 53 54 61 62 63 64 65   ← non-pairs
11 22 33 44 55 66                            ← pairs (beat all non-pairs)
21                                           ← KADONK, beats everything
```

`21` (a two and a one) is the trump roll — the "Kadonk".

### Turn flow
1. **Shake** — the active player rolls in secret (shown only to them, hot-seat style).
2. **Announce** — they declare a roll that must rank *strictly higher* than the standing claim. They can tell the truth or bluff (announce higher than they actually rolled).
3. The opponent then either **raises** (shake + announce something higher) or **calls the bluff**.
4. **On a call:** the announcer's real roll is revealed.
   - Real roll rank ≥ claimed rank → the announcer told the truth → **the caller loses a life**.
   - Real roll rank < claimed rank → it was a bluff → **the announcer loses a life**.
5. The player who lost the life starts the next round. Last player with lives wins.

> **Note for re-builders:** the original prototype had a logic bug where a player could only ever announce ≥ their own roll, which made the challenger always lose and bluffing pointless. The fixed rule (above) compares the claim against the *previous* standing claim, which is what makes the bluff meaningful.

---

## 3. Architecture (`script.js`)

A small, explicit **state machine**. No framework, no reactivity — render functions are called manually after each state change.

### State
```js
state = {
  lives:      [3, 3],   // per player
  current:    0,        // index of whose turn it is (0 or 1)
  secretRoll: null,     // the active player's real roll — persists behind a claim
  claim:      null,     // the standing announced combo
  phase:      "idle",   // idle | respond | announce | over
}
```

### Key functions
| Function | Role |
|---|---|
| `rollDice()` | Returns a sorted two-digit combo. |
| `beginTurn()` | Sets up controls + status for the active player based on the standing claim. |
| `shake()` | Rolls in secret, reveals to the active player, opens the announce form. |
| `populateClaimOptions()` | Fills the dropdown with every combo that beats the standing claim. |
| `announce()` | Locks in the claim, hands the turn to the opponent. |
| `callBluff()` | Reveals the truth, deducts a life, ends the round (or game). |
| `renderDice()` | Draws a combo as two pip-faced dice. |
| `renderLives()` | Draws hearts and highlights the active player. |

### Performance / quality choices
- **DOM references are cached once** in the `el` object — no repeated `getElementById` during play.
- **`replaceChildren()` + element creation** instead of `innerHTML` string-building for dice/hearts (avoids re-parsing HTML and is XSS-safe).
- **No inline `onclick`** — all wiring is `addEventListener` at the bottom of the file.
- **`prompt()` / `alert()` are gone** — replaced by an in-page modal (non-blocking, styleable, accessible).
- `script.js` is loaded with **`defer`** so parsing doesn't block render.
- `"use strict"` at the top.

---

## 4. Design system (`styles.css`)

All visual tokens live in `:root` as CSS custom properties. Change them there to re-theme the whole app.

### Theme: "green felt table"
A casino dice-table feel — deep green felt background, a cream parchment card, gold trim, red hearts.

### Colour palette
| Token | Value | Use |
|---|---|---|
| `--felt-900` | `#0b3220` | Darkest background vignette |
| `--felt-800` | `#0e3b27` | Page background base / `theme-color` |
| `--felt-700` | `#134e2e` | The "table" panel, title text |
| `--felt-600` | `#1b5e3f` | Background highlight |
| `--cream-50` | `#faf7ef` | Card surface |
| `--cream-100` | `#f1ead6` | Inset panels (player, claim form) |
| `--cream-200` | `#e3d8bd` | Borders, lost hearts |
| `--ink-900` | `#1e2420` | Primary text |
| `--ink-700` | `#3c443d` | Secondary text |
| `--ink-500` | `#6b7470` | Muted text |
| `--gold-500` | `#d8a13a` | Primary button base, active-player ring |
| `--gold-400` | `#e8c061` | Button highlight, accent text on felt |
| `--red-500` | `#d6453f` | Hearts, danger button |
| `--red-600` | `#b8332e` | Error text |
| `--green-500` | `#3a9d5d` | Reserved success accent |

### Typography
| Role | Font | Notes |
|---|---|---|
| Display (title, buttons, player names) | **Fredoka** (Google Fonts, weights 500/600/700) | Rounded, playful — fits a dice game. Loaded with `preconnect` + `display=swap`. |
| Body / UI | **System stack** (`system-ui, -apple-system, "Segoe UI", Roboto, …`) | Zero network cost, native feel. |

### Tokens
- **Radii:** `--radius-sm` 8px, `--radius-md` 14px, `--radius-lg` 22px.
- **Shadows:** `--shadow-card` (lifted card), `--shadow-soft` (buttons/panels).
- **Focus ring:** `--ring` (gold glow) applied via `:focus-visible`.
- **Easing:** `--ease` — a slight overshoot `cubic-bezier` for bouncy pops.

### Layout
- Body is a centered grid; the app is `width: min(100%, 480px)` so it's mobile-first and caps on desktop.
- Fluid spacing/sizing via `clamp()` (title, padding) — no media-query breakpoints needed for the core layout.
- Scoreboard is a `1fr auto 1fr` grid (player · "vs" · player).

### Dice rendering
Each die is a `60px` rounded square using `display: grid` (3×3). Pips are positioned by `grid-area` using `data-pos` keys (`tl`, `tr`, `ml`, `mc`, `mr`, `bl`, `br`). `script.js`'s `PIP_LAYOUT` maps each face (1–6) to the pip positions to render.

### Motion
- `@keyframes shake` — dice wobble on each roll (re-triggered by forcing reflow).
- `@keyframes heart-pop` — a heart scales up when a life is lost.
- `@keyframes pop-in` — modal entrance.
- **`prefers-reduced-motion`** is honoured — all animation/transition durations collapse to ~0.

### Accessibility
- `aria-live` on the status line and dice so screen readers announce state changes.
- `role="dialog"` + `aria-modal` on the modal; `aria-expanded`/`aria-controls` on the rules toggle.
- Visible `:focus-visible` ring on every interactive element.
- Colour is never the *only* signal (text labels accompany highlights).

---

## 5. Rebuilding from scratch — checklist

1. Create the three files; link Fredoka + `styles.css` in `<head>`, load `script.js` with `defer`.
2. Drop in the `:root` token block — it drives the whole look.
3. Markup: masthead → scoreboard (2 players) → table (claim, dice, status) → controls (start/shake/call/announce-form) → rules → modal.
4. Port `RANKING`, `PIP_LAYOUT`, the `state` object, and the flow functions.
5. Wire events at the bottom with `addEventListener`. Do the initial `renderLives()` / `renderDice(null)` paint.

That's the whole thing — no server, no build, no dependencies.
