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

const { createSimulationState, stepSimulation, perceiveForTermite } = simulationModule;

const world = { width: 200, height: 180 };

const generated = createSimulationState({
  world,
  termiteCount: 12,
  woodchipCount: 40,
  random: () => 0.42,
});

assert(generated.isInitialized === true, 'Simulation should initialize state');
assert(generated.termites.length === 12, 'Regenerate should create requested termite count');
assert(generated.woodchips.length === 40, 'Regenerate should create requested woodchip count');
assert(
  generated.termites.every((t) => t.x >= 0 && t.x <= world.width && t.y >= 0 && t.y <= world.height),
  'All termites are spawned within world bounds',
);
assert(
  generated.woodchips.every((chip) => chip.x >= 0 && chip.x <= world.width && chip.y >= 0 && chip.y <= world.height),
  'All woodchips are spawned within world bounds',
);

const next = stepSimulation(generated, {
  random: () => 0.99,
});
assert(next.tick === 1, 'stepSimulation must increment tick');
assert(
  next.signalFields.length === 0,
  'Classic termite model should not emit persistent signal fields.',
);

const localState = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'observer',
      x: 50,
      y: 60,
      heading: 0,
      carriedChipId: null,
    },
  ],
  woodchips: [
    { id: 'near', x: 80, y: 60, collected: false },
    { id: 'far', x: 140, y: 60, collected: false },
  ],
  signalFields: [
    { id: 'signal-near', x: 70, y: 60, intensity: 1 },
    { id: 'signal-far', x: 10, y: 10, intensity: 1 },
  ],
};

const perception = perceiveForTermite(localState, localState.termites[0], 35);
assert(perception.nearbyWoodchips.length === 1, 'Perception should include only nearby woodchips by radius.');
assert(perception.nearbyWoodchips[0]?.id === 'near', 'Perception should select the nearest local chip.');
assert(perception.nearbySignals.length === 1, 'Perception should include only nearby signal fields by radius.');

const wrapped = stepSimulation(
  {
    isInitialized: true,
    tick: 0,
    world,
    termites: [
      {
        id: 'wrapper',
        x: 199,
        y: 90,
        heading: 0,
        carriedChipId: null,
      },
    ],
    woodchips: [],
    signalFields: [],
  },
  {
    moveDistance: 4,
    random: () => 0.5,
  },
);
assert(
  wrapped.termites[0].x < 10,
  'Random wandering termites should wrap around world bounds.',
);

console.log('US-002 focused verification passed: local perception, bounded regeneration, and wraparound movement.');
