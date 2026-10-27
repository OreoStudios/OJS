#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { assertModuleBoundaries, discoverModuleManifests } = require('../src');

const root = process.argv[2];
if (!root) {
  process.stderr.write('Usage: node check-boundaries.js <modules-directory>\n');
  process.exitCode = 2;
} else {
  try {
    const target = path.resolve(root);
    assertModuleBoundaries(target);
    const manifests = discoverModuleManifests(target);
    process.stdout.write(`OJS boundaries OK: ${manifests.length} modules\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
