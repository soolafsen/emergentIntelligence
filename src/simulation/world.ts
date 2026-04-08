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
const DEFAULT_COLLISION_RADIUS = 18;
const DEFAULT_SIGNAL_FOLLOW_STRENGTH = 0.95;
const DEFAULT_CHIP_SEEK_STRENGTH = 1.2;
const DEFAULT_PICKUP_BIAS = 0.35;
const DEFAULT_DROP_BIAS = 0.2;
const DEFAULT_LOCAL_CUE_DENSITY_SCALE = 8;
const DEFAULT_PICKUP_RADIUS = 14;
const DEFAULT_DROP_CLUSTER_RADIUS = 22;

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

function pickNearest<T extends { x: number; y: number }>(origin: Termite, candidates: T[]): T {
  return candidates.reduce((best, candidate) => {
    const bestDistance = distanceSq(origin.x, origin.y, best.x, best.y);
    const candidateDistance = distanceSq(origin.x, origin.y, candidate.x, candidate.y);
    return candidateDistance < bestDistance ? candidate : best;
  }, candidates[0]);
}

function localUncollectedWoodchips(
  chips: Woodchip[],
  x: number,
  y: number,
  radiusSq: number,
): Woodchip[] {
  return chips.filter((chip) => !chip.collected && distanceSq(x, y, chip.x, chip.y) <= radiusSq);
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
    signalDecay = 0.95,
    signalDeposit = 0.12,
    minSignalIntensity = MIN_SIGNAL_INTENSITY,
    collisionAvoidanceRadius = DEFAULT_COLLISION_RADIUS,
    signalFollowStrength = DEFAULT_SIGNAL_FOLLOW_STRENGTH,
    chipSeekStrength = DEFAULT_CHIP_SEEK_STRENGTH,
    chipPickupBias = DEFAULT_PICKUP_BIAS,
    chipDropBias = DEFAULT_DROP_BIAS,
    localCueDensityScale = DEFAULT_LOCAL_CUE_DENSITY_SCALE,
    chipPickupRadius = DEFAULT_PICKUP_RADIUS,
    chipClusterRadius = DEFAULT_DROP_CLUSTER_RADIUS,
    random = Math.random,
  } = options;

  const collisionRadiusSq = collisionAvoidanceRadius * collisionAvoidanceRadius;
  const pickupRadiusSq = chipPickupRadius * chipPickupRadius;
  const clusterRadiusSq = chipClusterRadius * chipClusterRadius;
  const cueDensityScale = Math.max(1, localCueDensityScale);

  const nextSignalFields: SignalField[] = state.signalFields
    .map((field) => ({
      ...field,
      intensity: field.intensity * signalDecay,
    }))
    .filter((field) => field.intensity >= minSignalIntensity);

  const nextWoodchips: Woodchip[] = state.woodchips.map((chip) => ({
    ...chip,
  }));

  const nextTermites: Termite[] = [];

  for (const termite of state.termites) {
    const { nearbyTermites, nearbyWoodchips, nearbySignals } = perceiveForTermite(
      state,
      termite,
      perceptionRadius,
    );

    // Start with gentle inertia so termites do not jitter at rest.
    let steeringX = Math.cos(termite.heading) * 0.25;
    let steeringY = Math.sin(termite.heading) * 0.25;

    // Strong avoid when another termite is inside the collision radius.
    let avoidX = 0;
    let avoidY = 0;
    for (const neighbor of nearbyTermites) {
      const separation = distance(termite.x, termite.y, neighbor.x, neighbor.y);
      if (separation === 0 || distanceSq(termite.x, termite.y, neighbor.x, neighbor.y) > collisionRadiusSq) {
        continue;
      }
      const force = 1 - separation / collisionAvoidanceRadius;
      avoidX += ((termite.x - neighbor.x) / separation) * force;
      avoidY += ((termite.y - neighbor.y) / separation) * force;
    }

    const collisionAvoidance = Math.hypot(avoidX, avoidY);
    const hasCloseCollision = collisionAvoidance > 0.01;

    if (!hasCloseCollision) {
      // When not strongly avoiding, follow local chips first (when not carrying), else local signals.
      if (termite.carriedChipId === null && nearbyWoodchips.length > 0) {
        const targetChip = pickNearest(termite, nearbyWoodchips);
        const chipDistance = Math.max(
          1,
          distance(termite.x, termite.y, targetChip.x, targetChip.y),
        );
        steeringX += ((targetChip.x - termite.x) / chipDistance) * chipSeekStrength;
        steeringY += ((targetChip.y - termite.y) / chipDistance) * chipSeekStrength;
      } else if (nearbySignals.length > 0) {
        const strongestSignal = nearbySignals.reduce((best, candidate) => {
          return candidate.intensity > best.intensity ? candidate : best;
        }, nearbySignals[0]);
        const signalDistance = Math.max(
          1,
          distance(termite.x, termite.y, strongestSignal.x, strongestSignal.y),
        );
        steeringX += ((strongestSignal.x - termite.x) / signalDistance) * signalFollowStrength;
        steeringY += ((strongestSignal.y - termite.y) / signalDistance) * signalFollowStrength;
      }
    } else {
      // Strong local-collision pressure takes precedence.
      steeringX += avoidX * 1.8;
      steeringY += avoidY * 1.8;
    }

    // Carrying termites still keep some cue following to keep them in visible clusters.
    if (termite.carriedChipId !== null && nearbySignals.length > 0 && !hasCloseCollision) {
      const signalLeader = nearbySignals.reduce((best, candidate) => {
        return candidate.intensity > best.intensity ? candidate : best;
      }, nearbySignals[0]);
      const signalDistance = Math.max(
        1,
        distance(termite.x, termite.y, signalLeader.x, signalLeader.y),
      );
      steeringX += ((signalLeader.x - termite.x) / signalDistance) * (signalFollowStrength * 0.6);
      steeringY += ((signalLeader.y - termite.y) / signalDistance) * (signalFollowStrength * 0.6);
    }

    const heading = Math.atan2(steeringY, steeringX);

    const normalizedMagnitude = Math.hypot(steeringX, steeringY) || 1;
    const nextX = validPosition(termite.x + (steeringX / normalizedMagnitude) * moveDistance, state.world.width);
    const nextY = validPosition(termite.y + (steeringY / normalizedMagnitude) * moveDistance, state.world.height);

    const nextTermite: Termite = {
      ...termite,
      x: nextX,
      y: nextY,
      heading: normalizeAngle(heading),
      carriedChipId: termite.carriedChipId,
    };

    // Pick up behavior: based on pickup bias and cue density (few signals => more likely).
    if (nextTermite.carriedChipId === null) {
      const nearbyPickupCandidates = localUncollectedWoodchips(
        nextWoodchips,
        nextTermite.x,
        nextTermite.y,
        pickupRadiusSq,
      );

      if (nearbyPickupCandidates.length > 0) {
        const cueDensity = Math.min(1, nearbySignals.length / cueDensityScale);
        const pickupProbability = clamp(chipPickupBias * (1 - cueDensity), 0, 1);

        if (random() < pickupProbability) {
          const pickedChip = pickNearest(nextTermite, nearbyPickupCandidates);
          const chipIndex = nextWoodchips.findIndex((chip) => chip.id === pickedChip.id);
          if (chipIndex >= 0) {
            nextWoodchips[chipIndex].collected = true;
            nextTermite.carriedChipId = pickedChip.id;
          }
        }
      }
    } else {
      // Drop behavior: prefer dropping where cluster cues are visible, otherwise stochastic drop rule.
      const nearbyDropCandidates = localUncollectedWoodchips(
        nextWoodchips,
        nextTermite.x,
        nextTermite.y,
        clusterRadiusSq,
      );

      const localClusterDensity = Math.min(
        1,
        (nearbyDropCandidates.length + nearbySignals.length * 0.5) / cueDensityScale,
      );
      const shouldDropByRule = random() < chipDropBias * (0.35 + localClusterDensity);
      const nearCluster = nearbyDropCandidates.length > 0;

      if (nearCluster || shouldDropByRule) {
        const dropIndex = nextWoodchips.findIndex((chip) => chip.id === nextTermite.carriedChipId);
        if (dropIndex >= 0) {
          nextWoodchips[dropIndex] = {
            ...nextWoodchips[dropIndex],
            x: nextTermite.x,
            y: nextTermite.y,
            collected: false,
          };
          nextTermite.carriedChipId = null;
        }
      }
    }

    nextTermites.push(nextTermite);
  }

  const nextSignals = nextSignalFields.concat(
    nextTermites.map((termite) => ({
      id: makeId('signal'),
      x: termite.x,
      y: termite.y,
      intensity: signalDeposit,
    })),
  );

  return {
    ...state,
    tick: state.tick + 1,
    termites: nextTermites,
    woodchips: nextWoodchips,
    signalFields: nextSignals,
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
