'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { discoverModuleManifests } = require('./manifest');

function* sourceFiles(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error(`Symlinks are unsupported in modules: ${path.join(dir, item.name)}`);
    const current = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && !item.name.startsWith('.')) yield* sourceFiles(current);
    } else if (item.isFile() && /\.(?:js|cjs|mjs)$/.test(item.name)) yield current;
  }
}

// Lightweight scanner for conventional require/import syntax; not a JS parser.
function withoutComments(input) {
  return input.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/gm, match => match.replace(/[^\n]/g, ' '));
}

function imports(source) {
  const found = [];
  const patterns = [
    /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
    /\b(?:import|export)\s+(?:(?![;\n])[\s\S])*?\s+from\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s+(['"])([^'"\n]+)\1/g
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(source))) found.push({specifier: match[2], offset: match.index});
  }
  // Reject dynamic require()/import(), which cannot be validated safely here.
  for (const re of [/\brequire\s*\(([^)]*)\)/g, /\bimport\s*\(([^)]*)\)/g]) {
    let match;
    while ((match = re.exec(source))) {
      if (!/^\s*(['"])[^'"\n]+\1\s*$/.test(match[1])) {
        found.push({specifier: null, offset: match.index});
      }
    }
  }
  return found;
}

function checkModuleBoundaries(root) {
  const modules = discoverModuleManifests(root);
  const byName = new Map(modules.map(m => [m.name, m]));
  const issues = [];
  const resolved = path.resolve(root);
  for (const m of modules) for (const file of sourceFiles(m.moduleDir)) {
    const source = withoutComments(fs.readFileSync(file, 'utf8'));
    for (const item of imports(source)) {
      const line = source.slice(0, item.offset).split('\n').length;
      const report = message => issues.push({ file: path.relative(resolved, file).replaceAll(path.sep, '/'), line, message });
      if (item.specifier === null) { report('Dynamic require()/import() cannot be boundary-checked'); continue; }
      if (!item.specifier.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), item.specifier);
      const rel = path.relative(resolved, target);
      if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) continue;
      const [targetName, first] = rel.split(path.sep);
      if (!byName.has(targetName) || targetName === m.name) continue;
      if (!m.dependencies.includes(targetName)) report(`Undeclared dependency on ${targetName}`);
      if (first !== 'api') report(`Cross-module import of ${targetName} must use its api/ directory`);
    }
  }
  return issues;
}

function assertModuleBoundaries(root) {
  const issues = checkModuleBoundaries(root);
  if (issues.length) throw new Error('Module boundary violations:\n' + issues.map(i => `${i.file}:${i.line} ${i.message}`).join('\n'));
  return true;
}
module.exports = { checkModuleBoundaries, assertModuleBoundaries };
