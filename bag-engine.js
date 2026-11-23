/* Parkutut club bag engine: pure functions, no page or DOM needed.
   Frame: metres. x = right of the ball, y = up the hole. A shot is first made in the aim frame (lat = right of the aim line,
   dist = along it), then turned by the aim bearing (degrees clockwise from +y) and moved to the ball.
   Loads in the browser (window.PKBag, needs bag-config.js first) and in Node (require). */
(function (root) {
const DEF = typeof module === "object" && module.exports ? require("./bag-config.js") : root.PKBagConfig;
const cfgOf = o => Object.assign({}, DEF, o && o.cfg);

/* --- ellipse and sigma ------------------------------------------------- */
const sigmaFromNinety = (semiAxis, cfg) => semiAxis / cfgOf({ cfg }).K90;

/* the 90% ellipses to draw: good shots and mishits, in the aim frame */
function ellipses(club, opts) {
  const c = cfgOf(opts), f = opts && opts.conservative ? c.CONSERVATIVE_FACTOR : 1;
  const rx = club.width_90_m / 2 * f, ry = club.depth_90_m / 2 * f;
  return {
    good: { lat: club.bias_lat_m, dist: club.carry_m, rx, ry },
    miss: { lat: club.bias_lat_m, dist: club.carry_m * c.MISS_CARRY_FACTOR, rx: rx * c.MISS_SIGMA_FACTOR, ry: ry * c.MISS_SIGMA_FACTOR }
  };
}

/* the two normals of the shot mixture */
function distribution(club, opts) {
  const c = cfgOf(opts), e = ellipses(club, opts), s = x => x / c.K90;
  const rate = Math.min(Math.max(club.miss_rate || 0, 0), c.MISS_RATE_MAX);
  return {
    good: { w: 1 - rate, lat: e.good.lat, dist: e.good.dist, sdLat: s(e.good.rx), sdDist: s(e.good.ry) },
    miss: { w: rate, lat: e.miss.lat, dist: e.miss.dist, sdLat: s(e.miss.rx), sdDist: s(e.miss.ry) }
  };
}

/* --- random numbers: seeded so a result can be repeated --------------- */
function rng(seed) {
  let a = (seed == null ? (Math.random() * 2 ** 32) : seed) >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  u.normal = () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    let p, q; do p = u(); while (p === 0); q = u();
    const r = Math.sqrt(-2 * Math.log(p)); spare = r * Math.sin(2 * Math.PI * q); return r * Math.cos(2 * Math.PI * q);
  };
  return u;
}

/* n shots in the aim frame: {lat, dist, miss} */
function sampleShots(club, n, opts) {
  const D = distribution(club, opts), R = rng(opts && opts.seed), out = new Array(n);
  for (let i = 0; i < n; i++) {
    const miss = R() < D.miss.w, g = miss ? D.miss : D.good;
    out[i] = { lat: g.lat + R.normal() * g.sdLat, dist: g.dist + R.normal() * g.sdDist, miss };
  }
  return out;
}

/* aim frame -> course frame */
function toCourse(shot, aimBearingDeg, ball) {
  const t = aimBearingDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: ball.x + shot.lat * c + shot.dist * s, y: ball.y - shot.lat * s + shot.dist * c };
}

/* ray casting; poly = [[x,y], ...] */
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inAny = (p, polys) => (polys || []).some(poly => pointInPolygon(p, poly));

/* chance of landing on the green, in a hazard, or elsewhere. targets = {green:[poly], hazard:[poly]}; the green wins where they overlap */
function simulate(club, aimBearingDeg, ball, targets, opts) {
  const c = cfgOf(opts), n = (opts && opts.n) || c.SIM_SHOTS;
  let g = 0, h = 0;
  sampleShots(club, n, opts).forEach(s => {
    const p = toCourse(s, aimBearingDeg, ball);
    if (inAny(p, targets.green)) g++; else if (inAny(p, targets.hazard)) h++;
  });
  return { p_green: g / n, p_hazard: h / n, p_other: (n - g - h) / n };
}

const hasData = club => !!club && club.carry_m > 0 && club.depth_90_m > 0 && club.width_90_m > 0;

/* clubs ranked best first. Clubs over the level's hazard limit come after the safe ones, safest first.
   Higher handicaps (pemula, 100, 90) get a stricter limit and a bigger hazard penalty, so they play away from trouble. */
function recommend(clubs, aimBearingDeg, ball, targets, opts) {
  const c = cfgOf(opts), lv = c.RECOMMEND[(opts && opts.level) || c.DEFAULT_LEVEL] || c.RECOMMEND[c.DEFAULT_LEVEL];
  const rows = clubs.filter(hasData).map((club, i) => {
    const r = simulate(club, aimBearingDeg, ball, targets, Object.assign({}, opts, { seed: opts && opts.seed != null ? opts.seed + i : undefined }));
    return Object.assign({ club: club.name, safe: r.p_hazard <= lv.maxHazard, score: r.p_green - lv.hazardWeight * r.p_hazard }, r);
  });
  return rows.sort((a, b) => (b.safe - a.safe) || (a.safe ? b.score - a.score : a.p_hazard - b.p_hazard));
}

/* longest first, with the carry gap to the next club and a flag */
function gapping(clubs, opts) {
  const c = cfgOf(opts), list = clubs.filter(cl => cl && cl.carry_m > 0).slice().sort((a, b) => b.carry_m - a.carry_m);
  return list.map((cl, i) => {
    const next = list[i + 1], gap = next ? cl.carry_m - next.carry_m : null;
    const flag = gap == null ? null : gap > c.GAP_MAX_M ? "gap" : gap < c.OVERLAP_MIN_M ? "overlap" : null;
    return { name: cl.name, carry_m: cl.carry_m, next: next ? next.name : null, gap_m: gap, flag };
  });
}

/* --- bag data ---------------------------------------------------------- */
function defaultClub(name, level, opts) {
  const c = cfgOf(opts), L = c.LEVELS[level] || c.LEVELS[c.DEFAULT_LEVEL], carry = L.carry[name] || 100;
  return clubFrom(name, carry, L);
}
function clubFrom(name, carry, L) {
  return { name, loft: null, carry_m: carry, depth_90_m: Math.max(4, Math.round(carry * L.depthPct)), width_90_m: Math.max(4, Math.round(carry * L.widthPct)),
    bias_lat_m: 0, miss_rate: L.missRate, source: "manual", n_shots: 0, updated_at: new Date().toISOString() };
}
/* a new bag; carries from Parkutut Caddy when given ({DRIVER: 218, ...}) */
function defaultBag(level, caddyCarries, opts) {
  const c = cfgOf(opts), lv = c.LEVELS[level] ? level : c.DEFAULT_LEVEL, L = c.LEVELS[lv];
  let clubs = c.DEFAULT_BAG.map(nm => defaultClub(nm, lv, opts));
  if (caddyCarries && typeof caddyCarries === "object") {
    const fromCaddy = Object.entries(c.CADDY_NAMES).filter(([k]) => caddyCarries[k] > 0).map(([k, nm]) => clubFrom(nm, Math.round(caddyCarries[k]), L));
    if (fromCaddy.length) clubs = fromCaddy;
  }
  return { version: 1, level: lv, conservative: false, clubs, updated_at: new Date().toISOString() };
}
/* a stored bag made safe to use: unknown fields dropped, numbers clamped */
function cleanBag(raw, opts) {
  const c = cfgOf(opts);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.clubs)) return null;
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const seen = new Set(), clubs = [];
  raw.clubs.forEach(k => {
    if (!k || typeof k.name !== "string" || seen.has(k.name) || clubs.length >= c.BAG_MAX) return; seen.add(k.name);
    clubs.push({ name: k.name, loft: k.loft == null || k.loft === "" ? null : num(k.loft, 0, 70, null), carry_m: num(k.carry_m, 0, 350, 0),
      depth_90_m: num(k.depth_90_m, 0, 150, 0), width_90_m: num(k.width_90_m, 0, 150, 0), bias_lat_m: num(k.bias_lat_m, -60, 60, 0),
      miss_rate: num(k.miss_rate, 0, c.MISS_RATE_MAX, 0), source: ["manual", "screenshot", "logged"].includes(k.source) ? k.source : "manual",
      n_shots: Math.round(num(k.n_shots, 0, 1e6, 0)), updated_at: typeof k.updated_at === "string" ? k.updated_at : null });
  });
  return { version: 1, level: c.LEVELS[raw.level] ? raw.level : c.DEFAULT_LEVEL, conservative: !!raw.conservative, clubs,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null };
}

const API = { sigmaFromNinety, ellipses, distribution, rng, sampleShots, toCourse, pointInPolygon, simulate, recommend, gapping, hasData, defaultClub, defaultBag, cleanBag, config: DEF };
if (typeof module === "object" && module.exports) module.exports = API; else root.PKBag = API;
})(typeof self !== "undefined" ? self : this);
