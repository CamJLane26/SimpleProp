import { useEffect, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  ClockRange,
  Color,
  CompositePositionProperty,
  CompositeProperty,
  ConstantProperty,
  Ion,
  JulianDate,
  LabelStyle,
  LagrangePolynomialApproximation,
  ReferenceFrame,
  SampledPositionProperty,
  Terrain,
  TimeInterval,
  Viewer,
  type Entity,
  type InterpolationAlgorithm,
  type PositionProperty,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Satellite } from "../types";
import {
  parseSatellite,
  sampleInertialOrbitRange,
  type PropagatedSat,
} from "../lib/sgp4";
import {
  createForConeGraphics,
  createPositionHolder,
  forConeColor,
  forConeOutlineColor,
} from "../lib/sensorCone";
import {
  RESAMPLE_MARGIN_MINUTES,
  SAMPLE_HALF_MINUTES,
  SIM_HALF_MINUTES,
} from "../lib/timeConfig";

type Props = {
  satellites: Satellite[];
  visibleIds: Set<number>;
  forVisibleIds: Set<number>;
  playing: boolean;
  /** Signed Cesium clock multiplier: positive forward, negative reverse. */
  playbackMultiplier: number;
  /** Minutes relative to session epoch; applied only when scrubNonce changes. */
  scrubOffsetMinutes: number;
  scrubNonce: number;
  resetToNowNonce: number;
  onClockLabel: (iso: string) => void;
  onOffsetFromClock: (offsetMinutes: number) => void;
  onPlaybackEnd: () => void;
};

type PositionHolder = {
  current: PositionProperty | undefined;
};

type EntityBundle = {
  satellite: Satellite;
  entity: Entity;
  forEntity: Entity;
  positionHolder: PositionHolder;
};

type ParsedTle = {
  epoch: JulianDate;
  propagated: PropagatedSat;
};

function isIss(noradId: number): boolean {
  return noradId === 25544;
}

type PositionHistory = {
  property: CompositePositionProperty;
  leadTime: CompositeProperty;
  trailTime: CompositeProperty;
  resolution: CompositeProperty;
};

function parseTleHistory(satellite: Satellite): ParsedTle[] {
  return satellite.tles
    .map((tle) => {
      const epochDate = new Date(tle.epoch);
      const propagated = parseSatellite(
        tle.id,
        satellite.noradId,
        satellite.name,
        tle.tleLine1,
        tle.tleLine2,
      );
      if (!propagated || Number.isNaN(epochDate.getTime())) return null;
      return {
        epoch: JulianDate.fromDate(epochDate),
        propagated,
      };
    })
    .filter((entry): entry is ParsedTle => entry !== null)
    .sort((a, b) => JulianDate.compare(a.epoch, b.epoch));
}

/** Index of the TLE active at `time` (latest epoch ≤ time, else earliest). */
function activeTleIndex(parsed: ParsedTle[], time: JulianDate): number {
  let index = 0;
  for (let i = 0; i < parsed.length; i++) {
    if (JulianDate.compare(parsed[i].epoch, time) <= 0) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

function createSampledProperty(
  sat: PropagatedSat,
  start: JulianDate,
  stop: JulianDate,
): SampledPositionProperty {
  const { times, positions } = sampleInertialOrbitRange(sat, start, stop);
  const property = new SampledPositionProperty(ReferenceFrame.INERTIAL);
  property.setInterpolationOptions({
    interpolationAlgorithm:
      LagrangePolynomialApproximation as unknown as InterpolationAlgorithm,
    interpolationDegree: 5,
  });
  if (times.length > 0) {
    property.addSamples(times, positions);
  }
  return property;
}

/**
 * Build Cesium position/path properties for only the TLEs that overlap the
 * local sample window around `center` — not the full simulation span.
 */
function createPositionHistory(
  satellite: Satellite,
  center: JulianDate,
): PositionHistory | null {
  const parsed = parseTleHistory(satellite);
  if (parsed.length === 0) return null;

  const maxPeriodMinutes = Math.max(
    ...parsed.map((entry) => entry.propagated.periodMinutes),
  );
  const halfSpanMinutes = SAMPLE_HALF_MINUTES + maxPeriodMinutes / 2;
  const overallStart = JulianDate.addMinutes(
    center,
    -halfSpanMinutes,
    new JulianDate(),
  );
  const overallStop = JulianDate.addMinutes(
    center,
    halfSpanMinutes,
    new JulianDate(),
  );

  const startIdx = activeTleIndex(parsed, overallStart);
  const property = new CompositePositionProperty(ReferenceFrame.INERTIAL);
  const leadTime = new CompositeProperty();
  const trailTime = new CompositeProperty();
  const resolution = new CompositeProperty();

  for (let i = startIdx; i < parsed.length; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];

    if (
      i > startIdx &&
      JulianDate.compare(current.epoch, overallStop) >= 0
    ) {
      break;
    }

    const start =
      i === startIdx ? overallStart : current.epoch;
    const stop =
      next && JulianDate.compare(next.epoch, overallStop) < 0
        ? next.epoch
        : overallStop;

    if (JulianDate.compare(start, stop) >= 0) continue;

    const sampled = createSampledProperty(
      current.propagated,
      start,
      stop,
    );
    const isStopIncluded = !next || JulianDate.equals(stop, overallStop);
    const periodSeconds = current.propagated.periodMinutes * 60;
    const interval = {
      start,
      stop,
      isStartIncluded: true,
      // At an exact TLE epoch, the next (newer) interval owns the value.
      isStopIncluded,
    };

    property.intervals.addInterval(
      new TimeInterval({ ...interval, data: sampled }),
    );
    leadTime.intervals.addInterval(
      new TimeInterval({
        ...interval,
        data: new ConstantProperty(periodSeconds / 2),
      }),
    );
    trailTime.intervals.addInterval(
      new TimeInterval({
        ...interval,
        data: new ConstantProperty(periodSeconds / 2),
      }),
    );
    resolution.intervals.addInterval(
      new TimeInterval({
        ...interval,
        data: new ConstantProperty(Math.max(10, periodSeconds / 180)),
      }),
    );
  }

  return { property, leadTime, trailTime, resolution };
}

function minutesFromCenter(
  time: JulianDate,
  center: JulianDate,
): number {
  return Math.abs(JulianDate.secondsDifference(time, center) / 60);
}

export function Globe({
  satellites,
  visibleIds,
  forVisibleIds,
  playing,
  playbackMultiplier,
  scrubOffsetMinutes,
  scrubNonce,
  resetToNowNonce,
  onClockLabel,
  onOffsetFromClock,
  onPlaybackEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const bundlesRef = useRef<Map<number, EntityBundle>>(new Map());
  const epochRef = useRef<JulianDate>(JulianDate.now());
  const sampleCenterRef = useRef<JulianDate | null>(null);
  const visibleRef = useRef(visibleIds);
  const forVisibleRef = useRef(forVisibleIds);
  const callbacksRef = useRef({
    onClockLabel,
    onOffsetFromClock,
    onPlaybackEnd,
  });

  const applyPositionHistory = (
    bundle: EntityBundle,
    center: JulianDate,
  ) => {
    const history = createPositionHistory(bundle.satellite, center);
    if (!history) return;
    bundle.entity.position = history.property;
    bundle.positionHolder.current = history.property;
    if (bundle.entity.path) {
      bundle.entity.path.leadTime = history.leadTime;
      bundle.entity.path.trailTime = history.trailTime;
      bundle.entity.path.resolution = history.resolution;
    }
  };

  const resamplePositions = (center: JulianDate) => {
    for (const bundle of bundlesRef.current.values()) {
      applyPositionHistory(bundle, center);
    }
    sampleCenterRef.current = JulianDate.clone(center);
  };

  const needsResample = (time: JulianDate): boolean => {
    const sampleCenter = sampleCenterRef.current;
    if (!sampleCenter) return true;
    return (
      minutesFromCenter(time, sampleCenter) >
      SAMPLE_HALF_MINUTES - RESAMPLE_MARGIN_MINUTES
    );
  };

  const sampleApiRef = useRef({ needsResample, resamplePositions });
  visibleRef.current = visibleIds;
  forVisibleRef.current = forVisibleIds;
  callbacksRef.current = {
    onClockLabel,
    onOffsetFromClock,
    onPlaybackEnd,
  };
  sampleApiRef.current = { needsResample, resamplePositions };

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (token) {
      Ion.defaultAccessToken = token;
    }

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
      terrain: token ? Terrain.fromWorldTerrain() : undefined,
    });

    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = 1;
    viewer.clock.clockRange = ClockRange.CLAMPED;
    epochRef.current = JulianDate.now();
    viewer.clock.currentTime = JulianDate.clone(epochRef.current);
    viewer.clock.startTime = JulianDate.addMinutes(
      epochRef.current,
      -SIM_HALF_MINUTES,
      new JulianDate(),
    );
    viewer.clock.stopTime = JulianDate.addMinutes(
      epochRef.current,
      SIM_HALF_MINUTES,
      new JulianDate(),
    );

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 20, 28_000_000),
    });

    viewerRef.current = viewer;

    let lastUiUpdateMs = 0;
    const removeTick = viewer.clock.onTick.addEventListener((clock) => {
      const current = clock.currentTime;
      const atStart = JulianDate.compare(current, clock.startTime) <= 0;
      const atStop = JulianDate.compare(current, clock.stopTime) >= 0;
      const hitBoundary =
        clock.shouldAnimate &&
        ((clock.multiplier > 0 && atStop) ||
          (clock.multiplier < 0 && atStart));
      if (hitBoundary) {
        clock.shouldAnimate = false;
        callbacksRef.current.onPlaybackEnd();
      }

      if (sampleApiRef.current.needsResample(current)) {
        sampleApiRef.current.resamplePositions(current);
      }

      const nowMs = performance.now();
      if (!hitBoundary && nowMs - lastUiUpdateMs < 250) {
        return;
      }
      lastUiUpdateMs = nowMs;
      callbacksRef.current.onClockLabel(
        JulianDate.toDate(current).toISOString(),
      );
      const deltaSec = JulianDate.secondsDifference(current, epochRef.current);
      callbacksRef.current.onOffsetFromClock(deltaSec / 60);
    });

    return () => {
      removeTick();
      bundlesRef.current.clear();
      sampleCenterRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const bundle of bundlesRef.current.values()) {
      viewer.entities.remove(bundle.entity);
      viewer.entities.remove(bundle.forEntity);
    }
    bundlesRef.current.clear();

    const center = viewer.clock.currentTime;

    for (const sat of satellites) {
      const history = createPositionHistory(sat, center);
      if (!history) continue;

      const iss = isIss(sat.noradId);
      const { property: position } = history;
      const positionHolder = createPositionHolder(position);
      const cone = createForConeGraphics(positionHolder);

      const entity = viewer.entities.add({
        id: `sat-${sat.id}`,
        name: sat.name,
        position,
        point: {
          pixelSize: iss ? 10 : 6,
          color: iss
            ? Color.fromCssColorString("#fbbf24")
            : Color.fromCssColorString("#7dd3fc"),
          outlineColor: Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: sat.name,
          font: "11px sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(0, -14),
          show: iss,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        path: {
          leadTime: history.leadTime,
          trailTime: history.trailTime,
          resolution: history.resolution,
          width: iss ? 2 : 1,
          material: iss
            ? Color.fromCssColorString("#fbbf24").withAlpha(0.65)
            : Color.fromCssColorString("#38bdf8").withAlpha(0.35),
        },
        show: visibleRef.current.has(sat.id),
      });

      const forEntity = viewer.entities.add({
        id: `for-${sat.id}`,
        name: `${sat.name} FOR`,
        position: cone.position,
        orientation: cone.orientation,
        cylinder: {
          length: cone.length,
          topRadius: 0,
          bottomRadius: cone.bottomRadius,
          material: forConeColor(iss),
          outline: true,
          outlineColor: forConeOutlineColor(iss),
          numberOfVerticalLines: 12,
          slices: 48,
        },
        show: forVisibleRef.current.has(sat.id) && visibleRef.current.has(sat.id),
      });

      bundlesRef.current.set(sat.id, {
        satellite: sat,
        entity,
        forEntity,
        positionHolder,
      });
    }

    sampleCenterRef.current = JulianDate.clone(center);
  }, [satellites]);

  useEffect(() => {
    for (const [id, bundle] of bundlesRef.current) {
      bundle.entity.show = visibleIds.has(id);
      bundle.forEntity.show = forVisibleIds.has(id) && visibleIds.has(id);
    }
  }, [visibleIds, forVisibleIds]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.shouldAnimate = playing;
  }, [playing]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.multiplier = playbackMultiplier;
  }, [playbackMultiplier]);

  // User scrub — jump clock and refresh samples if outside the buffer.
  useEffect(() => {
    if (scrubNonce === 0) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const next = JulianDate.addMinutes(
      epochRef.current,
      scrubOffsetMinutes,
      new JulianDate(),
    );
    viewer.clock.currentTime = next;
    if (sampleApiRef.current.needsResample(next)) {
      sampleApiRef.current.resamplePositions(next);
    }
  }, [scrubNonce, scrubOffsetMinutes]);

  // Reset the epoch and full sim window so "Now" means wall-clock now.
  useEffect(() => {
    if (resetToNowNonce === 0) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const now = JulianDate.now();
    epochRef.current = JulianDate.clone(now);
    viewer.clock.startTime = JulianDate.addMinutes(
      now,
      -SIM_HALF_MINUTES,
      new JulianDate(),
    );
    viewer.clock.stopTime = JulianDate.addMinutes(
      now,
      SIM_HALF_MINUTES,
      new JulianDate(),
    );
    viewer.clock.currentTime = JulianDate.clone(now);
    callbacksRef.current.onClockLabel(JulianDate.toDate(now).toISOString());
    callbacksRef.current.onOffsetFromClock(0);
    sampleApiRef.current.resamplePositions(now);
  }, [resetToNowNonce]);

  return <div className="globe" ref={containerRef} />;
}
