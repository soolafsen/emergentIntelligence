import fs from 'node:fs';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

const source = fs.readFileSync('src/simulation/world.ts', 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2022,
    strict: true,
  },
});

const moduleProxy = { exports: {} };
const requireLike = () => {
  throw new Error('Runtime imports should have been type-erased.');
};

const loadSimulation = new Function('require', 'module', 'exports', `${compiled.outputText}\nreturn module.exports;`);
const simulationModule = loadSimulation(requireLike, moduleProxy, moduleProxy.exports);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sequenceRandom(values) {
  let index = 0;
  return () => {
    const next = values[index];
    index = (index + 1) % values.length;
    return next;
  };
}

const {
  stepSimulation,
} = simulationModule;

const world = { width: 220, height: 180 };

const towardSignal = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'towards-signal',
      x: 40,
      y: 80,
      heading: Math.PI,
      carriedChipId: null,
    },
  ],
  woodchips: [],
  signalFields: [
    {
      id: 'signal',
      x: 100,
      y: 80,
      intensity: 1,
    },
  ],
};

const movedTowardSignal = stepSimulation(towardSignal, {
  moveDistance: 2,
  signalDeposit: 0,
  signalDecay: 1,
  random: () => 0.75,
});
assert(
  movedTowardSignal.termites[0].x > towardSignal.termites[0].x,
  'Termite should move towards local signal when no close collision exists.',
);

const collideState = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'evader',
      x: 80,
      y: 80,
      heading: 0,
      carriedChipId: null,
    },
    {
      id: 'obstacle',
      x: 83,
      y: 80,
      heading: 0,
      carriedChipId: null,
    },
  ],
  woodchips: [],
  signalFields: [],
};

const movedAfterCollision = stepSimulation(collideState, {
  moveDistance: 3,
  collisionAvoidanceRadius: 12,
  signalDeposit: 0,
  signalDecay: 1,
  random: () => 0.75,
});
assert(
  movedAfterCollision.termites[0].x < collideState.termites[0].x,
  'Termite should bias away from close neighbors rather than continue forward.',
);

const pickupCandidateState = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'picker',
      x: 50,
      y: 50,
      heading: 0,
      carriedChipId: null,
    },
  ],
  woodchips: [
    {
      id: 'chip-1',
      x: 52,
      y: 50,
      collected: false,
    },
  ],
  signalFields: [],
};

const picked = stepSimulation(pickupCandidateState, {
  moveDistance: 0,
  chipPickupBias: 1,
  chipDropBias: 0,
  chipPickupRadius: 8,
  signalDeposit: 0,
  signalDecay: 1,
  localCueDensityScale: 999,
  random: () => 0.01,
});
assert(
  picked.termites[0].carriedChipId === 'chip-1',
  'Termite should be able to pick up nearby chip based on pickup bias.',
);
assert(
  picked.woodchips[0].collected === true,
  'Picked-up chip should become collected in state.',
);

const dropState = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'carrier',
      x: 100,
      y: 100,
      heading: 0,
      carriedChipId: 'chip-1',
    },
  ],
  woodchips: [
    {
      id: 'chip-1',
      x: 20,
      y: 20,
      collected: true,
    },
    {
      id: 'chip-2',
      x: 102,
      y: 100,
      collected: false,
    },
  ],
  signalFields: [],
};

const dropped = stepSimulation(dropState, {
  moveDistance: 0,
  chipDropBias: 1,
  chipClusterRadius: 8,
  signalDeposit: 0,
  signalDecay: 1,
  random: () => 0.99,
});
assert(
  dropped.termites[0].carriedChipId === null,
  'Carrier should drop chip near another chip cluster.',
);
const droppedChip = dropped.woodchips.find((chip) => chip.id === 'chip-1');
assert(
  droppedChip?.collected === false && droppedChip?.x === dropState.termites[0].x && droppedChip?.y === dropState.termites[0].y,
  'Dropped chip should return to active map at carrier position.',
);

const highCueNoPickup = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'high-cue',
      x: 50,
      y: 50,
      heading: 0,
      carriedChipId: null,
    },
  ],
  woodchips: [
    {
      id: 'chip-2',
      x: 52,
      y: 50,
      collected: false,
    },
  ],
  signalFields: Array.from({ length: 12 }).map((_, idx) => ({
    id: `signal-${idx}`,
    x: 52,
    y: 50,
    intensity: 1,
  })),
};

const noPickup = stepSimulation(highCueNoPickup, {
  moveDistance: 0,
  chipPickupBias: 1,
  localCueDensityScale: 1,
  chipPickupRadius: 12,
  signalDeposit: 0,
  signalDecay: 1,
  random: sequenceRandom([0.2]),
});
assert(
  noPickup.termites[0].carriedChipId === null,
  'High local cue density should suppress pickup probability.',
);

console.log('US-003 focused verification passed: movement bias, collisions, pickup, drop, and cue-density pickup rule.');
