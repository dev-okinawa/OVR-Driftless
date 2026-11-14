import type { UiFloatingPanel, UiToastRegion } from '@ai-designer/ui';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CalibrationLeaveDialog } from '../calibration/CalibrationLeaveDialog';
import { CalibrationPanel, type CalibrationDevice } from '../calibration/CalibrationPanel';
import { CalibrationRemoveDialog } from '../calibration/CalibrationRemoveDialog';
import { GraphsPanel } from '../figures/GraphsPanel';
import type { PairDevice } from '../figures/FiguresPanel';
import type { Recording } from '../recording/format';
import { RecordingDialogs } from '../recording/RecordingDialogs';
import { RecordingPanel } from '../recording/RecordingPanel';
import { formatRecordedAt, recordingDuration } from '../recording/recordingSummary';
import { ReplayBar } from '../recording/ReplayBar';
import { useRecordingFlow } from '../recording/useRecordingFlow';
import type { SceneLayer } from '../scene/layer';
import { SceneView, type SceneOptions } from '../scene/SceneView';
import { createLiveSource, DEFAULT_CORE_URL } from '../sources/live/liveSource';
import { createReplaySource, type ReplaySource } from '../sources/replay/replaySource';
import type { PoseSource } from '../sources/source';
import { createSimulatorPairGesture } from '../sources/simulator/simulatorPairGesture';
import { createSimulatorSource, type SimulatorSource } from '../sources/simulator/simulatorSource';
import { DeviceDock } from './DeviceDock';
import { DeviceMark } from './DeviceMark';
import { deviceViews } from '../scene/deviceView';
import { recordFiguresState, replayFiguresState } from './figuresAnnotations';
import { MeasurementsPanel } from './MeasurementsPanel';
import { ProductPlate } from './ProductPlate';
import { ROUTE_TITLES, type StageRoute } from './routes';
import { ScenePlates } from './ScenePlates';
import { attachSource, calibration, figures, recorder, skeleton, skeletonLayer, store } from './services';
import { SettingsPanel, SOURCE_NAMES, type ChosenSource } from './SettingsPanel';
import { recordSkeletonState, replaySkeletonState } from './skeletonAnnotations';
import { StatusChip } from './StatusChip';
import { TopTools, type ViewToggles } from './TopTools';
import { useAnnouncer } from './useAnnouncer';
import { useHashRoute } from './useHashRoute';
import styles from './stage.module.css';

type ActiveSource =
  | { readonly kind: 'live'; readonly source: PoseSource }
  | { readonly kind: 'simulated'; readonly source: SimulatorSource }
  | { readonly kind: 'replay'; readonly source: ReplaySource };

const CORE_URL: string = import.meta.env.VITE_CORE_URL ?? DEFAULT_CORE_URL;

const DEFAULT_VIEW: ViewToggles = { trails: true, bounds: true, skeleton: true, heightLines: false };
const DEFAULT_TRAIL_SECONDS = 1;

/** Demo misalignment of the simulated Lighthouse space, so that a calibration has something to correct. */
const DEMO_LIGHTHOUSE_OFFSET = { yawDeg: 8, offsetMm: 300 } as const;

const RUNNING_PHASES: readonly string[] = ['delay', 'collecting', 'paused', 'computing'];
const isCalibrationRunning = (): boolean => RUNNING_PHASES.includes(calibration.getSnapshot().phase);

const SCENE_LAYERS: readonly SceneLayer[] = [skeletonLayer];
const NO_IDS: readonly string[] = [];

const getTime = (): number | null => store.frame?.time ?? null;
const ignoreSeek = (): void => undefined;

export function App() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const figuresSnapshot = useSyncExternalStore(figures.subscribe, figures.getSnapshot);
  const skeletonSnapshot = useSyncExternalStore(skeleton.subscribe, skeleton.getSnapshot);
  const calibrationSnapshot = useSyncExternalStore(calibration.subscribe, calibration.getSnapshot);
  // What the user wanted while a calibration collects motion, until they confirm stopping it.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  // The first opening of the calibration panel offers "Only observe".
  const [launched, setLaunched] = useState(true);
  const [announcement, announce] = useAnnouncer();

  const askBeforeLeaving = (proceed: () => void): void => {
    if (isCalibrationRunning()) setPendingLeave(() => proceed);
    else proceed();
  };
  const [route, navigate] = useHashRoute((from, _to, proceed) => {
    if (from !== 'calibration' || !isCalibrationRunning()) return false;
    setPendingLeave(() => proceed);
    return true;
  });

  // Opening the application starts the live connection to SteamVR.
  const [chosenSource, setChosenSource] = useState<ChosenSource>('live');
  const recorderSnapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);
  // The recording being replayed; null means the chosen source is active.
  const [replayRecording, setReplayRecording] = useState<Recording | null>(null);
  const [replayFileName, setReplayFileName] = useState('');
  const [active, setActive] = useState<ActiveSource | null>(null);
  // Counts source changes: panels with state of their own start afresh with each source.
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [trailSeconds, setTrailSeconds] = useState(DEFAULT_TRAIL_SECONDS);
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const panelRef = useRef<UiFloatingPanel>(null);
  const toastRef = useRef<UiToastRegion>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const previousRoute = useRef(route);

  const flow = useRecordingFlow(recorder, {
    onSaved: (fileName) => {
      toastRef.current?.add({ message: `Recording saved as ${fileName}`, tone: 'positive' });
      announce(`Recording saved as ${fileName}`);
    },
    onOpen: (recording, fileName) =>
      askBeforeLeaving(() => {
        setReplayFileName(fileName);
        setReplayRecording(recording);
      }),
  });

  useEffect(() => {
    figures.clearPair();
    let next: ActiveSource;
    if (replayRecording) {
      next = { kind: 'replay', source: createReplaySource(replayRecording) };
      calibration.setPairGesture(null);
    } else if (chosenSource === 'live') {
      next = { kind: 'live', source: createLiveSource({ url: CORE_URL }) };
      calibration.setPairGesture(null);
    } else {
      const source = createSimulatorSource({ model: { lighthouseOffset: DEMO_LIGHTHOUSE_OFFSET } });
      next = { kind: 'simulated', source };
      calibration.setPairGesture(createSimulatorPairGesture(source.controls));
    }
    const stopFigures = replayRecording ? replayFiguresState(replayRecording, store, figures) : null;
    const stopSkeleton = replayRecording ? replaySkeletonState(replayRecording, store, skeleton) : null;
    attachSource(next.source);
    setActive(next);
    setSourceEpoch((epoch) => epoch + 1);
    setSelectedDeviceId(null);
    return () => {
      stopFigures?.();
      stopSkeleton?.();
      store.detach();
      setActive(null);
    };
  }, [replayRecording, chosenSource]);

  useEffect(() => {
    const stopFigures = recordFiguresState(figures, recorder);
    const stopSkeleton = recordSkeletonState(skeleton, recorder);
    return () => {
      stopFigures();
      stopSkeleton();
    };
  }, []);

  useEffect(() => skeletonLayer.setVisible(view.skeleton), [view.skeleton]);

  useEffect(() => {
    document.title = `${ROUTE_TITLES[route]} · OVR Driftless`;
  }, [route]);

  // Opening a panel moves focus to its title; closing returns it to the control that opened the panel.
  useEffect(() => {
    const previous = previousRoute.current;
    previousRoute.current = route;
    if (previous === route) return;
    if (previous === 'calibration') setLaunched(false);
    if (route !== 'scene') {
      const panel = panelRef.current;
      void panel?.updateComplete.then(() => requestAnimationFrame(() => panel.focus()));
      return;
    }
    const opener =
      previous === 'calibration'
        ? document.querySelector<HTMLElement>('ui-dock-action')
        : openerRef.current?.isConnected
          ? openerRef.current
          : document.querySelector<HTMLElement>(`ui-button[data-open="${previous}"]`);
    requestAnimationFrame(() => opener?.focus());
  }, [route]);

  // Escape closes a panel also when focus is outside its controls; the panel's own Escape arrives as `ui-close`.
  useEffect(() => {
    if (route === 'scene') return;
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.composedPath().some((node) => node instanceof HTMLDialogElement)) return;
      event.preventDefault();
      navigate('scene');
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [route, navigate]);

  const session = snapshot.session;
  const devices = useMemo(() => deviceViews(session?.devices ?? [], snapshot.deviceStates), [session, snapshot.deviceStates]);
  const replaying = active?.kind === 'replay' ? active.source.recording : null;

  const highlightDeviceIds = useMemo(() => {
    const ids = figuresSnapshot.pair ? [figuresSnapshot.pair.deviceIdA, figuresSnapshot.pair.deviceIdB] : [];
    if (selectedDeviceId) ids.push(selectedDeviceId);
    // While the calibration panel is open the chosen pair is highlighted.
    if (route === 'calibration' && calibrationSnapshot.pair) {
      ids.push(calibrationSnapshot.pair.controllerId, calibrationSnapshot.pair.trackerId);
    }
    return ids.length > 0 ? ids : NO_IDS;
  }, [figuresSnapshot.pair, selectedDeviceId, route, calibrationSnapshot.pair]);
  const highlightedIds = useMemo(() => new Set(highlightDeviceIds), [highlightDeviceIds]);

  const sceneOptions = useMemo<SceneOptions>(
    () => ({ showTrails: view.trails, trailSeconds, showPlayAreas: view.bounds, showHeightLines: view.heightLines }),
    [view.trails, view.bounds, view.heightLines, trailSeconds],
  );

  const pairDevices = useMemo<readonly PairDevice[]>(
    () =>
      devices
        .filter((device) => device.info.role !== 'base-station')
        .map((device) => ({
          id: device.info.id,
          name: device.shortName,
          label: device.label,
          system: device.info.trackingSystem,
          state: device.state,
          mark: <DeviceMark size="lg" device={device} />,
        })),
    [devices],
  );

  const calibrationDevices = useMemo<readonly CalibrationDevice[]>(
    () =>
      devices.map((device) => ({
        id: device.info.id,
        name: device.shortName,
        label: device.label,
        role: device.info.role,
        state: device.state,
      })),
    [devices],
  );
  const renderCalibrationMark = useCallback(
    (deviceId: string, size: 'md' | 'lg') => {
      const device = devices.find((candidate) => candidate.info.id === deviceId);
      return device ? <DeviceMark device={device} size={size} /> : null;
    },
    [devices],
  );

  const getGraphSeries = useCallback(
    () => [
      ...(figuresSnapshot.hasReference ? figures.getSeries() : []),
      ...(skeletonSnapshot.calibrated ? skeleton.getSeries() : []),
    ],
    [figuresSnapshot.hasReference, skeletonSnapshot.calibrated],
  );

  const openPanel = (target: StageRoute, opener: HTMLElement): void => {
    openerRef.current = opener;
    navigate(target);
  };

  const togglePanel = (target: StageRoute, opener: HTMLElement): void => {
    if (route === target) navigate('scene');
    else openPanel(target, opener);
  };

  const closeReplay = (): void => {
    setReplayRecording(null);
    announce(`Replay closed. Source: ${SOURCE_NAMES[chosenSource]}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('ui-status-chip-part[data-open="settings"]')?.focus());
  };

  const toggleDevice = (deviceId: string, selected: boolean): void =>
    setSelectedDeviceId((current) => (selected ? deviceId : current === deviceId ? null : current));

  const chooseGraphPair = (): void => {
    openerRef.current = document.querySelector<HTMLElement>('ui-button[data-open="measurements"]');
    navigate('measurements');
  };

  let graphsEmptyMessage = 'Set a reference or calibrate the skeleton to start the graphs.';
  let canChoosePair = replaying === null;
  const tracking = devices.some((device) => device.info.role !== 'base-station' && device.state === 'tracking');
  if (replaying) {
    graphsEmptyMessage = 'The recording holds no pair reference and no skeleton calibration.';
  } else if (!tracking) {
    graphsEmptyMessage = 'Graphs start when devices are tracked.';
    canChoosePair = false;
  } else if (pairDevices.every((d) => d.system !== 'headset') || pairDevices.every((d) => d.system !== 'lighthouse')) {
    graphsEmptyMessage = 'A pair needs a device of each tracking system.';
    canChoosePair = false;
  }

  const status = snapshot.status;
  let recordBlockedReason: string | null = null;
  if (replaying) recordBlockedReason = 'Close the replay to record';
  else if (status?.state !== 'running') recordBlockedReason = 'Wait for the data source';

  return (
    <>
      <ui-stage label="3D scene of the session" panelLabel={ROUTE_TITLES[route]} widePanelLabel="Graphs" aboveBottomLabel="Notices and replay">
        <div className={styles.scene}>
          <SceneView
            store={store}
            options={sceneOptions}
            layers={SCENE_LAYERS}
            highlightDeviceIds={highlightDeviceIds}
            resetViewSignal={resetViewSignal}
            onDeviceClick={(deviceId) => toggleDevice(deviceId, deviceId !== selectedDeviceId)}
          />
          <ScenePlates
            sourceKind={snapshot.sourceKind}
            status={status}
            noDevices={session !== null && session.devices.length === 0}
            onOpenSettings={(opener) => openPanel('settings', opener)}
          />
        </div>

        <ProductPlate />
        <StatusChip
          calibration={calibrationSnapshot.result}
          drift={figuresSnapshot}
          sourceKind={snapshot.sourceKind}
          sourceStatus={status}
          replay={
            replaying
              ? { fileName: replayFileName, recordedAt: formatRecordedAt(replaying.createdAt), durationSeconds: recordingDuration(replaying) }
              : null
          }
          onOpen={openPanel}
        />
        <TopTools
          view={view}
          onViewChange={(key, value) => setView((current) => ({ ...current, [key]: value }))}
          route={route}
          onTogglePanel={togglePanel}
          recordingControls={<RecordingPanel recorder={recorder} flow={flow} recordBlockedReason={recordBlockedReason} />}
        />

        {route === 'calibration' && (
          <CalibrationPanel
            calibration={calibration}
            devices={calibrationDevices}
            renderMark={renderCalibrationMark}
            launch={launched && calibrationSnapshot.result === null}
            onClose={() => navigate('scene')}
            onObserve={() => navigate('scene')}
            onDone={(outcome) => {
              announce(
                outcome.referenceApplied || outcome.skeletonApplied ? 'Calibration done. Options applied' : 'Calibration done',
              );
              navigate('scene');
            }}
            onRequestLeave={askBeforeLeaving}
            onCloseReplay={closeReplay}
            onAnnounce={announce}
            panelRef={panelRef}
          />
        )}
        {route === 'measurements' && (
          <MeasurementsPanel
            key={sourceEpoch}
            panelRef={panelRef}
            figures={figures}
            skeleton={skeleton}
            devices={pairDevices}
            replay={replaying !== null}
            getTime={getTime}
            onAnnounce={announce}
            onClose={() => navigate('scene')}
          />
        )}
        {route === 'settings' && (
          <SettingsPanel
            panelRef={panelRef}
            simulatorControls={active?.kind === 'simulated' ? active.source.controls : null}
            source={chosenSource}
            recording={recorderSnapshot.isRecording}
            onSourceChange={(next) =>
              askBeforeLeaving(() => {
                setChosenSource(next);
                announce(`Source: ${SOURCE_NAMES[next]}`);
              })
            }
            replay={replaying !== null}
            trailsOn={view.trails}
            trailSeconds={trailSeconds}
            onTrailSeconds={setTrailSeconds}
            calibrated={calibrationSnapshot.result !== null}
            onRemoveCalibration={() => setRemoveOpen(true)}
            onResetView={() => setResetViewSignal((signal) => signal + 1)}
            onCloseReplay={closeReplay}
            onClose={() => navigate('scene')}
          />
        )}
        {route === 'graphs' && (
          <GraphsPanel
            panelRef={panelRef}
            getSeries={getGraphSeries}
            getTime={getTime}
            replayDuration={replaying ? recordingDuration(replaying) : null}
            cutTime={replaying?.truncated ? recordingDuration(replaying) : null}
            onSeek={active?.kind === 'replay' ? active.source.controls.seek : ignoreSeek}
            emptyMessage={graphsEmptyMessage}
            onChoosePair={canChoosePair ? chooseGraphPair : null}
            onClose={() => navigate('scene')}
          />
        )}

        <ui-toast-region ref={toastRef} slot="above-bottom" placement="inline" />
        {active?.kind === 'replay' && (
          <ReplayBar
            controls={active.source.controls}
            interrupted={active.source.recording.truncated}
            recordedAt={formatRecordedAt(active.source.recording.createdAt)}
            onClose={closeReplay}
            closeLabel="Back to simulator"
          />
        )}

        <DeviceDock
          devices={devices}
          highlightedIds={highlightedIds}
          onSelect={toggleDevice}
          calibrated={calibrationSnapshot.result !== null}
          onCalibrate={(opener) => openPanel('calibration', opener)}
        />
      </ui-stage>

      <RecordingDialogs flow={flow} />
      <CalibrationLeaveDialog
        open={pendingLeave !== null}
        onKeep={() => {
          setPendingLeave(null);
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-cancel]')?.focus());
        }}
        onStop={() => {
          const proceed = pendingLeave;
          setPendingLeave(null);
          calibration.cancel();
          proceed?.();
        }}
      />
      <CalibrationRemoveDialog
        open={removeOpen}
        onKeep={() => setRemoveOpen(false)}
        onRemove={() => {
          setRemoveOpen(false);
          calibration.remove();
          announce('Calibration removed');
          requestAnimationFrame(() => panelRef.current?.focus());
        }}
      />
      <div className={styles.visuallyHidden} role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}
