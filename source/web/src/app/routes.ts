// The open panel is part of the address, so back, forward and reload keep it.

export type StageRoute = 'scene' | 'calibration' | 'measurements' | 'graphs' | 'settings';

export const STAGE_ROUTES: readonly StageRoute[] = ['scene', 'calibration', 'measurements', 'graphs', 'settings'];

export const ROUTE_TITLES: Readonly<Record<StageRoute, string>> = {
  scene: 'Scene',
  calibration: 'Calibration',
  measurements: 'Measurements',
  graphs: 'Graphs',
  settings: 'Settings',
};

/** `#/measurements` for `measurements`. */
export function hashOf(route: StageRoute): string {
  return `#/${route}`;
}

/** The route of a hash; anything unknown is the plain scene. */
export function routeOf(hash: string): StageRoute {
  const name = hash.replace(/^#\/?/, '');
  return STAGE_ROUTES.find((route) => route === name) ?? 'scene';
}
