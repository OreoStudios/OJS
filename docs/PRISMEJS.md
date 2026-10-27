# PrismeJS — reusable property tests for Sentinel X

PrismeJS is the Node.js adaptation of ideas from OreoLib Prism for Java.
The new package @ojs/prism is opt-in and compatible with Node.js 22+.

## Capabilities

- Deterministic seeded fuzzing, boundary inputs and optional adversarial strings.
- Metamorphic properties: commutative, idempotent, deterministic.
- Differential checks with a trusted reference and round-trip inverses.
- User-defined sync/async assertions and expected-exception contracts.
- Bounded shrinking of failures and JSONL regression case replay.
- Pass/fail reports, failure metadata and HTML export with escaped content.
- Helpers for Sentinel X NDJSON event contracts, secret-literal checks and Prometheus metrics.

## Example

~~~js
const {test} = require('node:test');
const {Prism,generators} = require('@ojs/prism');

test('addition', async () => {
  const report = await new Prism({seed:42,samples:100}).check({
    name:'addition',
    generate:generators.tuple(generators.integer(),generators.integer()),
    fn:(a,b)=>a+b,
    metamorphic:['commutative']
  }).run();
  report.assertSuccess();
});
~~~

Each property requires a name, generate(rng,index) returning an array of
function arguments, and fn. Optionally declare assert, expectedThrows,
metamorphic, reference, inverse, precondition and samples.

Run:

~~~bash
npm install
npm run test:prism
npm test
~~~

## Regression replay

~~~js
const runner=new Prism({seed:20261027,samples:50,shrinkBudget:64,
  regressionDir:'.prism-regressions'});
~~~

Saved failing arguments are stored in local JSONL files keyed by a stable hash
of the property name. They are replayed before newly generated inputs.
The regression directory is gitignored. Never use real passwords, session
tokens, personal data or production payloads as generated inputs because
reports and replay files can retain unredacted arguments.

## Sentinel X integration

~~~js
const fs=require('node:fs');
const {sentinel}=require('@ojs/prism');

// First generate real local test traffic.
const events=sentinel.assertNdjsonEvents(
  fs.readFileSync('supportdesk/logs/app.log','utf8'),
  {forbiddenLiterals:['TEST_ONLY_PASSWORD']}
);
if (!events.some(e=>e.event_type==='auth_failure')) throw Error('Missing auth failure');
~~~

~~~js
// metricsText comes from a real GET /metrics request.
const samples=sentinel.parsePrometheusSamples(metricsText,'auth_attempts_total');
const count=samples.find(s=>s.labels.includes('result="failure"'));
if (!count || count.value<1) throw Error('Missing auth failure metric');
~~~

See examples/prism-sentinel/tests/observability.test.js: it runs the real
OJS observability and security-events components, not the separate EPITECH
Sentinel X SupportDesk application. These examples do not establish live
Wazuh ingestion or detection.

PrismeJS complements Jest/Supertest and never replaces the existing 47
Sentinel X tests or Timéo's Wazuh validation. Do not change the project's
intentional educational vulnerabilities during integration.

Limitations: this is a property/contract runner, not a full JS AST fuzzer,
runtime sandbox, security audit, or deployment validation.
