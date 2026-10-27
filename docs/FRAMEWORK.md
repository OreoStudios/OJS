# OJS Framework API (experimental)

## @ojs/modulith

- `Modulith.register({name, dependencies, factory})` registers a module.
- `await modulith.start()` and `await modulith.stop()` execute lifecycle hooks with reverse-order cleanup.
- `modulith.events.subscribe(type, handler)` and `await modulith.events.publish(type, event)` deliver **in-process**, non-durable events. Failures reject an AggregateError.
- `modulith.graph()` produces Mermaid text; `modulith.order()` gives topological order.
- `Container.provide(token, factory)` and `resolve(token)` offer synchronous dependency injection.
- `Modulith.registerDirectory(root)` loads JSON `package.info` manifests (`name`, `version`, `description`, `dependencies`, `entry`, `api`), checks boundaries, and registers module factories.
- `checkModuleBoundaries(root)` / `assertModuleBoundaries(root)` detect undeclared relative cross-module imports and imports of another module's private `internal/`, `domain/` or `infra/`; dynamic imports are rejected.
- Each module contains `api/`, `internal/`, `domain/`, `index.js`, and `package.info`. See [MODULITH-BOUNDARIES.md](./MODULITH-BOUNDARIES.md) for examples and scanner limitations.

## @ojs/orm

- `model(table, fields, { primaryKey })`, `new OjsORM(db).repository(schema)` provide schema-limited SQLite operations.
- `scopeRepository(repo, {owner_id})` automatically enforces fixed predicates and prevents overriding scoped fields. **The caller must establish the trusted scope from authenticated context.**
- `runMigrations(db, [{id, version, up(db)}])` tracks versioned transactional SQLite migrations.

## Security boundaries

No ORM is universally secure. Parameterization reduces SQL injection risk. It does **not** replace authentication, authorization, CSRF protections, output escaping, dependency patching, SSRF controls or database least privilege. Avoid logging passwords and session tokens.

## Still planned

Durable outbox and event retries, AST-complete boundary analysis (current scanner covers conventional relative imports only), async DI, publication of packages to npm, broader driver support, full integration and load/security audit.
