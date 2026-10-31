# play-forge
A collection of fun, interactive mini-games designed to bring people together. Play, compete, and challenge your friends through a variety of casual, board, and multiplayer games — all in one place.

## Play

- **Online:** the GitHub Pages site (deployed automatically from `main`).
- **Offline / no hosting:** run `npm run build` and open `dist/games/<game>/index.html` directly. Each game is **one self-contained HTML file**: copy it anywhere, double-click it, and play. Multiplayer still works from `file://`.

Multiplayer: one player clicks **Create room** and shares the 5-letter code (or the invite link). Friends enter the code and click **Join**.

## How multiplayer works (no server)

```
 Browser A (host) ◄──── WebRTC data channel ────► Browser B
        ▲                                               ▲
        └──── public Nostr relays (connection setup only) ┘
```

- **Transport:** [Trystero](https://github.com/dmotz/trystero) handles WebRTC. Peers find each other through public Nostr relays, so we run no server. Only connection setup goes through relays. Game traffic is direct peer to peer.
- **Netcode:** host-authoritative. The room creator runs the simulation at a fixed tick rate. Guests send inputs to the host, and the host broadcasts the state after every tick. Each game is a pure `setup` / `tick` function over JSON data, so the same code runs solo (offline transport) and online.
- **Limits:** if the host leaves, the match ends. Keep the host's tab visible, because browsers throttle background tabs. A few strict networks (symmetric NAT) need a TURN server. You can pass one to Trystero via `turnConfig`.

## Project layout

```
engine/                  reusable library, imported as '@forge'
  app.ts                 createGameApp(): menu → lobby → match → results UI
  core/                  emitter, fixed-rate ticker + render loop, input (keys/swipe), seeded RNG
  net/
    transport.ts         Transport interface + offline transport
    trystero.ts          internet P2P (WebRTC)
    broadcast.ts         same-browser tabs (dev/testing)
    session.ts           host-authoritative Session + GameDefinition contract
  render2d/canvas.ts     HiDPI, letterboxed 2D canvas
  ui/lobby.css
games/
  games.json             launcher listing
  snake/                 index.html, main.ts (wiring), sim.ts (rules), render.ts, sim.test.ts
index.html               launcher page
scripts/build.mjs        builds launcher + one single-file HTML per game into dist/
```

## Tech choices

| Need | Choice | Why |
| --- | --- | --- |
| Language / build | TypeScript + Vite + `vite-plugin-singlefile` | Fast dev server; production output is a single HTML file that works on `file://` and static hosts |
| 2D | Canvas 2D (`engine/render2d`) | Zero dependencies, enough for grid/arcade games. Add **PixiJS** later for sprite-heavy games |
| 3D | **three.js** (add when the first 3D game arrives, as `engine/render3d`) | Most mature WebGL/WebGPU library. The session/netcode layer is renderer-agnostic, so nothing else changes |
| P2P | Trystero (Nostr strategy) | Serverless signalling, bundles into the single file |
| Tests | Vitest | Game rules are pure functions, so they are easy to unit-test |

## Develop

```bash
npm install
npm run dev          # http://localhost:5173 (launcher), /games/snake/
npm test             # unit tests (simulation + session over BroadcastChannel)
npm run typecheck
npm run build        # dist/ (or: npm run build -- snake)
```

To test multiplayer locally without the internet, open the game in two tabs with `?net=local`, e.g. `http://localhost:5173/games/snake/?net=local`.

## Adding a game

1. Create `games/<id>/index.html` with a `#stage` element and `main.ts`. Copy `games/snake` as a template.
2. Write the rules as a `GameDefinition<State, Input>` (`setup`, `tick`, `isFinished`). The state must be JSON-serialisable, and randomness must use `@forge/core/rng` with the seed stored in state.
3. Call `createGameApp({ def, title, stage, mount, resultText })`. In `mount`, start rendering from `session.state` and bind input to `session.sendInput`.
4. Add an entry to `games/games.json`.

## Deploy

`.github/workflows/pages.yml` tests, builds, and publishes `dist/` on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**.
