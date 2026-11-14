/**
 * Every tunable number of the scene's look in one place. Distances are meters in world space unless the name says
 * `Px` or `Ms`. The values follow the designer's spatial view (`ui-spatial-view`, design workspace) where it has one.
 */
export const SCENE_CONFIG = {
  grid: {
    /** The grid is built once, this far to each side of its center; the center follows the camera target. */
    halfSize: 16,
    /** Line spacing; every second line (whole meters) is the readable cell, the others a faint subdivision. */
    step: 0.5,
    /** The grid center moves in whole meters so lines stay on the world's meter marks. */
    snap: 1,
    /** Distance from the camera target at which a line starts to fade and at which it is gone, and its peak opacity. */
    minor: { start: 2, end: 8, strength: 0.8 },
    major: { start: 3, end: 14, strength: 1 },
  },
  areas: {
    /** The headset's area: a neutral pad, black at this opacity. The Lighthouse area has no fill. */
    fillOpacity: 0.15,
    edgeOpacity: 0.1,
    bracketLength: 0.25,
    /** A bracket arm is at most this part of the edge it lies on. */
    bracketMaxFraction: 0.2,
    bracketWidthPx: 2,
    /** Lifts floor drawings off the grid so they do not flicker against it. */
    lift: 0.002,
  },
  trails: {
    /** Points kept per device: one minute at 60 frames a second plus some room. */
    capacity: 4096,
    /** Opacity of the quarters of a trail, oldest to newest. */
    quarterOpacity: [0.15, 0.4, 0.65, 0.9],
  },
  marks: {
    /** How close the pointer must be to a mark's center to point at it, pixels. */
    hitRadiusPx: 18,
    /** The ring where a height line meets the floor. */
    footRadius: 0.06,
    footSegments: 24,
    /** A device lower than this above the floor has no height line. */
    minHeightLine: 0.02,
  },
  camera: {
    fovDegrees: 50,
    near: 0.05,
    far: 300,
    minDistance: 0.6,
    maxDistance: 30,
    /** Angle from straight up: the view never goes below the floor and never looks straight down. */
    minPolarDegrees: 1,
    maxPolarDegrees: 85,
    /** Reset view glides this long, ease-out; immediate with reduced motion. */
    glideMs: 220,
    keyboardPanSpeed: 7,
  },
} as const;
