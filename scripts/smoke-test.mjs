import { accessSync, constants } from 'node:fs';

const requiredFiles = [
  'index.html',
  'src/main.tsx',
  'src/App.tsx',
  'src/App.css',
  'src/index.css',
  'src/simulation/types.ts',
  'src/simulation/world.ts',
  'src/ui/controls/ControlsPanel.tsx',
  'src/shared/types.ts',
];

for (const file of requiredFiles) {
  accessSync(file, constants.R_OK);
}

console.log('US-001 smoke check: required source files present.');
