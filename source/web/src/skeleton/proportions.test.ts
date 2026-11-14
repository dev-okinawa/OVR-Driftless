import { describe, expect, it } from 'vitest';
import { BONES, JOINT_NAMES, createProportions } from './proportions';

describe('createProportions', () => {
  it('stacks to the eye height from the floor', () => {
    const p = createProportions(1.8);
    expect(p.ankleHeight + p.shin + p.thigh).toBeCloseTo(p.hipHeight, 9);
    expect(p.hipHeight + p.spine + p.neck).toBeCloseTo(p.eyeHeight, 9);
    expect(p.eyeHeight).toBeGreaterThan(1.8 * 0.9);
    expect(p.eyeHeight).toBeLessThan(1.8);
  });

  it('scales linearly with height', () => {
    const a = createProportions(1.5);
    const b = createProportions(1.8);
    expect(b.thigh / a.thigh).toBeCloseTo(1.2, 9);
  });

  it('has bones between known joints only', () => {
    for (const bone of BONES) {
      expect(JOINT_NAMES).toContain(bone.from);
      expect(JOINT_NAMES).toContain(bone.to);
      expect(bone.name).toBe(`${bone.from}-${bone.to}`);
    }
  });
});
