import { describe, expect, it } from 'vitest';
import type { SessionInfo } from '../domain/types';
import { defaultCameraView, easeOutCubic, interpolateView, type CameraView } from './camera';

describe('defaultCameraView', () => {
  it('looks at the origin from above and in front when there is no session', () => {
    const view = defaultCameraView(null);
    expect(view.target[0]).toBe(0);
    expect(view.target[2]).toBe(0);
    expect(view.position[1]).toBeGreaterThan(view.target[1]);
    expect(view.position[2]).toBeGreaterThan(0);
  });

  it('looks at the middle of the play areas and stays outside them', () => {
    const session: SessionInfo = {
      devices: [],
      floorHeight: 0.1,
      playAreas: [
        {
          trackingSystem: 'headset',
          corners: [
            [1, 0, 1],
            [5, 0, 1],
            [5, 0, 5],
            [1, 0, 5],
          ],
        },
      ],
    };
    const view = defaultCameraView(session);
    expect(view.target[0]).toBeCloseTo(3);
    expect(view.target[2]).toBeCloseTo(3);
    expect(view.target[1]).toBeGreaterThan(0.1);
    expect(Math.hypot(view.position[0] - 3, view.position[2] - 3)).toBeGreaterThan(2.8);
  });
});

describe('interpolateView', () => {
  const near: CameraView = { position: [0, 1, 4], target: [0, 1, 0] };
  const far: CameraView = { position: [6, 5, 6], target: [2, 1, 2] };

  it('starts at the first view and ends at the second', () => {
    const start = interpolateView(near, far, 0);
    const end = interpolateView(near, far, 1);
    for (let i = 0; i < 3; i++) {
      expect(start.position[i]).toBeCloseTo(near.position[i]!);
      expect(start.target[i]).toBeCloseTo(near.target[i]!);
      expect(end.position[i]).toBeCloseTo(far.position[i]!);
      expect(end.target[i]).toBeCloseTo(far.target[i]!);
    }
  });

  it('keeps the camera away from its target when turning to the opposite side', () => {
    const behind: CameraView = { position: [0, 1, -4], target: [0, 1, 0] };
    const middle = interpolateView(near, behind, 0.5);
    expect(Math.hypot(middle.position[0] - middle.target[0], middle.position[2] - middle.target[2])).toBeCloseTo(4);
  });

  it('turns the short way round', () => {
    const left: CameraView = { position: [-4 * Math.sin(0.2), 1, 4 * Math.cos(0.2)], target: [0, 1, 0] };
    const right: CameraView = { position: [4 * Math.sin(0.2), 1, 4 * Math.cos(0.2)], target: [0, 1, 0] };
    expect(interpolateView(left, right, 0.5).position[2]).toBeGreaterThan(3.9);
  });
});

describe('easeOutCubic', () => {
  it('runs from 0 to 1 and is fastest at the start', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
