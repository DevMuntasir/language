# MiroTalk Next Platform

This directory is the parallel, production-oriented migration target for MiroTalk. The legacy application remains available while rooms are moved by cohort.

## Implemented foundation

- React/TypeScript/Vite meeting client with LiveKit media, adaptive subscriptions, a 12-tile cap, stable control-plane presence, and optional client-generated E2EE invite keys.
- Fastify/TypeScript API with OpenAPI, schema validation, standard errors, stable signed sessions, PostgreSQL room/audit state, Redis presence and sequenced collaboration operations.
- Socket.IO Redis adapter so control-plane replicas can broadcast across nodes.
- LiveKit room provisioning and least-privilege participant grants.
- Python transcription worker using Redis Streams, bounded retries, a dead-letter stream, S3-compatible ephemeral input, and explicit consent validation.
- Opt-in Bangla ↔ English live interpretation: Bangla speech to English through OpenAI Realtime WebRTC, and English speech to Bengali through an explicitly dispatched LiveKit Python agent. AI translation is disabled for E2EE rooms.
- Docker Compose development environment and Kubernetes production templates.

The existing `/app` and `/public` implementation is intentionally not removed. Feature-parity modules such as the legacy whiteboard, recording UI, widgets, Mattermost and Slack adapters must move behind cohort flags before legacy retirement.

## Local development

Requirements: Node.js 24, npm 11, Python 3.12+, and Docker Compose.

```bash
cd platform
cp .env.example .env
npm install
docker compose up --build
```

The React client is served at `http://localhost:5173`, the control API at `http://localhost:3100`, API documentation at `http://localhost:3100/api/v2/docs`, and LiveKit at `ws://localhost:7880`. Local transcription input uses a private filesystem volume; production uses S3-compatible object storage.

### Live interpreter (optional)

Set `OPENAI_API_KEY` to enable Bangla → English realtime voice and captions. For English → Bengali voice, also set `ELEVEN_API_KEY` and `TRANSLATION_BN_VOICE_ID`, then start the opt-in worker profile:

```bash
docker compose --profile translation up --build
```

Create a room with **Allow AI live interpretation**, then each listener explicitly enables the interpreter and chooses the language they want to hear. Provider keys remain server-side. The current policy rejects cloud interpretation in E2EE rooms.

For frontend/backend hot reload, start PostgreSQL, Redis and LiveKit with Compose, then run:

```bash
npm run dev
```

## Required production configuration

- Replace every example domain, image, API key and secret in `deploy/kubernetes`.
- Supply PostgreSQL, Redis and object storage as HA managed services or equivalent operators.
- Keep LiveKit on a dedicated host-network node pool and provision trusted certificates for the signal and TURN domains.
- Never put an E2EE fragment key in logs, analytics, API payloads or persisted state.
- Publish immutable images, run migrations as a pre-deploy job, and validate load/rollback gates before changing cohort percentages.

## Verification

```bash
npm run typecheck
npm test
npm run build
PYTHONPATH=apps/ai-worker python3 -m unittest discover apps/ai-worker/tests
PYTHONPATH=apps/translator-worker python3 -m unittest discover apps/translator-worker/tests
docker compose config --quiet
```

The legacy test suite must also pass from the repository root before a cohort is enabled.
