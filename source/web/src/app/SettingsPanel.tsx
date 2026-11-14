import type { UiFloatingPanel } from '@ai-designer/ui';
import { useState, type Ref } from 'react';
import { SimulatorPanel } from '../sources/simulator/SimulatorPanel';
import type { SimulatorControls } from '../sources/simulator/simulatorSource';
import styles from './panels.module.css';

/** The source the user chose; a replay takes its place until it is closed. */
export type ChosenSource = 'live' | 'simulated';

export interface SettingsPanelProps {
  /** Present on simulated data only; it adds the Simulator tab. */
  readonly simulatorControls: SimulatorControls | null;
  readonly source: ChosenSource;
  /** A recording is being made: the source cannot change until it stops. */
  readonly recording: boolean;
  readonly onSourceChange: (source: ChosenSource) => void;
  /** A recording is replayed: the source cannot change until the replay is closed. */
  readonly replay: boolean;
  readonly trailsOn: boolean;
  readonly trailSeconds: number;
  readonly onTrailSeconds: (seconds: number) => void;
  /** The product's calibration is in effect, so it can be removed. */
  readonly calibrated: boolean;
  /** The owner confirms, then removes the calibration. */
  readonly onRemoveCalibration: () => void;
  readonly onResetView: () => void;
  readonly onCloseReplay: () => void;
  readonly onClose: () => void;
  readonly panelRef?: Ref<UiFloatingPanel>;
}

const MIN_TRAIL_SECONDS = 1;
const MAX_TRAIL_SECONDS = 60;

const SOURCE_OPTIONS: { value: ChosenSource; label: string }[] = [
  { value: 'live', label: 'SteamVR' },
  { value: 'simulated', label: 'Simulator' },
];
export const SOURCE_NAMES: Readonly<Record<ChosenSource, string>> = { live: 'SteamVR', simulated: 'simulator' };

const isChosenSource = (value: string): value is ChosenSource => SOURCE_OPTIONS.some((option) => option.value === value);

/** The Settings panel: source, trail length, Reset view and, on simulated data, the Simulator tab. */
export function SettingsPanel({
  simulatorControls,
  source,
  recording,
  onSourceChange,
  replay,
  trailsOn,
  trailSeconds,
  onTrailSeconds,
  calibrated,
  onRemoveCalibration,
  onResetView,
  onCloseReplay,
  onClose,
  panelRef,
}: SettingsPanelProps) {
  const [tab, setTab] = useState('general');
  const [trailError, setTrailError] = useState('');
  const tabs = [{ id: 'general', label: 'General' }, ...(simulatorControls ? [{ id: 'simulator', label: 'Simulator' }] : [])];
  const activeTab = tab === 'simulator' && !simulatorControls ? 'general' : tab;

  const commitTrailSeconds = (text: string): void => {
    const seconds = Number(text);
    if (text === '' || !Number.isFinite(seconds) || seconds < MIN_TRAIL_SECONDS || seconds > MAX_TRAIL_SECONDS) {
      setTrailError(`Enter a length from ${MIN_TRAIL_SECONDS} to ${MAX_TRAIL_SECONDS} seconds.`);
      return;
    }
    setTrailError('');
    onTrailSeconds(seconds);
  };

  return (
    <ui-floating-panel ref={panelRef} slot="panel" className={styles.panel} heading="Settings" closable onui-close={onClose}>
      <ui-tabs tabs={tabs} value={activeTab} onui-change={(event) => setTab(event.detail.value)}>
        <div slot="general" className={styles.stack}>
          <div className={styles.group}>
            <ui-segmented-control
              label="Source"
              options={SOURCE_OPTIONS}
              value={source}
              disabled={replay || recording}
              hint={recording ? 'Stop the recording to change the source.' : ''}
              onui-change={(event) => {
                const next = event.detail.value;
                if (isChosenSource(next) && next !== source) onSourceChange(next);
              }}
            />
            {replay && (
              <>
                <ui-text variant="small" tone="muted">
                  Replaying a recording. Close the replay to change the source.
                </ui-text>
                <div className={styles.row}>
                  <ui-button icon="close" onClick={onCloseReplay}>
                    Back to {SOURCE_NAMES[source]}
                  </ui-button>
                </div>
              </>
            )}
          </div>

          <div className={styles.group}>
            <ui-heading level={3} size="sm">
              View
            </ui-heading>
            <ui-text-field
              type="number"
              label="Trail length"
              unit="s"
              min={String(MIN_TRAIL_SECONDS)}
              max={String(MAX_TRAIL_SECONDS)}
              step="1"
              hint={trailsOn ? `From ${MIN_TRAIL_SECONDS} to ${MAX_TRAIL_SECONDS} seconds.` : 'Turn Trails on to see them.'}
              error={trailError}
              disabled={!trailsOn}
              value={String(trailSeconds)}
              onui-change={(event) => commitTrailSeconds(event.detail.value)}
            />
            <div className={styles.row}>
              <ui-button icon="reset" onClick={onResetView}>
                Reset view
              </ui-button>
            </div>
          </div>

          <div className={styles.group}>
            <ui-heading level={3} size="sm">
              Calibration
            </ui-heading>
            <div className={styles.row}>
              <ui-button variant="danger" icon="trash" disabled={!calibrated || replay} onClick={onRemoveCalibration}>
                Remove calibration
              </ui-button>
            </div>
            <ui-text variant="small" tone="muted">
              {calibrated
                ? 'The Lighthouse devices return to where Lighthouse places them, uncorrected.'
                : 'There is no calibration to remove. Calibrate from the dock.'}
            </ui-text>
          </div>
        </div>
        {simulatorControls && (
          <div slot="simulator" className={styles.stack}>
            <SimulatorPanel controls={simulatorControls} />
          </div>
        )}
      </ui-tabs>
    </ui-floating-panel>
  );
}
