import { describe, expect, it } from 'vitest';
import { toMarkers, toTimeSeries, type ValueFormatters } from './chartData';
import type { ChartSeries } from './chartSeries';

const formatters: ValueFormatters = { millimeters: (value) => `${value} mm`, degrees: (value) => `${value}°` };

const distance: ChartSeries = {
  label: 'Distance',
  unit: 'mm',
 
  points: [
    { time: 12, value: 0 },
    { time: 13, value: null },
    { time: 14, value: 2.5 },
  ],
};
const strain: ChartSeries = { label: 'Strain', unit: 'mm', points: [{ time: 20, value: 4 }] };

describe('toTimeSeries', () => {
  it('turns points into [time, value] pairs and keeps gaps as null', () => {
    const [row] = toTimeSeries([distance], formatters);
    expect(row?.points).toEqual([
      [12, 0],
      [13, null],
      [14, 2.5],
    ]);
    expect(row?.unit).toBe('mm');
  });

  it('returns a new array every time, so the chart redraws', () => {
    expect(toTimeSeries([distance], formatters)).not.toBe(toTimeSeries([distance], formatters));
  });
});

describe('toMarkers', () => {
  it('marks the first point of the reference and of the skeleton calibration', () => {
    expect(toMarkers([distance, strain], null).map((marker) => marker.time)).toEqual([12, 20]);
  });

  it('adds the cut of an interrupted recording', () => {
    expect(toMarkers([], 90)).toEqual([{ time: 90, label: 'Recording cut here', icon: 'warning' }]);
  });

  it('marks nothing for an empty series', () => {
    expect(toMarkers([{ ...distance, points: [] }], null)).toEqual([]);
  });
});
