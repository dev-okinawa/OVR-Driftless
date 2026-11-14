export interface SceneOptions {
  readonly showTrails: boolean;
  /** How much history a trail keeps, seconds. */
  readonly trailSeconds: number;
  readonly showPlayAreas: boolean;
  /** A hairline from every device to the floor, ending in a small ring. */
  readonly showHeightLines: boolean;
}
