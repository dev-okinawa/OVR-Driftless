import { useEffect, useRef, type ReactElement } from 'react';
import type { SessionStore } from '../state/sessionStore';
import type { SceneLayer } from './layer';
import { SceneController, type SceneClasses } from './sceneController';
import type { SceneOptions } from './sceneOptions';
import styles from './SceneView.module.css';

export type { SceneOptions } from './sceneOptions';

export interface SceneViewProps {
  readonly store: SessionStore;
  readonly options: SceneOptions;
  readonly layers?: readonly SceneLayer[];
  /** Devices to emphasize (the declared pair). */
  readonly highlightDeviceIds?: readonly string[];
  /** Incrementing this number resets the camera to the default view. */
  readonly resetViewSignal?: number;
  /** Called when a device mark is clicked. */
  readonly onDeviceClick?: (deviceId: string) => void;
}

const SCENE_CLASSES: SceneClasses = {
  marker: styles.marker ?? '',
  highlighted: styles.highlighted ?? '',
  canvas: styles.canvas ?? '',
  tooltip: styles.tooltip ?? '',
};
const NO_LAYERS: readonly SceneLayer[] = [];
const NO_IDS: readonly string[] = [];

/** The 3D view of every device mark, the play areas, the floor and the trails. Fills its parent element. */
export function SceneView({
  store,
  options,
  layers = NO_LAYERS,
  highlightDeviceIds = NO_IDS,
  resetViewSignal = 0,
  onDeviceClick,
}: SceneViewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SceneController | null>(null);
  const inputs = { options, layers, highlightDeviceIds, resetViewSignal, onDeviceClick };
  const inputsRef = useRef(inputs);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new SceneController(container, store, SCENE_CLASSES, inputsRef.current);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [store]);

  // Runs after every render, after the effect above has created the controller.
  useEffect(() => {
    inputsRef.current = inputs;
    controllerRef.current?.setInputs(inputs);
  });

  return <div ref={containerRef} className={styles.root} />;
}
