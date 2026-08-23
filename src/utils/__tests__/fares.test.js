import { describe, it, expect } from 'vitest';
import {
  calcTraditionalJeep,
  calcModernJeep,
  calcTricycle,
  calcBus,
  calcTaxi,
  calcTrain,
  calcMoveItAngkas,
  calculateLegFare
} from '../fares';

/**
 * Fare regression tests.
 *
 * These tests FREEZE the fare behavior that existed before the routing-engine
 * refactor. Every expected value below was derived from the original
 * implementation in src/utils/fares.js (see README fare matrix too).
 *
 * If a fare rule legitimately changes (e.g. an LTFRB fare hike), update the
 * production constant AND these tests together in a clearly-labeled commit.
 */

describe('traditional jeepney', () => {
  it('charges base fare at or below 4 km', () => {
    expect(calcTraditionalJeep(4).fare).toBe(14);
    expect(calcTraditionalJeep(2).fare).toBe(14);
    expect(calcTraditionalJeep(0).fare).toBe(14);
  });

  it('adds ₱2.00/km for excess distance beyond 4 km', () => {
    expect(calcTraditionalJeep(6).fare).toBe(18); // 14 + 2*2
    expect(calcTraditionalJeep(4.5).fare).toBe(15); // 14 + 0.5*2
  });

  it('applies 20% concessionary discount', () => {
    expect(calcTraditionalJeep(4, true).fare).toBe(11.2); // 14 * 0.8
    expect(calcTraditionalJeep(6, true).fare).toBe(14.4); // 18 * 0.8
  });

  it('formats text with two decimals and peso sign', () => {
    expect(calcTraditionalJeep(4).text).toBe('₱14.00');
  });
});

describe('modern jeepney', () => {
  it('charges base fare at or below 4 km', () => {
    expect(calcModernJeep(4).fare).toBe(17);
    expect(calcModernJeep(1).fare).toBe(17);
  });

  it('adds ₱2.40/km for excess distance beyond 4 km', () => {
    expect(calcModernJeep(9).fare).toBe(29); // 17 + 5*2.40
  });

  it('applies 20% concessionary discount', () => {
    expect(calcModernJeep(4, true).fare).toBe(13.6); // 17 * 0.8
  });
});

describe('tricycle', () => {
  const leg = { distance_km: 2 };

  it('shared mode: ₱10 base for first km + ₱2.50 per excess km', () => {
    expect(calcTricycle({ distance_km: 0.8 }, 'shared').fare).toBe(10);
    expect(calcTricycle(leg, 'shared').fare).toBe(12.5); // 10 + 1*2.50
  });

  it('special mode: uses negotiated flat_fare when present', () => {
    const flat = { distance_km: 5, flat_fare: 50 };
    const result = calcTricycle(flat, 'special');
    expect(result.fare).toBe(50);
    expect(result.text).toContain('(Special Solo)');
  });

  it('special mode without flat_fare: estimates ₱50 base + ₱15/km beyond 2 km', () => {
    expect(calcTricycle({ distance_km: 3 }, 'special').fare).toBe(65); // 50 + 1*15
    expect(calcTricycle({ distance_km: 1.5 }, 'special').fare).toBe(50); // no excess
  });

  it('defaults to shared mode when preference omitted', () => {
    expect(calcTricycle(leg).fare).toBe(12.5);
  });

  it('shared result is labeled', () => {
    expect(calcTricycle(leg, 'shared').text).toContain('(Shared)');
  });

  // Existing quirk kept intentionally: flat_fare of 0 is falsy, so the
  // distance-based estimate kicks in. Do not "fix" silently — changing this
  // alters displayed fares.
  it('treats flat_fare of 0 as absent (existing falsy-check behavior)', () => {
    expect(calcTricycle({ distance_km: 3, flat_fare: 0 }, 'special').fare).toBe(65);
  });
});

describe('bus', () => {
  it('aircon: ₱18 base for first 5 km + ₱2.98/km excess', () => {
    expect(calcBus(5, 'aircon').fare).toBe(18);
    expect(calcBus(10, 'aircon').fare).toBe(32.9); // 18 + 5*2.98
  });

  it('ordinary: ₱15 base for first 5 km + ₱2.49/km excess', () => {
    expect(calcBus(5, 'ordinary').fare).toBe(15);
    expect(calcBus(10, 'ordinary').fare).toBe(27.45); // 15 + 5*2.49
  });

  it('defaults to aircon when preference omitted', () => {
    expect(calcBus(10).fare).toBe(32.9);
  });

  it('applies 20% concessionary discount', () => {
    expect(calcBus(10, 'aircon', true).fare).toBe(26.32); // 32.9 * 0.8
  });

  it('labels the bus class in text', () => {
    expect(calcBus(10, 'aircon').text).toContain('Aircon');
    expect(calcBus(10, 'ordinary').text).toContain('Ordinary');
  });
});

describe('taxi', () => {
  it('uses ₱45 flagdown + ₱13.50/km', () => {
    expect(calcTaxi(3).fare).toBe(85.5); // 45 + 3*13.5
    expect(calcTaxi(0).fare).toBe(45);
  });

  it('never applies discounts', () => {
    // calcTaxi has no discount parameter by design; calculateLegFare must not
    // pass one either. Verified via dispatch test below.
    expect(calcTaxi(3).note).toBe('regulated but variable by traffic');
  });
});

describe('train (LRT-1)', () => {
  // raw = 16.25 boarding + 1.47/km
  it('SVC/Beep: rounds raw fare to nearest ₱1, clamped to [19, 52]', () => {
    expect(calcTrain(0, 'svc').fare).toBe(19); // raw 16.25 -> 16 -> clamp min 19
    expect(calcTrain(5, 'svc').fare).toBe(24); // raw 23.60 -> 24
    expect(calcTrain(10, 'svc').fare).toBe(31); // raw 30.95 -> 31
    expect(calcTrain(30, 'svc').fare).toBe(52); // raw 60.35 -> 60 -> clamp max 52
  });

  it('Single Journey Ticket: rounds raw fare to nearest ₱5, clamped to [20, 55]', () => {
    expect(calcTrain(0, 'sjt').fare).toBe(20); // raw 16.25 -> 15 -> clamp min 20
    expect(calcTrain(10, 'sjt').fare).toBe(30); // raw 30.95 -> 30
    expect(calcTrain(30, 'sjt').fare).toBe(55); // raw 60.35 -> 60 -> clamp max 55
  });

  it('discount applies after tier rounding/clamping', () => {
    expect(calcTrain(10, 'svc', true).fare).toBe(24.8); // 31 * 0.8
  });

  it('labels ticket type in text', () => {
    expect(calcTrain(10, 'svc').text).toContain('SVC/Beep');
    expect(calcTrain(10, 'sjt').text).toContain('Single Ticket');
  });
});

describe('motorcycle taxi (MoveIt / Angkas)', () => {
  it('returns a min/max range: min ₱50+₱10/km, max ₱80+₱15/km', () => {
    const r = calcMoveItAngkas(3);
    expect(r.minFare).toBe(80); // 50 + 3*10
    expect(r.maxFare).toBe(125); // 80 + 3*15
    expect(r.isRange).toBe(true);
    expect(r.text).toBe('₱80 - ₱125');
  });

  it('exposes minimum fare for sorting/comparison', () => {
    expect(calcMoveItAngkas(3).fare).toBe(80);
  });
});

describe('calculateLegFare dispatch', () => {
  it('walk legs are free regardless of other fields', () => {
    const walkLeg = { mode: 'walk', fare_type: null, distance_km: 2 };
    const r = calculateLegFare(walkLeg);
    expect(r.fare).toBe(0);
    expect(r.text).toBe('Free');
  });

  it('legs with null fare_type are free (existing early-return behavior)', () => {
    // Quirk frozen intentionally: fare_type === null short-circuits to Free
    // before mode dispatch, even for paid modes.
    const oddLeg = { mode: 'jeepney', fare_type: null, distance_km: 10 };
    expect(calculateLegFare(oddLeg).text).toBe('Free');
  });

  it('routes jeepney legs by fare_type: traditional vs modern', () => {
    const trad = { mode: 'jeepney', fare_type: 'traditional', distance_km: 4 };
    const mod = { mode: 'jeepney', fare_type: 'modern', distance_km: 4 };
    expect(calculateLegFare(trad).fare).toBe(14);
    expect(calculateLegFare(mod).fare).toBe(17);
  });

  it('unknown jeepney fare_types fall through to modern pricing (existing else-branch)', () => {
    const estimate = { mode: 'jeepney', fare_type: 'estimate', distance_km: 4 };
    expect(calculateLegFare(estimate).fare).toBe(17);
  });

  it('bus fare follows options.busPreference, not fare_type', () => {
    const busLeg = { mode: 'bus', fare_type: 'aircon', distance_km: 10 };
    expect(calculateLegFare(busLeg, false, { busPreference: 'aircon' }).fare).toBe(32.9);
    expect(calculateLegFare(busLeg, false, { busPreference: 'ordinary' }).fare).toBe(27.45);
  });

  it('train fare follows options.trainPreference and discount flag', () => {
    const trainLeg = { mode: 'train', fare_type: 'estimate', distance_km: 10 };
    expect(calculateLegFare(trainLeg, false, { trainPreference: 'svc' }).fare).toBe(31);
    expect(calculateLegFare(trainLeg, true, { trainPreference: 'svc' }).fare).toBe(24.8);
  });

  it('tricycle fare follows options.tricycleMode', () => {
    const trike = { mode: 'tricycle', fare_type: 'tricycle', distance_km: 2 };
    expect(calculateLegFare(trike, false, { tricycleMode: 'shared' }).fare).toBe(12.5);
    expect(calculateLegFare(trike, false, { tricycleMode: 'special' }).fare).toBe(50);
  });

  it('taxi ignores discounts entirely', () => {
    const taxiLeg = { mode: 'taxi', fare_type: 'taxi', distance_km: 3 };
    expect(calculateLegFare(taxiLeg, true).fare).toBe(85.5);
  });

  it('moto_taxi returns a range with min used as sorting fare', () => {
    const moto = { mode: 'moto_taxi', fare_type: 'estimate', distance_km: 3 };
    const r = calculateLegFare(moto);
    expect(r.isRange).toBe(true);
    expect(r.minFare).toBe(80);
    expect(r.fare).toBe(80);
  });

  it('unsupported modes fall back to Free (existing default branch)', () => {
    const unknown = { mode: 'helicopter', fare_type: 'estimate', distance_km: 10 };
    expect(calculateLegFare(unknown).text).toBe('Free');
  });
});
