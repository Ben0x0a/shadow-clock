# ShadowClock

Estimate **when** a photo was taken from the shadows in it and a known place, or **where** it
was taken from shadows with known times. Uncertainties are handled honestly: every compatible
solution is shown, including the two dates per year that share the same Sun position.

Built for digital forensics and OSINT. It is a static site: every computation runs in the
browser, and nothing you enter leaves your machine.

- **Find the time**: place ± radius, then 1–4 shadows. Extra shadows are either other objects
  in the same photo or other photos taken a known time apart. Add constraints (years, months,
  time of day, time zone, absolute bounds) and check a claimed EXIF time, with or without its
  UTC offset.
- **Find the place**: shadows with their UTC times; the bands of possible places are crossed.
- NREL SPA solar positions, full error propagation (penumbra, tilt, refraction, location and
  time uncertainty), 68 / 95 / 99.7 % regions, reproducible JSON reports.

## Quick start

```sh
npm ci
npm run dev      # http://localhost:5173
npm test         # unit and round-trip tests
npm run build    # static site in dist/
```

Node 24 is pinned in `.node-version` / `mise.toml`.

## Deploying to Cloudflare Pages

Connect the repository and set **Build command** to `npm run build` and **Build output
directory** to `dist`. Security headers (strict CSP) come from `public/_headers`.

## Documentation

See [docs/README.md](docs/README.md): method and assumptions, how to read the results,
workflows, the report format and the architecture.

## Development & AI use

Generative AI was used in this project mainly to assist during the coding phase.
The original ideas and the overall structure are the owner's, and all core logic
has been reviewed. Even so, mistakes or bugs may have slipped past proof-reading —
please report anything unexpected.
