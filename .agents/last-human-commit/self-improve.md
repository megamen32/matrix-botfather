## 2026-07-31 — 22ce96e (Full)

- What slowed or confused L? Reviewer found read-only Compose mounts and vault/registry ordering after initial tests; both were corrected before commit.
- Which instruction should change? none.
- Which skill, MCP, or tool is missing? Proposed: deployment preflight that proves mounted paths are writable inside a read-only Compose container before release.
- What operation or error repeated? 3 red test cycles (missing sync helper, missing account API, vault ordering) confirmed test-first guards; no recurrence after fixes.
- State: Proposed

## 2026-07-31 — 33de2e4 HTTPS handoff (Full)

- What slowed or confused L? server-100 nginx-dev is ahead 10/behind 3 with foreign dirty files, so its timer correctly refuses a public ingress deploy.
- Which instruction should change? none.
- Which skill, MCP, or tool is missing? Proposed: preflight should report canonical nginx repo divergence before application build work starts.
- What operation or error repeated? 1 blocked `git pull --ff-only`; evidence: `/home/roomhacker/ServersAdministartion/nginx-dev` main divergence; guard is no merge/reset of shared work.
- State: needs human decision
