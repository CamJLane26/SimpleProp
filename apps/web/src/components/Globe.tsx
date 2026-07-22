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
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { Satellite } from "../types";
import {
  parseSatellite,
  sampleInertialOrbit,
  type PropagatedSat,
} from "../lib/sgp4";

const SCRUB_HALF_MINUTES = 90;
const MULTIPLIER = 60;

type Props = {
  satellites: Satellite[];
  visibleIds: Set<number>;
  playing: boolean;
  /** Minutes relative to session epoch; applied only when scrubNonce changes. */
  scrubOffsetMinutes: number;
  scrubNonce: number;
  resetToNowNonce: number;
  onClockLabel: (iso: string) => void;
  onOffsetFromClock: (offsetMinutes: number) => void;
  onPlaybackEnd: () => void;
};

type EntityBundle = {
  satellite: Satellite;
  entity: Entity;
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

function createSampledProperty(
  sat: PropagatedSat,
  center: JulianDate,
  paddingMinutes: number,
): SampledPositionProperty {
  const { times, positions } = sampleInertialOrbit(
    sat,
    center,
    paddingMinutes,
  );
  const property = new SampledPositionProperty(ReferenceFrame.INERTIAL);
  property.setInterpolationOptions({
    interpolationAlgorithm:
      LagrangePolynomialApproximation as unknown as InterpolationAlgorithm,
    interpolationDegree: 5,
  });
  property.addSamples(times, positions);
  return property;
}

function createPositionHistory(
  satellite: Satellite,
  center: JulianDate,
): PositionHistory | null {
  const parsed = satellite.tles
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
    .filter(
      (
        entry,
      ): entry is { epoch: JulianDate; propagated: PropagatedSat } =>
        entry !== null,
    )
    .sort((a, b) => JulianDate.compare(a.epoch, b.epoch));

  if (parsed.length === 0) return null;

  const maxPeriodMinutes = Math.max(
    ...parsed.map((entry) => entry.propagated.periodMinutes),
  );
  const overallHalfSpanMinutes =
    SCRUB_HALF_MINUTES + maxPeriodMinutes / 2;
  const overallStart = JulianDate.addMinutes(
    center,
    -overallHalfSpanMinutes,
    new JulianDate(),
  );
  const overallStop = JulianDate.addMinutes(
    center,
    overallHalfSpanMinutes,
    new JulianDate(),
  );
  const property = new CompositePositionProperty(ReferenceFrame.INERTIAL);
  const leadTime = new CompositeProperty();
  const trailTime = new CompositeProperty();
  const resolution = new CompositeProperty();

  for (let i = 0; i < parsed.length; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];
    const start =
      i === 0 || JulianDate.compare(current.epoch, overallStart) < 0
        ? overallStart
        : current.epoch;
    const stop =
      next && JulianDate.compare(next.epoch, overallStop) < 0
        ? next.epoch
        : overallStop;

    if (JulianDate.compare(start, stop) >= 0) continue;

    const extraPadding =
      SCRUB_HALF_MINUTES +
      (maxPeriodMinutes - current.propagated.periodMinutes) / 2;
    const sampled = createSampledProperty(
      current.propagated,
      center,
      extraPadding,
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

export function Globe({
  satellites,
  visibleIds,
  playing,
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
  const visibleRef = useRef(visibleIds);
  const callbacksRef = useRef({
    onClockLabel,
    onOffsetFromClock,
    onPlaybackEnd,
  });

  visibleRef.current = visibleIds;
  callbacksRef.current = {
    onClockLabel,
    onOffsetFromClock,
    onPlaybackEnd,
  };

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
    viewer.clock.multiplier = MULTIPLIER;
    viewer.clock.clockRange = ClockRange.CLAMPED;
    epochRef.current = JulianDate.now();
    viewer.clock.currentTime = JulianDate.clone(epochRef.current);
    viewer.clock.startTime = JulianDate.addMinutes(
      epochRef.current,
      -SCRUB_HALF_MINUTES,
      new JulianDate(),
    );
    viewer.clock.stopTime = JulianDate.addMinutes(
      epochRef.current,
      SCRUB_HALF_MINUTES,
      new JulianDate(),
    );

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 20, 28_000_000),
    });

    viewerRef.current = viewer;

    let lastUiUpdateMs = 0;
    const removeTick = viewer.clock.onTick.addEventListener((clock) => {
      const current = clock.currentTime;
      const reachedEnd =
        clock.shouldAnimate &&
        JulianDate.compare(current, clock.stopTime) >= 0;
      if (reachedEnd) {
        clock.shouldAnimate = false;
        callbacksRef.current.onPlaybackEnd();
      }

      const nowMs = performance.now();
      if (!reachedEnd && nowMs - lastUiUpdateMs < 250) {
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
    }
    bundlesRef.current.clear();

    const center = viewer.clock.currentTime;

    for (const sat of satellites) {
      const history = createPositionHistory(sat, center);
      if (!history) continue;

      const iss = isIss(sat.noradId);
      const { property: position } = history;

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

      bundlesRef.current.set(sat.id, {
        satellite: sat,
        entity,
      });
    }
  }, [satellites]);

  useEffect(() => {
    for (const [id, bundle] of bundlesRef.current) {
      const show = visibleIds.has(id);
      bundle.entity.show = show;
    }
  }, [visibleIds]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.shouldAnimate = playing;
  }, [playing]);

  const resamplePositions = (center: JulianDate) => {
    for (const bundle of bundlesRef.current.values()) {
      const history = createPositionHistory(bundle.satellite, center);
      if (!history) continue;
      bundle.entity.position = history.property;
      if (bundle.entity.path) {
        bundle.entity.path.leadTime = history.leadTime;
        bundle.entity.path.trailTime = history.trailTime;
        bundle.entity.path.resolution = history.resolution;
      }
    }
  };

  // User scrub / "Now" — apply once per nonce
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
  }, [scrubNonce, scrubOffsetMinutes]);

  // Reset the epoch and scrub window so "Now" means wall-clock now.
  useEffect(() => {
    if (resetToNowNonce === 0) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const now = JulianDate.now();
    epochRef.current = JulianDate.clone(now);
    viewer.clock.startTime = JulianDate.addMinutes(
      now,
      -SCRUB_HALF_MINUTES,
      new JulianDate(),
    );
    viewer.clock.stopTime = JulianDate.addMinutes(
      now,
      SCRUB_HALF_MINUTES,
      new JulianDate(),
    );
    viewer.clock.currentTime = JulianDate.clone(now);
    callbacksRef.current.onClockLabel(JulianDate.toDate(now).toISOString());
    callbacksRef.current.onOffsetFromClock(0);
    resamplePositions(now);
  }, [resetToNowNonce]);

  return <div className="globe" ref={containerRef} />;
}
