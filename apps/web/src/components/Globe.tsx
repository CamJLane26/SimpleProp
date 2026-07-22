import { useEffect, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  ClockRange,
  Color,
  Ion,
  JulianDate,
  LabelStyle,
  LagrangePolynomialApproximation,
  ReferenceFrame,
  SampledPositionProperty,
  Terrain,
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
  sat: PropagatedSat;
  entity: Entity;
};

function isIss(noradId: number): boolean {
  return noradId === 25544;
}

function createPositionProperty(
  sat: PropagatedSat,
  center: JulianDate,
): SampledPositionProperty {
  const { times, positions } = sampleInertialOrbit(
    sat,
    center,
    SCRUB_HALF_MINUTES,
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
      const parsed = parseSatellite(
        sat.id,
        sat.noradId,
        sat.name,
        sat.tleLine1,
        sat.tleLine2,
      );
      if (!parsed) continue;

      const iss = isIss(sat.noradId);
      const periodSeconds = parsed.periodMinutes * 60;
      const position = createPositionProperty(parsed, center);

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
          leadTime: periodSeconds / 2,
          trailTime: periodSeconds / 2,
          resolution: Math.max(10, periodSeconds / 180),
          width: iss ? 2 : 1,
          material: iss
            ? Color.fromCssColorString("#fbbf24").withAlpha(0.65)
            : Color.fromCssColorString("#38bdf8").withAlpha(0.35),
        },
        show: visibleRef.current.has(sat.id),
      });

      bundlesRef.current.set(sat.id, {
        sat: parsed,
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
      bundle.entity.position = createPositionProperty(bundle.sat, center);
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
