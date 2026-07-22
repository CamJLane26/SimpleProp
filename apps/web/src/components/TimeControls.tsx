export type PlaybackDirection = "forward" | "reverse";

type Props = {
  playing: boolean;
  onTogglePlay: () => void;
  direction: PlaybackDirection;
  onDirectionChange: (direction: PlaybackDirection) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  /** Absolute minutes offset from session epoch. */
  offsetMinutes: number;
  /** Visible scrubber window bounds (absolute minutes from epoch). */
  minMinutes: number;
  maxMinutes: number;
  onScrub: (offsetMinutes: number) => void;
  /** Shift the visible 1-day window earlier/later. */
  onPanWindow: (deltaMinutes: number) => void;
  canPanEarlier: boolean;
  canPanLater: boolean;
  onReset: () => void;
  clockLabel: string;
};

const SPEED_MIN = 0.1;
const SPEED_MAX = 1000;

export function TimeControls({
  playing,
  onTogglePlay,
  direction,
  onDirectionChange,
  speed,
  onSpeedChange,
  offsetMinutes,
  minMinutes,
  maxMinutes,
  onScrub,
  onPanWindow,
  canPanEarlier,
  canPanLater,
  onReset,
  clockLabel,
}: Props) {
  return (
    <div className="time-controls">
      <button type="button" className="play-btn" onClick={onTogglePlay}>
        {playing ? "Pause" : "Play"}
      </button>
      <button type="button" onClick={onReset}>
        Now
      </button>

      <div className="direction-group" role="group" aria-label="Playback direction">
        <button
          type="button"
          className={
            direction === "reverse" ? "dir-btn active" : "dir-btn"
          }
          onClick={() => onDirectionChange("reverse")}
          aria-pressed={direction === "reverse"}
        >
          ‹ Reverse
        </button>
        <button
          type="button"
          className={
            direction === "forward" ? "dir-btn active" : "dir-btn"
          }
          onClick={() => onDirectionChange("forward")}
          aria-pressed={direction === "forward"}
        >
          Forward ›
        </button>
      </div>

      <label className="speed-control">
        <span className="speed-label">Speed</span>
        <input
          className="speed-input"
          type="number"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step="any"
          value={speed}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (!Number.isFinite(next)) return;
            onSpeedChange(
              Math.min(SPEED_MAX, Math.max(SPEED_MIN, next)),
            );
          }}
          aria-label="Playback speed multiplier"
        />
        <span className="speed-suffix" aria-hidden="true">
          ×
        </span>
      </label>

      <div className="scrub-group">
        <button
          type="button"
          className="pan-btn"
          disabled={!canPanEarlier}
          onClick={() => onPanWindow(-24 * 60)}
          aria-label="Pan timeline back one day"
        >
          ‹‹
        </button>
        <input
          className="scrubber"
          type="range"
          min={minMinutes}
          max={maxMinutes}
          step={0.25}
          value={offsetMinutes}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Time scrubber (1-day window)"
        />
        <button
          type="button"
          className="pan-btn"
          disabled={!canPanLater}
          onClick={() => onPanWindow(24 * 60)}
          aria-label="Pan timeline forward one day"
        >
          ››
        </button>
      </div>
      <time className="clock-label" dateTime={clockLabel}>
        {clockLabel}
      </time>
    </div>
  );
}
