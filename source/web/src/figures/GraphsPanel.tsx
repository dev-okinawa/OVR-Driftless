import { formatClock, formatDegrees, formatMillimeters, type UiFloatingPanel, type UiTimeChart } from '@ai-designer/ui';
import { useEffect, useRef, type Ref } from 'react';
import { toMarkers, toTimeSeries, type ValueFormatters } from './chartData';
import type { ChartSeries } from './chartSeries';
import styles from './GraphsPanel.module.css';

export interface GraphsPanelProps {
  /** The lines to draw, read a few times a second; the arrays behind them are mutated as data arrives. */
  readonly getSeries: () => readonly ChartSeries[];
  /** The current session time in seconds; null before the first frame. */
  readonly getTime: () => number | null;
  /** Length of the replayed recording, seconds; null when the data is live or simulated. */
  readonly replayDuration: number | null;
  /** Time at which an interrupted recording ends, to mark the cut; null otherwise. */
  readonly cutTime: number | null;
  /** Seeks the replay; used when the user clicks a graph. */
  readonly onSeek: (time: number) => void;
  /** What the chart says when there is nothing to draw. */
  readonly emptyMessage: string;
  /** Opens the pair choice; when set, the empty chart offers it as the next step. */
  readonly onChoosePair: (() => void) | null;
  readonly onClose: () => void;
  readonly panelRef?: Ref<UiFloatingPanel>;
}

/** A live chart shows at least this much time, so that its first seconds do not stretch over the whole width. */
const MIN_LIVE_SPAN_S = 30;
/** The series are read, compared and converted at most this often while data streams in. */
const REBUILD_INTERVAL_MS = 250;

const FORMATTERS: ValueFormatters = { millimeters: formatMillimeters, degrees: formatDegrees };

/** What a rebuild depends on, as numbers: changes when a point is added, removed or thinned. */
function signature(series: readonly ChartSeries[]): number[] {
  const numbers: number[] = [];
  for (const line of series) {
    const last = line.points[line.points.length - 1];
    numbers.push(line.points.length, line.points[0]?.time ?? NaN, last?.time ?? NaN, last?.value ?? NaN);
  }
  return numbers;
}

function sameSignature(a: readonly number[] | null, b: readonly number[]): boolean {
  // NaN marks an empty series or a gap; it equals itself here.
  return a !== null && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/**
 * Distance, angle and strain on one time axis. The chart gets its data by reference on an animation frame, not
 * through React state; a click on the graph seeks while a recording is replayed.
 */
export function GraphsPanel({
  getSeries,
  getTime,
  replayDuration,
  cutTime,
  onSeek,
  emptyMessage,
  onChoosePair,
  onClose,
  panelRef,
}: GraphsPanelProps) {
  const chartRef = useRef<UiTimeChart>(null);
  // Read by the animation loop, which must not restart when the parent renders.
  const inputs = useRef({ getSeries, getTime, replayDuration, cutTime });
  useEffect(() => {
    inputs.current = { getSeries, getTime, replayDuration, cutTime };
  });

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let frameId = 0;
    let lastSignature: number[] | null = null;
    let lastCheck = Number.NEGATIVE_INFINITY;
    let lastCutTime: number | null | undefined;

    const tick = (now: number): void => {
      const { getSeries: readSeries, getTime: readTime, replayDuration: duration, cutTime: cut } = inputs.current;
      const time = readTime();
      const cutChanged = cut !== lastCutTime;
      if (now - lastCheck >= REBUILD_INTERVAL_MS || cutChanged) {
        lastCheck = now;
        const series = readSeries();
        const next = signature(series);
        if (cutChanged || !sameSignature(lastSignature, next)) {
          lastSignature = next;
          lastCutTime = cut;
          chart.series = toTimeSeries(series, FORMATTERS);
          chart.markers = toMarkers(series, cut);
          chart.domain = [0, duration !== null ? Math.max(duration, 1) : Math.max(MIN_LIVE_SPAN_S, time ?? 0)];
        }
      }
      const cursor = duration !== null ? time : null;
      if (chart.cursor !== cursor) chart.cursor = cursor;
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const eyebrow =
    replayDuration !== null ? `Whole recording · ${formatClock(replayDuration)} · click a graph to seek` : 'Session so far';

  return (
    <ui-floating-panel ref={panelRef} slot="wide-panel" heading="Graphs" eyebrow={eyebrow} closable onui-close={onClose}>
      <ui-time-chart
        ref={chartRef}
        label="Session graphs"
        seekable={replayDuration !== null}
        emptyMessage={emptyMessage}
        onui-seek={(event) => onSeek(event.detail.time)}
      >
        {onChoosePair && (
          <div slot="empty" className={styles.emptyHint}>
            <ui-text variant="small" tone="muted">
              {emptyMessage}
            </ui-text>
            <ui-button size="sm" onClick={onChoosePair}>
              Choose a pair
            </ui-button>
          </div>
        )}
      </ui-time-chart>
    </ui-floating-panel>
  );
}
