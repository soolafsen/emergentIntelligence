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

const {
  stepSimulation,
} = simulationModule;

const world = { width: 220, height: 180 };

const wanderingState = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'wanderer',
      x: 40,
      y: 80,
      heading: 0,
      carriedChipId: null,
    },
  ],
  woodchips: [],
  signalFields: [],
};

const movedByWander = stepSimulation(wanderingState, {
  moveDistance: 2,
  random: () => 0.9,
});
assert(
  movedByWander.termites[0].x !== wanderingState.termites[0].x ||
    movedByWander.termites[0].y !== wanderingState.termites[0].y,
  'Termite should wander even without chips nearby.',
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
      x: 50,
      y: 50,
      collected: false,
    },
  ],
  signalFields: [],
};

const picked = stepSimulation(pickupCandidateState, {
  moveDistance: 0,
  chipPickupRadius: 8,
  random: () => 0.01,
});
assert(
  picked.termites[0].carriedChipId === 'chip-1',
  'Termite should pick up a nearby chip on contact.',
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
      x: 100,
      y: 100,
      collected: false,
    },
  ],
  signalFields: [],
};

const dropped = stepSimulation(dropState, {
  moveDistance: 0,
  chipPickupRadius: 8,
  chipClusterRadius: 14,
  random: () => 0.25,
});
assert(
  dropped.termites[0].carriedChipId === null,
  'Carrier should drop chip when it encounters another woodchip.',
);
const droppedChip = dropped.woodchips.find((chip) => chip.id === 'chip-1');
assert(
  droppedChip?.collected === false,
  'Dropped chip should return to the active map.',
);
assert(
  droppedChip &&
    Math.hypot(droppedChip.x - dropState.termites[0].x, droppedChip.y - dropState.termites[0].y) > 0.5,
  'Dropped chip should be placed in a nearby empty spot, not directly on the carrier.',
);
assert(
  droppedChip &&
    Math.hypot(droppedChip.x - dropState.woodchips[1].x, droppedChip.y - dropState.woodchips[1].y) <= 14,
  'Dropped chip should land near the chip that triggered the drop.',
);
assert(
  Math.hypot(dropped.termites[0].x - dropState.termites[0].x, dropped.termites[0].y - dropState.termites[0].y) > 1,
  'After dropping, the termite should displace away from the local pile.',
);

console.log('US-003 focused verification passed: wandering, pickup on contact, and nearby empty-space drops.');
