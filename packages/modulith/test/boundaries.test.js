'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Modulith, discoverModuleManifests, checkModuleBoundaries, assertModuleBoundaries } = require('../src');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ojs-boundaries-'));
  function add(name, dependencies = []) {
    const dir = path.join(root, name);
    for (const part of ['', 'api', 'internal', 'domain']) fs.mkdirSync(path.join(dir, part), {recursive:true});
    fs.writeFileSync(path.join(dir, 'package.info'), JSON.stringify({name,version:'1.0.0',description:`${name} module`,dependencies,api:'api/index.js'}));
    fs.writeFileSync(path.join(dir, 'api/index.js'), 'module.exports = { ping: () => true };\n');
    fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = () => ({ active: true });\n');
    return dir;
  }
  return {root,add,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('manifest loading and lifecycle from directory', async t => {
  const f=fixture();t.after(f.cleanup);f.add('db');f.add('auth',['db']);
  assert.deepEqual(discoverModuleManifests(f.root).map(m=>m.name),['auth','db']);
  const m=new Modulith().registerDirectory(f.root);
  assert.deepEqual(m.order(),['db','auth']);
  await m.start();assert.equal(m.get('auth').active,true);await m.stop();
});
test('allows imports through public api of declared dependencies', t => {
  const f=fixture();t.after(f.cleanup);f.add('db');const dir=f.add('auth',['db']);
  fs.writeFileSync(path.join(dir,'internal','service.js'),"const api = require('../../db/api');\nmodule.exports = api;\n");
  assert.deepEqual(checkModuleBoundaries(f.root),[]);
});
test('blocks undeclared dependencies and access to private source', t => {
  const f=fixture();t.after(f.cleanup);f.add('db');const dir=f.add('auth');
  fs.writeFileSync(path.join(dir,'internal','service.js'),"const x = require('../../db/internal/repo');\n");
  const issues=checkModuleBoundaries(f.root);
  assert.equal(issues.length,2);
  assert.match(issues.map(i=>i.message).join(' '),/Undeclared dependency/);
  assert.match(issues.map(i=>i.message).join(' '),/must use its api/);
  assert.throws(()=>assertModuleBoundaries(f.root),/Module boundary violations/);
});
test('blocks access to another module domain and bootstrap even with dependency', t => {
  const f=fixture();t.after(f.cleanup);f.add('db');const dir=f.add('auth',['db']);
  fs.writeFileSync(path.join(dir,'internal','service.js'),"import data from '../../db/domain/entity.js';\nexport * from '../../db/index.js';\n");
  const issues=checkModuleBoundaries(f.root);assert.equal(issues.length,2);
  assert.ok(issues.every(i=>/api/.test(i.message)));
});
test('blocks dynamic require when scanning modules', t => {
  const f=fixture();t.after(f.cleanup);const dir=f.add('auth');
  fs.writeFileSync(path.join(dir,'index.js'),"const target = 'some'; require(target);\n");
  assert.match(checkModuleBoundaries(f.root)[0].message,/Dynamic/);
});
test('rejects invalid manifest and missing dependencies', t => {
  const f=fixture();t.after(f.cleanup);const dir=f.add('auth',['db']);
  assert.throws(()=>discoverModuleManifests(f.root),/missing dependency/);
  fs.writeFileSync(path.join(dir,'package.info'), '{ invalid json }');
  assert.throws(()=>discoverModuleManifests(f.root),/Invalid package.info/);
});
test('rejects manifest entry escaping a module', t => {
  const f=fixture();t.after(f.cleanup);const dir=f.add('auth');
  const manifest={name:'auth',version:'1.0.0',description:'auth module',dependencies:[],api:'../index.js'};
  fs.writeFileSync(path.join(dir,'package.info'),JSON.stringify(manifest));
  assert.throws(()=>discoverModuleManifests(f.root),/Public api/);
});
