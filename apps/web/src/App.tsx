import { useCallback, useMemo, useState } from "react";
import { Globe } from "./components/Globe";
import { SatellitePanel } from "./components/SatellitePanel";
import {
  TimeControls,
  type PlaybackDirection,
} from "./components/TimeControls";
import { useSatellites } from "./hooks/useSatellites";
import {
  SCRUB_PAN_MINUTES,
  SIM_HALF_MINUTES,
  clampSimOffset,
  clampViewCenter,
  followPlayhead,
  scrubViewBounds,
} from "./lib/timeConfig";

const DEFAULT_SPEED = 1;

export default function App() {
  const catalog = useSatellites();
  const [visibleIds, setVisibleIds] = useState<Set<number> | null>(null);
  const [forVisibleIds, setForVisibleIds] = useState<Set<number> | null>(
    null,
  );
  const [playing, setPlaying] = useState(true);
  const [direction, setDirection] =
    useState<PlaybackDirection>("forward");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [displayOffset, setDisplayOffset] = useState(0);
  const [scrubOffset, setScrubOffset] = useState(0);
  const [viewCenter, setViewCenter] = useState(0);
  const [scrubNonce, setScrubNonce] = useState(0);
  const [resetToNowNonce, setResetToNowNonce] = useState(0);
  const [clockLabel, setClockLabel] = useState(() =>
    new Date().toISOString(),
  );

  const satellites =
    catalog.status === "ready" ? catalog.satellites : [];

  const effectiveVisible = useMemo(() => {
    if (visibleIds) return visibleIds;
    if (satellites.length === 0) return new Set<number>();
    return new Set(satellites.map((s) => s.id));
  }, [visibleIds, satellites]);

  const effectiveForVisible = useMemo(() => {
    if (forVisibleIds) return forVisibleIds;
    return new Set<number>();
  }, [forVisibleIds]);

  const playbackMultiplier =
    (direction === "forward" ? 1 : -1) * speed;

  const { min: viewMin, max: viewMax } = scrubViewBounds(viewCenter);

  const handleToggle = useCallback(
    (id: number) => {
      const currentlyVisible = effectiveVisible.has(id);
      setVisibleIds((prev) => {
        const base = prev ?? new Set(satellites.map((s) => s.id));
        const next = new Set(base);
        if (currentlyVisible) next.delete(id);
        else next.add(id);
        return next;
      });
      if (currentlyVisible) {
        setForVisibleIds((forPrev) => {
          if (!forPrev?.has(id)) return forPrev;
          const forNext = new Set(forPrev);
          forNext.delete(id);
          return forNext;
        });
      }
    },
    [satellites, effectiveVisible],
  );

  const handleToggleFor = useCallback(
    (id: number) => {
      if (!effectiveVisible.has(id)) return;
      setForVisibleIds((prev) => {
        const next = new Set(prev ?? []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [effectiveVisible],
  );

  const handleShowAll = useCallback(() => {
    setVisibleIds(new Set(satellites.map((s) => s.id)));
  }, [satellites]);

  const handleHideAll = useCallback(() => {
    setVisibleIds(new Set());
    setForVisibleIds(new Set());
  }, []);

  const handleShowAllFor = useCallback(() => {
    setForVisibleIds(new Set(effectiveVisible));
  }, [effectiveVisible]);

  const handleHideAllFor = useCallback(() => {
    setForVisibleIds(new Set());
  }, []);

  const handleOffsetFromClock = useCallback((offsetMinutes: number) => {
    const offset = clampSimOffset(offsetMinutes);
    setDisplayOffset(offset);
    setViewCenter((center) => followPlayhead(offset, center));
  }, []);

  const applyScrub = useCallback((value: number) => {
    const { min, max } = scrubViewBounds(viewCenter);
    let nextCenter = viewCenter;
    let offset = clampSimOffset(value);

    // Dragging against an edge pans the 1-day window across the sim.
    if (offset >= max - 0.01) {
      nextCenter = clampViewCenter(viewCenter + SCRUB_PAN_MINUTES);
      const bounds = scrubViewBounds(nextCenter);
      offset = Math.min(offset + SCRUB_PAN_MINUTES, bounds.max);
      offset = Math.max(bounds.min, offset);
    } else if (offset <= min + 0.01) {
      nextCenter = clampViewCenter(viewCenter - SCRUB_PAN_MINUTES);
      const bounds = scrubViewBounds(nextCenter);
      offset = Math.max(offset - SCRUB_PAN_MINUTES, bounds.min);
      offset = Math.min(bounds.max, offset);
    } else {
      offset = Math.max(min, Math.min(max, offset));
    }

    setViewCenter(nextCenter);
    setScrubOffset(offset);
    setDisplayOffset(offset);
    setScrubNonce((n) => n + 1);
  }, [viewCenter]);

  const panWindow = useCallback(
    (deltaMinutes: number) => {
      const nextCenter = clampViewCenter(viewCenter + deltaMinutes);
      const { min, max } = scrubViewBounds(nextCenter);
      const offset = Math.max(min, Math.min(max, displayOffset));
      setViewCenter(nextCenter);
      if (offset !== displayOffset) {
        setScrubOffset(offset);
        setDisplayOffset(offset);
        setScrubNonce((n) => n + 1);
      }
    },
    [viewCenter, displayOffset],
  );

  const scrubberValue = Math.max(
    viewMin,
    Math.min(viewMax, displayOffset),
  );

  const canPanEarlier = viewMin > -SIM_HALF_MINUTES + 0.01;
  const canPanLater = viewMax < SIM_HALF_MINUTES - 0.01;

  const resetToNow = useCallback(() => {
    setScrubOffset(0);
    setDisplayOffset(0);
    setViewCenter(0);
    setResetToNowNonce((n) => n + 1);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SimpleProp</span>
          <span className="brand-sub">Cesium · SGP4</span>
        </div>
        {catalog.status === "loading" && (
          <p className="status">Loading catalog…</p>
        )}
        {catalog.status === "error" && (
          <p className="status error">Catalog error: {catalog.message}</p>
        )}
      </header>

      <main className="main">
        <SatellitePanel
          satellites={satellites}
          visibleIds={effectiveVisible}
          forVisibleIds={effectiveForVisible}
          onToggle={handleToggle}
          onToggleFor={handleToggleFor}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
          onShowAllFor={handleShowAllFor}
          onHideAllFor={handleHideAllFor}
        />

        <div className="stage">
          {catalog.status === "ready" && (
            <Globe
              satellites={satellites}
              visibleIds={effectiveVisible}
              forVisibleIds={effectiveForVisible}
              playing={playing}
              playbackMultiplier={playbackMultiplier}
              scrubOffsetMinutes={scrubOffset}
              scrubNonce={scrubNonce}
              resetToNowNonce={resetToNowNonce}
              onClockLabel={setClockLabel}
              onOffsetFromClock={handleOffsetFromClock}
              onPlaybackEnd={() => setPlaying(false)}
            />
          )}
          {catalog.status !== "ready" && (
            <div className="globe placeholder" />
          )}

          <TimeControls
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            direction={direction}
            onDirectionChange={setDirection}
            speed={speed}
            onSpeedChange={setSpeed}
            offsetMinutes={scrubberValue}
            minMinutes={viewMin}
            maxMinutes={viewMax}
            onScrub={applyScrub}
            onPanWindow={panWindow}
            canPanEarlier={canPanEarlier}
            canPanLater={canPanLater}
            onReset={resetToNow}
            clockLabel={clockLabel}
          />
        </div>
      </main>
    </div>
  );
}
