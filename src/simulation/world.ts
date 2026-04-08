import type { WorldDimensions } from './types';

export interface Termite {
  id: string;
  x: number;
  y: number;
  heading: number;
  carriedChipId: string | null;
}

export interface Woodchip {
  id: string;
  x: number;
  y: number;
  collected: boolean;
}

export interface SignalField {
  id: string;
  x: number;
  y: number;
  intensity: number;
}

export interface SimulationState {
  isInitialized: boolean;
  tick: number;
  world: WorldDimensions;
  termites: Termite[];
  woodchips: Woodchip[];
  signalFields: SignalField[];
}

export interface SimulationConfig {
  world: WorldDimensions;
  termiteCount: number;
  woodchipCount: number;
  random?: () => number;
}

export interface Perception {
  nearbyTermites: Termite[];
  nearbyWoodchips: Woodchip[];
  nearbySignals: SignalField[];
}

export interface AdvanceResult {
  state: SimulationState;
  pickups: number;
  drops: number;
}

export interface StepOptions {
  perceptionRadius?: number;
  moveDistance?: number;
  signalDecay?: number;
  signalDeposit?: number;
  minSignalIntensity?: number;
  collisionAvoidanceRadius?: number;
  signalFollowStrength?: number;
  chipSeekStrength?: number;
  chipPickupBias?: number;
  chipDropBias?: number;
  localCueDensityScale?: number;
  chipPickupRadius?: number;
  chipClusterRadius?: number;
  random?: () => number;
}

const MIN_SIGNAL_INTENSITY = 0.01;
const TWO_PI = Math.PI * 2;
const DEFAULT_MOVE_DISTANCE = 1;
const DEFAULT_PERCEPTION_RADIUS = 70;
const POST_DROP_DISPLACEMENT = 20;

const DIRECTIONS = [
  { dx: -1, dy: -1, heading: -3 * Math.PI / 4 },
  { dx: 0, dy: -1, heading: -Math.PI / 2 },
  { dx: 1, dy: -1, heading: -Math.PI / 4 },
  { dx: 1, dy: 0, heading: 0 },
  { dx: 1, dy: 1, heading: Math.PI / 4 },
  { dx: 0, dy: 1, heading: Math.PI / 2 },
  { dx: -1, dy: 1, heading: 3 * Math.PI / 4 },
  { dx: -1, dy: 0, heading: Math.PI },
] as const;

let nextId = 0;

function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeWorld(world: WorldDimensions): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(world.width)),
    height: Math.max(1, Math.floor(world.height)),
  };
}

function wrapCoordinate(value: number, maxExclusive: number): number {
  const wrapped = value % maxExclusive;
  return wrapped < 0 ? wrapped + maxExclusive : wrapped;
}

function cellKey(x: number, y: number, width: number): number {
  return y * width + x;
}

function distanceSq(aX: number, aY: number, bX: number, bY: number): number {
  const dx = aX - bX;
  const dy = aY - bY;
  return dx * dx + dy * dy;
}

function randomCell(random: () => number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.floor(random() * width),
    y: Math.floor(random() * height),
  };
}

function randomDirection(random: () => number) {
  return DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
}

function buildChipMaps(
  chips: Woodchip[],
  width: number,
): {
  chipByCell: Map<number, number>;
  chipIdToIndex: Map<string, number>;
} {
  const chipByCell = new Map<number, number>();
  const chipIdToIndex = new Map<string, number>();

  for (let index = 0; index < chips.length; index += 1) {
    const chip = chips[index];
    chipIdToIndex.set(chip.id, index);
    if (!chip.collected) {
      chipByCell.set(cellKey(chip.x, chip.y, width), index);
    }
  }

  return { chipByCell, chipIdToIndex };
}

function nearbyEmptyNeighbor(
  x: number,
  y: number,
  chipByCell: Map<number, number>,
  width: number,
  height: number,
  random: () => number,
): { x: number; y: number } | null {
  const start = Math.floor(random() * DIRECTIONS.length);

  for (let offset = 0; offset < DIRECTIONS.length; offset += 1) {
    const direction = DIRECTIONS[(start + offset) % DIRECTIONS.length];
    const neighborX = wrapCoordinate(x + direction.dx, width);
    const neighborY = wrapCoordinate(y + direction.dy, height);
    const neighborKey = cellKey(neighborX, neighborY, width);

    if (!chipByCell.has(neighborKey)) {
      return { x: neighborX, y: neighborY };
    }
  }

  return null;
}

function mutateSimulationStep(
  state: SimulationState,
  chipByCell: Map<number, number>,
  chipIdToIndex: Map<string, number>,
  options: StepOptions = {},
): { pickups: number; drops: number } {
  const { world } = state;
  const { width, height } = normalizeWorld(world);
  const moveDistance = Math.max(0, Math.round(options.moveDistance ?? DEFAULT_MOVE_DISTANCE));
  let pickups = 0;
  let drops = 0;

  for (const termite of state.termites) {
    const direction = randomDirection(options.random ?? Math.random);

    if (moveDistance > 0) {
      termite.x = wrapCoordinate(termite.x + direction.dx * moveDistance, width);
      termite.y = wrapCoordinate(termite.y + direction.dy * moveDistance, height);
    }

    termite.heading = direction.heading;

    const currentCellKey = cellKey(termite.x, termite.y, width);
    const chipIndexAtCell = chipByCell.get(currentCellKey);

    if (termite.carriedChipId === null) {
      if (chipIndexAtCell !== undefined) {
        const pickedChip = state.woodchips[chipIndexAtCell];
        state.woodchips[chipIndexAtCell] = {
          ...pickedChip,
          collected: true,
        };
        chipByCell.delete(currentCellKey);
        termite.carriedChipId = pickedChip.id;
        pickups += 1;
      }
      continue;
    }

    if (chipIndexAtCell === undefined) {
      continue;
    }

    const carriedChipIndex = chipIdToIndex.get(termite.carriedChipId);
    if (carriedChipIndex === undefined) {
      continue;
    }

    const dropCell = nearbyEmptyNeighbor(
      termite.x,
      termite.y,
      chipByCell,
      width,
      height,
      options.random ?? Math.random,
    );

    if (dropCell === null) {
      continue;
    }

    const droppedChip = {
      ...state.woodchips[carriedChipIndex],
      x: dropCell.x,
      y: dropCell.y,
      collected: false,
    };

    state.woodchips[carriedChipIndex] = droppedChip;
    chipByCell.set(cellKey(dropCell.x, dropCell.y, width), carriedChipIndex);
    termite.carriedChipId = null;
    drops += 1;

    const escapeDirection = randomDirection(options.random ?? Math.random);
    termite.x = wrapCoordinate(termite.x + escapeDirection.dx * POST_DROP_DISPLACEMENT, width);
    termite.y = wrapCoordinate(termite.y + escapeDirection.dy * POST_DROP_DISPLACEMENT, height);
    termite.heading = escapeDirection.heading;
  }

  state.tick += 1;
  return { pickups, drops };
}

export function createSimulationState({
  world,
  termiteCount,
  woodchipCount,
  random = Math.random,
}: SimulationConfig): SimulationState {
  const normalizedWorld = normalizeWorld(world);
  const occupiedChipCells = new Set<number>();
  const woodchips: Woodchip[] = [];
  const totalCells = normalizedWorld.width * normalizedWorld.height;

  while (woodchips.length < woodchipCount) {
    const startX = Math.floor(random() * normalizedWorld.width);
    const startY = Math.floor(random() * normalizedWorld.height);
    let placed = false;

    for (let probe = 0; probe < totalCells; probe += 1) {
      const candidateIndex = (startY * normalizedWorld.width + startX + probe) % totalCells;
      const x = candidateIndex % normalizedWorld.width;
      const y = Math.floor(candidateIndex / normalizedWorld.width);
      const key = cellKey(x, y, normalizedWorld.width);

      if (occupiedChipCells.has(key)) {
        continue;
      }

      occupiedChipCells.add(key);
      woodchips.push({
        id: makeId('chip'),
        x,
        y,
        collected: false,
      });
      placed = true;
      break;
    }

    if (!placed) {
      break;
    }
  }

  const termites: Termite[] = Array.from({ length: termiteCount }, () => {
    const direction = randomDirection(random);
    const position = randomCell(random, normalizedWorld.width, normalizedWorld.height);
    return {
      id: makeId('termite'),
      x: position.x,
      y: position.y,
      heading: direction.heading,
      carriedChipId: null,
    };
  });

  return {
    isInitialized: true,
    tick: 0,
    world: normalizedWorld,
    termites,
    woodchips,
    signalFields: [],
  };
}

export function perceiveForTermite(
  state: SimulationState,
  termite: Termite,
  perceptionRadius: number,
): Perception {
  const radiusSq = perceptionRadius * perceptionRadius;

  return {
    nearbyTermites: state.termites.filter(
      (other) => other.id !== termite.id && distanceSq(termite.x, termite.y, other.x, other.y) <= radiusSq,
    ),
    nearbyWoodchips: state.woodchips.filter(
      (chip) => !chip.collected && distanceSq(termite.x, termite.y, chip.x, chip.y) <= radiusSq,
    ),
    nearbySignals: state.signalFields.filter(
      (signal) => distanceSq(termite.x, termite.y, signal.x, signal.y) <= radiusSq,
    ),
  };
}

export function advanceSimulation(
  state: SimulationState,
  steps: number,
  options: StepOptions = {},
): AdvanceResult {
  const workingState: SimulationState = {
    ...state,
    termites: state.termites.map((termite) => ({ ...termite })),
    woodchips: state.woodchips.map((chip) => ({ ...chip })),
    signalFields: [],
  };

  const { chipByCell, chipIdToIndex } = buildChipMaps(
    workingState.woodchips,
    workingState.world.width,
  );

  let pickups = 0;
  let drops = 0;
  const totalSteps = Math.max(0, Math.floor(steps));

  for (let step = 0; step < totalSteps; step += 1) {
    const result = mutateSimulationStep(workingState, chipByCell, chipIdToIndex, options);
    pickups += result.pickups;
    drops += result.drops;
  }

  return {
    state: workingState,
    pickups,
    drops,
  };
}

export function stepSimulation(state: SimulationState, options: StepOptions = {}): SimulationState {
  return advanceSimulation(state, 1, options).state;
}

export { MIN_SIGNAL_INTENSITY };

export function resetSimulation(
  world: WorldDimensions,
  termiteCount: number,
  woodchipCount: number,
): SimulationState {
  return createSimulationState({
    world,
    termiteCount,
    woodchipCount,
  });
}
