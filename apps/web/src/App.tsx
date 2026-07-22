import { useCallback, useMemo, useState } from "react";
import { Globe } from "./components/Globe";
import { SatellitePanel } from "./components/SatellitePanel";
import {
  TimeControls,
  type PlaybackDirection,
} from "./components/TimeControls";
import { useSatellites } from "./hooks/useSatellites";

const SCRUB_HALF_MINUTES = 90;
const DEFAULT_SPEED = 1;

export default function App() {
  const catalog = useSatellites();
  const [visibleIds, setVisibleIds] = useState<Set<number> | null>(null);
  const [playing, setPlaying] = useState(true);
  const [direction, setDirection] =
    useState<PlaybackDirection>("forward");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [displayOffset, setDisplayOffset] = useState(0);
  const [scrubOffset, setScrubOffset] = useState(0);
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

  const playbackMultiplier =
    (direction === "forward" ? 1 : -1) * speed;

  const handleToggle = useCallback(
    (id: number) => {
      setVisibleIds((prev) => {
        const base = prev ?? new Set(satellites.map((s) => s.id));
        const next = new Set(base);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [satellites],
  );

  const handleShowAll = useCallback(() => {
    setVisibleIds(new Set(satellites.map((s) => s.id)));
  }, [satellites]);

  const handleHideAll = useCallback(() => {
    setVisibleIds(new Set());
  }, []);

  const applyScrub = useCallback((value: number) => {
    const clamped = Math.max(
      -SCRUB_HALF_MINUTES,
      Math.min(SCRUB_HALF_MINUTES, value),
    );
    setScrubOffset(clamped);
    setDisplayOffset(clamped);
    setScrubNonce((n) => n + 1);
  }, []);

  const scrubberValue = Math.max(
    -SCRUB_HALF_MINUTES,
    Math.min(SCRUB_HALF_MINUTES, displayOffset),
  );

  const resetToNow = useCallback(() => {
    setScrubOffset(0);
    setDisplayOffset(0);
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
          onToggle={handleToggle}
          onShowAll={handleShowAll}
          onHideAll={handleHideAll}
        />

        <div className="stage">
          {catalog.status === "ready" && (
            <Globe
              satellites={satellites}
              visibleIds={effectiveVisible}
              playing={playing}
              playbackMultiplier={playbackMultiplier}
              scrubOffsetMinutes={scrubOffset}
              scrubNonce={scrubNonce}
              resetToNowNonce={resetToNowNonce}
              onClockLabel={setClockLabel}
              onOffsetFromClock={setDisplayOffset}
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
            minMinutes={-SCRUB_HALF_MINUTES}
            maxMinutes={SCRUB_HALF_MINUTES}
            onScrub={applyScrub}
            onReset={resetToNow}
            clockLabel={clockLabel}
          />
        </div>
      </main>
    </div>
  );
}
