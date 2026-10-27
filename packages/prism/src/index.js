'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');

function random(seed) {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return {
    next() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0)/4294967296; },
    int(min,max) { return min + Math.floor(this.next() * (max-min+1)); }
  };
}
const generators = {
  integer({min=-100,max=100}={}) {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min>max || max-min>0xffffffff) throw RangeError('Invalid integer range');
    const edges=[...new Set([min,max,0,-1,1].filter(x=>x>=min&&x<=max))];
    return (rng,i)=>i<edges.length?edges[i]:rng.int(min,max);
  },
  boolean:()=>(_,i)=>!!(i%2),
  constant:value=>()=>value,
  oneOf(values) {
    if(!Array.isArray(values)||!values.length) throw TypeError('Expected nonempty choices');
    return (rng,i)=>values[i<values.length?i:rng.int(0,values.length-1)];
  },
  string({maxLength=40,adversarial=false}={}) {
    if(!Number.isInteger(maxLength)||maxLength<0||maxLength>10000) throw RangeError('Invalid maxLength');
    const choices=adversarial?['','a',' ','\n','\u0000','\u202e','é','🙂',"' OR 1=1 --",'../../file','a'.repeat(maxLength)]:['','a',' ','é','🙂','a'.repeat(maxLength)];
    const boundaries=[...new Set(choices.filter(s=>s.length<=maxLength))];
    const alphabet='abcXYZ0123 _-é';
    return (rng,i)=>{
      if(i<boundaries.length) return boundaries[i];
      let s=''; const n=rng.int(0,maxLength);
      for(let j=0;j<n;j++) s+=alphabet[rng.int(0,alphabet.length-1)];
      return s;
    };
  },
  tuple:(...items)=>{
    if(!items.length||items.some(g=>typeof g!=='function')) throw TypeError('Expected generators');
    return (rng,i)=>items.map(g=>g(rng,i));
  }
};

function parseNdjson(input) {
  if(typeof input!=='string') throw TypeError('Expected NDJSON text');
  return input.split(/\r?\n/).filter(Boolean).map((line,i)=>{
    let value;
    try {value=JSON.parse(line);} catch(e){throw Error('Invalid NDJSON line '+(i+1)+': '+e.message);}
    if(!value||typeof value!=='object'||Array.isArray(value)) throw Error('Invalid NDJSON event '+(i+1));
    return value;
  });
}
function assertNdjsonEvents(input,{requiredFields=['timestamp','level','event_type','source_ip','endpoint','method','status_code','message'],forbiddenLiterals=[]}={}) {
  const events=typeof input==='string'?parseNdjson(input):input;
  if(!Array.isArray(events)||!events.length) throw Error('Expected NDJSON events');
  for(const event of events) {
    for(const field of requiredFields) if(!Object.hasOwn(event,field)) throw Error('Missing event field: '+field);
    if(!Number.isInteger(event.status_code)) throw Error('Invalid status_code');
    if(typeof event.timestamp!=='string'||Number.isNaN(Date.parse(event.timestamp))) throw Error('Invalid timestamp');
  }
  const data=JSON.stringify(events);
  for(const secret of forbiddenLiterals) {
    if(typeof secret!=='string'||!secret) throw TypeError('Invalid forbidden literal');
    if(data.includes(secret)) throw Error('Sensitive literal detected');
  }
  return events;
}
function parsePrometheusSamples(input,metric) {
  if(typeof input!=='string'||typeof metric!=='string'||!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metric)) throw TypeError('Invalid Prometheus text or metric');
  return input.split(/\r?\n/).flatMap(line=>{
    if(!line.startsWith(metric)) return [];
    const rest=line.slice(metric.length), match=/^(?:\{([^}]*)\})?\s+([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|[+-]?Inf|NaN)(?:\s|$)/.exec(rest);
    return match?[{labels:match[1]||'',value:Number(match[2])}]:[];
  });
}
const sentinel={parseNdjson,assertNdjsonEvents,parsePrometheusSamples};
const same=isDeepStrictEqual;
const failure=(category,detail)=>({category,detail});
const errorText=e=>e instanceof Error?e.name+': '+e.message:String(e);
async function evaluate(spec,args) {
  let value,thrown;
  try{value=await spec.fn(...args);}catch(e){thrown=e;}
  if(spec.expectedThrows){
    if(!thrown)return failure('EXPECTED_EXCEPTION','Expected exception');
    const predicate=spec.expectedThrows;
    const okay=predicate===Error||predicate.prototype instanceof Error
      ? thrown instanceof predicate:predicate(thrown);
    return okay?null:failure('EXPECTED_EXCEPTION',errorText(thrown));
  }
  if(thrown)return failure('EXCEPTION',errorText(thrown));
  if(spec.assert)try{await spec.assert(value,args);}catch(e){return failure('CONTRACT',errorText(e));}
  for(const rule of spec.metamorphic||[]){
    let nextArgs;
    if(rule==='commutative')nextArgs=[args[1],args[0]];
    else if(rule==='idempotent')nextArgs=[value];
    else nextArgs=args;
    try{if(!same(value,await spec.fn(...nextArgs)))return failure('METAMORPHIC_'+rule.toUpperCase(),'Property mismatch');}
    catch(e){return failure('METAMORPHIC_'+rule.toUpperCase(),errorText(e));}
  }
  if(spec.reference)try{if(!same(value,await spec.reference(...args)))return failure('DIFFERENTIAL','Reference mismatch');}
    catch(e){return failure('DIFFERENTIAL',errorText(e));}
  if(spec.inverse)try{if(!same(args[0],await spec.inverse(value)))return failure('ROUND_TRIP','Inverse mismatch');}
    catch(e){return failure('ROUND_TRIP',errorText(e));}
  return null;
}
function candidates(value){
  if(typeof value==='number'&&Number.isFinite(value)&&value!==0)return [...new Set([0,Math.trunc(value/2),value+(value>0?-1:1)])].filter(v=>v!==value);
  if(typeof value==='string'&&value.length)return [...new Set(['',value.slice(0,Math.floor(value.length/2)),value.slice(0,-1)])].filter(v=>v!==value);
  if(value===true)return [false];
  return [];
}
async function shrink(spec,args,category,budget){
  let current=args.slice();
  while(budget>0){
    let changed=false;
    for(let i=0;i<current.length&&!changed;i++)for(const small of candidates(current[i])){
      if(budget--<=0)break;
      const next=current.slice();next[i]=small;
      if(spec.precondition&&!(await spec.precondition(next)))continue;
      const problem=await evaluate(spec,next);
      if(problem&&problem.category===category){current=next;changed=true;break;}
    }
    if(!changed)break;
  }
  return current;
}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const regressionFile=(dir,name)=>path.join(dir,hash(name)+'.jsonl');
function loadCases(dir,name){
  const file=regressionFile(dir,name);
  if(!fs.existsSync(file))return [];
  if(fs.statSync(file).size>1048576)throw Error('Regression file too large');
  return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>{
    const args=JSON.parse(line);if(!Array.isArray(args))throw Error('Invalid regression fixture');
    return args;
  });
}
function recordCase(dir,name,args){
  let data;
  try{data=JSON.stringify(args);}catch{return;}
  if(!data||data.length>8192)return;
  fs.mkdirSync(dir,{recursive:true});
  const file=regressionFile(dir,name);
  const previous=fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\n'):[];
  if(!previous.includes(data))fs.appendFileSync(file,data+'\n');
}
class PrismReport{
  constructor(){this.passed=0;this.failures=[];}
  get failed(){return this.failures.length;}
  get total(){return this.passed+this.failed;}
  get successful(){return this.total>0&&this.failed===0;}
  assertSuccess(){if(!this.successful)throw Error(this.toString());return this;}
  toString(){return 'PrismeJS: '+this.passed+' passed, '+this.failed+' failed'+this.failures.map(f=>'\n- '+f.name+' #'+f.sample+' seed='+f.seed+' '+f.category+' '+f.detail+' args='+JSON.stringify(f.args)).join('');}
  writeHtml(file){
    const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rows=this.failures.map(f=>'<tr><td>'+escape(f.name)+'</td><td>'+escape(f.sample)+'</td><td>'+escape(f.category)+'</td><td><pre>'+escape(JSON.stringify(f.args))+'</pre></td><td>'+escape(f.detail)+'</td></tr>').join('');
    fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
    fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><title>PrismeJS</title><h1>PrismeJS results</h1><p>'+this.passed+' passed, '+this.failed+' failed</p><table>'+rows+'</table>');
    return this;
  }
}
class Prism {
  constructor({seed=20261027,samples=100,shrinkBudget=64,regressionDir}={}){
    if(!Number.isSafeInteger(seed))throw TypeError('Invalid seed');
    if(!Number.isInteger(samples)||samples<1||samples>1000000)throw RangeError('Invalid samples');
    if(!Number.isInteger(shrinkBudget)||shrinkBudget<0||shrinkBudget>10000)throw RangeError('Invalid shrinkBudget');
    this.seed=seed;this.samples=samples;this.shrinkBudget=shrinkBudget;this.regressionDir=regressionDir;this.specs=[];
  }
  check(spec){
    if(!spec||typeof spec.name!=='string'||!spec.name||typeof spec.fn!=='function'||typeof spec.generate!=='function')throw TypeError('Expected name, fn and generate');
    if(this.specs.some(p=>p.name===spec.name))throw Error('Duplicate property: '+spec.name);
    if(spec.metamorphic&&(!Array.isArray(spec.metamorphic)||spec.metamorphic.some(x=>!['commutative','idempotent','deterministic'].includes(x))))throw TypeError('Unknown metamorphic relation');
    for(const prop of ['assert','reference','inverse','precondition'])if(spec[prop]!==undefined&&typeof spec[prop]!=='function')throw TypeError('Expected '+prop+' function');
    if(spec.expectedThrows&&(spec.assert||spec.reference||spec.inverse||spec.metamorphic?.length))throw TypeError('expectedThrows cannot combine with return contracts');
    this.specs.push(spec);return this;
  }
  async run(){
    if(!this.specs.length)throw Error('No registered PrismeJS properties');
    const report=new PrismReport();
    for(const spec of this.specs){
      const seeded=(this.seed^parseInt(hash(spec.name).slice(0,8),16))>>>0,rng=random(seeded);
      const cases=this.regressionDir?loadCases(this.regressionDir,spec.name).map((args,i)=>({args,i:-i-1,replay:true})):[];
      const samples=spec.samples??this.samples;
      if(!Number.isInteger(samples)||samples<1||samples>1000000)throw RangeError('Invalid property samples');
      for(let i=0;i<samples;i++){
        const args=await spec.generate(rng,i);
        if(!Array.isArray(args))throw TypeError('Generator must return argument array');
        cases.push({args,i,replay:false});
      }
      for(const c of cases){
        if(spec.precondition&&!(await spec.precondition(c.args)))continue;
        const issue=await evaluate(spec,c.args);
        if(!issue){report.passed++;continue;}
        const minimal=await shrink(spec,c.args,issue.category,this.shrinkBudget);
        report.failures.push({name:spec.name,sample:c.i,seed:seeded,category:issue.category,args:minimal,detail:issue.detail});
        if(this.regressionDir&&!c.replay)recordCase(this.regressionDir,spec.name,minimal);
      }
    }
    return report;
  }
}
module.exports={Prism,PrismReport,generators,sentinel};
