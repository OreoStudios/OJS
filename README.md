# OJS — Reusable Node.js Modulith + ORM

OJS is an independent, reusable Node.js toolkit, with a **Sentinel X
SupportDesk** application serving as a real-world example.

**Packages:** @ojs/modulith (modules, events, DI), @ojs/orm (bound SQL,
migrations, scoped repositories), @ojs/observability (JSONL logs and Prometheus
metrics), @ojs/security-events (event normalization and safety helpers).

## Sentinel X Quick Start

Requirements: Node.js 22+, Docker Compose, git, Python 3.
To test locally:

    npm install
    npm run test:all

To start the application with Prometheus and Grafana, copy .env.example to
.env, replace both secrets and run:

    docker compose up --build -d

Local service URLs: SupportDesk http://127.0.0.1:3000,
Prometheus http://127.0.0.1:9090,
Grafana http://127.0.0.1:3001.

For **all Wazuh components** use:

    bash wazuh/bootstrap.sh

Read wazuh/README.md for dependencies, certificates, expected Wazuh alerts,
startup troubleshooting and local-only security restrictions.

Local educational demo accounts (NEVER use publicly):
admin@supportdesk.local / Admin_123,
jdupont@supportdesk.local / User_1234.

## One Compose with the complete Sentinel X stack

To satisfy the final EPITECH Compose deliverable (app + Prometheus + Grafana
+ Wazuh Manager/Indexer/Dashboard), prepare the official Wazuh certificates
and then launch all six services in one Compose project:

    cp .env.example .env
    # Replace the example passwords with strong secrets
    OJS_PREPARE_ONLY=1 bash wazuh/bootstrap.sh
    docker compose -f compose.full.yml up -d --build
    docker compose -f compose.full.yml ps

The Wazuh dashboard is on https://127.0.0.1:8443. Expect a self-signed
certificate warning. The full Compose has passed CI syntax validation,
but the Wazuh runtime still requires manual hardware-dependent validation
and live alert evidence.

## EPITECH documentation

- CONTRACT.md — required technical contract, still awaiting team validation.
- docs/ATTACK-PLANS.md — at least three detailed *draft* plans.
- docs/SENTINEL-X-RUNBOOK.md — Wazuh validation and attack notes.
- docs/QA-CHECKLIST.md — functional, non-functional and final verification.

## Status and limits

SupportDesk key routes and OJS observability/security packages are implemented,
with automated HTTP tests. Actual Docker/Wazuh launch, Wazuh alert screenshots,
attack executions, false-positive measurements, full security audit and
team approval require separate execution and verification.

OJS reduces repetitive security and observability work; no Node.js ORM can
guarantee that an entire application is fully secure.

## Declarative modulith manifests and boundaries

Reusable `@ojs/modulith` now supports JSON `package.info` module manifests, `api/internal/domain` structure, `Modulith.registerDirectory()` and automated source boundary checks.

- [Manifest schema and architecture rules](docs/MODULITH-BOUNDARIES.md)
- Demo: `npm run check:modules` then `npm run demo --workspace=@ojs/modulith-layout-example`
- Existing `Modulith.register()` calls remain supported.

The boundary checker covers conventional static relative imports; it is not a full security sandbox or an AST-complete analyzer.

## PrismeJS — automatic tests inspired by OreoLib Prism

The new `@ojs/prism` package provides seeded fuzzing, metamorphic tests, differential comparisons, inverse/round-trip checks, minimized failures and replayable regression cases. It includes NDJSON and Prometheus helpers designed especially for Sentinel X test contracts.

- Run `npm run test:prism` to execute the PrismeJS package tests and real OJS observability examples.
- See [PrismeJS documentation](docs/PRISMEJS.md).
- The separate EPITECH Sentinel X application must opt in explicitly; these tests do not prove live Wazuh alerting.
