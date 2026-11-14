import type { TimeMarker, TimeSeries } from '@ai-designer/ui';
import type { ChartSeries } from './chartSeries';

/** How the chart prints values; the kit's formatters, passed in so that this file loads without a browser. */
export interface ValueFormatters {
  readonly millimeters: (value: number) => string;
  readonly degrees: (value: number) => string;
}

interface SeriesLook {
  /** The smallest value range the chart shows, so that noise does not fill the row. */
  readonly minRange: number;
  readonly unit: 'millimeters' | 'degrees';
  readonly tone?: TimeSeries['tone'];
  readonly marker: TimeMarker | null;
}

// Keyed by the series label the figures and the skeleton give their lines.
const LOOKS: Readonly<Record<string, SeriesLook>> = {
  Distance: { minRange: 5, unit: 'millimeters', marker: { time: 0, label: 'Reference set', icon: 'crosshair' } },
  Angle: { minRange: 0.5, unit: 'degrees', tone: 'secondary', marker: null },
  Strain: { minRange: 20, unit: 'millimeters', marker: { time: 0, label: 'Skeleton calibrated', icon: 'skeleton' } },
};

const DEFAULT_LOOK: SeriesLook = { minRange: 1, unit: 'millimeters', marker: null };

/** The rows of the kit's time chart for the given series; a new array each call, as the chart requires. */
export function toTimeSeries(series: readonly ChartSeries[], formatters: ValueFormatters): TimeSeries[] {
  return series.map((line) => {
    const look = LOOKS[line.label] ?? DEFAULT_LOOK;
    return {
      id: line.label.toLowerCase(),
      label: line.label,
      unit: line.unit,
      points: line.points.map((point) => [point.time, point.value] as const),
      minRange: look.minRange,
      format: formatters[look.unit],
      ...(look.tone ? { tone: look.tone } : {}),
    };
  });
}

/** A marker at the first point of each series that marks a moment: the reference and the skeleton calibration. */
export function toMarkers(series: readonly ChartSeries[], cutTime: number | null): TimeMarker[] {
  const markers: TimeMarker[] = [];
  for (const line of series) {
    const marker = LOOKS[line.label]?.marker;
    const first = line.points[0];
    if (marker && first) markers.push({ ...marker, time: first.time });
  }
  if (cutTime !== null) markers.push({ time: cutTime, label: 'Recording cut here', icon: 'warning' });
  return markers;
}
