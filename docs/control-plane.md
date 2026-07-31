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

It listens only on `127.0.0.1:8092`. Publish it through an authenticated Nginx
vhost only after choosing its hostname and access policy.
