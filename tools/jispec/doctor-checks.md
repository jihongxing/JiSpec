# JiSpec Doctor Runtime Checks

## Overview

`jispec doctor runtime` performs diagnostic-only health checks for the runtime and legacy compatibility surface.
It does not promote runtime-extended or deferred surfaces into `doctor v1` or `doctor pilot` gating.

## Check Categories

### 1. Pipeline Configuration
- **Check**: `pipeline.yaml` exists and is valid
- **Location**: `agents/pipeline.yaml`
- **Validates**:
  - File exists
  - YAML parses correctly
  - Has `pipeline.name`, `pipeline.version`, `pipeline.stages`
  - Each stage has required fields: `id`, `name`, `agent`, `lifecycle_state`, `inputs`, `outputs`, `gates`
  - `failure_handling`, `parallel`, `progress` sections present

### 2. Storage Adapter Boundary
- **Check**: FilesystemStorage contract compliance
- **Validates**:
  - `existsSync()` works for known paths
  - `readFileSync()` returns correct types
  - `writeFileSync()` creates files
  - `mkdirSync()` creates directories
  - No direct `fs` imports in core files (stage-runner, pipeline-executor, cache-manager, failure-handler)

### 3. Artifact Identity System
- **Check**: Identity encoding/decoding roundtrip
- **Validates**:
  - `encodeIdentity()` produces Windows-safe filenames (no colons, slashes)
  - `decodeIdentity()` correctly parses encoded identities
  - `identityEquals()` semantic comparison works
  - Context-level vs slice-level scoping

### 4. Cache Key Computation
- **Check**: Cache key determinism
- **Validates**:
  - Same inputs → same cache key
  - Different inputs → different cache keys
  - `computeCacheKey()` produces `cache:` prefixed hex strings
  - `computeContentHash()` is stable

### 5. Cache Manifest Format
- **Check**: Manifest structure compliance
- **Validates**:
  - `createManifest()` produces valid manifests
  - Has `cacheKey`, `timestamp`, `sliceId`, `stageId`, `inputs`, `outputs`
  - Artifact snapshots have `identity`, `path`, `contentHash`

### 6. Rollback Prerequisites
- **Check**: Snapshot mechanism readiness
- **Validates**:
  - `.jispec/snapshots/<sliceId>/` directory structure
  - FailureHandler can create snapshots
  - Snapshots contain `timestamp`, `sliceId`, `lifecycle`, `gates`, `files`
  - Rollback can restore from snapshot

### 7. Regression Environment
- **Check**: Test suite health
- **Validates**:
  - `regression-runner.ts` exists
  - The regression matrix manifest can be materialized without executing suites
  - Suite and expected-test totals are read from the manifest, not hardcoded
  - V1 mainline, runtime-extended, deferred surfaces, and pilot readiness stay in separate boundaries
  - runtime-extended remains diagnostic-only and does not participate in pilot or V1 gating
  - `npm run build` passes
  - `npm run jispec -- validate` passes

## Output Format

```
=== JiSpec Doctor: Extended Runtime Readiness ===

✓ Pipeline Configuration
  - pipeline.yaml valid
  - 6 stages defined
  - failure_handling configured

✓ Storage Adapter Boundary
  - No direct fs imports in core
  - FilesystemStorage contract compliant

✓ Artifact Identity System
  - encodeIdentity/decodeIdentity roundtrip: OK
  - Windows-safe naming: OK

✓ Cache Key Computation
  - Deterministic: OK
  - Format: cache:<hex>

✓ Cache Manifest Format
  - Structure valid
  - Artifact snapshots complete

✓ Rollback Prerequisites
  - Snapshot directory: .jispec/snapshots/
  - FailureHandler ready

✓ Regression Environment
  - Regression manifest v1: 122 suite(s), 521 expected test(s)
  - runtime-extended diagnostics stay separate from V1 and pilot boundaries
  - Build: OK
  - Validate: OK

=== Summary ===
7/7 checks passed
Extended Runtime Ready: YES
```

## Exit Codes

- `0`: All checks passed
- `1`: One or more checks failed
