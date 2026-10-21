# Test access — Matrix BotFather / UserIO voice

## Owner and purpose

- Owner: project operator. These identities were issued at the operator's explicit request for isolated UserIO Matrix voice testing.
- Homeserver: `chat.bezrabotnyi.com` on server-88.
- They are test fixtures, not production or personal accounts.

## Identities

| Role | Matrix ID | Display name | State |
| --- | --- | --- | --- |
| Test account A | `@lhc_voice_tester_a_20261021:chat.bezrabotnyi.com` | LHC Voice Caller Test | Active, non-admin, unjoined; not used in latest call |
| Peer / callee | `@lhc_voice_tester_b_20261021:chat.bezrabotnyi.com` | LHC Voice Peer Test | Active, non-admin; joined to the isolated test room below |

## Isolated call test room

- Name: `LHC AgentCall test 2026-10-21`
- Room ID: `!WcdQRAMzHhrxcZzQad:chat.bezrabotnyi.com`
- Private, non-federated, and unencrypted; joined members are the UserIO caller `@aiadmin:chat.bezrabotnyi.com` and test peer B only.
- The first UserIO call was unanswered because no receiver was online. After joining from an isolated Element test client and allowing `org.matrix.msc3401.call.member` in the room power levels, a later call completed with `answered=true`; the recording contains sent assistant TTS and no received caller audio. See UserIO `.agents/TEST_ACCESS.md` for exact non-secret receipts and recording evidence.

## Credential boundary

- Passwords and compatibility tokens are stored only in `data/secrets.enc`, encrypted by `CONTROL_PLANE_MASTER_KEY`.
- Never place credentials in this file, Git, logs, shell output, chat, or test fixtures.
- Runtime secrets are not part of this repository's development setup. Do not read or print `.env` or private `data/` files.

## Allowed use

- Use only these IDs on the listed homeserver for UserIO voice test work.
- Do not call, impersonate, or use the owner account `@bezrabotnyi:chat.bezrabotnyi.com` as a test peer.
- Do not use or invite `@hermesbot`.
- Before voice calls, confirm a private test room and a MatrixRTC-capable receiving client. BotFather account issuance alone does not implement a call answerer.
- Keep the existing owner-call canary and its recordings separate from these fixtures.

## Cleanup

When the authorized test run is complete, use BotFather's owner-only delete command for the two exact usernames. Verify the registry and homeserver state; retain only non-secret test receipts required by the LHC task.

## Issuance receipt

- Issued and live-read back on 2026-10-21 as active, non-admin accounts, managed in BotFather, with password and token presence verified in the encrypted vault.
- Neither account has joined a room. No message or call was sent.
- The source fix for the MAS/Synapse ordering bug passed independent review and offline tests and is published on main. The deployed BotFather service has not been updated.
