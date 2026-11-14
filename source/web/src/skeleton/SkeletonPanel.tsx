import { formatMillimeters, type UiButton } from '@ai-designer/ui';
import { useRef, useState, useSyncExternalStore } from 'react';
import type { SkeletonStrain } from './skeletonStrain';
import type { StrainPartName } from './strain';
import styles from './SkeletonPanel.module.css';

export interface SkeletonPanelProps {
  readonly skeleton: SkeletonStrain;
  /** A replay shows the recorded calibration; it cannot be changed. */
  readonly replay: boolean;
  readonly onAnnounce: (text: string) => void;
}

const PART_LABELS: Readonly<Record<StrainPartName, string>> = {
  spine: 'Spine',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
  leftFootFloor: 'Left foot below floor',
  rightFootFloor: 'Right foot below floor',
  hipsOffset: 'Hips off the head (filtered)',
};

/**
 * Skeleton: calibrate or clear, body height, strain in total and by part. Strained parts use the critical tone.
 * Returns the content of a tab; its owner arranges the groups.
 */
export function SkeletonPanel({ skeleton, replay, onAnnounce }: SkeletonPanelProps) {
  const snapshot = useSyncExternalStore(skeleton.subscribe, skeleton.getSnapshot);
  const [failed, setFailed] = useState(false);
  const calibrateRef = useRef<UiButton>(null);

  const calibrate = (): void => {
    const ok = skeleton.calibrate();
    setFailed(!ok);
    if (ok) onAnnounce('Skeleton calibrated');
  };

  const clear = (): void => {
    skeleton.clearCalibration();
    setFailed(false);
    onAnnounce('Skeleton calibration cleared');
    requestAnimationFrame(() => calibrateRef.current?.focus());
  };

  const { strain } = snapshot;
  return (
    <>
      <div className={styles.group}>
        <div className={styles.row}>
          <ui-button ref={calibrateRef} variant="primary" disabled={replay} onClick={calibrate}>
            {snapshot.calibrated ? 'Calibrate again' : 'Calibrate skeleton'}
          </ui-button>
          {snapshot.calibrated && !replay && (
            <ui-button variant="ghost" onClick={clear}>
              Clear
            </ui-button>
          )}
        </div>
        <ui-text variant="small" tone="muted">
          {replay ? 'A replay shows the recorded calibration.' : 'Stand straight while the spaces are aligned.'}
        </ui-text>
      </div>

      {failed && !replay && <ui-alert tone="critical">Cannot calibrate: the headset is not tracking.</ui-alert>}

      {snapshot.calibrated ? (
        <>
          <ui-description-list
            items={[
              {
                term: 'Height',
                description: snapshot.heightMeters === null ? '—' : `${Math.round(snapshot.heightMeters * 100)} cm`,
                numeric: true,
              },
            ]}
          />
          {strain ? (
            <>
              <ui-stat
                size="lg"
                label="Strain"
                value={formatMillimeters(strain.totalMm)}
                unit="mm"
                tone={strain.totalMm > 0 ? 'critical' : 'neutral'}
              >
                {strain.totalMm > 0 ? 'Some bones cannot follow all their devices.' : 'Every bone follows its devices.'}
              </ui-stat>
              <ui-list dividers label="Strain by part">
                {strain.parts.map((part) => (
                  <ui-list-item key={part.name}>
                    <ui-stat
                      inline
                      label={PART_LABELS[part.name]}
                      value={formatMillimeters(part.mm)}
                      unit="mm"
                      tone={part.mm > 0 ? 'critical' : 'muted'}
                    />
                  </ui-list-item>
                ))}
              </ui-list>
            </>
          ) : (
            <ui-text variant="small">No tracker is tracking: nothing connects the two tracking systems.</ui-text>
          )}
        </>
      ) : (
        <ui-empty-state size="sm" icon="skeleton" heading="Not calibrated">
          Calibrate the skeleton to measure strain.
        </ui-empty-state>
      )}

      <ui-text variant="small" tone="muted">
        Strain is a coarse indicator: crouching, sitting or a tracker slipping on its strap also produce it, not only
        drift between the tracking spaces.
      </ui-text>
    </>
  );
}
