# Titan War — Architecture & Developer Reference

## What Is This?

Titan War is a browser-based real-time strategy game inspired by Command & Conquer. It runs entirely in vanilla JavaScript with no build tools, no frameworks, and no external dependencies — just an HTML page, a CSS file, and one large JS file rendered via a 2D Canvas API.

---

## Running the Game

```bash
./play.sh          # starts python3 -m http.server 8080 and opens browser
./Launch Game.command   # same, double-clickable from macOS Finder
```

The server must be running because `game-combined.js` is loaded as a `<script>` tag (not an ES module), so it can't be opened as `file://`.

---

## File Structure

| File | Role |
|------|------|
| `index.html` | Layout shell — canvas elements, UI panels, buttons |
| `style.css` | All visual styling; uses `clamp()` with viewport units for responsive scaling |
| `game-combined.js` | Entire game (~4200 lines) — single file, no modules |
| `play.sh` | Dev server launcher |
| `Launch Game.command` | macOS double-click launcher |

---

## Architecture Overview

### Game Loop

```
requestAnimationFrame → gameLoop(timestamp)
  → deltaTime = (timestamp - lastTime) / 1000   (seconds)
  → game.update(deltaTime)
  → game.render()
```

Delta-time is capped at `0.1s` to prevent large jumps after tab focus loss.

### Class Hierarchy (top-level)

- **`Game`** — central controller; owns all state, the camera, and calls update/render on everything
- **`InputHandler`** — attached to the canvas; translates DOM events into game actions
- **`GameAI`** — enemy AI; runs on its own timer inside `game.update()`
- **`Unit`** — soldiers, tanks, harvesters, snipers, artillery, commandos
- **`Building`** — HQ, barracks, factory, power plant, refinery, turret, sandbag, missile silo
- **`Projectile`** — bullets/shells fired by units and turrets; carries an `owner` reference for kill credit
- **`NukeProjectile`** — slow-moving arc projectile; on impact creates AoE kill + shockwave ring
- **`Particle`** — explosion/smoke effects; pure visual, no gameplay effect
- **`ResourceDeposit`** — tiberium nodes harvesters collect from; regenerate slowly over time

---

## Coordinate System (critical — read this first)

There are **two coordinate spaces**:

| Space | Description |
|-------|-------------|
| **World space** | Game logic coordinates; world is `worldWidth × worldHeight` (3000×2000) |
| **Screen/camera space** | What the player sees; a fixed 700-unit-tall window scaled to fill the canvas |

**Camera** (`game.camera`): `{ x, y, width, height }`  
`height` is fixed at 700 game units. `width` is calculated dynamically in `resizeCanvas()` to match the canvas aspect ratio — this prevents stretching.

**Rendering**: `ctx.scale(canvas.width / camera.width, canvas.height / camera.height)` is applied once per frame. Because `camera.width/height` always matches the canvas aspect ratio, both scale factors are equal and nothing distorts.

**Input conversion** (`InputHandler.getCanvasPos()`):
```javascript
x: (e.clientX - rect.left) * (camera.width / rect.width)   // CSS px → camera space
y: (e.clientY - rect.top)  * (camera.height / rect.height)
// then: worldX = cameraSpaceX + camera.x
```

**Never** use raw `e.clientX/Y` or canvas pixel coordinates for game logic.

---

## Camera & Navigation

- **Edge scrolling**: handled in `Game.update(deltaTime)`. Mouse within 50px of any canvas edge scrolls the camera continuously; speed scales with depth into the edge zone (max 800 world-units/sec). Only fires while `mouseOnCanvas` is true — moving into a UI panel stops scrolling immediately.
- **Middle-mouse drag**: hold middle button and drag to pan freely.
- **Arrow keys / WASD**: discrete keyboard scrolling (handled in `InputHandler.onKeyDown`).
- **Minimap click**: click the minimap to jump the camera to that world position.
- **Go to Base button**: snaps camera to player HQ.

---

## Fog of War

Two-layer persistent fog:

| State | Meaning | Visual |
|-------|---------|--------|
| `0` — unexplored | Never seen | Solid black |
| `1` — explored | Was seen, not currently visible | Fully clear (terrain stays revealed permanently) |
| `2` — visible | Currently in vision range | Fully clear + enemies shown |

**Implementation**: `game.playerFog` and `game.enemyFog` are `Uint8Array` grids with tile size 48 world-units. Each frame `updateFog()` decays `2→1`, then re-marks tiles visible around every unit/building using `markFogVisible()`.

**Visibility radii** are per-unit/building type (e.g. sniper: 320, soldier: 220, HQ: 280). Set as `visionRadius` in `setStats()`.

**Rules**:
- Enemy units only render when `playerFog` state = 2 at their position
- Enemy buildings render when state ≥ 1 (you keep seeing them after exploring)
- Minimap darkens unexplored tiles
- AI only auto-attacks player buildings it has actually scouted (`isExploredByEnemy`)

---

## Campaign System

Five missions, unlocked sequentially. Progress stored in `localStorage` key `titanwar_completed` (JSON array of completed mission IDs).

```javascript
MISSIONS = [
  { id: 1, name: '...', enemyIncome: 8, ... },
  ...
  { id: 5, name: '...', canBuildSilo: true, ... }
]
```

`Game.showCampaignScreen()` — renders a DOM overlay with mission cards.  
`Game.startMission(missionId)` — full state reset, sets `this.currentMission`, calls `init()`, centers camera on player base.

Win condition: destroy enemy HQ. Lose condition: player HQ destroyed.

---

## AI System (`GameAI`)

The AI runs on configurable timers. Its behavior is driven by `cfg` (defaults) overridden by `missionConfig` (per-mission tuning):

```javascript
get cfg() {
    const defaults = { buildInterval: 15, attackInterval: 30, ... };
    return { ...defaults, ...this.missionConfig };
}
```

Key AI behaviors:
- `tryBuild()` — builds buildings near its HQ; checks `cfg.canBuildSilo` before placing missile silo
- `tryProduceUnits()` — queues units from barracks/factory
- `tryAttack()` — sends idle combat units toward player buildings it has scouted
- `tryLaunchNuke()` — fires nuke if silo charged and enough credits (Mission 5 only)
- `grantIncome()` — grants credits on a timer; rate set by `cfg.incomeRate`

---

## Tech Tree (Building Prerequisites)

Defined in `BUILD_PREREQS` const (above the `Game` class):

| Building | Requires |
|----------|----------|
| War Factory | Barracks |
| Turret | Barracks |
| Missile Silo | War Factory |

`enterBuildMode()` checks prerequisites and shows an error if unmet. Build buttons in the UI grey out and display "Need X" text.

---

## Nuke System

**Building**: `missile_silo` — costs 1500 credits, 90-second recharge (`nukeCooldown` / `maxNukeCooldown`). Requires War Factory.

**Player workflow**:
1. Click a missile silo to select it
2. Info bar shows cooldown status or "Ready — right-click to target"
3. Right-click anywhere on the map to fire (costs 800 credits)

**`NukeProjectile`**: flies in a slow arc; on arrival kills all units/buildings within 300px and spawns particles + a `Shockwave` ring.

---

## Building System

**Placement rules** (`Game.isValidBuildLocation(x, y, team)`):
- No overlap with existing buildings/deposits
- Player buildings must be within 200px of an existing friendly building (`buildRadius`)
- Player buildings cannot be placed within 350px of any enemy building
- AI has no proximity restriction

**Repair**: select a player building → "🔧 Repair Building" button appears in the action panel. Costs 3 credits/sec, heals 15 HP/sec. Runs in the background after deselecting; auto-stops at full HP or when out of credits.

**Garrison**: select soldiers/snipers/commandos → right-click a friendly building to garrison them (max 4, max 2 for sandbags). Garrisoned units disappear from the map; the building fires at enemies within 280 world-units with a 50% damage bonus. Attack rate scales with garrison size. Click "🚪 Evacuate Garrison" to release them. Units die if their building is destroyed.

**Production queue**: `Game.productionQueue` is an array of `{ type, building, timer }` entries processed each frame.

---

## Unit System

**Veterancy**: units earn kills via `addKill()`, called by `Projectile.update()` on a fatal hit (via `projectile.owner`). Level thresholds: 3 kills = Veteran ★, 8 kills = Elite ★★, 18 kills = Hero ★★★. Each level grants +15% max HP and damage plus a small HP heal. Stars render above the health bar (gold/silver/orange).

**Unit Commands**:

| Action | How |
|--------|-----|
| Select | Left-click or drag-select box |
| Move | Right-click empty ground (also deselects) |
| Attack | Right-click enemy unit/building |
| Garrison | Right-click friendly building with soldiers selected |
| Stop | S key or Stop button |
| Move mode | M key — next left-click is move target |
| Attack mode | A key — next left-click is attack target |

---

## Economy

**Ore deposits**: plain objects `{ x, y, amount, maxAmount }`. Harvesters reduce `amount`; deposits regenerate at 8 units/sec up to `maxAmount`. A dashed gold ring appears when a deposit is below 30% capacity. Deposits are spread across the map — the center deposits are contested and high-value.

**Harvester flow**: harvester → drives to deposit → mines until `carrying = maxCarry` → returns to refinery → credits added → repeat.

**AI income**: time-gated credit grants (no harvester needed), rate configured per mission via `cfg.incomeRate`.

---

## UI Panels

```
#ui-top        — credits, power display, selected-unit info bar
#ui-bottom
  #minimap-container   — minimap canvas + Go to Base button
  #build-menu          — building buttons (data-type, data-cost)
  #unit-menu           — unit production buttons
  #action-panel        — production queue, repair/evacuate buttons,
                         unit command buttons, campaign + cheats
```

All sizes use `clamp(min, preferred, max)` with `vh/vw` units for responsive scaling.

`resizeCanvas()` is called on `window resize` and on game init. It syncs both canvas buffer sizes to their CSS display sizes AND recalculates `camera.width` to match the aspect ratio.

---

## Key Patterns & Conventions

- **No modules**: everything is in `game-combined.js`, loaded with a plain `<script>` tag. Classes are defined globally.
- **`window._game`**: the Game instance is stored here so campaign/UI buttons can reach it from inline onclick handlers.
- **`game.gameState`**: `'campaign'` | `'playing'` | `'victory'` | `'defeat'`
- **Delta time**: always pass `deltaTime` (seconds) to `update()` methods; never use raw frame counts for timers.
- **World vs screen rendering**: all draw calls use `unit.x - camera.x`, `unit.y - camera.y` to convert world→screen. The `ctx.scale()` in `render()` maps that to canvas pixels.
- **Teams**: `this.playerTeam = 'player'`, enemy is `'enemy'`. All units and buildings have a `.team` property.
- **Update call order** (inside `Game.update()`): units → buildings → projectiles → particles → AI → deposits regen → edge scroll → fog → power → nuke UI → repair UI → check game end.

---

## Known Quirks

- No save system mid-mission; mission progress persists via localStorage only.
- Enemy AI income is time-gated, not harvester-based.
- Turrets auto-attack the nearest enemy in range each frame (no manual targeting).
- The minimap redraws every frame — fog overlay loops over the full fog grid each tick (acceptable at 50×42 tiles).
- `checkGameEnd()` runs every tick — safe because it returns early when `gameState !== 'playing'`.
- `updateRepairUI()` is called both from `Game.update()` (every frame) and from `updateUI()` (on click events) to avoid a one-frame delay when selecting buildings.
