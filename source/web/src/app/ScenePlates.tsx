import type { SourceKind, SourceStatus } from '../sources/source';
import styles from './stage.module.css';

export interface ScenePlatesProps {
  readonly sourceKind: SourceKind | null;
  readonly status: SourceStatus | null;
  /** The session has been announced and has no device. */
  readonly noDevices: boolean;
  readonly onOpenSettings: (opener: HTMLElement) => void;
}

/**
 * What the scene says when there is nothing to draw: connecting, unavailable, or no device. Nothing otherwise.
 * SteamVR being unavailable is an ordinary wait, not a fault: the status chip says why, the scene stays clear.
 */
export function ScenePlates({ sourceKind, status, noDevices, onOpenSettings }: ScenePlatesProps) {
  if (status?.state === 'connecting') {
    return (
      <div className={styles.plates}>
        <ui-floating-panel className={styles.plate} label="Connecting" heading="Connecting">
          <ui-loading-state variant="block" label="Connecting to the data source" />
        </ui-floating-panel>
      </div>
    );
  }

  if (status?.state === 'unavailable') {
    if (sourceKind === 'live') return null;
    return (
      <div className={styles.plates}>
        <ui-floating-panel className={styles.plate} label="No data" heading="No data to show">
          <ui-text tone="secondary">{status.message ?? 'The data source is unavailable.'}</ui-text>
        </ui-floating-panel>
      </div>
    );
  }

  if (noDevices) {
    const simulated = sourceKind === 'simulated';
    return (
      <div className={styles.plates}>
        <ui-floating-panel className={styles.plate} label="No devices" heading="No devices to show">
          <ui-text tone="secondary">
            {simulated
              ? 'Turn on "Present" for a device in Settings, under Simulator.'
              : 'Devices appear here when they are reported.'}
          </ui-text>
          {simulated && (
            <ui-button slot="footer" size="lg" onClick={(event) => onOpenSettings(event.currentTarget)}>
              Open Settings
            </ui-button>
          )}
        </ui-floating-panel>
      </div>
    );
  }

  return null;
}
