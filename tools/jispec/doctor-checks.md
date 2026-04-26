# JiSpec Doctor Phase 5.1 Checks

## Overview

`jispec doctor phase5` performs comprehensive health checks for Phase 5.1 readiness.

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
  - No direct `fs` imports in core files (stage-runner, pipeline-executor, cache-manager)

### 3. Artifact Identity System
- **Check**: Identity encoding/decoding roundtrip
- **Validates**:
  - `toPath()` produces Windows-safe filenames (no colons, slashes)
  - `fromPath()` correctly parses identities
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
  - All 12 test suites are registered
  - Expected test counts match actual
  - `npm run build` passes
  - `npm run jispec -- validate` passes

## Output Format

```
=== JiSpec Doctor: Phase 5.1 Readiness ===

✓ Pipeline Configuration
  - pipeline.yaml valid
  - 6 stages defined
  - failure_handling configured

✓ Storage Adapter Boundary
  - No direct fs imports in core
  - FilesystemStorage contract compliant

✓ Artifact Identity System
  - toPath/fromPath roundtrip: OK
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
  - 12/12 test suites registered
  - 55/55 tests expected
  - Build: OK
  - Validate: OK

=== Summary ===
7/7 checks passed
Phase 5.1 Ready: YES
```

## Exit Codes

- `0`: All checks passed
- `1`: One or more checks failed
