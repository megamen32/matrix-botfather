# Klub Control Plane

The control plane configures the discussion club only. It never creates Matrix
accounts: use Matrix BotFather first, then activate that registered account as
a club persona in the owner-only UI.

Activation is atomic across three club inputs:

1. `personas/<username>.toml`
2. `config/bot.toml` -> `matrix.demo_accounts`
3. `.env.local` -> `MATRIX_TOKEN_<USERNAME>`

Credentials stay in `data/secrets.enc`; neither the Matrix command bot nor the
web API returns them. Changes create rollback revisions below
`control-history/` and require a controlled `docker compose restart bot` in
the sibling `klub-diskussiy-v2` project because the Bun process loads config at
startup.

Run the panel privately:

```sh
docker compose -f docker-compose.yml -f docker-compose.control-plane.yml up -d control-plane
```

It listens only on `127.0.0.1:8092`. The live owner UI is published at
`https://admin.debate.bezrabotnyi.com/` behind the existing
`auth.bezrabotnyi.com` SSO gate.

The UI also configures the separate Matrix moderator. Its Compose service lives
in `/home/roomhacker/matrix-synapse/moderator-bot` and exposes its control API
only on server-88 loopback port `8093`; the control plane proxies these
requests server-side. Do not expose that port through Nginx. The API returns
room moderation settings, preset names and rule metadata only, not user warning
records or message history. New rooms are created with moderation disabled.
