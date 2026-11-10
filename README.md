# ShadowClock

Estimate **when** a photo was taken from the shadows in it and a known place, or **where** it
was taken from shadows with known times. Every compatible solution is shown, including the
two dates per year that share the same Sun position.

Built for digital forensics and OSINT, following the house `static-web-app` standard on
[static-web-platform](https://github.com/Ben0x0a/static-web-platform) (`platform/`, a
Git submodule): everything runs in the browser, nothing you enter leaves your machine, and
the only external server (OpenStreetMap map tiles) is contacted only after you allow it.

- **Find the time**: place ± radius, then 1–4 shadows. Extra shadows are other objects in
  the same photo or other photos taken a known time apart. Constraints: years, months, time
  of day, time zone, date bounds. Check a claimed EXIF time, with or without its UTC offset.
- **Find the place**: shadows with their times; the rings of possible places are crossed.
- Every measurement is a value ± a tolerance declared by the operator, treated as a hard
  bound. Physical margins (blurred shadow tip, lean, refraction) and the place/time
  tolerances are propagated as bounds. NREL SPA solar positions. JSON report with SHA-256.
- Guided step-by-step flow, or an Expert view with every option at once.
- **Command line** (Deno, no network): the same computations on a saved case or an
  exported report, for batch work and scripting.

## Three outputs

| | Hosted site (installable app) | Single-file download | Command line |
|---|---|---|---|
| Use | everyday use, phones, *Install* (home screen / dock) | offline or locked-down machines, archiving, sending as a file | scripting, batch runs, re-running a report |
| Updates | automatic (network-first service worker) | *Check for updates* (asks consent) reads `version.json` | download it again (*Command line* link on the site) |
| File | `public/index.html` + scripts | `public/shadowclock.html` (SHA-256 published in `public/version.json`) | `public/shadowclock-cli.js` (also the JavaScript library) |

## Command line

Needs [Deno](https://deno.com) 2.9 (LTS) only. It reads local files and has no network
access (Deno is given `--allow-read` only).

```sh
alias shadowclock='deno run --no-config --no-prompt --allow-read shadowclock-cli.js'
shadowclock --help
shadowclock example --name paris > case.json      # a built-in case to start from
shadowclock find-time --format text case.json     # known place → compatible times
shadowclock find-place athens.json                # known times → compatible places (JSON)
shadowclock check-claim --format text case.json   # the case's claimed time vs the shadows
deno run --no-config --no-prompt --allow-read --allow-write=result.json shadowclock-cli.js \
  find-time --out result.json case.json           # --out needs write access to that file only
```

| Command | Operation (`src/api/`) | Input |
|---|---|---|
| `example [--name paris\|sydney\|tromso\|athens]` | `example()` | none |
| `find-time FILE` | `findTime()` | a case |
| `find-place FILE` | `findPlace()` | a case |
| `check-claim FILE` | `checkClaim()` | a case with a claimed time |

- **A case** is a saved case (`{"v": 1, …}`, as `example` writes it) or a JSON report
  exported from the page (`*.shadowclock.report.json`): its inputs are solved again, so
  a report can be checked independently. The mode stored in the case is ignored: the
  command says what to compute. `-` reads standard input.
- **Output:** JSON by default, with the solver request and the results in the same shape
  as the page's report (`src/api/results.ts`); `--format text` for reading;
  `--out FILE` (`--force` to replace) needs `--allow-write=FILE` added to the Deno
  command; standard output needs no write permission.
- **Exit codes:** `0` success, `1` invalid input (code `not-json`, `not-a-case`,
  `invalid-case` with every field error, `unknown-example`), `2` usage error, `3`
  internal error.
- **Not on the command line:** the maps, heat map and sky chart (display only; the JSON
  carries their data) and the guided steps (an input aid).

## Structure

```
platform/        static-web-platform (submodule, pinned release) — never edit here
src/
  site.json      id, title, siteUrl, download name, command line, external server (tiles),
                 worker, support link
  core/          pure maths and form rules (no page access) — tested in tests/
  api/           the operations (find time, find place, check claim, examples), result
                 shapes and message texts — shared by the page and the command line
  cli/           the command line over api/ (Deno; no network, no page access)
  workers/       solver.ts: the solvers off the main thread
  state/         the working case, guided/expert view, the solve session
  ui/            display helpers (fields, info buttons, formats, map, colours)
  features/      inputs, results, claim, mode-tabs, examples, share-export, help, toolbar
  main.ts        wiring: starts the platform, mounts the features
  strings.ts     every UI string (plus api/messages.ts, spread in)
  app.css        tokens, layout, phone / print / forced-colour rules
  index.html     page shell
tests/           unit tests of src/core/, src/api/ and the commands (Node test runner)
e2e/             browser tests of behaviour (Playwright)
scenarios.json   screens reached by interaction, re-checked by `swp gate`
public/          generated by `npx swp build` — committed and published as is
```

## Setup and build

```sh
git submodule update --init         # platform/
mise install                        # pinned Node and Deno (mise.toml)
mise exec -- npm ci                 # pinned platform, TypeScript, esbuild, Playwright
mise exec -- npx swp build          # layers, type check, bundle → public/
mise exec -- npx swp serve          # http://127.0.0.1:8765 with the production headers
```

`src/` is the only thing you edit; commit `src/` and `public/` together.

## Checks

```sh
mise exec -- npm run typecheck && mise exec -- npm test   # core maths, api/, commands (Node test runner)
mise exec -- npx swp verify      # public/ is byte-for-byte what src/ builds to
mise exec -- npx swp gate        # verification gate, on every scenario
mise exec -- npx playwright test # browser tests
```

- **Verification gate** (`swp gate`, from the platform): CSP consistent with the declared
  origins, no request without consent, axe-core WCAG A/AA, real labels, keyboard walk
  (reachable, visible, not hidden under the sticky header), no data in the URL or title,
  phone rules (16 px fields, 44 px visible targets), reflow at 320/390 px and landscape,
  text spacing, forced colours, offline reload, the single file's self-containment and
  update check, and the command line under Deno with no permission (`--help`, `--version`) — on the first screen and on each of the scenarios in `scenarios.json`
  (guided steps, every example, evidence, claim check, mode tabs, info buttons, map consent
  denied and allowed, expert view, menus, share warning, help).
- **Browser tests** (`e2e/`): each example's answer, a keyboard-only case, share links
  (the tool link carries no data; the calculation link reopens the case and leaves the
  address bar clean), map consent (tiles only after *Allow*, only from the declared
  server), reflow, and the single file computing offline.
- **CI** (`.github/workflows/ci.yml`) runs all of the above on every push and pull
  request; the checkout fetches the public platform submodule. Actions are pinned to commit SHAs; Dependabot proposes
  updates (actions, npm, platform submodule) against `dev`.

## Updating the platform

```sh
git -C platform fetch --tags && git -C platform checkout vX.Y.Z
mise exec -- npx swp build && mise exec -- npx swp gate
```

Read `platform/CHANGELOG.md` first; commit the submodule pointer together with `public/`.

## Deploying

Cloudflare Pages (or any static host) serves `public/` as committed:
framework preset *None*, **empty build command**, output directory **`public`**,
production branch `main`. Security headers come from `public/_headers` (generated); the
full CSP is a `<meta>` in each page. `siteUrl` in `src/site.json` must be the production
URL (it is used by the single file's update check).

For official or sensitive casework, the skill recommends a Swiss or in-house host instead
of a US provider (`_headers` then translates into that server's configuration).

## Privacy

- The case lives in this tab only (`sessionStorage`), and leaves it only through
  *Share this calculation…* (a warning lists what the link contains before it is copied)
  or the JSON report — both explicit actions. An opened link is validated, loaded and
  removed from the address bar.
- *Privacy* (platform) lists the external server and your decision, can forget it, and
  offers *Clear all local data*. *Accessibility* offers the theme choice.
- Map tiles: requested only after consent; they reveal the viewed area and this site's
  address to OpenStreetMap (as stated in the consent dialog).

## Third-party code

| Library | Version | Source | Licence |
|---|---|---|---|
| Leaflet | 1.9.4 | npm, pinned by `package-lock.json`; script bundled into `app.js`, stylesheet into `app.css` (its images embedded) | BSD-2-Clause |
| static-web-platform | 2.0.1 | `platform/` submodule (shared base: consent, storage, sharing, dialogs, build, gate) | see its repository |

Nothing else from `node_modules/` is shipped: TypeScript, esbuild and Playwright are build
and test tools only, pinned by `package-lock.json`.

## Design decisions

1. **Worker for the solver.** A year-long fine search takes up to a second or two; it
   runs in `workers/solver.ts` (`platform.worker("solver")`) so typing stays fluid. The
   single file starts it from a `blob:` URL, so only its CSP allows `worker-src blob:`.
2. **Referrer for map tiles.** Pages send no Referer. OpenStreetMap's tile policy asks
   for one, so the tile origin declares `"referrerPolicy": "strict-origin"` in
   `site.json`: only this site's origin is sent, never the page URL, and the consent
   dialog states it.
3. **No `content.ts`.** ShadowClock has no editable content list; its examples are
   generated from the solar model in `src/core/examples.ts`.
4. **Core messages as keys.** The solver also runs inside the worker, where `t()` does not
   exist, so it returns message keys. Their texts live in `src/api/messages.ts`, so the
   page (`src/ui/context.ts`, through the platform's string table) and the command line
   word them identically.
5. **Gaussian model kept in the core.** The UI only offers declared bounds; the core still
   implements the Gaussian (σ) model, unused by the app.
6. **One `results` feature.** The time and place answers share the status, empty state
   and announcements, so they live in one feature folder (`features/results/time`,
   `features/results/place`) instead of two features that would need each other.
7. **A shared `ui/context.ts`.** The platform instance is set once in `main.ts`, so the
   many render helpers call `t()` without threading the platform through every call.
8. **Local copy: the single file, not the local-server zip.** The platform also offers a
   zip with a local server, for apps that fail from `file://`. ShadowClock does not: the
   solver worker starts from a `blob:` URL, and OpenStreetMap serves tiles to a page
   without a Referer (checked in Chrome on 2026-11-10). The single file needs no runtime.
9. **One path through `api/`.** The page and the command line call the same operations:
   the page sends the case to its Web Worker (`state/solve.ts` → `workers/solver.ts`, a
   background thread in the browser), which runs `findTime` / `findPlace`; the claim
   check calls `checkClaim`; the report and the command line export results with the same
   functions, and render messages with the same `core/message.ts`. The page also
   validates the case before sending it, with the same core builders the operations use,
   so field errors show at once and do not depend on the worker; a valid case is shown as
   running at once, so an earlier answer is never shown as current. The report includes
   results only when they belong to the current inputs.

## Not tested automatically

Safari and Firefox, a real phone install, a real screen reader (VoiceOver/NVDA) and voice
control. Do the manual pass in the skill's `references/accessibility.md` before each
release.

## Documentation

See [docs/README.md](docs/README.md): method and assumptions, how to read the results,
workflows, the report format and the architecture.

## Licence

Copyright 2026 Ben0x0a. Licensed under the [Apache License, Version 2.0](LICENSE).

Bundled third-party material keeps its own licence:
- Leaflet: BSD-2-Clause.
- static-web-platform: Apache-2.0 (its notice stays in `app.js` as a legal comment).

## Development & AI use

Generative AI was used in this project mainly to assist during the coding phase.
The original ideas and the overall structure are the owner's, and all core logic
has been reviewed. Even so, mistakes or bugs may have slipped past proof-reading —
please report anything unexpected.
