'use strict';
const fs = require('node:fs');
const path = require('node:path');

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function safeFile(moduleDir, file, field) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.includes('\\')) {
    throw new Error(`Invalid ${field}: ${file}`);
  }
  const target = path.resolve(moduleDir, file);
  const relative = path.relative(moduleDir, target);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`${field} must stay inside module: ${file}`);
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.realpathSync(target) !== target) {
    throw new Error(`${field} must reference a regular non-symlinked file: ${file}`);
  }
  return target;
}

function readModuleManifest(moduleDir) {
  const source = path.join(moduleDir, 'package.info');
  let info;
  try { info = JSON.parse(fs.readFileSync(source, 'utf8')); }
  catch (error) { throw new Error(`Invalid package.info at ${source}: ${error.message}`); }
  if (!info || Array.isArray(info) || typeof info !== 'object') throw new Error(`package.info must be an object: ${source}`);
  if (!NAME.test(info.name) || info.name !== path.basename(moduleDir)) throw new Error(`Module name must match its directory: ${source}`);
  if (typeof info.description !== 'string' || !info.description.trim()) throw new Error(`Module description is required: ${source}`);
  if (typeof info.version !== 'string' || !VERSION.test(info.version)) throw new Error(`Invalid module version: ${source}`);
  if (!Array.isArray(info.dependencies) || info.dependencies.some(d => typeof d !== 'string' || !NAME.test(d)) || new Set(info.dependencies).size !== info.dependencies.length || info.dependencies.includes(info.name)) {
    throw new Error(`Invalid module dependencies: ${source}`);
  }
  const entry = info.entry === undefined ? 'index.js' : info.entry;
  const api = info.api === undefined ? 'api/index.js' : info.api;
  if (typeof api !== 'string' || !api.startsWith('api/')) throw new Error(`Public api must be under api/: ${source}`);
  if (entry !== 'index.js') throw new Error(`Module entry must be index.js: ${source}`);
  for (const dir of ['api', 'internal', 'domain']) {
    const dirPath = path.join(moduleDir, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) throw new Error(`Missing ${dir}/ directory: ${source}`);
  }
  const entryFile = safeFile(moduleDir, entry, 'entry');
  const apiFile = safeFile(moduleDir, api, 'api');
  return Object.freeze({ name: info.name, version: info.version, description: info.description, dependencies: Object.freeze([...info.dependencies]), moduleDir, entryFile, apiFile });
}

function discoverModuleManifests(root) {
  const resolved = path.resolve(root);
  const manifests = fs.readdirSync(resolved, { withFileTypes: true })
    .filter(item => item.isDirectory() && !item.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => readModuleManifest(path.join(resolved, item.name)));
  const names = new Set(manifests.map(m => m.name));
  for (const m of manifests) for (const dep of m.dependencies) {
    if (!names.has(dep)) throw new Error(`Module ${m.name} declares missing dependency: ${dep}`);
  }
  return manifests;
}
module.exports = { readModuleManifest, discoverModuleManifests };
