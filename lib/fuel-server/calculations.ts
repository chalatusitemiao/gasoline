import "server-only";

import Decimal from "decimal.js";
import { asc, inArray, sql } from "drizzle-orm";
import { fuelRecords } from "@/lib/db/fuel-schema";
import type { FuelAnomaly } from "@/lib/fuel";
import type { FuelTx } from "./shared";

export const FuelDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function manualAmounts(liters: string, unitPrice: string, odometer: string) {
  const volume = new FuelDecimal(liters);
  const price = new FuelDecimal(unitPrice);
  return {
    liters: volume.toFixed(3),
    unitPrice: price.toFixed(6),
    amount: volume.times(price).toFixed(2),
    odometer: new FuelDecimal(odometer).toFixed(2),
  };
}

type DerivedRecord = {
  id: string;
  distance: string | null;
  consumption: string | null;
  baseline: string | null;
  anomalyReason: FuelAnomaly | null;
};

export async function recalculateVehicles(
  tx: FuelTx,
  vehicleIds: string[],
  { baselineSamples, anomalyMultiplier }: { baselineSamples: number; anomalyMultiplier: number },
) {
  const records = await tx.select({
    id: fuelRecords.id,
    vehicleId: fuelRecords.vehicleId,
    liters: fuelRecords.liters,
    odometer: fuelRecords.odometer,
    distance: fuelRecords.distance,
    consumption: fuelRecords.consumption,
    baseline: fuelRecords.baseline,
    isAnomaly: fuelRecords.isAnomaly,
    anomalyReason: fuelRecords.anomalyReason,
  }).from(fuelRecords)
    .where(inArray(fuelRecords.vehicleId, vehicleIds))
    .orderBy(asc(fuelRecords.vehicleId), asc(fuelRecords.date), asc(fuelRecords.sequence));

  const history: Decimal[] = [];
  let previous: Decimal | undefined;
  let previousVehicleId: string | undefined;
  const updates: DerivedRecord[] = [];

  for (const record of records) {
    if (previousVehicleId !== record.vehicleId) {
      history.length = 0;
      previous = undefined;
      previousVehicleId = record.vehicleId;
    }

    const odometer = new FuelDecimal(record.odometer);
    const delta = previous === undefined ? null : odometer.minus(previous);
    previous = odometer;

    const distance = delta?.toFixed(2) ?? null;
    let consumption: string | null = null;
    let baseline: string | null = null;
    let anomalyReason: FuelAnomaly | null = null;

    if (delta?.lte(0)) {
      anomalyReason = "odometer_not_increased";
    } else if (delta) {
      const rate = new FuelDecimal(record.liters).times(100).div(delta);
      consumption = rate.toFixed(6);

      if (history.length >= 2) {
        const average = FuelDecimal.sum(...history).div(history.length);
        baseline = average.toFixed(6);
        if (rate.gt(average.times(anomalyMultiplier))) anomalyReason = "consumption_high";
      }

      if (!anomalyReason) {
        history.push(rate);
        if (history.length > baselineSamples) history.shift();
      }
    }

    if (
      record.distance !== distance || record.consumption !== consumption ||
      record.baseline !== baseline || record.anomalyReason !== anomalyReason ||
      record.isAnomaly !== (anomalyReason !== null)
    ) {
      updates.push({ id: record.id, distance, consumption, baseline, anomalyReason });
    }
  }

  for (let i = 0; i < updates.length; i += 250) {
    const batch = updates.slice(i, i + 250);
    const rows = batch.map(({ id, distance, consumption, baseline, anomalyReason }) => sql`
      (${id}::uuid, ${distance}::numeric, ${consumption}::numeric, ${baseline}::numeric, ${anomalyReason}::text)
    `);
    await tx.execute(sql`
      update ${fuelRecords} as target
      set distance = calculated.distance,
          consumption = calculated.consumption,
          baseline = calculated.baseline,
          anomaly_reason = calculated.anomaly_reason,
          is_anomaly = calculated.anomaly_reason is not null
      from (values ${sql.join(rows, sql`, `)}) as calculated(id, distance, consumption, baseline, anomaly_reason)
      where target.id = calculated.id
    `);
  }
}
