# Project Structure

**Current repository:** empty apart from `docs/` created by this design. There is no application tree to preserve.  
**Rule:** add code in the layout below when implementation starts.  
**Change in progress:** [ADR-011](adr/ADR-011-microservices-kong-gateway.md) proposes microservices behind Kong, in `gateway/` and `services/`. `backend/` below shows the earlier monolith layout. `auth-service` and `business-service` exist so far. See ADR-011 before adding another.

```text
CRMAI/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/           # routers: auth, customers, leads, conversations,
│   │   │                     # messages, followups, tasks, escalations,
│   │   │                     # knowledge, analytics, notifications, webhooks
│   │   ├── core/             # config, errors, logging, deps
│   │   ├── db/models/
│   │   ├── auth/
│   │   ├── services/         # CRM use cases
│   │   ├── channels/         # adapters and canonical message
│   │   ├── ai/
│   │   │   ├── llm/
│   │   │   ├── tools/
│   │   │   └── rag/
│   │   ├── notifications/
│   │   └── analytics/
│   ├── alembic/
│   ├── tests/
│   │   └── gold/             # intent and RAG jsonl files
│   ├── requirements.txt
│   └── Dockerfile
├── gateway/
│   ├── kong.yml              # routes and JWT plugin config
│   └── start.sh              # inserts the public key when Kong starts
├── services/
│   ├── business-service/     # company data: staff, roles, and workspace settings
│   └── auth-service/         # accounts, login, and tokens. The only service that touches passwords
│       ├── app/
│       │   ├── main.py
│       │   ├── core/         # config, security, errors, rate limit
│       │   ├── api/          # deps and v1 endpoints
│       │   ├── models/       # SQLAlchemy tables
│       │   ├── schemas/      # Pydantic request and response models
│       │   ├── repositories/ # DB queries only
│       │   ├── services/     # business logic
│       │   └── db/           # session and Alembic migrations
│       ├── tests/
│       ├── Dockerfile
│       └── pyproject.toml
├── scripts/
│   └── setup-dev.sh          # creates local keys and .env
├── frontend/
│   └── src/                  # staff app and widget entry
├── mobile/                   # Expo staff app
├── database/
│   └── seed/                 # fictional Northline SQL or JSON
├── docs/                     # this documentation set
├── docker-compose.yml
├── .env.example
└── .gitignore
```

`ai/` is a Python package inside the backend, not a separate service. The folder name still makes the agent boundary visible in review.

`integrations/` is not a top-level runtime project. Channel adapters live in `backend/app/channels/` so they can call the router without a network hop. The design discussion remains in `docs/integrations/`.

## What not to add yet

- A separate `vector-db` container
- Generated client SDKs
- A monorepo tool. Three folders and a compose file are enough

## Documentation map

| Path | Role |
| --- | --- |
| `docs/architecture/HLD.md` | System-level design |
| `docs/architecture/LLD.md` | Module-level design |
| `docs/ai/` | Agent, RAG, safety, demos, value |
| `docs/database/DATABASE-DESIGN.md` | Schema |
| `docs/api/API-SPECIFICATION.md` | HTTP contract |
| `docs/adr/` | Decision records |
| `docs/MVP.md` | What the first demonstration must include |
| `docs/IMPLEMENTATION-ROADMAP.md` | Phase order |

When code and a document disagree during the project, fix the document in the same change if the code's behavior is the one the team accepted. The names in the LLD, API spec, and schema are the ones to implement first.
