# Contract Source Adapters

JiSpec contract source adapters convert existing repo artifacts into deterministic takeover evidence. They do not call an LLM, do not upload source, and do not create a new blocking gate. The local `verify` and `ci:verify` gates remain the enforcement surface.

## Adapter Families

`bootstrap discover` writes `.spec/facts/bootstrap/contract-source-adapters.json` beside the Evidence Graph and adoption-ranked evidence.

Supported adapters:

- `openapi`: OpenAPI and Swagger YAML/JSON files.
- `protobuf`: `.proto` service and message definitions.
- `graphql`: `.graphql` and `.gql` schema files.
- `db_migration`: SQL/database schema assets and migration files.
- `test_framework`: test directories, test suffixes, JiSpec test plans, Gherkin features, and script test harnesses.
- `monorepo_manifest`: pnpm/Nx/Turbo/Lerna/Rush manifests and package workspace manifests.

Each evidence item records:

- `deterministic: true`
- `llm_blocking_gate: false`
- `adoption_disposition`
- `enters.adoption_ranking`
- `enters.contract_graph`
- `enters.verify_facts`

## Adoption Rules

Strong contract source files such as OpenAPI, Protobuf, GraphQL, and database schema assets can become `candidate_contract` evidence. They enter adoption ranking with `schema_truth_source` metadata so takeover drafts can prefer them over weak route/module guesses.

Supporting implementation traces such as migrations, tests, and monorepo topology remain `supporting_only` unless an owner explicitly maps them through JiSpec anchors or static collector mappings.

Weak embedded GraphQL or dynamic surfaces become `unresolved_surface` verify facts. They stay visible for owner review/spec debt, but JiSpec does not treat them as adopted contracts.

## Greenfield And Verify Flow

The Greenfield static collector recognizes adapter-backed schema facts and can map them into the deterministic Contract Graph when they contain JiSpec anchors such as `@jispec contract CTR-...`.

Unmapped governed facts remain advisory code drift under the existing ratchet policy. Unresolved surfaces are emitted as `GREENFIELD_UNRESOLVED_SURFACE`, keeping the owner-review path separate from adopted contract truth.
