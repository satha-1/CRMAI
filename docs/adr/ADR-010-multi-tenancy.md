# ADR-010: Multi-company (multi-tenant) service

**Status:** Proposed  
**Supersedes:** "Multi-organization tenancy" under *Future enhancement* in [MVP.md](../MVP.md)

## Context

The team wants CRMAI offered as a service that many companies use from one deployment, not one install per company. The UI mockups already show a **Workspace** switcher. The frontend (`frontend/`) now implements this against its mock API.

## Decision

Shared database, shared schema, row-level tenancy by `organization_id`.

- New table `organizations (id, name, industry, plan, widget_key unique, timezone, product_label, created_at)`.
- New table `memberships (user_id, organization_id, role_id)`, unique per (user, organization). A user's role is **per workspace**; `users.role_id` becomes the default only.
- Add `organization_id uuid not null` (FK, indexed) to: customers, customer_contacts, leads, conversations, messages, customer_interactions, follow_ups, tasks, ai_actions, escalations, knowledge_documents, knowledge_chunks, notifications, audit_logs. Extend the existing partial unique indexes with `organization_id`.
- Channels: per-organization enablement (`organization_channels (organization_id, channel_code, is_enabled)`).
- Every staff request sends `X-Organization-Id`. A dependency resolves the membership, loads the permissions for **that** role, and puts `organization_id` into every query. A missing or foreign membership returns 403. Records from another organization return 404, like any other out-of-scope id.
- The widget resolves the organization from its `X-Widget-Key` (one key per organization, rotatable).
- RAG retrieval filters chunks by `organization_id` **before** similarity ranking. The agent's tool executor scopes every tool call to the conversation's organization.
- New permission `org.manage` (admin only): settings, channels, widget key rotation.

New API routes the frontend already calls:

| Route | Purpose |
| --- | --- |
| `POST /auth/signup` | Create an organization and its first admin. Returns the token pair + `organization_id` |
| `GET /auth/me` | Adds `memberships: [{ organization, role }]` |
| `POST /organizations` | Logged-in user creates another workspace and becomes its admin |
| `GET /organizations/current`, `PATCH /organizations/current` | Settings for the org in `X-Organization-Id` |
| `POST /organizations/current/rotate-widget-key` | New widget key |
| `POST /users` | If the email already exists, add a membership instead of a new user |

## Consequences

- One codebase and one database for every customer company. That is cheap to run and fits the single-instance deployment.
- Every query must include the tenant filter. Add a test per router that a token from org A gets 404 for an org B id (`TC-SEC-TENANT`).
- The AI prompt snapshot and the RAG search must never mix organizations. That is the highest-risk leak, so test it explicitly.
- Postgres row-level security can be added later as a second guard. It is not needed for the prototype.
