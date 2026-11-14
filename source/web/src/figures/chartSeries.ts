/** One point of a line on a time chart. A null value is a gap: the line is broken there, not drawn at zero. */
export interface ChartPoint {
  /** Seconds since the session started. */
  readonly time: number;
  readonly value: number | null;
}

/** One line of a time chart. */
export interface ChartSeries {
  readonly label: string;
  /** Shown after the current value and on the axis: "mm", "°". */
  readonly unit: string;
  /** In time order. */
  readonly points: readonly ChartPoint[];
}
