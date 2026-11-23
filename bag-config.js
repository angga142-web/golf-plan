/* Parkutut club bag: every tunable number in one place.
   Values marked GUESS are not measured; change them freely as real shot data comes in. Loads in the browser (window.PKBagConfig)
   and in Node (require) so the engine tests use the same numbers. */
(function (root) {
const CONFIG = {
  // 90% ellipse -> sigma: a 2D normal puts 90% of shots inside the ellipse at k sigma, k = sqrt(-2 ln 0.10) = 2.146
  K90: Math.sqrt(-2 * Math.log(0.10)),

  // Mode konservatif: draw and simulate every ellipse this much bigger. GUESS.
  CONSERVATIVE_FACTOR: 1.25,

  // Mishit part of the shot mixture. GUESS (real data: about 15% mishits on a 6-iron for a mid handicapper).
  MISS_CARRY_FACTOR: 0.7,   // a mishit carries 70% of a good shot
  MISS_SIGMA_FACTOR: 2.0,   // and spreads twice as wide and deep
  MISS_RATE_MAX: 0.4,

  // Gapping view flags
  GAP_MAX_M: 15,            // a carry gap above this between neighbouring clubs is a hole in the bag
  OVERLAP_MIN_M: 5,         // a gap below this means two clubs do the same job

  // recommend(): highest chance of the green while the hazard chance stays under the limit.
  // Higher handicaps get a stricter limit and a bigger penalty per percent of hazard. GUESS.
  RECOMMEND: {
    pemula: { maxHazard: 0.10, hazardWeight: 3.0 },
    "100":  { maxHazard: 0.10, hazardWeight: 3.0 },
    "90":   { maxHazard: 0.15, hazardWeight: 2.0 },
    "80":   { maxHazard: 0.20, hazardWeight: 1.0 }
  },
  SIM_SHOTS: 2000,

  // Clubs a bag can hold, longest first, and the 13 club bag a new player starts with
  CLUB_NAMES: ["Dr", "3W", "5W", "7W", "3H", "4H", "5H", "3i", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "AW", "SW", "LW"],
  DEFAULT_BAG: ["Dr", "3W", "5W", "4H", "5i", "6i", "7i", "8i", "9i", "PW", "AW", "SW", "LW"],
  BAG_MAX: 14,
  BAG_MIN: 9,

  // Starting values per skill level: carry in metres per club; 90% depth and width as a share of carry; mishit rate. GUESS, tune freely.
  LEVELS: {
    pemula: { label: "Pemula", depthPct: 0.20, widthPct: 0.30, missRate: 0.30,
      carry: { Dr: 160, "3W": 145, "5W": 135, "7W": 125, "3H": 135, "4H": 128, "5H": 120, "3i": 130, "4i": 125, "5i": 118, "6i": 110, "7i": 102, "8i": 94, "9i": 85, PW: 75, AW: 65, SW: 55, LW: 45 } },
    "100":  { label: "Skor 100", depthPct: 0.16, widthPct: 0.25, missRate: 0.22,
      carry: { Dr: 180, "3W": 163, "5W": 152, "7W": 142, "3H": 152, "4H": 145, "5H": 137, "3i": 147, "4i": 141, "5i": 134, "6i": 126, "7i": 117, "8i": 107, "9i": 97, PW: 86, AW: 75, SW: 63, LW: 50 } },
    "90":   { label: "Skor 90", depthPct: 0.13, widthPct: 0.20, missRate: 0.15,
      carry: { Dr: 200, "3W": 182, "5W": 170, "7W": 159, "3H": 170, "4H": 162, "5H": 153, "3i": 165, "4i": 158, "5i": 150, "6i": 141, "7i": 131, "8i": 120, "9i": 109, PW: 97, AW: 85, SW: 72, LW: 58 } },
    "80":   { label: "Skor 80", depthPct: 0.10, widthPct: 0.15, missRate: 0.08,
      carry: { Dr: 220, "3W": 200, "5W": 187, "7W": 175, "3H": 187, "4H": 178, "5H": 168, "3i": 182, "4i": 174, "5i": 165, "6i": 155, "7i": 144, "8i": 132, "9i": 120, PW: 107, AW: 94, SW: 80, LW: 65 } }
  },
  LEVEL_ORDER: ["pemula", "100", "90", "80"],   // object keys "80"/"90"/"100" would otherwise sort as numbers
  DEFAULT_LEVEL: "100",

  // Parkutut Caddy's saved carries (caddy-clubs-v1) seed a new bag. Caddy name -> bag name.
  CADDY_NAMES: { DRIVER: "Dr", WOOD: "3W", "WOOD 2": "5W", "4 IRON": "4i", "5 IRON": "5i", "6 IRON": "6i", "7 IRON": "7i", "8 IRON": "8i", "9 IRON": "9i", PW: "PW", GW: "AW", SW: "SW", LW: "LW" }
};
if (typeof module === "object" && module.exports) module.exports = CONFIG; else root.PKBagConfig = CONFIG;
})(typeof self !== "undefined" ? self : this);
