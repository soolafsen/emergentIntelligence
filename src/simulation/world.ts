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
const DEFAULT_PERCEPTION_RADIUS = 70;
const DEFAULT_MOVE_DISTANCE = 1.8;
const DEFAULT_PICKUP_RADIUS = 14;
const DEFAULT_DROP_CLUSTER_RADIUS = 18;
const DEFAULT_WANDER_JITTER = 0.8;

let nextId = 0;

function normalizeAngle(angle: number): number {
  while (angle <= -Math.PI) {
    angle += TWO_PI;
  }
  while (angle > Math.PI) {
    angle -= TWO_PI;
  }
  return angle;
}

function makeId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function randomInRange(random: () => number, min: number, max: number): number {
  return random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceSq(aX: number, aY: number, bX: number, bY: number): number {
  const dx = aX - bX;
  const dy = aY - bY;
  return dx * dx + dy * dy;
}

function distance(aX: number, aY: number, bX: number, bY: number): number {
  const square = distanceSq(aX, aY, bX, bY);
  return square > 0 ? Math.sqrt(square) : 0;
}

function validPosition(value: number, max: number): number {
  return clamp(value, 0, max);
}

function wrapPosition(value: number, max: number): number {
  if (value < 0) return max + value;
  if (value > max) return value - max;
  return value;
}

function localUncollectedWoodchips(
  chips: Woodchip[],
  x: number,
  y: number,
  radiusSq: number,
): Woodchip[] {
  return chips.filter((chip) => !chip.collected && distanceSq(x, y, chip.x, chip.y) <= radiusSq);
}

function findNearbyEmptyDropSpot(
  chips: Woodchip[],
  originX: number,
  originY: number,
  world: WorldDimensions,
  contactRadius: number,
  searchRadius: number,
  random: () => number,
): { x: number; y: number } {
  const emptyRadiusSq = contactRadius * contactRadius;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = randomInRange(random, 0, TWO_PI);
    const radius = randomInRange(random, contactRadius * 1.25, searchRadius);
    const candidateX = wrapPosition(originX + Math.cos(angle) * radius, world.width);
    const candidateY = wrapPosition(originY + Math.sin(angle) * radius, world.height);
    const occupied = chips.some(
      (chip) => !chip.collected && distanceSq(candidateX, candidateY, chip.x, chip.y) <= emptyRadiusSq,
    );

    if (!occupied) {
      return { x: candidateX, y: candidateY };
    }
  }

  return {
    x: wrapPosition(originX + contactRadius * 1.5, world.width),
    y: wrapPosition(originY, world.height),
  };
}

export function createSimulationState({
  world,
  termiteCount,
  woodchipCount,
  random = Math.random,
}: SimulationConfig): SimulationState {
  const termites: Termite[] = Array.from({ length: termiteCount }, () => ({
    id: makeId('termite'),
    x: validPosition(randomInRange(random, 0, world.width), world.width),
    y: validPosition(randomInRange(random, 0, world.height), world.height),
    heading: randomInRange(random, -Math.PI, Math.PI),
    carriedChipId: null,
  }));

  const woodchips: Woodchip[] = Array.from({ length: woodchipCount }, () => ({
    id: makeId('chip'),
    x: validPosition(randomInRange(random, 0, world.width), world.width),
    y: validPosition(randomInRange(random, 0, world.height), world.height),
    collected: false,
  }));

  return {
    isInitialized: true,
    tick: 0,
    world,
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

export function stepSimulation(state: SimulationState, options: StepOptions = {}): SimulationState {
  const {
    perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
    moveDistance = DEFAULT_MOVE_DISTANCE,
    chipPickupRadius = DEFAULT_PICKUP_RADIUS,
    chipClusterRadius = DEFAULT_DROP_CLUSTER_RADIUS,
    random = Math.random,
  } = options;

  const pickupRadiusSq = chipPickupRadius * chipPickupRadius;
  const dropSearchRadius = Math.max(chipClusterRadius, chipPickupRadius * 1.5);

  const nextWoodchips: Woodchip[] = state.woodchips.map((chip) => ({
    ...chip,
  }));

  const nextTermites: Termite[] = [];

  for (const termite of state.termites) {
    const nextHeading = normalizeAngle(
      termite.heading + randomInRange(random, -DEFAULT_WANDER_JITTER, DEFAULT_WANDER_JITTER),
    );
    const steeringX = Math.cos(nextHeading);
    const steeringY = Math.sin(nextHeading);
    const normalizedMagnitude = Math.hypot(steeringX, steeringY) || 1;
    const nextX = wrapPosition(termite.x + (steeringX / normalizedMagnitude) * moveDistance, state.world.width);
    const nextY = wrapPosition(termite.y + (steeringY / normalizedMagnitude) * moveDistance, state.world.height);

    const nextTermite: Termite = {
      ...termite,
      x: nextX,
      y: nextY,
      heading: nextHeading,
      carriedChipId: termite.carriedChipId,
    };

    if (nextTermite.carriedChipId === null) {
      const nearbyPickupCandidates = localUncollectedWoodchips(nextWoodchips, nextTermite.x, nextTermite.y, pickupRadiusSq);
      if (nearbyPickupCandidates.length > 0) {
        const pickedChip = nearbyPickupCandidates[0];
        const chipIndex = nextWoodchips.findIndex((chip) => chip.id === pickedChip.id);
        if (chipIndex >= 0) {
          nextWoodchips[chipIndex].collected = true;
          nextTermite.carriedChipId = pickedChip.id;
        }
      }
    } else {
      const nearbyDropCandidates = localUncollectedWoodchips(nextWoodchips, nextTermite.x, nextTermite.y, pickupRadiusSq);
      if (nearbyDropCandidates.length > 0) {
        const dropIndex = nextWoodchips.findIndex((chip) => chip.id === nextTermite.carriedChipId);
        if (dropIndex >= 0) {
          const dropSpot = findNearbyEmptyDropSpot(
            nextWoodchips,
            nextTermite.x,
            nextTermite.y,
            state.world,
            chipPickupRadius,
            dropSearchRadius,
            random,
          );
          nextWoodchips[dropIndex] = {
            ...nextWoodchips[dropIndex],
            x: dropSpot.x,
            y: dropSpot.y,
            collected: false,
          };
          nextTermite.carriedChipId = null;
        }
      }
    }

    nextTermites.push(nextTermite);
  }

  return {
    ...state,
    tick: state.tick + 1,
    termites: nextTermites,
    woodchips: nextWoodchips,
    signalFields: [],
  };
}

export { MIN_SIGNAL_INTENSITY };
export function resetSimulation(world: WorldDimensions, termiteCount: number, woodchipCount: number): SimulationState {
  return createSimulationState({
    world,
    termiteCount,
    woodchipCount,
  });
}
