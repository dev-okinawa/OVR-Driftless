import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../domain/types';
import { mat3FromQuat, mat3Multiply, mat3MultiplyVec3, mat3SymmetricEigenvalues, mat3Transpose } from './mat3';
import type { Mat3 } from './mat3';
import { quatFromAxisAngle, quatFromYaw, quatRotateVec3 } from './quat';

describe('mat3', () => {
  it('matches the quaternion rotation', () => {
    const q = quatFromAxisAngle([1, 2, -0.5], 0.9);
    const v: Vec3 = [0.3, -1.2, 2];
    const byMatrix = mat3MultiplyVec3(mat3FromQuat(q), v);
    const byQuat = quatRotateVec3(q, v);
    for (let i = 0; i < 3; i++) expect(byMatrix[i]).toBeCloseTo(byQuat[i] ?? 0, 12);
  });

  it('turns by +yaw like quatFromYaw: [c·x + s·z, y, -s·x + c·z]', () => {
    const yaw = 0.7;
    const [x, y, z]: Vec3 = [1, 2, 3];
    const turned = mat3MultiplyVec3(mat3FromQuat(quatFromYaw(yaw)), [x, y, z]);
    expect(turned[0]).toBeCloseTo(Math.cos(yaw) * x + Math.sin(yaw) * z, 12);
    expect(turned[1]).toBeCloseTo(y, 12);
    expect(turned[2]).toBeCloseTo(-Math.sin(yaw) * x + Math.cos(yaw) * z, 12);
  });

  it('a rotation times its transpose is the identity', () => {
    const r = mat3FromQuat(quatFromAxisAngle([0.2, 1, 0.4], 2));
    const product = mat3Multiply(r, mat3Transpose(r));
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    product.forEach((value, index) => expect(value).toBeCloseTo(identity[index] ?? 0, 12));
  });

  it('finds the eigenvalues of a diagonal matrix, largest first', () => {
    const m: Mat3 = [2, 0, 0, 0, 5, 0, 0, 0, -1];
    expect(mat3SymmetricEigenvalues(m)).toEqual([5, 2, -1].map((value) => expect.closeTo(value, 12)));
  });

  it('finds the eigenvalues of a dense symmetric matrix', () => {
    // [[2,1,0],[1,2,0],[0,0,4]] has eigenvalues 4, 3, 1.
    const m: Mat3 = [2, 1, 0, 1, 2, 0, 0, 0, 4];
    const values = mat3SymmetricEigenvalues(m);
    expect(values[0]).toBeCloseTo(4, 12);
    expect(values[1]).toBeCloseTo(3, 12);
    expect(values[2]).toBeCloseTo(1, 12);
  });

  it('handles repeated eigenvalues', () => {
    expect(mat3SymmetricEigenvalues([3, 0, 0, 0, 3, 0, 0, 0, 3])).toEqual([3, 3, 3]);
    const values = mat3SymmetricEigenvalues([1, 0, 0, 0, 0.25, 0, 0, 0, 0.25]);
    expect(values[0]).toBeCloseTo(1, 12);
    expect(values[1]).toBeCloseTo(0.25, 12);
    expect(values[2]).toBeCloseTo(0.25, 12);
  });
});
