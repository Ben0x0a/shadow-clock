# Getting started

## Run it

```sh
npm ci && npm run dev
```

Or open the deployed site. No account, no server: the page works offline once loaded (map
tiles excepted).

## A first case in time mode

The guided view asks one question at a time; finished steps collapse to a one-line summary
you can edit. Switch on **Expert view** in the top bar to see every option at once.

1. **Where was the photo taken?** Paste coordinates in any usual form (`48.8584, 2.2945`,
   DMS, or a Google Maps / OpenStreetMap link) and say how precisely you know the place
   (exact spot, street, town, region, or any radius).
2. **Measure a vertical object and its shadow.** Enter the height and the shadow length
   (any unit, the same for both), each with the **tolerance** you declare: the largest error
   you consider possible. Optionally give the shadow's direction (base → tip, clockwise from
   true north) with its tolerance. *More options* offers a ratio or an angle instead of
   lengths, which edge of the shadow tip you measured, the object's possible lean and a
   magnetic-north correction.
3. **Anything else in the picture?** Up to four shadows in total:
   - *Another object* in the same photo: same instant.
   - *Another photo* of the same place, with the time gap after the first photo and its
     tolerance (e.g. the difference between two EXIF timestamps, ± 2 s).
4. **What do you already know?** Years (required, because shadows cannot tell years apart),
   the time zone used for display and filters, and optionally months, time of day and
   absolute date bounds.

The answer appears as soon as enough is entered: the possible periods first, then
**Does a claimed time match?** and **Show the evidence** (year map, each day's window, sky
check, error budget).

Use **Examples** in the top bar to load cases whose true answer is known.

## Place mode

Switch to **Find the place**. Give each shadow the time it was taken (EXIF or ISO text,
plus its UTC offset) and its uncertainty. One elevation-only shadow gives a ring of places;
two or more at different times cross into small areas.

## Sharing and exporting

- **Share → Copy link to the tool** gives a clean link with no data, safe to post anywhere.
- **Share → Copy link to this calculation** gives a link whose `#fragment` holds the whole
  case. Browsers never send the fragment to servers, but anyone with the link can read it.
  When such a link is opened, the case is loaded and the data is removed from the address
  bar at once. The address bar never shows case data otherwise, so copying the URL or
  bookmarking the page cannot leak it. The working case survives a reload through the tab's
  session storage, which stays on the device and is cleared when the tab closes.
- **Export → Download report** writes `<timestamp>.shadowclock.report.json` (see
  [Report format](formats/report.md)). **Print** produces a paper/PDF record.
