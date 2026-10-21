# Matrix BotFather agent guide

Matrix BotFather manages owner-authorized Matrix accounts on the configured Synapse + Matrix Authentication Service (MAS) homeserver. The main path is `index.js` -> `lib/matrixClient.js` -> `handlers/commands.js` -> `handlers/adminApi.js`; registry metadata and encrypted credentials live behind `handlers/botStore.js` and `lib/secretVault.js`.

The discussion-club control plane is a separate consumer. It configures club personas after a Matrix account exists and does not create accounts. Read `docs/control-plane.md` before changing that integration.

## Safe development

- Run `npm test` for the full offline suite. Focused tests use Node's built-in test runner, for example `node --test test/masRegistration.test.js`.
- Tests must use stubs and temporary files. Never contact live Matrix or MAS, create accounts, send room messages, or mutate `data/` from a unit test.
- Treat `.env`, `data/bots.json`, `data/secrets.enc`, and `control-history/` as private runtime state. Never print, copy into documentation, commit, or include secret values in logs or test output.
- `MATRIX_ADMIN_ALLOWED_USERS` is the owner authorization boundary. Do not weaken it or bypass `handlers/commands.js` for ordinary provisioning. Create, delete, invite, or join accounts only when the task explicitly authorizes the operation.
- Keep passwords and access tokens inside the encrypted vault. Public registry metadata must not contain credentials.
- Do not restart or rebuild the live BotFather service to run a local test. A live release requires an explicitly scoped deployment task and a rollback path.
- Keep control-plane configuration changes separate from account issuance and from UserIO call operations.

## Codebase navigation

- Start with `README.md` for the code map and local checks.
- Check for `graphify-out/graph.json` before using Graphify. If it is absent, use the README map and targeted source reads; do not treat a missing generated index as a defect.
- When a graph exists, use `graphify query`, `graphify path`, or `graphify explain` for focused codebase questions. After code edits, run `graphify update .` only when maintaining an existing graph.

When a user explicitly types `/graphify`, use the installed Graphify skill before doing anything else.
