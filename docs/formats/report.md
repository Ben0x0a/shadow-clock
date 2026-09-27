# Report format (`*.shadowclock.report.json`)

The filename carries the application name (`<UTC timestamp>.shadowclock.report.json`) so the
artefact is attributable.

| Field | Content |
|---|---|
| `application` | `name`, `version`, page `url` |
| `generatedAtUtc` | ISO 8601 time of export |
| `mode` | `time` or `place` |
| `method` | Algorithms and parameters used (SPA, ΔT model, refraction σ, semi-diameter, levels, steps) |
| `inputsSha256` | SHA-256 of the canonical JSON of `inputs` |
| `inputs` | The form exactly as typed (restores the case) |
| `request` | The parsed request sent to the solver (numbers, UTC epoch milliseconds) |
| `results` | Time mode: clusters with daily windows, fits and probabilities; place mode: regions and cells. Plus warnings and the derived observations with their error budgets |

All times in `request` and `results` are UTC epoch milliseconds; angles are degrees.
