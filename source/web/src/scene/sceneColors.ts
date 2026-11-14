import { Color } from 'three';

/** Colors of the scene, read from the design kit's `--ui-*` tokens so the scene defines none of its own. */
export interface SceneColors {
  readonly background: Color;
  readonly headset: Color;
  readonly lighthouse: Color;
  readonly critical: Color;
  /** The 0.5 m grid lines. */
  readonly gridMinor: Color;
  /** The 1 m grid lines. */
  readonly gridMajor: Color;
  /** Height lines and the rings where they meet the floor. */
  readonly stem: Color;
  /** Skeleton: bone edges and joint rings. */
  readonly bone: Color;
  /** Floor shading of play areas; black by the design, drawn at a low opacity. */
  readonly shade: Color;
}

/** Reads the colors from the element's computed style; the tokens sit on `:root`, so any attached element works. */
export function readSceneColors(element: Element): SceneColors {
  const style = getComputedStyle(element);
  const read = (name: string): Color => new Color(style.getPropertyValue(name).trim());
  return {
    background: read('--ui-color-surface-scene'),
    headset: read('--ui-color-system-headset'),
    lighthouse: read('--ui-color-system-lighthouse'),
    critical: read('--ui-color-critical'),
    gridMinor: read('--ui-color-data-grid'),
    gridMajor: read('--ui-color-data-axis'),
    stem: read('--ui-color-border-strong'),
    bone: read('--ui-color-data-series-secondary'),
    shade: new Color(0x000000),
  };
}
