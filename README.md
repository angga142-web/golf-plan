# Parkutut

Static golf course-management site at https://parkutut.com. Plain HTML/JS, no build step, installable as a PWA (`manifest.webmanifest`, `sw.js`).
Data lives in the browser's `localStorage`; signed-in users also get one JSON file on the server through `api/data.php` (synced by `auth.js`).

## Club bag (`bag.html`)

Each player describes their bag by feel: per club, a carry and the ellipse where about 90% of good shots land. No launch monitor needed.

### Files

| File | What it does |
|---|---|
| `bag-config.js` | Every tunable number: constants, thresholds, skill-level defaults. |
| `bag-engine.js` | Pure functions, no DOM: sigma conversion, shot sampling, rotation, point in polygon, `simulate`, `recommend`, `gapping`, bag defaults and cleaning. |
| `bag.html` | Mobile editor (canvas plus sliders) and the gapping list. |
| `tests/bag-engine.test.js` | Unit tests. Run `node --test tests/*.test.js` (Node 18+, no packages). |

### Data model

The bag is stored in localStorage key `parkutut-bag-v1`. `auth.js` syncs it to the server as a single value (this phone wins; the server only fills an empty phone).

```js
{ version: 1, level: "pemula" | "100" | "90" | "80", conservative: false, updated_at: "ISO date",
  clubs: [ { name: "7i",            // Dr, 3W, 5W, 7W, 3H-5H, 3i-9i, PW, AW, SW, LW; 14 at most
             loft: null,            // degrees, optional
             carry_m: 140,          // centre of the good-shot ellipse, metres
             depth_90_m: 22,        // full short-to-long length of the 90% ellipse
             width_90_m: 36,        // full left-to-right width of the 90% ellipse
             bias_lat_m: -6,        // ellipse centre: + right, - left
             miss_rate: 0.18,       // 0 to 0.4, share of mishits
             source: "manual",      // "manual" | "screenshot" | "logged"
             n_shots: 0, updated_at: "ISO date" } ] }
```

A new bag starts from Parkutut Caddy's saved carries (`caddy-clubs-v1`) when they exist; otherwise it uses the level defaults. Nothing is written until the first change. Caddy keeps its own carry list for now.

**Migration and rollback.** This adds one new key; no existing key or server format changes. To roll back, remove `bag.html`, `bag-*.js` and the landing card, take `"parkutut-bag-v1"` out of `KEEP` in `auth.js`, and optionally `localStorage.removeItem("parkutut-bag-v1")`. Old server files that hold the key are simply ignored.

### Model

- **90% ellipse to sigma:** σ = semi-axis / k, with k = √(−2 ln 0.10) ≈ 2.146 (90% of a 2D normal falls inside k σ).
- **Shots are a mix of two normals:** (1 − miss_rate) × good plus miss_rate × miss.
  - Good shot: centred on (bias, carry), with σ from the ellipse.
  - Mishit: centred on (bias, `MISS_CARRY_FACTOR` × carry), with σ × `MISS_SIGMA_FACTOR`.
- **Frame and simulation:** coordinates are in metres, with x to the right and y up the hole. The aim bearing is in degrees, clockwise from +y. `simulate()` turns each sample by the aim bearing, moves it to the ball, and tests green polygons first, then hazards.
- **`recommend()`:**
  - Clubs whose hazard chance is at or below the level's `maxHazard` come first, ranked by p_green − `hazardWeight` × p_hazard.
  - Clubs over the limit come last, safest first.
  - Higher handicaps get a stricter limit and a bigger penalty, so they play away from trouble.

### Guessed constants (tune in `bag-config.js`)

| Constant | Value | Status |
|---|---|---|
| `CONSERVATIVE_FACTOR` | 1.25 | guess |
| `MISS_CARRY_FACTOR` | 0.7 | guess |
| `MISS_SIGMA_FACTOR` | 2.0 | guess |
| `RECOMMEND` limits and weights per level | 0.10 to 0.20, weights 1 to 3 | guess |
| `LEVELS`: carries, depth/width % of carry, miss rate | per level | guess, roughly typical amateur numbers |
| `GAP_MAX_M` / `OVERLAP_MIN_M` | 15 / 5 m | chosen thresholds |
| `K90` | 2.146 | exact |

### Phase 2 plan: course map (not built yet)

1. **Check OpenStreetMap coverage first.** Query Overpass for `golf=green|fairway|bunker|tee|hole|water_hazard|lateral_water_hazard` and `natural=water` around the target courses (Jakarta, Bogor, Singapore). Record which holes have greens, bunkers and water drawn.
2. **Map:** Leaflet, because it is small, has no build step and suits this site. Convert lat/lng to local metres around the ball (equirectangular is fine at hole scale) so `simulate()` and `recommend()` work unchanged.
3. **Interaction:** tap a target to set the aim bearing from the ball. Draw each club's rotated ellipse, then list `recommend()` for the player's level.
4. **Fixing gaps:** let players draw or adjust missing greens and hazards. Store the result per course in our own data (`data/<course>-geo.json`), and send the fixes back to OSM only by hand.
5. **Satellite basemap:** check licences before use. That covers Esri World Imagery attribution and terms (already credited for the hole drawings), Mapbox free-tier limits and OneMap SG terms. No elevation for now.
