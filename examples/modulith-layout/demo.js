'use strict';
const path = require('node:path');
const { Modulith } = require('@ojs/modulith');
async function main() {
  const modulith = new Modulith().registerDirectory(path.join(__dirname, 'modules'));
  await modulith.start();
  try { process.stdout.write(modulith.get('tickets').titles().join('\n') + '\n'); }
  finally { await modulith.stop(); }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
