'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Prism,generators,sentinel}=require('@ojs/prism');
const {createObservability}=require('@ojs/observability');
const {suspectSqlInput}=require('@ojs/security-events');
test('real OJS JSONL writer keeps event fields without exposing test credentials',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prisme-sentinel-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const observer=createObservability({logFile:path.join(dir,'events.jsonl')});
 const secret='TEST_ONLY_NEVER_LOG';
 const report=await new Prism({samples:5,seed:42}).check({
  name:'JSONL security events',
  generate:generators.tuple(generators.oneOf(['auth_failure','auth_success'])),
  fn:event_type=>observer.write({event_type,source_ip:'127.0.0.1',user:'test@example.invalid',
   endpoint:'/login',method:'POST',status_code:302,message:'Test login attempt',
   body:{password:secret},query:{token:secret}}),
  assert:event=>{
   assert.equal(event.body,null);assert.equal(event.query,null);
   sentinel.assertNdjsonEvents(fs.readFileSync(observer.logFile,'utf8'),{forbiddenLiterals:[secret]});
  }
 }).run();
 report.assertSuccess();
});
test('read actual OJS Prometheus metrics',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prisme-metrics-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const observer=createObservability({logFile:path.join(dir,'events.jsonl')});
 const report=await new Prism({samples:4,seed:7}).check({
  name:'Prometheus exposition',
  generate:generators.tuple(generators.oneOf(['supportdesk_http_requests_total','supportdesk_auth_failure_total'])),
  fn:name=>sentinel.parsePrometheusSamples(observer.metrics(),name),
  assert:rows=>{assert.equal(rows.length,1);assert.ok(Number.isFinite(rows[0].value));}
 }).run();
 report.assertSuccess();
});
test('fuzz actual OJS SQL classifier safely',async()=>{
 const report=await new Prism({samples:30,seed:2026}).check({
  name:'SQL classifier deterministic output',
  generate:generators.tuple(generators.string({adversarial:true})),
  fn:suspectSqlInput,assert:result=>assert.equal(typeof result,'boolean'),
  metamorphic:['deterministic']
 }).run();
 report.assertSuccess();
});
