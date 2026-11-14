import type { UiFloatingPanel } from '@ai-designer/ui';
import { useState, type Ref } from 'react';
import { FiguresPanel, type PairDevice } from '../figures/FiguresPanel';
import type { PairFigures } from '../figures/pairFigures';
import { SkeletonPanel } from '../skeleton/SkeletonPanel';
import type { SkeletonStrain } from '../skeleton/skeletonStrain';
import styles from './panels.module.css';

export interface MeasurementsPanelProps {
  readonly figures: PairFigures;
  readonly skeleton: SkeletonStrain;
  readonly devices: readonly PairDevice[];
  readonly replay: boolean;
  readonly getTime: () => number | null;
  readonly onAnnounce: (text: string) => void;
  readonly onClose: () => void;
  readonly panelRef?: Ref<UiFloatingPanel>;
}

const TABS = [
  { id: 'pair', label: 'Pair drift' },
  { id: 'skeleton', label: 'Skeleton' },
];

/** The Measurements panel: Pair drift and Skeleton. */
export function MeasurementsPanel({
  figures,
  skeleton,
  devices,
  replay,
  getTime,
  onAnnounce,
  onClose,
  panelRef,
}: MeasurementsPanelProps) {
  const [tab, setTab] = useState('pair');
  return (
    <ui-floating-panel ref={panelRef} slot="panel" className={styles.panel} heading="Measurements" closable onui-close={onClose}>
      <ui-tabs tabs={TABS} value={tab} onui-change={(event) => setTab(event.detail.value)}>
        <div slot="pair" className={styles.stack}>
          <FiguresPanel figures={figures} devices={devices} replay={replay} getTime={getTime} onAnnounce={onAnnounce} />
        </div>
        <div slot="skeleton" className={styles.stack}>
          <SkeletonPanel skeleton={skeleton} replay={replay} onAnnounce={onAnnounce} />
        </div>
      </ui-tabs>
    </ui-floating-panel>
  );
}
