import {
  propagate,
  twoline2satrec,
  type SatRec,
} from "satellite.js";
import { Cartesian3, JulianDate } from "cesium";

const TWO_PI = Math.PI * 2;
const KM_TO_M = 1000;
const ORBIT_SAMPLES = 180;

export type PropagatedSat = {
  id: string;
  noradId: number;
  name: string;
  satrec: SatRec;
  periodMinutes: number;
};

export function parseSatellite(
  id: string,
  noradId: number,
  name: string,
  tleLine1: string,
  tleLine2: string,
): PropagatedSat | null {
  try {
    const satrec = twoline2satrec(tleLine1, tleLine2);
    if (
      satrec.error !== 0 ||
      !Number.isFinite(satrec.no) ||
      satrec.no <= 0
    ) {
      return null;
    }

    const periodMinutes = TWO_PI / satrec.no;
    if (!Number.isFinite(periodMinutes) || periodMinutes <= 0) {
      return null;
    }

    return { id, noradId, name, satrec, periodMinutes };
  } catch {
    return null;
  }
}

function julianToDate(time: JulianDate): Date {
  return JulianDate.toDate(time);
}

function positionEciAt(
  satrec: SatRec,
  time: JulianDate,
): { x: number; y: number; z: number } | null {
  const date = julianToDate(time);
  const pv = propagate(satrec, date);
  const positionEci = pv.position;
  if (!positionEci || typeof positionEci === "boolean") {
    return null;
  }

  if (
    !Number.isFinite(positionEci.x) ||
    !Number.isFinite(positionEci.y) ||
    !Number.isFinite(positionEci.z)
  ) {
    return null;
  }

  return positionEci;
}

/**
 * Sample an inertial SGP4 trajectory only over [start, stop].
 * One step of padding on each side keeps Cesium Lagrange interpolation stable
 * at interval boundaries without preloading the full simulation span.
 */
export function sampleInertialOrbitRange(
  sat: PropagatedSat,
  start: JulianDate,
  stop: JulianDate,
  samplesPerRevolution = ORBIT_SAMPLES,
): { times: JulianDate[]; positions: Cartesian3[] } {
  const spanSeconds = JulianDate.secondsDifference(stop, start);
  if (!(spanSeconds > 0)) {
    return { times: [], positions: [] };
  }

  const periodSeconds = sat.periodMinutes * 60;
  const stepSeconds = periodSeconds / samplesPerRevolution;
  const sampleStart = JulianDate.addSeconds(
    start,
    -stepSeconds,
    new JulianDate(),
  );
  const sampleStop = JulianDate.addSeconds(
    stop,
    stepSeconds,
    new JulianDate(),
  );
  const totalSeconds = JulianDate.secondsDifference(sampleStop, sampleStart);
  const steps = Math.max(1, Math.ceil(totalSeconds / stepSeconds));

  const times: JulianDate[] = [];
  const positions: Cartesian3[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = JulianDate.addSeconds(
      sampleStart,
      stepSeconds * i,
      new JulianDate(),
    );
    const positionEci = positionEciAt(sat.satrec, t);
    if (positionEci) {
      times.push(t);
      positions.push(
        new Cartesian3(
          positionEci.x * KM_TO_M,
          positionEci.y * KM_TO_M,
          positionEci.z * KM_TO_M,
        ),
      );
    }
  }

  return { times, positions };
}
