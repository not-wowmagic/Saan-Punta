/**
 * Fare calculation utilities for Saan Punta (reflecting current rates and guidelines)
 */

/**
 * Calculates traditional jeepney fare.
 * Formula: ₱14.00 for the first 4km, ₱2.00 per km thereafter.
 * 20% discount applies to student/senior/PWD.
 */
export function calcTraditionalJeep(distanceKm, isDiscounted = false) {
  const baseFare = 14.00;
  const baseKm = 4.0;
  const excessRate = 2.00;
  
  let fare = baseFare;
  if (distanceKm > baseKm) {
    const excess = distanceKm - baseKm;
    fare += excess * excessRate;
  }
  
  if (isDiscounted) {
    fare = fare * 0.8; // 20% discount
  }
  
  return {
    fare: Math.round(fare * 100) / 100, // round to 2 decimal places
    isRange: false,
    text: `₱${(Math.round(fare * 100) / 100).toFixed(2)}`
  };
}

/**
 * Calculates modern jeepney fare.
 * Formula: ₱17.00 for the first 4km, ₱2.40 per km thereafter.
 * 20% discount applies to student/senior/PWD.
 */
export function calcModernJeep(distanceKm, isDiscounted = false) {
  const baseFare = 17.00;
  const baseKm = 4.0;
  const excessRate = 2.40;
  
  let fare = baseFare;
  if (distanceKm > baseKm) {
    const excess = distanceKm - baseKm;
    fare += excess * excessRate;
  }
  
  if (isDiscounted) {
    fare = fare * 0.8; // 20% discount
  }
  
  return {
    fare: Math.round(fare * 100) / 100,
    isRange: false,
    text: `₱${(Math.round(fare * 100) / 100).toFixed(2)}`
  };
}

/**
 * Calculates tricycle fare.
 * Tricycles have both:
 * 1. Shared / Regular: ₱10.00 base for first km + ₱2.50 per excess km.
 * 2. Special / Solo: Negotiated flat fare from leg data, or estimated based on distance (base ₱50.00 + ₱15.00/km excess of 2km).
 */
export function calcTricycle(leg, tricycleMode = 'shared') {
  if (tricycleMode === 'special') {
    const fare = leg.flat_fare || (50.00 + Math.max(0, leg.distance_km - 2) * 15.00);
    return {
      fare: fare,
      isRange: false,
      text: `₱${fare.toFixed(2)} (Special Solo)`,
      note: "negotiated flat rate"
    };
  } else {
    // Shared / Regular passenger rate
    const baseFare = 10.00;
    const baseKm = 1.0;
    const excessRate = 2.50;
    let fare = baseFare;
    if (leg.distance_km > baseKm) {
      fare += (leg.distance_km - baseKm) * excessRate;
    }
    return {
      fare: Math.round(fare * 100) / 100,
      isRange: false,
      text: `₱${(Math.round(fare * 100) / 100).toFixed(2)} (Shared)`,
      note: "shared passenger rate"
    };
  }
}

/**
 * Calculates bus fare.
 * 1. Ordinary Bus: ₱15.00 base for first 5km + ₱2.49/km thereafter.
 * 2. Air-conditioned Bus: ₱18.00 base for first 5km + ₱2.98/km thereafter.
 * 20% discount applies to student/senior/PWD.
 */
export function calcBus(distanceKm, busPreference = 'aircon', isDiscounted = false) {
  let baseFare = 18.00;
  let excessRate = 2.98;
  const baseKm = 5.0;

  if (busPreference === 'ordinary') {
    baseFare = 15.00;
    excessRate = 2.49;
  }

  let fare = baseFare;
  if (distanceKm > baseKm) {
    fare += (distanceKm - baseKm) * excessRate;
  }

  if (isDiscounted) {
    fare = fare * 0.8;
  }

  return {
    fare: Math.round(fare * 100) / 100,
    isRange: false,
    text: `₱${(Math.round(fare * 100) / 100).toFixed(2)} (${busPreference === 'aircon' ? 'Aircon' : 'Ordinary'})`
  };
}

/**
 * Calculates taxi fare.
 * Formula: ₱45 flagdown rate + ₱13.50 per km.
 * No discounts apply. Flagged as "regulated but variable by traffic".
 */
export function calcTaxi(distanceKm) {
  const flagdown = 45.00;
  const ratePerKm = 13.50;
  
  const fare = flagdown + (distanceKm * ratePerKm);
  
  return {
    fare: Math.round(fare * 100) / 100,
    isRange: false,
    text: `₱${(Math.round(fare * 100) / 100).toFixed(2)}`,
    note: "regulated but variable by traffic"
  };
}

/**
 * Calculates train fare (LRT-1).
 * Boarding fee: ₱16.25, Distance rate: ₱1.47/km.
 * SVC (Beep): Boarding + (Dist * 1.47) rounded to nearest ₱1. Min 19, Max 52.
 * SJT (Single Ticket): Boarding + (Dist * 1.47) rounded to nearest ₱5. Min 20, Max 55.
 * 20% discount applies to student/senior/PWD on the computed ticket rate.
 */
export function calcTrain(distanceKm, trainPreference = 'svc', isDiscounted = false) {
  const boardingFee = 16.25;
  const distanceRate = 1.47;
  const rawFare = boardingFee + (distanceKm * distanceRate);
  
  let fare = rawFare;
  if (trainPreference === 'sjt') {
    // Round to nearest 5 pesos
    fare = Math.round(rawFare / 5) * 5;
    if (fare < 20) fare = 20;
    if (fare > 55) fare = 55;
  } else {
    // SVC: Round to nearest 1 peso
    fare = Math.round(rawFare);
    if (fare < 19) fare = 19;
    if (fare > 52) fare = 52;
  }
  
  if (isDiscounted) {
    fare = fare * 0.8;
  }
  
  return {
    fare: Math.round(fare * 100) / 100,
    isRange: false,
    text: `₱${(Math.round(fare * 100) / 100).toFixed(2)} (${trainPreference === 'sjt' ? 'Single Ticket' : 'SVC/Beep'})`
  };
}

/**
 * Calculates MoveIt/Angkas fare (motorcycle taxi).
 * Surge pricing means there is no fixed formula, and showing a single number is misleading.
 * We calculate and store ONLY as a wide estimate range (min-max).
 * No discounts apply. Labeled as "rough estimate, not sourced from any official rate".
 */
export function calcMoveItAngkas(distanceKm) {
  const minFare = 50 + (distanceKm * 10);
  const maxFare = 80 + (distanceKm * 15);
  
  const roundedMin = Math.round(minFare);
  const roundedMax = Math.round(maxFare);
  
  return {
    minFare: roundedMin,
    maxFare: roundedMax,
    fare: roundedMin, // use minimum for sorting/comparison purposes
    isRange: true,
    text: `₱${roundedMin} - ₱${roundedMax}`,
    note: "rough estimate, not sourced from any official rate"
  };
}

/**
 * Main calculator that routes to the specific mode.
 */
export function calculateLegFare(leg, isDiscounted = false, options = {}) {
  const {
    tricycleMode = 'shared',
    busPreference = 'aircon',
    trainPreference = 'svc'
  } = options;

  if (leg.mode === "walk" || leg.fare_type === null) {
    return { fare: 0, isRange: false, text: "Free" };
  }
  
  switch (leg.mode) {
    case "jeepney":
      if (leg.fare_type === "traditional") {
        return calcTraditionalJeep(leg.distance_km, isDiscounted);
      } else {
        return calcModernJeep(leg.distance_km, isDiscounted);
      }
    case "tricycle":
      return calcTricycle(leg, tricycleMode);
    case "bus":
      return calcBus(leg.distance_km, busPreference, isDiscounted);
    case "taxi":
      return calcTaxi(leg.distance_km);
    case "train":
      return calcTrain(leg.distance_km, trainPreference, isDiscounted);
    case "moto_taxi":
      return calcMoveItAngkas(leg.distance_km);
    default:
      return { fare: 0, isRange: false, text: "Free" };
  }
}
