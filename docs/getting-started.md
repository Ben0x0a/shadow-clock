# Getting started

## Run it

```sh
npm ci && npm run dev
```

Or open the deployed site. No account, no server: the page works offline once loaded (map
tiles excepted).

## A first case in time mode

1. **Where was it taken?** Paste coordinates in any usual form (`48.8584, 2.2945`, DMS, or a
   Google Maps / OpenStreetMap link), and say how precisely you know the place.
2. **Shadows.** For a vertical object, enter its height and its shadow length (any unit, the
   same for both). Alternatively give their ratio or the Sun elevation directly. Choose `± σ`
   for a measurement with a standard deviation, or `min–max` for hard bounds. If you know the
   shadow's direction, enter its azimuth (base → tip, clockwise from true north).
3. **Add shadows** to tighten the result (up to four):
   - *Same photo*: another vertical object in the same picture, so the same instant.
   - *Another photo*: the same place, taken a known time later or earlier (e.g. the
     difference between two EXIF timestamps, which is usually exact even when the camera
     clock is wrong).
4. **What do you already know?** Years (required, because shadows cannot tell years apart),
   the time zone used for display and filters, months, time of day, absolute bounds.
5. Results update live. Click a solution or a heatmap cell to compare the Sun's path with
   your measurements in the *Sky check*.

Use **Examples** in the top bar to load cases whose true answer is known.

## Place mode

Switch to **Find the place**. Give each shadow the time it was taken (EXIF or ISO text,
plus its UTC offset) and its uncertainty. One elevation-only shadow gives a ring of places;
two or more at different times cross into small areas.

## Sharing and exporting

- **Share** copies a link whose `#fragment` holds the whole case. Browsers never send the
  fragment to servers, but anyone with the link can read it.
- **Export → Download report** writes `<timestamp>.shadowclock.report.json` (see
  [Report format](formats/report.md)). **Print** produces a paper/PDF record.
