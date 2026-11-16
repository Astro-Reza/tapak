#!/usr/bin/env node

/**
 * Unified E2E Test Suite Runner for Marswalk
 *
 * Sequentially executes:
 * 1. Node.js E2E Test Suite (`test/e2e-comms.test.mjs`)
 * 2. Python E2E Test Suite (`backend/tests/test_e2e_comms.py` via pytest)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

console.log('================================================================');
console.log('🚀 Running Marswalk End-to-End Comms & Link Budget Test Suites');
console.log('================================================================\n');

// 1. Run Node.js E2E Suite
console.log('[1/2] Running Node.js E2E Test Suite (test/e2e-comms.test.mjs)...');
const nodeTest = spawnSync(process.execPath, ['test/e2e-comms.test.mjs'], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (nodeTest.status !== 0) {
  console.error(`\n❌ Node.js E2E test suite failed with exit code ${nodeTest.status}`);
  process.exit(nodeTest.status ?? 1);
}
console.log('✅ Node.js E2E test suite passed.\n');

// 2. Discover Python interpreter and run Python E2E Suite
console.log('[2/2] Running Python Backend E2E Test Suite (backend/tests/test_e2e_comms.py)...');

let pythonCmd = 'python';
const venvWin = path.join(rootDir, 'backend', '.venv', 'Scripts', 'python.exe');
const venvPosix = path.join(rootDir, 'backend', '.venv', 'bin', 'python');

if (process.env.PYTHON && fs.existsSync(process.env.PYTHON)) {
  pythonCmd = process.env.PYTHON;
} else if (fs.existsSync(venvWin)) {
  pythonCmd = venvWin;
} else if (fs.existsSync(venvPosix)) {
  pythonCmd = venvPosix;
}

const pytestArgs = [
  '-m',
  'pytest',
  '-o',
  'pythonpath=backend',
  'backend/tests/test_e2e_comms.py',
  '-v',
];

const pythonTest = spawnSync(pythonCmd, pytestArgs, {
  cwd: rootDir,
  stdio: 'inherit',
});

if (pythonTest.status !== 0) {
  console.error(`\n❌ Python Backend E2E test suite failed with exit code ${pythonTest.status}`);
  process.exit(pythonTest.status ?? 1);
}
console.log('✅ Python Backend E2E test suite passed.\n');

console.log('================================================================');
console.log('🎉 All E2E Comms & Link Budget tests (Node & Python) PASSED!');
console.log('================================================================');
process.exit(0);
