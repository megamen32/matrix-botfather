## 2026-07-31 — 22ce96e (Full)

- What slowed or confused L? Reviewer found read-only Compose mounts and vault/registry ordering after initial tests; both were corrected before commit.
- Which instruction should change? none.
- Which skill, MCP, or tool is missing? Proposed: deployment preflight that proves mounted paths are writable inside a read-only Compose container before release.
- What operation or error repeated? 3 red test cycles (missing sync helper, missing account API, vault ordering) confirmed test-first guards; no recurrence after fixes.
- State: Proposed
