# Reading the results

- **Two periods per year.** The Sun's declination takes each value twice a year, placed
  symmetrically around a solstice, so the same shadow fits two periods. The equation of time
  makes the two slightly different in clock time. Near a solstice the declination changes
  slowly: the two periods merge into one long one and the date is poorly constrained.
- **Morning / afternoon.** Without the shadow's direction, each day has two solutions, one on
  each side of solar noon. They are listed separately and tagged.
- **No year.** Each year in the range is solved separately; the pattern shifts only by
  minutes from one year to the next.
- **Declared bounds, not probabilities.** Every listed time fits inside every tolerance you
  declared (plus the physical terms). All listed periods are equally possible; ShadowClock
  does not rank them. Narrower tolerances give narrower windows — but only declare what you
  can defend.
- **Windows.** Each day of a solution has a window: the possible span and the time closest
  to the centre of all bounds ("best"). A ✂ or "cut" tag means a constraint or the search
  range truncated it.
- **No solution** means the declared bounds are incompatible: check the north reference,
  the tilt, sloping ground, the tolerances, or whether two photos were really taken at the
  same place.
- **Error budget** shows which input dominates the uncertainty, so you know what to measure
  better.
