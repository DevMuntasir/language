# Migration status and parity gates

The new platform is intentionally additive. A feature must pass its parity gate before its cohort cookie can route production rooms to React/LiveKit.

| Capability | Current migration state | Cutover gate |
| --- | --- | --- |
| Room creation and join | Implemented in API v2 and React | Browser E2E against deployed PostgreSQL, Redis and LiveKit |
| Guest identity and roles | Implemented with scoped, expiring control and LiveKit tokens | OIDC adapter and role escalation tests |
| Media | LiveKit camera/audio/screen controls and adaptive 12-tile grid implemented | 50-user room and TURN-only load tests |
| E2EE | Client key generation, fragment transport and LiveKit E2EE worker implemented | Cross-browser test and key-leak audit |
| Presence/resume | Redis-backed presence, sequence and snapshot protocol implemented | reconnect, duplicate and Redis failover tests |
| Room lock/end | API/domain policy implemented | moderator UI and cross-replica integration tests |
| Whiteboard/annotations | Sequenced generic operation transport implemented | React canvas UI and legacy snapshot conversion |
| Chat/captions/reactions | LiveKit data channel infrastructure available | feature UI, E2EE and moderation parity |
| Recording | LiveKit/local browser primitives available | migrate legacy save-before-exit behavior |
| File sharing | Object store is provisioned | presigned upload, scanning and expiry endpoints |
| Transcription | Python worker, consent validation, retry and DLQ implemented | upload/job API, result fan-out and provider integration test |
| API compatibility | v1 stats and room-active facade started | meeting/join/token/meetings golden contracts |
| Integrations | Signed webhook registration implemented | delivery worker, Slack, Mattermost and email parity |
| Branding/i18n/widgets | Not migrated | configuration mapping and visual regression suite |
| Production operations | Compose/Kubernetes templates and health probes implemented | real cluster deploy, dashboards, alerts, chaos and rollback drill |

Do not remove the legacy application until every row required by the production deployment has passed its gate for two stable releases.
