import type { IconName } from '@ai-designer/ui';
import type { ReactNode } from 'react';
import type { StageRoute } from './routes';
import styles from './stage.module.css';

/** The scene elements the round toggles show and hide. */
export interface ViewToggles {
  readonly trails: boolean;
  readonly bounds: boolean;
  readonly skeleton: boolean;
  readonly heightLines: boolean;
}

export interface TopToolsProps {
  readonly view: ViewToggles;
  readonly onViewChange: (key: keyof ViewToggles, value: boolean) => void;
  /** The open panel; its button shows as pressed. */
  readonly route: StageRoute;
  readonly onTogglePanel: (route: StageRoute, opener: HTMLElement) => void;
  /** The Record and Open recording buttons, which sit between Graphs and Settings. */
  readonly recordingControls: ReactNode;
}

interface ToolButtonProps {
  readonly label: string;
  readonly icon: IconName;
  readonly pressed: boolean;
  readonly tip: string;
  readonly panel?: StageRoute;
  readonly onClick: (event: { currentTarget: HTMLElement }) => void;
}

function ToolButton({ label, icon, pressed, tip, panel, onClick }: ToolButtonProps) {
  return (
    <ui-tooltip content={tip} placement="bottom">
      <ui-button
        variant="floating"
        size="lg"
        iconOnly
        icon={icon}
        label={label}
        data-open={panel}
        toggle
        pressed={pressed}
        onClick={onClick}
      />
    </ui-tooltip>
  );
}

const VIEW_TOGGLES: readonly { readonly key: keyof ViewToggles; readonly icon: IconName; readonly label: string }[] = [
  { key: 'trails', icon: 'trail', label: 'Trails' },
  { key: 'bounds', icon: 'bounds', label: 'Bounds' },
  { key: 'skeleton', icon: 'skeleton', label: 'Skeleton' },
  { key: 'heightLines', icon: 'height-lines', label: 'Height lines' },
];

/**
 * The top-right rows: the view toggles, then the panel buttons with the recording buttons between them.
 * They are two groups, so the stage keeps them at the two ends of its row.
 */
export function TopTools({ view, onViewChange, route, onTogglePanel, recordingControls }: TopToolsProps) {
  const panel = (target: StageRoute, label: string, icon: IconName) => (
    <ToolButton
      label={label}
      icon={icon}
      pressed={route === target}
      tip={label}
      panel={target}
      onClick={(event) => onTogglePanel(target, event.currentTarget)}
    />
  );
  return (
    <>
      <div slot="top-end" className={styles.tools} role="group" aria-label="View">
        {VIEW_TOGGLES.map(({ key, icon, label }) => (
          <ToolButton
            key={key}
            label={label}
            icon={icon}
            pressed={view[key]}
            tip={`${label}: ${view[key] ? 'on' : 'off'}`}
            onClick={() => onViewChange(key, !view[key])}
          />
        ))}
      </div>
      <div slot="top-end" className={styles.tools} role="group" aria-label="Session">
        {panel('measurements', 'Measurements', 'crosshair')}
        {panel('graphs', 'Graphs', 'wave')}
        {recordingControls}
        {panel('settings', 'Settings', 'settings')}
      </div>
    </>
  );
}
