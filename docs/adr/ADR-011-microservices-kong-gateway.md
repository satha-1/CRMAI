# ADR-011: Microservices behind a Kong API gateway

**Status:** Proposed  
**Supersedes:** [ADR-001](ADR-001-architecture-style.md), once accepted

## Context

ADR-001 chose a modular monolith and rejected microservices. The project is now moving to microservices, with Kong as the single entry point for the API. `gateway/` and `services/auth-service/` already exist in the repository. The guide is [API-GATEWAY.md](../deployment/API-GATEWAY.md).

Reason for the change: _team to fill in before accepting this ADR. ADR-001 rejected this style because of network failures and the cost of running several deployables, so the reason should say what has changed._

## Decision

- Clients reach the API only through Kong. Services do not publish ports.
- Kong runs in DB-less mode. Routes live in `gateway/kong.yml`, and the Admin API is off.
- Kong routes by path and keeps the full path, so the public `/api/v1/...` contract in the API specification does not change.
- Each service lives in `services/<name>/` and runs under Docker Compose. Services use FastAPI and Python, as ADR-003 expects for the backend.
- Kong adds `X-Request-ID` to every request, which provides the `request_id` that the observability design requires.
- `auth-service` is the first service. It owns `/api/v1/auth/*`.
- Access tokens use RS256, not the HS256 in the earlier security design. Only `auth-service` has the private key, so a service that only verifies tokens cannot create them.
- Kong's JWT plugin rejects missing and forged tokens. Each service verifies the token again and checks expiry, because only the service can return the `AUTH_EXPIRED` error that tells clients to refresh.
- `auth-service` loads permissions from the database on each request.

## Open questions

These must be answered before a second service is built.

1. **Service boundaries.** Only `auth` is decided. ADR-001 considered CRM, AI, and channels as possible services.
2. **Database ownership.** One shared PostgreSQL database, or one per service. ADR-010 assumes one shared database and schema. `auth-service` currently uses the `crmai` database, and this can change while it is the only service.
3. **Transactions.** ADR-001 kept customer, lead, and message writes in one transaction with the audit row. Decide how this holds if those tables end up in different services.
4. **Agent tool calls.** The AI agent calls CRM services in-process through the tool executor, and channel adapters call the router in-process. Decide how these calls work over the network, and what happens when one fails during an agent turn.
5. **Permission checks in other services.** ADR-007 loads RBAC permissions from the database on every request, and ADR-010 resolves the membership from `X-Organization-Id`. `auth-service` owns those tables, so decide how other services read them: a shared database, or a call to `auth-service`.
6. **Background work.** Decide which service owns the follow-up scanner, which ADR-001 ran inside the API process.
7. **Rate limits.** ADR-007 and the security design use in-memory limits for one process. Decide whether they stay in the services or move to Kong.

## Alternatives

- **Keep the modular monolith (ADR-001), with or without Kong.** Still viable. Kong can route to a single backend, so the gateway does not depend on this decision.
- **Microservices without a gateway.** Rejected. Each client would need to know every service address, and the frontend and mobile app would have to change whenever a service is split.
- **Kong with a database or Admin API.** Rejected. Routes would live in a running database instead of git, and there would be one more container to run and back up.

## Consequences

- There are more deployables, and network failures between services become normal. Kong returns 502 when a service is down, so clients must handle that.
- The team must keep Kong's own errors in mind. Its 404 body differs from the error body in the API specification.
- CORS, gateway rate limiting, and TLS are not configured yet.
- Local development needs Docker for the API. The frontend's mock mode still works without it.

## Documents to update when accepted

These still describe the modular monolith:

- [HLD.md](../architecture/HLD.md): sections 1, 3, 7, 9, and 18, including the system context and deployment diagrams
- [ARCHITECTURE-REVIEW.md](../ARCHITECTURE-REVIEW.md): the list of things that should stay out of the design
- [NFR.md](../requirements/NFR.md): the scaling note
- [ADR-009](ADR-009-deployment.md): "one API replica" and the Compose contents
- [DEPLOYMENT-ARCHITECTURE.md](../deployment/DEPLOYMENT-ARCHITECTURE.md): the container list
- [LLD.md](../architecture/LLD.md): after the open questions are answered
