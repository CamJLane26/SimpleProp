# TLE transition behavior

## Current behavior: hard switch

Each satellite can have multiple TLE sets ordered by their parsed epochs.
For a visualization time `t`, SimpleProp uses:

- the latest TLE whose epoch is less than or equal to `t`; or
- the earliest available TLE when `t` predates the complete history.

At the exact epoch of a newer TLE, the newer set owns the position. Cesium
stores each TLE's samples in a separate time interval, so polynomial
interpolation never crosses an epoch boundary.

Add another element set by resolving the satellite metadata row and deriving
the epoch from line 1:

```sql
INSERT INTO satellite_tles (satellite_id, epoch, tle_line1, tle_line2)
SELECT
  id,
  parse_tle_epoch('1 25544U ...'),
  '1 25544U ...',
  '2 25544 ...'
FROM satellites
WHERE id = <satellite_id>;
```

Use the satellite primary key (`id`) when attaching TLE history. NORAD IDs are
not unique in this schema, so they are not a safe join key by themselves.

The API returns every set sorted by epoch. Browser tabs fetch that history once
on page load; database changes become visible after reloading the page.

## Demo seed transitions

Fresh databases seeded by `db/init.sql` include two example transitions inside
the ±90 minute scrub window (relative to DB init time):

| Satellite | NORAD | Newer TLE epoch | How to see it |
|---|---|---|---|
| ISS (ZARYA) | 25544 | ~+30 minutes | Play or scrub forward from Now |
| HST | 20580 | ~-30 minutes | Scrub backward from Now |

The newer demo TLEs intentionally offset mean anomaly so the hard switch is
visible as a position jump. These are synthetic demo elements, not operational
ephemerides.

A hard switch is orbitally explicit but may cause a visible jump. TLEs are
independent fitted solutions, and propagating adjacent sets to the same epoch
does not guarantee identical position or velocity.

## Future option: display-only blending

If visual continuity becomes more important than showing the raw discontinuity,
add a short transition window around each newer epoch:

1. Choose a configurable duration, such as 30–120 seconds.
2. Propagate both the old and new TLE throughout that window.
3. Convert both results into the same inertial frame.
4. Blend position with a smoothstep weight:

   `w = x²(3 - 2x)`, where `x` runs from 0 to 1 across the window.

   `displayPosition = oldPosition * (1 - w) + newPosition * w`

5. Outside the window, use the applicable TLE without blending.
6. Apply the same blended position property to both the marker and orbit path
   to prevent visual drift.

This blend must be labeled as a visualization technique. The interpolated
positions are not an SGP4 solution and should not be used for conjunction
analysis, mission operations, or other precision calculations.

For a more physically meaningful transition, replace display blending with an
orbit determination or smoothing process that produces a continuous state
history before it reaches the browser.
