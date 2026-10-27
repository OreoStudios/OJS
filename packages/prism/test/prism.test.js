'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Prism,generators,sentinel}=require('../src');
test('seeded fuzzing repeats inputs',async()=>{
 const run=async()=>{const xs=[];const report=await new Prism({seed:42,samples:15}).check({name:'square',generate:generators.tuple(generators.integer()),fn:x=>{xs.push(x);return x*x},assert:x=>assert.ok(x>=0)}).run();report.assertSuccess();return xs};
 assert.deepEqual(await run(),await run());
});
test('metamorphic commutative and idempotent checks',async()=>{
 const report=await new Prism({samples:10}).check({name:'sum',generate:generators.tuple(generators.integer(),generators.integer()),fn:(a,b)=>a+b,metamorphic:['commutative','deterministic']}).check({name:'trim',generate:generators.tuple(generators.string()),fn:s=>s.trim(),metamorphic:['idempotent']}).run();
 assert.equal(report.passed,20);report.assertSuccess();
});
test('detects and shrinks failures',async()=>{
 const report=await new Prism({samples:1}).check({name:'bad',generate:()=>[10],fn:n=>n+1,metamorphic:['idempotent']}).run();
 assert.equal(report.failed,1);assert.equal(report.failures[0].category,'METAMORPHIC_IDEMPOTENT');assert.deepEqual(report.failures[0].args,[0]);assert.throws(()=>report.assertSuccess());
});
test('differential comparison',async()=>{
 const report=await new Prism({samples:3}).check({name:'diff',generate:generators.tuple(generators.integer()),fn:n=>n+1,reference:n=>n}).run();
 assert.equal(report.failed,3);assert.equal(report.failures[0].category,'DIFFERENTIAL');
});
test('roundtrip property',async()=>{
 const report=await new Prism({samples:12}).check({name:'codec',generate:generators.tuple(generators.string({adversarial:true})),fn:s=>'p:'+s,inverse:s=>s.slice(2)}).run();report.assertSuccess();
});
test('expected and unexpected exceptions',async()=>{
 const ok=await new Prism({samples:2}).check({name:'throws',generate:()=>[1],fn:()=>{throw TypeError('yes')},expectedThrows:TypeError}).run();ok.assertSuccess();
 const bad=await new Prism({samples:1}).check({name:'crash',generate:()=>[1],fn:()=>{throw Error('no') }}).run();assert.equal(bad.failures[0].category,'EXCEPTION');
});
test('regression fixtures are recorded and replayed',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prisme-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const run=()=>new Prism({samples:1,regressionDir:dir}).check({name:'replay',generate:()=>[10],fn:n=>n+1,metamorphic:['idempotent']}).run();
 assert.equal((await run()).failed,1);const report=await run();assert.equal(report.failed,2);assert.equal(report.failures[0].sample,-1);
});
test('HTML escapes inputs',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prisme-html-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const report=await new Prism({samples:1}).check({name:'<script>',generate:()=>[1],fn:()=>{throw Error('<x>')}}).run();
 const file=path.join(dir,'report.html');report.writeHtml(file);assert.match(fs.readFileSync(file,'utf8'),/&lt;script&gt;/);
});
test('invalid properties rejected',async()=>{
 assert.throws(()=>new Prism({samples:0}),/Invalid/);await assert.rejects(new Prism().run(),/No registered/);
});
test('Sentinel NDJSON event and secret contract',()=>{
 const line=JSON.stringify({timestamp:'2026-10-27T10:00:00Z',level:'warning',event_type:'auth_failure',source_ip:'127.0.0.1',endpoint:'/login',method:'POST',status_code:302,message:'invalid credentials'})+'\n';
 assert.equal(sentinel.assertNdjsonEvents(line,{forbiddenLiterals:['TEST_SECRET']}).length,1);
 assert.throws(()=>sentinel.assertNdjsonEvents(line,{forbiddenLiterals:['invalid credentials']}),/Sensitive/);
 assert.throws(()=>sentinel.assertNdjsonEvents('{invalid'),/Invalid NDJSON/);
});
test('Sentinel Prometheus parsing',()=>{
 const metrics='# HELP auth_attempts_total\n'+'auth_attempts_total{result="failure"} 3\n'+'auth_attempts_total_extra 9\n';
 assert.deepEqual(sentinel.parsePrometheusSamples(metrics,'auth_attempts_total'),[{labels:'result="failure"',value:3}]);
});
test('async contract checks',async()=>{
 const report=await new Prism({samples:2}).check({name:'async',generate:()=>['/health'],fn:async()=>({status:200}),assert:async r=>assert.equal(r.status,200)}).run();report.assertSuccess();
});
