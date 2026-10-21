# Matrix BotFather

Matrix BotFather is the owner-only account manager for the configured Matrix homeserver. It accepts commands from the explicit owner allowlist, provisions accounts through Matrix Authentication Service (MAS), and stores account credentials in an encrypted vault.

The discussion-club control plane is a separate consumer. It configures club personas after an account exists; it does not create Matrix accounts. See [control-plane.md](docs/control-plane.md).

## Code map

| Path | Responsibility |
| --- | --- |
| `index.js` | Matrix sync loop and command dispatch |
| `lib/matrixClient.js` | Matrix Client-Server API transport |
| `lib/access.js` | Owner allowlist check |
| `handlers/commands.js` | `!botfather` / `!bf` command handlers |
| `handlers/adminApi.js` | MAS and Synapse account operations |
| `handlers/botStore.js` | Public bot registry and encrypted credential access |
| `lib/secretVault.js` | Encryption for stored passwords and tokens |
| `test/` | Offline Node.js tests with mocked Matrix/MAS boundaries |

## Local checks

Requires Node.js 22. Install dependencies and run the offline suite:

```sh
npm ci
npm test
```

For a focused MAS-registration regression:

```sh
node --test test/masRegistration.test.js
```

Unit tests must not contact a live homeserver or create accounts. Use test doubles and temporary directories.

## Runtime data and secrets

- `.env` contains runtime credentials and must never be committed.
- `data/bots.json` contains registry metadata. `data/secrets.enc` stores passwords and access tokens encrypted with `CONTROL_PLANE_MASTER_KEY`.
- Do not print, paste, or add credentials to issues, logs, tests, or documentation. Never replace the encrypted vault with plaintext test data.
- Provisioning and room-management commands are owner-only. A live Matrix operation requires explicit task authorization.

See [AGENTS.md](AGENTS.md) for agent workflow and safety boundaries.
