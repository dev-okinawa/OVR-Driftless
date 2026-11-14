/** What the user's hands do during a calibration. Only the simulator implements it; with real devices the user does it. */
export interface PairGesture {
  /** Whether the source can join this pair (simulator: the right controller and the waist tracker). */
  canJoin(controllerId: string, trackerId: string): boolean;
  /** Collecting starts: join the pair if possible and wave it. */
  startWaving(controllerId: string, trackerId: string): void;
  /** Collecting ended: motion returns to what it was; the pair stays joined. */
  stopWaving(): void;
  /** The user detaches the tracker. */
  release(): void;
}
