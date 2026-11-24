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
- `auth-service` owns accounts, passwords, tokens, and `/api/v1/auth/*`. No other service touches passwords.
- `business-service` owns company data, and so far serves `/api/v1/users` and `/api/v1/organizations`. To create a login account it calls `POST /internal/accounts` on `auth-service`, a route Kong does not expose.
- Both services use the shared `crmai` database for now, and `auth-service` runs all its migrations.
- Access tokens use RS256, not the HS256 in the earlier security design. Only `auth-service` has the private key, so a service that only verifies tokens cannot create them.
- Kong's JWT plugin rejects missing and forged tokens. Each service verifies the token again and checks expiry, because only the service can return the `AUTH_EXPIRED` error that tells clients to refresh.
- `auth-service` loads permissions from the database on each request.

## Service boundaries

The plan is seven services. The scope comes from the [Universal Industry CRM feature report](#source), limited to what the project's sprints need.

| Service | Owns | Status |
| --- | --- | --- |
| `auth-service` | Accounts, passwords, login, tokens | Built |
| `business-service` | Companies, staff, roles, workspace settings | Built |
| `crm-service` | Customers, contacts, leads, follow-ups, tasks, timeline, calls, site visits | Planned |
| `omnichannel-service` | Channel adapters, shared inbox, conversations, messages, human handover | Planned |
| `notification-service` | In-app and email alerts, follow-up reminders, overdue warnings | Planned |
| `ai-service` | AI agent, escalation policy, knowledge base, RAG, tool calls | Planned |
| `analytics-service` | Read-only dashboards and team reports | Planned |

- **Records that save together stay together.** `crm-service` holds customers, leads, and the timeline because a lead change and its timeline entry must save in one transaction.
- **Channels.** `omnichannel-service` connects website, email, WhatsApp, Facebook, and Instagram through the adapters in [ADR-006](ADR-006-omnichannel.md). Website and email are the real transports for now. The other channels stay simulated until the team has provider accounts.
- **Human handover is not a separate service.** The [ADR-008](ADR-008-human-in-loop.md) policy in `ai-service` decides when a person is needed. `omnichannel-service` creates the escalation, turns the AI off, and locks the conversation to one staff member. `notification-service` alerts staff. Staff resolve the escalation and choose whether to release the conversation to the AI.
- **Analytics only reads.** `analytics-service` writes no business records.

These are added only when a sprint needs them: commerce, cases, marketing, workflow, and connectors to business systems such as ERP or accounting.

<a id="source"></a>Source: `Universal_Industry_CRM_Functional_Feature_Report.pdf`, a team planning document that is not in this repository. Its section 14 notes that a modular monolith can be a sensible starting point, so the reason section above should answer that.

## Open questions

Question 1 and question 6 are answered by the plan above. The others must be answered before the planned services are built.

1. **Service boundaries.** Answered: see [Service boundaries](#service-boundaries).
2. **Database ownership.** One shared PostgreSQL database, or one per service. ADR-010 assumes one shared database and schema. `auth-service` and `business-service` both use the `crmai` database, and this gets harder to change as services are added.
3. **Transactions.** ADR-001 kept customer, lead, and message writes in one transaction with the audit row. Decide how this holds if those tables end up in different services.
4. **Agent tool calls.** The AI agent calls CRM services in-process through the tool executor, and channel adapters call the router in-process. Decide how these calls work over the network, and what happens when one fails during an agent turn.
5. **Permission checks in other services.** ADR-007 loads RBAC permissions from the database on every request, and ADR-010 resolves the membership from `X-Organization-Id`. `auth-service` owns those tables, so decide how other services read them: a shared database, or a call to `auth-service`.
6. **Background work.** Answered: `notification-service` owns the follow-up scanner, which ADR-001 ran inside the API process, and the overdue escalation check.
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
- [COMPONENT-MATRIX.md](../architecture/COMPONENT-MATRIX.md): which service each component belongs to
- [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md): the note that `ai/` is a package inside the backend
