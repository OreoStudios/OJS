# OJS — Declarative modules and boundary rules

OJS `@ojs/modulith` now supports JSON `package.info` manifests, automatic
module registration, and optional static boundary verification. The original
`new Modulith().register({ name, dependencies, factory })` API still works.

## Module layout

```text
src/modules/
  auth/
    package.info
    index.js           # OJS module factory
    api/index.js       # only entry point for other modules
    internal/           # private implementation
    domain/             # domain model
    infra/              # optional persistence and adapters
  tickets/
    package.info
    index.js
    api/
    internal/
    domain/
```

Each immediate child of the root represents one module. All of
`api/`, `internal/`, and `domain/` must exist.

A `package.info` is a **JSON file** (not a Java properties file):

```json
{
  "name": "tickets",
  "version": "1.0.0",
  "description": "Ticket workflows",
  "dependencies": ["auth", "database"],
  "entry": "index.js",
  "api": "api/index.js"
}
```

- `name` matches the module directory (lowercase kebab case).
- `version` follows a basic semantic version, `description` is required.
- `dependencies` is an array of other module names; no duplicates or self-reference.
- `entry` defaults to `index.js` and currently must have that value. It exports
  a function or an object with a `factory` function.
- `api` defaults to `api/index.js` and must reference a file under `api/`.
- `Modulith.order()` detects circular dependencies before the app starts.

## Registration and lifecycle

```js
const path = require('node:path');
const { Modulith } = require('@ojs/modulith');
const app = new Modulith().registerDirectory(path.join(__dirname, 'modules'));
await app.start();
const tickets = app.get('tickets');
await app.stop();
```

A module factory receives `(dependencies, context)` as with
`Modulith.register()` and must return an object:

```js
// modules/tickets/index.js
module.exports = ({ database }) => ({ listTickets: () => database.list() });
```

## Boundary verification

- `discoverModuleManifests(root)` and `readModuleManifest(dir)` validate metadata.
- `checkModuleBoundaries(root)` returns `{ file, line, message }` diagnostics.
- `assertModuleBoundaries(root)` throws if any violation exists.
- `registerDirectory(root)` checks boundaries by default. For gradual migrations,
  `registerDirectory(root, { enforceBoundaries: false })` disables that scan.

Rules checked for relative CommonJS `require()`, ESM `import` and
`export ... from` declarations in `.js`, `.cjs`, and `.mjs`:

1. A module may import files anywhere within itself.
2. An import from another module must target its **`api/`** directory.
3. The destination module must be declared in `dependencies`.
4. Dynamic `require(variable)` / `import(expression)` are rejected.

Modules can also communicate through declared OJS dependency instances,
without importing another module's source files.

Check the architecture in a CI pipeline:

```bash
node packages/modulith/bin/check-boundaries.js path/to/src/modules
npm test
```

The checker exits nonzero for invalid manifests and boundary violations.

**Important limits:** this is a lightweight static checker, **not** a full
JavaScript AST parser, a TypeScript resolver or a security sandbox. It cannot
guarantee enforcement for aliases, reflection, generated code, or every exotic
syntax variant. For complex codebases, supplement it with AST-based lint rules
and configure any custom module aliases. It does not enforce runtime
authorization or domain data access. The OJS EventBus remains in-process.

## Sentinel X warning

The separate `OreoStudios/OJS/examples/supportdesk` is **not** a drop-in
replacement for EPITECH Sentinel X SupportDesk. It uses different log names,
metric names and security behavior. To migrate the EPITECH application, adopt
only the reusable OJS library, preserve HTTP routes, intentional pedagogical
vulnerabilities, NDJSON event contract, Prometheus metrics and Wazuh rules,
and rerun the existing test suites.
