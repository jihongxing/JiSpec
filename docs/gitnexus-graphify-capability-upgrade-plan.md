# GitNexus / Graphify Capability Upgrade Plan

GitNexus / Graphify 是参考来源，不是运行时依赖。

This compatibility page keeps the upgrade-plan wording available for older links.
It describes an import-only boundary and the explicit `run-external-tool` step without making either provider part of JiSpec runtime authority.

JiSpec treats external graph tools as optional references only:

- import-only ingestion stays advisory
- `run-external-tool` is explicit and controlled
- source truth remains local JiSpec artifacts

