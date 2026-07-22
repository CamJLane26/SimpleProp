/** Half-span of the full simulation relative to session epoch (±7.5 days = 15 days). */
export const SIM_HALF_MINUTES = 7.5 * 24 * 60;

/** Visible scrubber window half-span (±12 hours = 1 day on the timeline). */
export const SCRUB_VIEW_HALF_MINUTES = 12 * 60;

/**
 * Half-span of pre-sampled position data around the sample center.
 * Kept aligned with the scrub view so memory stays bounded while the
 * playhead can still move freely across the full simulation.
 */
export const SAMPLE_HALF_MINUTES = SCRUB_VIEW_HALF_MINUTES;

/** Resample when the playhead is this close to the edge of the sample buffer. */
export const RESAMPLE_MARGIN_MINUTES = 60;

/** When scrubbing against a scrubber edge, slide the view by this many minutes. */
export const SCRUB_PAN_MINUTES = 30;

export function clampSimOffset(offsetMinutes: number): number {
  return Math.max(
    -SIM_HALF_MINUTES,
    Math.min(SIM_HALF_MINUTES, offsetMinutes),
  );
}

/** Absolute scrubber bounds for a 1-day window centered on `viewCenterMinutes`. */
export function scrubViewBounds(viewCenterMinutes: number): {
  min: number;
  max: number;
} {
  const span = 2 * SCRUB_VIEW_HALF_MINUTES;
  let min = viewCenterMinutes - SCRUB_VIEW_HALF_MINUTES;
  let max = viewCenterMinutes + SCRUB_VIEW_HALF_MINUTES;

  if (min < -SIM_HALF_MINUTES) {
    min = -SIM_HALF_MINUTES;
    max = Math.min(SIM_HALF_MINUTES, min + span);
  }
  if (max > SIM_HALF_MINUTES) {
    max = SIM_HALF_MINUTES;
    min = Math.max(-SIM_HALF_MINUTES, max - span);
  }

  return { min, max };
}

export function clampViewCenter(viewCenterMinutes: number): number {
  if (SIM_HALF_MINUTES <= SCRUB_VIEW_HALF_MINUTES) return 0;
  const minCenter = -SIM_HALF_MINUTES + SCRUB_VIEW_HALF_MINUTES;
  const maxCenter = SIM_HALF_MINUTES - SCRUB_VIEW_HALF_MINUTES;
  return Math.max(minCenter, Math.min(maxCenter, viewCenterMinutes));
}

/** Keep the playhead inside the visible scrubber window by sliding the center. */
export function followPlayhead(
  offsetMinutes: number,
  viewCenterMinutes: number,
): number {
  const { min, max } = scrubViewBounds(viewCenterMinutes);
  if (offsetMinutes >= min && offsetMinutes <= max) {
    return viewCenterMinutes;
  }
  return clampViewCenter(offsetMinutes);
}
