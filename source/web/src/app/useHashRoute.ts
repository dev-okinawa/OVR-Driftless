import { useCallback, useEffect, useRef, useState } from 'react';
import { hashOf, routeOf, type StageRoute } from './routes';

/**
 * Called before the route leaves `from` for `to`. Return true to take over: the route stays, and `proceed` goes on
 * with the change when the owner decides to (after a confirmation).
 */
export type LeaveGuard = (from: StageRoute, to: StageRoute, proceed: () => void) => boolean;

function isFreshLaunch(): boolean {
  return location.hash === '' || location.hash === '#' || location.hash === '#/';
}

/**
 * The route kept in the address hash. Opening a panel or closing it adds a history entry, so Back closes a panel.
 * A launch without an address opens the calibration: the scene is the first history entry, the calibration the second.
 */
export function useHashRoute(guard: LeaveGuard): readonly [StageRoute, (route: StageRoute) => void] {
  const [route, setRoute] = useState<StageRoute>(() => (isFreshLaunch() ? 'calibration' : routeOf(location.hash)));
  const routeRef = useRef(route);
  const guardRef = useRef(guard);
  useEffect(() => {
    routeRef.current = route;
    guardRef.current = guard;
  });

  useEffect(() => {
    if (isFreshLaunch()) {
      history.replaceState(null, '', hashOf('scene'));
      history.pushState(null, '', hashOf('calibration'));
    }
    const onHashChange = (): void => {
      const next = routeOf(location.hash);
      const current = routeRef.current;
      if (next === current) return;
      const proceed = (): void => {
        if (location.hash !== hashOf(next)) location.hash = hashOf(next);
        routeRef.current = next;
        setRoute(next);
      };
      if (guardRef.current(current, next, proceed)) {
        // Back and forward must not leave yet: put the current entry back.
        history.pushState(null, '', hashOf(current));
        return;
      }
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: StageRoute): void => {
    const current = routeRef.current;
    if (next === current) return;
    const proceed = (): void => {
      if (location.hash !== hashOf(next)) location.hash = hashOf(next);
      routeRef.current = next;
      setRoute(next);
    };
    if (!guardRef.current(current, next, proceed)) proceed();
  }, []);

  return [route, navigate];
}
