# Verify a claimed EXIF time

1. Time mode. Enter the place and its uncertainty.
2. Measure one or more vertical objects in the photo (see [Method](../concepts/method.md) for
   what to measure and the assumptions).
3. In **Check a claimed time**, paste `DateTimeOriginal` (e.g. `2024:07:14 15:32:10`).
   - If `OffsetTimeOriginal` exists, enter it: the verdict states the smallest confidence
     region that contains the claimed time, and the nearest compatible time.
   - If not, leave the offset empty: every offset from UTC−12 to UTC+14 is tested and the
     compatible ones are listed. If the place's legal offset for that season is not among
     them, the date, the clock or the claim is wrong.
4. Export the JSON report for the record.
