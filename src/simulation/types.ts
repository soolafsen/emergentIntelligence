export interface WorldDimensions {
  width: number;
  height: number;
}

export interface SimulationState {
  isInitialized: boolean;
  tick: number;
  world: WorldDimensions;
}
