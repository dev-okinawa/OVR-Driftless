import type { PerspectiveCamera, Scene } from 'three';
import type { Frame, SessionInfo } from '../domain/types';

/**
 * Something drawn into the 3D scene on top of the devices: the skeleton, for example.
 * The scene view owns the renderer and the camera; a layer only adds and updates its own objects.
 */
export interface SceneLayer {
  /** Adds the layer's objects to the scene. Called once, before the first `update`. */
  attach(scene: Scene): void;
  /** Called on every animation frame that draws a frame, after the camera has moved for it. */
  update(frame: Frame, session: SessionInfo, camera: PerspectiveCamera): void;
  setVisible(visible: boolean): void;
  /** Removes the layer's objects from the scene and disposes their geometries and materials. */
  detach(): void;
}
