import { formatClock, formatDegrees, formatMillimeters } from '@ai-designer/ui';
import { formatAgo, formatTimeOfDay } from '../calibration/formatAgo';
import type { CalibrationResult } from '../calibration/calibrationController';
import type { PairFiguresSnapshot } from '../figures/pairFigures';
import type { SourceKind, SourceStatus } from '../sources/source';
import type { StageRoute } from './routes';
import { useNow } from './useNow';

export interface StatusChipProps {
  /** The calibration in effect; null when the product has not calibrated. */
  readonly calibration: CalibrationResult | null;
  readonly drift: PairFiguresSnapshot;
  readonly sourceKind: SourceKind | null;
  readonly sourceStatus: SourceStatus | null;
  /** Set while a recording is replayed. */
  readonly replay: { readonly fileName: string; readonly recordedAt: string; readonly durationSeconds: number } | null;
  readonly onOpen: (route: StageRoute, opener: HTMLElement) => void;
}

/** The start and the end of a long file name; the tooltip holds the whole name. */
function shortFileName(name: string, max = 22): string {
  return name.length <= max ? name : `${name.slice(0, max - 9)}…${name.slice(-8)}`;
}

const AGO_REFRESH_MS = 15_000;

function CalibrationPart({ calibration, onOpen }: Pick<StatusChipProps, 'calibration' | 'onOpen'>) {
  const now = useNow(AGO_REFRESH_MS);
  const open = (event: { currentTarget: HTMLElement }) => onOpen('calibration', event.currentTarget);
  if (!calibration) {
    return (
      <ui-status-chip-part
        data-open="calibration"
        description="This product has not aligned the Lighthouse devices with the headset. Open the calibration panel."
        onClick={open}
      >
        <ui-register-mark slot="prefix" size="sm" status="no-reference" label="Not calibrated" />
        Not calibrated
      </ui-status-chip-part>
    );
  }
  return (
    <ui-status-chip-part
      data-open="calibration"
      description={`Calibrated at ${formatTimeOfDay(calibration.appliedAt)}, fit error ${formatMillimeters(calibration.fitErrorMm)} mm. Open the calibration panel.`}
      onClick={open}
    >
      <ui-register-mark slot="prefix" size="sm" distance={0} angle={0} label="Calibrated" />
      Calibrated · {formatAgo(calibration.appliedAt, now)}
    </ui-status-chip-part>
  );
}

function DriftPart({ drift, onOpen }: Pick<StatusChipProps, 'drift' | 'onOpen'>) {
  const open = (event: { currentTarget: HTMLElement }) => onOpen('measurements', event.currentTarget);
  const { current } = drift;
  if (!drift.hasReference) {
    return (
      <ui-status-chip-part data-open="measurements" description="No reference set for a pair. Open Measurements." onClick={open}>
        No reference
      </ui-status-chip-part>
    );
  }
  if (!current) {
    return (
      <ui-status-chip-part
        data-open="measurements"
        description="A device of the pair is not tracking, so the drift is not measured. Open Measurements."
        onClick={open}
      >
        <ui-register-mark slot="prefix" size="sm" status="gap" label="Drift not measured" />
        Not measured
        <span slot="figures">—</span>
      </ui-status-chip-part>
    );
  }
  return (
    <ui-status-chip-part
      data-open="measurements"
      description={`Drift of the pair since the reference: ${formatMillimeters(current.distanceMm)} mm and ${formatDegrees(current.angleDeg)} degrees. Open Measurements.`}
      onClick={open}
    >
      <ui-register-mark slot="prefix" size="sm" distance={current.distanceMm} angle={current.angleDeg} />
      Drift
      <span slot="figures">{formatMillimeters(current.distanceMm)} mm</span>
      <span slot="figures">{formatDegrees(current.angleDeg)}°</span>
    </ui-status-chip-part>
  );
}

function SourcePart({ sourceKind, sourceStatus, replay, onOpen }: Omit<StatusChipProps, 'drift' | 'calibration'>) {
  const open = (event: { currentTarget: HTMLElement }) => onOpen('settings', event.currentTarget);
  if (replay) {
    return (
      <ui-status-chip-part
        data-open="settings"
        description={`Replaying ${replay.fileName}, recorded ${replay.recordedAt}, length ${formatClock(replay.durationSeconds)}. Open the source settings.`}
        onClick={open}
      >
        <ui-badge code variant="hatched" size="sm">
          REPLAY · {shortFileName(replay.fileName)}
        </ui-badge>
      </ui-status-chip-part>
    );
  }
  if (sourceKind === 'simulated') {
    return (
      <ui-status-chip-part
        data-open="settings"
        description="Source: simulated data, not from SteamVR. Open the source settings."
        onClick={open}
      >
        <ui-badge code variant="hatched" size="sm">
          SIMULATED
        </ui-badge>
      </ui-status-chip-part>
    );
  }
  if (sourceKind !== 'live') return null;
  if (sourceStatus?.state === 'running') {
    return (
      <ui-status-chip-part data-open="settings" description="Source: live data from SteamVR. Open the source settings." onClick={open}>
        <ui-badge code variant="solid" size="sm">
          LIVE
        </ui-badge>
      </ui-status-chip-part>
    );
  }
  const connecting = sourceStatus?.state === 'connecting';
  return (
    <ui-status-chip-part
      data-open="settings"
      tone={connecting ? 'neutral' : 'critical'}
      description={
        connecting
          ? 'Connecting to SteamVR. Open the source settings.'
          : `${sourceStatus?.message ?? 'SteamVR is not running.'} Open the source settings.`
      }
      onClick={open}
    >
      <ui-badge code variant={connecting ? 'outline' : 'subtle'} size="sm" tone={connecting ? 'neutral' : 'critical'}>
        {connecting ? 'CONNECTING' : 'NO SIGNAL'}
      </ui-badge>
    </ui-status-chip-part>
  );
}

/**
 * The status chip, top left: the calibration, the drift of the declared pair and the source of the data; each part opens its panel.
 */
export function StatusChip({ calibration, drift, sourceKind, sourceStatus, replay, onOpen }: StatusChipProps) {
  return (
    <ui-status-chip slot="top-start" label="Session status">
      <CalibrationPart calibration={calibration} onOpen={onOpen} />
      <DriftPart drift={drift} onOpen={onOpen} />
      <SourcePart sourceKind={sourceKind} sourceStatus={sourceStatus} replay={replay} onOpen={onOpen} />
    </ui-status-chip>
  );
}
