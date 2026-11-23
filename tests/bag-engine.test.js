// Run: node --test tests/   (Node 18+, no packages needed)
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../bag-engine.js");
const C = require("../bag-config.js");

const club = (o) => Object.assign({ name: "7i", carry_m: 140, depth_90_m: 20, width_90_m: 30, bias_lat_m: 0, miss_rate: 0 }, o);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} not within ${tol} of ${b}`);
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

test("sigma conversion uses k = sqrt(-2 ln 0.10)", () => {
  near(C.K90, 2.146, 0.001, "k");
  near(B.sigmaFromNinety(21.46), 10, 0.01, "sigma");
  const d = B.distribution(club());
  near(d.good.sdDist, 10 / C.K90, 1e-9, "depth sigma");
  near(d.good.sdLat, 15 / C.K90, 1e-9, "width sigma");
});

test("about 90% of good shots land inside the 90% ellipse", () => {
  [club(), club({ bias_lat_m: -8, width_90_m: 50, depth_90_m: 12 })].forEach((k, j) => {
    const e = B.ellipses(k).good, s = B.sampleShots(k, 40000, { seed: 7 + j });
    const inside = s.filter(p => ((p.lat - e.lat) / e.rx) ** 2 + ((p.dist - e.dist) / e.ry) ** 2 <= 1).length / s.length;
    near(inside, 0.90, 0.02, "share inside");
  });
});

test("mixture: miss share, miss carry and miss spread follow the config", () => {
  const k = club({ miss_rate: 0.25, bias_lat_m: 5 }), s = B.sampleShots(k, 40000, { seed: 3 });
  const miss = s.filter(p => p.miss), good = s.filter(p => !p.miss);
  near(miss.length / s.length, 0.25, 0.01, "miss share");
  near(mean(miss.map(p => p.dist)), 140 * C.MISS_CARRY_FACTOR, 1, "miss carry");
  near(mean(miss.map(p => p.lat)), 5, 0.5, "miss keeps the bias");
  near(sd(miss.map(p => p.dist)) / sd(good.map(p => p.dist)), C.MISS_SIGMA_FACTOR, 0.1, "miss spread");
  assert.equal(B.sampleShots(club({ miss_rate: 0.9 }), 1, {}).length, 1);
  near(B.distribution(club({ miss_rate: 0.9 })).miss.w, C.MISS_RATE_MAX, 1e-9, "miss rate is capped");
});

test("rotation by aim bearing and ball position", () => {
  const ball = { x: 10, y: 20 }, r = (s, a) => { const p = B.toCourse(s, a, ball); return [+p.x.toFixed(6), +p.y.toFixed(6)]; };
  assert.deepEqual(r({ lat: 0, dist: 100 }, 0), [10, 120]);    // straight up the hole
  assert.deepEqual(r({ lat: 0, dist: 100 }, 90), [110, 20]);   // aimed east
  assert.deepEqual(r({ lat: 10, dist: 0 }, 90), [10, 10]);     // right of an east aim is south
  assert.deepEqual(r({ lat: 0, dist: 100 }, 180), [10, -80]);
  const p = B.toCourse({ lat: 0, dist: 100 }, 45, { x: 0, y: 0 });
  near(p.x, 70.7107, 1e-3, "x at 45"); near(p.y, 70.7107, 1e-3, "y at 45");
});

test("point in polygon", () => {
  const sq = box(0, 0, 10, 10);
  assert.equal(B.pointInPolygon({ x: 5, y: 5 }, sq), true);
  assert.equal(B.pointInPolygon({ x: 15, y: 5 }, sq), false);
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];   // concave
  assert.equal(B.pointInPolygon({ x: 7, y: 7 }, L), false);
  assert.equal(B.pointInPolygon({ x: 2, y: 7 }, L), true);
});

test("simulate: shares add up and follow the aim", () => {
  const k = club(), green = [box(-20, 125, 20, 155)], hazard = [box(-60, 160, 60, 200)];
  const r = B.simulate(k, 0, { x: 0, y: 0 }, { green, hazard }, { seed: 1 });
  near(r.p_green + r.p_hazard + r.p_other, 1, 1e-9, "sum");
  assert.ok(r.p_green > 0.85, "most good shots hit a green sized to the ellipse");
  const off = B.simulate(k, 90, { x: 0, y: 0 }, { green, hazard }, { seed: 1 });
  assert.equal(off.p_green, 0, "aimed 90 degrees away: no green");
  const big = B.simulate(k, 0, { x: 0, y: 0 }, { green, hazard }, { seed: 1, conservative: true });
  assert.ok(big.p_green < r.p_green, "mode konservatif lowers the green chance");
});

test("recommend: best green chance among the safe clubs", () => {
  const clubs = [club({ name: "5i", carry_m: 165 }), club({ name: "7i", carry_m: 140 }), club({ name: "9i", carry_m: 115 }), { name: "LW", carry_m: 0 }];
  const t = { green: [box(-15, 128, 15, 152)], hazard: [box(-60, 160, 60, 200)] };   // water just behind the green
  const r = B.recommend(clubs, 0, { x: 0, y: 0 }, t, { level: "90", seed: 5 });
  assert.equal(r.length, 3, "clubs without data are skipped");
  assert.equal(r[0].club, "7i");
  assert.equal(r[r.length - 1].club, "5i", "the club that flies into the water comes last");
  assert.equal(r[r.length - 1].safe, false);
});

test("recommend: higher handicaps avoid the hazard sooner", () => {
  // Green behind water. The long club reaches the green more often but also finds more water.
  const t = { green: [box(-15, 150, 15, 175)], hazard: [box(-60, 120, 60, 150)] };
  // 6i at the pin: about 80% green, 14% water. 4H long: about 30% green, almost no water.
  const clubs = [club({ name: "6i", carry_m: 160, depth_90_m: 40, width_90_m: 24 }), club({ name: "4H", carry_m: 180, depth_90_m: 40, width_90_m: 24 })];
  const lo = B.recommend(clubs, 0, { x: 0, y: 0 }, t, { level: "80", seed: 9 });
  const hi = B.recommend(clubs, 0, { x: 0, y: 0 }, t, { level: "100", seed: 9 });
  assert.equal(lo[0].club, "6i", "level 80 accepts 14% water for the green");
  assert.equal(hi[0].club, "4H", "level 100 takes the club that carries the water");
});

test("gapping flags gaps over 15 m and overlaps under 5 m, skips clubs without data", () => {
  const g = B.gapping([{ name: "5i", carry_m: 177 }, { name: "Dr", carry_m: 200 }, { name: "4H", carry_m: 180 }, { name: "6i", carry_m: 165 }, { name: "LW", carry_m: 0 }, { name: "SW" }]);
  assert.deepEqual(g.map(r => r.name), ["Dr", "4H", "5i", "6i"]);
  assert.deepEqual(g.map(r => r.flag), ["gap", "overlap", null, null]);
  assert.deepEqual(g.map(r => r.gap_m), [20, 3, 12, null]);
  assert.equal(B.gapping([{ name: "a", carry_m: 100 }, { name: "b", carry_m: 85 }])[0].flag, null, "exactly 15 m is fine");
  assert.equal(B.gapping([{ name: "a", carry_m: 100 }, { name: "b", carry_m: 95 }])[0].flag, null, "exactly 5 m is fine");
  assert.equal(B.gapping([{ name: "a", carry_m: 100 }, { name: "b", carry_m: 80 }], { cfg: { GAP_MAX_M: 25 } })[0].flag, null, "threshold is configurable");
});

test("default bag, Caddy seed, and cleaning stored data", () => {
  const d = B.defaultBag("90");
  assert.equal(d.clubs.length, 13); assert.equal(d.level, "90");
  assert.equal(d.clubs[0].name, "Dr"); assert.equal(d.clubs[0].carry_m, C.LEVELS["90"].carry.Dr);
  const s = B.defaultBag("100", { DRIVER: 210, "7 IRON": 135, GW: 88 });
  assert.deepEqual(s.clubs.map(k => [k.name, k.carry_m]), [["Dr", 210], ["7i", 135], ["AW", 88]]);
  const c = B.cleanBag({ level: "zz", clubs: [{ name: "Dr", carry_m: "999", miss_rate: 2, source: "x", evil: 1 }, { name: "Dr" }, 5] });
  assert.equal(c.level, C.DEFAULT_LEVEL); assert.equal(c.clubs.length, 1);
  assert.equal(c.clubs[0].carry_m, 350); assert.equal(c.clubs[0].miss_rate, C.MISS_RATE_MAX); assert.equal(c.clubs[0].source, "manual");
  assert.equal("evil" in c.clubs[0], false);
  assert.equal(B.cleanBag(null), null);
});

test("mode konservatif inflates both ellipses by the factor", () => {
  const a = B.ellipses(club()), b = B.ellipses(club(), { conservative: true });
  near(b.good.rx / a.good.rx, C.CONSERVATIVE_FACTOR, 1e-9, "good");
  near(b.miss.ry / a.miss.ry, C.CONSERVATIVE_FACTOR, 1e-9, "miss");
});
