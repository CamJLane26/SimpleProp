type Props = {
  playing: boolean;
  onTogglePlay: () => void;
  /** Minutes offset from session start (center = 0). */
  offsetMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  onScrub: (offsetMinutes: number) => void;
  onReset: () => void;
  clockLabel: string;
};

export function TimeControls({
  playing,
  onTogglePlay,
  offsetMinutes,
  minMinutes,
  maxMinutes,
  onScrub,
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
      <input
        className="scrubber"
        type="range"
        min={minMinutes}
        max={maxMinutes}
        step={0.25}
        value={offsetMinutes}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Time scrubber"
      />
      <time className="clock-label" dateTime={clockLabel}>
        {clockLabel}
      </time>
    </div>
  );
}
