import { describe, expect, it } from 'vitest';
import { hashOf, routeOf, STAGE_ROUTES } from './routes';

describe('routes', () => {
  it('reads every route back from its own hash', () => {
    for (const route of STAGE_ROUTES) expect(routeOf(hashOf(route))).toBe(route);
  });

  it('accepts a hash without the slash', () => {
    expect(routeOf('#graphs')).toBe('graphs');
  });

  it('treats an empty or unknown hash as the scene', () => {
    expect(routeOf('')).toBe('scene');
    expect(routeOf('#/')).toBe('scene');
    expect(routeOf('#/not-a-panel')).toBe('scene');
  });
});
