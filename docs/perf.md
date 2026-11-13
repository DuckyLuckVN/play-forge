# Measuring performance in a game (`?perf`)

Any game can record frame, render, sim-tick and long-task timings: add `?perf` to its URL
(e.g. `/games/shuttle-pop/index.html?perf`), play, then press **Shift+Alt+P** (or run `__perf.download()` in
the console; DevTools itself slows a WebGL page, so prefer the shortcut).
It saves `perf-<time>.json` (also `__perf.report()` to inspect it in place). Off without `?perf`:
nothing is created and the loops pay one null check.

Code: `engine/core/perfprobe.ts` (hooked into `engine/core/loop.ts` and the quality governor in
`engine/render3d/scene.ts`).

## Reading the report

- `frame` — time between drawn frames (ms): p50 / p95 / p99 / max, and `jank` = frames at or over
  20 / 33 / 50 ms (a 60 Hz frame is 16.7 ms).
- `render` — our own CPU work per frame (ms). **Long frames with low render time** = the browser or the
  OS didn't give us the frame (other apps, compositor, GPU); **high render time** = the game is too slow.
- `tick` — sim ticker: how late a run fired (`lateP95`, `lateMax`) and catch-up `bursts` (more than one
  tick in one run). Late ticks / bursts feel like input lag or hitches.
- `longTasks` — main-thread blocks over 50 ms (Chrome only).
- `perSecond` — the same per second (find when it got bad); `events` — quality changes, long tasks,
  tab hidden / visible, with their time in seconds.

## When frames are slow but `render` is low

That's GPU fill: a big window or fullscreen draws millions of pixels. The quality governor
(`engine/render3d/quality.ts`) steps the ladder down; once Auto has settled (locked) it drops on 4 bad
windows out of the last 6. The ladder's last rung (`minDpr: 0.75`) lets a canvas bigger than the pixel
budget render down to 0.75× and be upscaled.

## Cooked static light (`engine/render3d/bake.ts`)

A fixed sun over static scenery needs no per-frame shadows or AO for that scenery. `bakeGround` renders
the static casters once (their sun shadows projected onto the ground + top-down contact occlusion,
blurred) into one shading texture; `groundShadeOverlay` multiplies it over the ground (one draw call).
Mark the baked casters as non-casting afterwards, so the live shadow map keeps only moving things.
Re-bake only when the layout changes (Shuttle Pop: court size or prop detail; `scenery.ts` `cook`).
Live screen-space AO (`AoOptions.scale` for a cheaper half-resolution buffer) is then an opt-in extra.
