import { formatMillimeters, type UiButton, type UiFloatingPanel } from '@ai-designer/ui';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { DeviceRole, DeviceState } from '../domain/types';
import type { CalibrationController, CalibrationPair, CalibrationSnapshot, FinishOutcome } from './calibrationController';
import { formatTimeOfDay } from './formatAgo';
import styles from './CalibrationPanel.module.css';

/** A device as the panel names it; the marks come from the shell, which owns how devices are drawn. */
export interface CalibrationDevice {
  readonly id: string;
  /** Short name under a mark. */
  readonly name: string;
  /** Full name, for messages. */
  readonly label: string;
  readonly role: DeviceRole;
  readonly state: DeviceState;
}

export interface CalibrationPanelProps {
  readonly calibration: CalibrationController;
  readonly devices: readonly CalibrationDevice[];
  readonly renderMark: (deviceId: string, size: 'md' | 'lg') => ReactNode;
  /** Not calibrated at launch: steps 1 and 2 offer "Only observe" instead of Cancel. */
  readonly launch: boolean;
  /** Close, Escape, Cancel on steps 1, 2 and 4. During waving the owner asks first. */
  readonly onClose: () => void;
  /** "Only observe". */
  readonly onObserve: () => void;
  readonly onDone: (outcome: FinishOutcome) => void;
  /** Cancel during waving: the owner confirms, then runs `proceed`. */
  readonly onRequestLeave: (proceed: () => void) => void;
  readonly onCloseReplay: () => void;
  readonly onAnnounce: (text: string) => void;
  readonly panelRef: RefObject<UiFloatingPanel | null>;
}

type View = 'choose' | 'join';

const STEP_ITEMS = [
  { id: 'choose', label: 'Choose the pair' },
  { id: 'join', label: 'Join the pair' },
  { id: 'wave', label: 'Wave the pair' },
  { id: 'done', label: 'Result' },
];
const STEP_IDS = ['choose', 'join', 'wave', 'done'] as const;
const TITLES = ['Choose the pair', 'Join the pair', 'Wave the pair', 'Calibrated'];

function stepOf(snapshot: CalibrationSnapshot, view: View): number {
  switch (snapshot.phase) {
    case 'delay':
    case 'collecting':
    case 'paused':
    case 'computing':
      return 3;
    case 'done':
    case 'failed':
      return 4;
    default:
      return view === 'join' ? 2 : 1;
  }
}

const OPTION_REASONS = {
  'pair-not-tracking': 'A device of the pair is not tracking.',
  'headset-not-tracking': 'The headset is not tracking.',
} as const;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

interface StepProps {
  readonly snapshot: CalibrationSnapshot;
  readonly devices: readonly CalibrationDevice[];
  readonly renderMark: CalibrationPanelProps['renderMark'];
}

function deviceOf(devices: readonly CalibrationDevice[], id: string | undefined): CalibrationDevice | undefined {
  return devices.find((device) => device.id === id);
}

function pairName(devices: readonly CalibrationDevice[], pair: CalibrationPair): string {
  const name = (id: string) => deviceOf(devices, id)?.name ?? 'Device';
  return `${name(pair.controllerId)} controller + ${name(pair.trackerId)} tracker`;
}

function PairRow({ snapshot, devices, renderMark }: StepProps) {
  const controller = deviceOf(devices, snapshot.pair?.controllerId);
  const tracker = deviceOf(devices, snapshot.pair?.trackerId);
  if (!controller || !tracker) return null;
  return (
    <div className={styles.pair}>
      <span className={styles.device}>
        {renderMark(controller.id, 'md')}
        <ui-text inline variant="small">
          {controller.name}
        </ui-text>
      </span>
      <ui-icon name="link" />
      <span className={styles.device}>
        {renderMark(tracker.id, 'md')}
        <ui-text inline variant="small">
          {tracker.name}
        </ui-text>
      </span>
    </div>
  );
}

interface ChooseProps extends StepProps {
  readonly calibrated: boolean;
  readonly onCloseReplay: () => void;
}

function blockedReason(snapshot: CalibrationSnapshot, devices: readonly CalibrationDevice[]): string | null {
  const { blocked } = snapshot;
  if (blocked?.reason === 'no-pair') return 'choose a controller and a tracker.';
  if (blocked?.reason === 'pair-not-tracking') {
    return `${deviceOf(devices, blocked.deviceId)?.label ?? 'A device of the pair'} is not tracking.`;
  }
  return null;
}

function Tiles({
  side,
  snapshot,
  devices,
  renderMark,
  chosen,
  disabled,
  onChoose,
}: StepProps & {
  readonly side: 'controller' | 'tracker';
  readonly chosen: string;
  readonly disabled: boolean;
  readonly onChoose: (id: string) => void;
}) {
  const candidates = (side === 'controller' ? snapshot.controllers : snapshot.trackers).map((info) => ({
    info,
    device: deviceOf(devices, info.id),
  }));
  const label = side === 'controller' ? 'Controller' : 'Tracker';
  if (candidates.length === 0) {
    if (disabled) return null;
    return (
      <ui-alert tone="caution" heading={`No ${label.toLowerCase()} is present`}>
        {side === 'controller'
          ? 'Turn on a Quest Touch controller and keep it in view of the headset.'
          : 'Turn on a Vive tracker and keep it in view of the base stations.'}
      </ui-alert>
    );
  }
  const lost = candidates.filter((candidate) => candidate.device?.state !== 'tracking');
  const chosenTracking = candidates.some((candidate) => candidate.info.id === chosen && candidate.device?.state === 'tracking');
  const hint = lost.length
    ? `${lost.map((candidate) => candidate.device?.name ?? 'Device').join(' and ')} ${lost.length > 1 ? 'are' : 'is'} not tracking. ${
        side === 'controller' ? 'Keep it in view of the headset.' : 'Keep it in view of the base stations.'
      }`
    : '';
  return (
    <ui-choice-group
      label={label}
      value={chosenTracking ? chosen : ''}
      disabled={disabled}
      hint={hint}
      onui-change={(event) => onChoose(event.detail.value)}
    >
      {candidates.map(({ info, device }) => (
        <ui-choice key={info.id} value={info.id} disabled={device?.state !== 'tracking'}>
          <span slot="icon">{renderMark(info.id, 'lg')}</span>
          {device?.name ?? info.name}
        </ui-choice>
      ))}
    </ui-choice-group>
  );
}

function ChooseStep({
  snapshot,
  devices,
  renderMark,
  calibrated,
  onCloseReplay,
  draft,
  onChoose,
}: ChooseProps & {
  readonly draft: { readonly controller: string; readonly tracker: string };
  readonly onChoose: (side: 'controller' | 'tracker', id: string) => void;
}) {
  const reason = snapshot.blocked?.reason;
  const unavailable = reason === 'replay' || reason === 'source-unavailable';
  const hint = blockedReason(snapshot, devices);
  const missingSide = snapshot.controllers.length === 0 || snapshot.trackers.length === 0;
  const result = snapshot.result;
  return (
    <>
      <ui-text>Pick the controller and the tracker you will join together.</ui-text>
      {calibrated && result && (
        <ui-alert tone="neutral" heading={`Calibrated at ${formatTimeOfDay(result.appliedAt)}`}>
          The current calibration stays in effect until the new one is applied.
        </ui-alert>
      )}
      {reason === 'replay' && (
        <ui-alert tone="caution" heading="Calibration needs present devices">
          A recording is being replayed, so no device is present. Close the replay to calibrate.
          <ui-button slot="actions" size="sm" onClick={onCloseReplay}>
            Close replay
          </ui-button>
        </ui-alert>
      )}
      {reason === 'source-unavailable' && (
        <ui-alert tone="critical" heading="No data source">
          Calibration needs the headset and the Lighthouse devices, and the data source is not delivering them.
        </ui-alert>
      )}
      <Tiles
        side="controller"
        snapshot={snapshot}
        devices={devices}
        renderMark={renderMark}
        chosen={draft.controller}
        disabled={unavailable}
        onChoose={(id) => onChoose('controller', id)}
      />
      <Tiles
        side="tracker"
        snapshot={snapshot}
        devices={devices}
        renderMark={renderMark}
        chosen={draft.tracker}
        disabled={unavailable}
        onChoose={(id) => onChoose('tracker', id)}
      />
      {!unavailable && hint && !missingSide && (
        <ui-text variant="small" tone="muted">
          Next is unavailable: {lowerFirst(hint)}
        </ui-text>
      )}
      <ui-text variant="small" tone="muted">
        Turn off any other tool that changes device poses before you start; two such tools conflict. The product cannot
        detect them.
      </ui-text>
    </>
  );
}

function JoinStep({ snapshot, devices, renderMark }: StepProps) {
  return (
    <>
      <PairRow snapshot={snapshot} devices={devices} renderMark={renderMark} />
      <ui-text>
        Fix the tracker rigidly to the controller, for example with a strap, so the two cannot shift against each other.
      </ui-text>
      <ui-alert tone="neutral" heading="Rigidity is not checked">
        The product cannot tell whether the pair is joined firmly. A loose joint gives a wrong result.
      </ui-alert>
      <ui-text variant="small" tone="muted">
        Collection starts {snapshot.startDelaySeconds} seconds after you press Start waving.
      </ui-text>
      {snapshot.canJoinOnSimulator !== null && (
        <ui-text variant="small" tone="muted">
          {snapshot.canJoinOnSimulator
            ? 'Simulated data: the simulator joins this pair for you when you press Start waving.'
            : 'Simulated data: the simulator can only join the right controller and the waist tracker; this pair stays apart, so the calibration will fail.'}
        </ui-text>
      )}
    </>
  );
}

function WaveStep({
  snapshot,
  devices,
  renderMark,
  onDismissDiscarded,
}: StepProps & { readonly onDismissDiscarded: () => void }) {
  const { phase, delayLeftSeconds, progress, stalled, discarded, pausedDeviceId } = snapshot;
  const percent = Math.floor(progress * 100);
  if (phase === 'delay') {
    return (
      <div className={styles.centered}>
        <ui-progress-ring
          size="lg"
          label="Time until collection starts"
          max={snapshot.startDelaySeconds}
          value={delayLeftSeconds}
          valueText={`${delayLeftSeconds} seconds`}
        >
          <ui-stat size="lg" label="Starts in" value={String(delayLeftSeconds)} unit="s" />
        </ui-progress-ring>
        <ui-text>Put the headset on and pick up the pair.</ui-text>
      </div>
    );
  }
  const paused = deviceOf(devices, pausedDeviceId ?? undefined);
  return (
    <>
      <div className={styles.centered}>
        <ui-progress-ring size="lg" label="Motion collected" value={percent} valueText={`${percent}%`}>
          <ui-stat
            size="lg"
            label={phase === 'computing' ? 'Computing the alignment' : 'Motion collected'}
            value={String(percent)}
            unit="%"
          />
        </ui-progress-ring>
      </div>
      {phase === 'paused' && paused && (
        <ui-alert tone="caution" heading="Collection paused">
          {paused.label} {paused.state === 'disconnected' ? 'is disconnected. Reconnect it' : 'lost tracking. Bring it back into view'};
          collection continues on its own.
        </ui-alert>
      )}
      {stalled && (
        <ui-alert tone="caution" heading="Turn the pair as well as move it">
          Moving without turning gives no usable motion.
        </ui-alert>
      )}
      {discarded && (phase === 'collecting' || phase === 'paused') && (
        <ui-alert
          tone="caution"
          heading="Motion discarded"
          dismissible
          onui-dismiss={(event) => {
            event.preventDefault();
            onDismissDiscarded();
          }}
        >
          The headset recentered, so the motion collected before it no longer fits. Collection continues from 0%.
        </ui-alert>
      )}
      <PairRow snapshot={snapshot} devices={devices} renderMark={renderMark} />
      <ui-text>
        {phase === 'computing'
          ? 'Keep the pair joined until the result is applied.'
          : 'Move the pair and turn it in every direction, in front of the headset. Keep it joined until the result is applied.'}
      </ui-text>
    </>
  );
}

function ResultStep({
  snapshot,
  devices,
  options,
  onOptions,
}: {
  readonly snapshot: CalibrationSnapshot;
  readonly devices: readonly CalibrationDevice[];
  readonly options: { readonly setReference: boolean; readonly fitSkeleton: boolean };
  readonly onOptions: (options: { readonly setReference: boolean; readonly fitSkeleton: boolean }) => void;
}) {
  const { failure, result, pair } = snapshot;
  if (snapshot.phase === 'failed') {
    return (
      <>
        <ui-alert tone="critical" heading="Nothing was applied">
          {result
            ? `The previous calibration, applied at ${formatTimeOfDay(result.appliedAt)}, stays in effect.`
            : 'No calibration is in effect.'}
        </ui-alert>
        <ui-description-list
          items={[
            ...(pair ? [{ term: 'Pair', description: pairName(devices, pair) }] : []),
            failure?.reason === 'fit-error'
              ? {
                  term: 'Fit error',
                  description: `${formatMillimeters(failure.fitErrorMm)} mm, above the limit of ${formatMillimeters(failure.limitMm)} mm`,
                  numeric: true,
                }
              : { term: 'Fit error', description: 'The motion did not determine an alignment' },
          ]}
        />
        <ui-text>Check that the tracker is rigidly joined to the controller, then turn the pair more in every direction.</ui-text>
      </>
    );
  }
  const referenceBlocked = snapshot.doneOptions.reference ? OPTION_REASONS[snapshot.doneOptions.reference] : '';
  const skeletonBlocked = snapshot.doneOptions.skeleton ? OPTION_REASONS[snapshot.doneOptions.skeleton] : '';
  return (
    <>
      <ui-alert tone="positive" heading="The spaces are aligned">
        The result is applied to every Lighthouse device.
      </ui-alert>
      {result && (
        <ui-description-list
          items={[
            { term: 'Pair', description: pairName(devices, result) },
            { term: 'Applied at', description: formatTimeOfDay(result.appliedAt), numeric: true },
            { term: 'Fit error', description: `${formatMillimeters(result.fitErrorMm)} mm`, numeric: true },
          ]}
        />
      )}
      <ui-text>Detach the tracker and put it where you use it, or keep the pair joined to measure its drift first.</ui-text>
      <div className={styles.group}>
        <ui-checkbox
          label="Set reference for this pair"
          hint={referenceBlocked || 'Measures drift of the pair from this moment. Keep the pair joined while you measure.'}
          disabled={referenceBlocked !== ''}
          checked={options.setReference && referenceBlocked === ''}
          onui-change={(event) => onOptions({ ...options, setReference: event.detail.value })}
        />
        <ui-checkbox
          label="Fit the skeleton"
          hint={skeletonBlocked || 'Uses the trackers you wear, not the tracker of this pair.'}
          disabled={skeletonBlocked !== ''}
          checked={options.fitSkeleton && skeletonBlocked === ''}
          onui-change={(event) => onOptions({ ...options, fitSkeleton: event.detail.value })}
        />
      </div>
    </>
  );
}

/**
 * The calibration panel: four steps in a floating panel. Steps 1 and 2 are its own view while the controller is
 * idle; steps 3 and 4 follow the controller's phase. It renders the snapshot and sends commands, nothing else.
 */
export function CalibrationPanel({
  calibration,
  devices,
  renderMark,
  launch,
  onClose,
  onObserve,
  onDone,
  onRequestLeave,
  onCloseReplay,
  onAnnounce,
  panelRef,
}: CalibrationPanelProps) {
  const snapshot = useSyncExternalStore(calibration.subscribe, calibration.getSnapshot);
  const [view, setView] = useState<View>('choose');
  const [draft, setDraft] = useState(() => ({
    controller: snapshot.pair?.controllerId ?? '',
    tracker: snapshot.pair?.trackerId ?? '',
  }));
  const [options, setOptions] = useState({ setReference: true, fitSkeleton: false });
  const cancelRef = useRef<UiButton>(null);

  const { phase } = snapshot;
  const step = stepOf(snapshot, view);
  const running = step === 3;
  const failed = phase === 'failed';

  // Leaving the panel in any way ends a finished attempt, so that reopening starts at step 1.
  useEffect(() => () => calibration.dismissResult(), [calibration]);

  // A reset of the controller (a new source) clears the pair: the panel starts over at step 1.
  const lastPair = useRef(snapshot.pair);
  useEffect(() => {
    const hadPair = lastPair.current !== null;
    lastPair.current = snapshot.pair;
    if (hadPair && snapshot.pair === null && phase === 'idle') {
      setView('choose');
      setDraft({ controller: '', tracker: '' });
    }
  }, [snapshot.pair, phase]);

  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    // A step change lands on the new title; the wait puts focus on Cancel instead.
    requestAnimationFrame(() => (phase === 'delay' ? cancelRef.current : panelRef.current)?.focus());
  }, [step, phase, panelRef]);

  const last = useRef<{ phase: typeof phase; stalled: boolean; discarded: boolean } | null>(null);
  const { stalled, discarded, pausedDeviceId } = snapshot;
  useEffect(() => {
    const previous = last.current;
    last.current = { phase, stalled, discarded };
    if (!previous) return;
    if (previous.phase !== phase) {
      if (phase === 'delay') onAnnounce(`Calibration starts in ${snapshot.startDelaySeconds} seconds`);
      else if (phase === 'collecting') onAnnounce(previous.phase === 'delay' ? 'Collecting motion' : 'Collection continues');
      else if (phase === 'paused') onAnnounce(`Collection paused: ${deviceOf(devices, pausedDeviceId ?? undefined)?.label ?? 'a device'} is not tracking`);
      else if (phase === 'computing') onAnnounce('Computing the alignment');
      else if (phase === 'done') onAnnounce('Calibration applied');
      else if (phase === 'failed') onAnnounce('Calibration failed. Nothing was applied');
      else if (phase === 'idle' && previous.phase !== 'done' && previous.phase !== 'failed') onAnnounce('Calibration stopped. Nothing was applied');
    }
    if (stalled && !previous.stalled) onAnnounce('Turn the pair as well as move it');
    if (discarded && !previous.discarded) onAnnounce('Motion discarded. Collection started again');
    // Announcements follow the snapshot; `devices` is read for names at that moment.
  }, [phase, stalled, discarded, pausedDeviceId]);

  const choose = (side: 'controller' | 'tracker', id: string): void => {
    const next = { ...draft, [side]: id };
    setDraft(next);
    if (next.controller && next.tracker) calibration.choosePair(next.controller, next.tracker);
  };

  const close = (): void => {
    calibration.dismissResult();
    onClose();
  };

  const back = (): void => {
    calibration.dismissResult();
    setView('choose');
  };

  const done = (): void => {
    onDone(calibration.finish(options));
  };

  const blocked = snapshot.blocked !== null;
  const leftLabel = launch ? 'Only observe' : 'Cancel';
  const footerSecondary = (label: string, onClick: () => void) => (
    <ui-button slot="footer" className={styles.footerSecondary} size="lg" variant={launch ? 'ghost' : 'secondary'} onClick={onClick}>
      {label}
    </ui-button>
  );

  let footer: ReactNode;
  if (step === 1) {
    footer = (
      <>
        {footerSecondary(leftLabel, launch ? onObserve : close)}
        <ui-button slot="footer" className={styles.footerPrimary} size="lg" variant="primary" disabled={blocked} onClick={() => setView('join')}>
          Next
        </ui-button>
      </>
    );
  } else if (step === 2) {
    footer = (
      <>
        {footerSecondary('Back', back)}
        <ui-button slot="footer" className={styles.footerPrimary} size="lg" variant="primary" disabled={blocked} onClick={() => calibration.start()}>
          Start waving
        </ui-button>
      </>
    );
  } else if (running) {
    footer = (
      <ui-button ref={cancelRef} data-cancel slot="footer" className={styles.footerPrimary} size="lg" onClick={() => onRequestLeave(() => setView('join'))}>
        Cancel
      </ui-button>
    );
  } else if (failed) {
    footer = (
      <>
        {footerSecondary('Back', back)}
        <ui-button slot="footer" className={styles.footerPrimary} size="lg" variant="primary" onClick={() => calibration.tryAgain()}>
          Try again
        </ui-button>
      </>
    );
  } else {
    footer = (
      <ui-button slot="footer" className={styles.footerPrimary} size="lg" variant="primary" onClick={done}>
        Done
      </ui-button>
    );
  }

  const stepProps = { snapshot, devices, renderMark };
  let body: ReactNode;
  if (step === 1) {
    body = (
      <ChooseStep
        {...stepProps}
        calibrated={snapshot.result !== null}
        onCloseReplay={onCloseReplay}
        draft={draft}
        onChoose={choose}
      />
    );
  } else if (step === 2) body = <JoinStep {...stepProps} />;
  else if (step === 3) body = <WaveStep {...stepProps} onDismissDiscarded={() => calibration.dismissDiscarded()} />;
  else body = <ResultStep snapshot={snapshot} devices={devices} options={options} onOptions={setOptions} />;

  return (
    <ui-floating-panel
      ref={panelRef}
      slot="panel"
      className={styles.panel}
      closable
      eyebrow={`Calibration · step ${step} of 4`}
      heading={failed ? 'Calibration failed' : (TITLES[step - 1] ?? '')}
      onui-close={close}
    >
      <ui-steps slot="header-extra" variant="bar" items={STEP_ITEMS} current={STEP_IDS[step - 1] ?? 'choose'} />
      <div className={styles.stack}>{body}</div>
      {footer}
    </ui-floating-panel>
  );
}
