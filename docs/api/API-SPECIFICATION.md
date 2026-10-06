# API Specification

**Base path:** `/api/v1`  
**Status:** Proposed contract. No routes are implemented.  
**Format:** JSON, UTF-8.  
**Time:** ISO-8601 UTC.  
**Ids:** UUID strings.

Staff routes require `Authorization: Bearer <access_token>` unless noted. Authorization lists the permission code. The role matrix is in [SECURITY-DESIGN.md](../security/SECURITY-DESIGN.md).

## Error body

Every error uses HTTP status plus:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "scheduled_at must be in the future",
    "details": [{ "field": "scheduled_at", "issue": "past" }],
    "request_id": "3f1c..."
  }
}
```

| HTTP | code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body or query failed validation |
| 401 | `AUTH_INVALID` | Bad login, missing token |
| 401 | `AUTH_EXPIRED` | Access token expired |
| 401 | `AUTH_REVOKED` | Refresh token reused or revoked |
| 403 | `FORBIDDEN` | Authenticated, permission missing |
| 404 | `NOT_FOUND` | Id unknown, or hidden by scope |
| 409 | `CONFLICT` | Unique constraint, lock, duplicate escalation |
| 422 | `TOOL_DENIED` | Used by agent internals; HTTP APIs use 403/409 instead |
| 429 | `RATE_LIMITED` | Widget or login throttle |
| 502 | `UPSTREAM_FAILED` | LLM or email provider failed on a synchronous staff call |
| 500 | `INTERNAL` | Unexpected |

Unknown ids return 404, including when the caller must not learn that a record exists outside their scope.

## Pagination

List endpoints accept `limit` (default 20, max 100) and `cursor` (opaque). Response:

```json
{ "items": [], "next_cursor": null }
```

---

## Authentication

### POST /api/v1/auth/login

- **Auth:** none
- **Authz:** none
- **Request:** `{ "email": "agent@northline.example", "password": "..." }`
- **Validation:** email format, password 8–128 chars
- **Response 200:** `{ "access_token", "refresh_token", "expires_in": 900, "user": { "id", "full_name", "role" } }`
- **Errors:** 401 `AUTH_INVALID`, 429 after 10 failures per email per 15 minutes

### POST /api/v1/auth/refresh

- **Auth:** none. Body holds the refresh token
- **Request:** `{ "refresh_token": "..." }`
- **Response 200:** new token pair. The presented refresh token is revoked
- **Errors:** 401 `AUTH_REVOKED` or `AUTH_EXPIRED`

### POST /api/v1/auth/logout

- **Auth:** bearer
- **Request:** `{ "refresh_token": "..." }`
- **Response 204**
- **Errors:** 401 if the access token is missing

### GET /api/v1/auth/me

- **Auth:** bearer
- **Response 200:** `{ "id", "email", "full_name", "role", "permissions": ["customer.read"] }`

---

## Customers

### POST /api/v1/customers

- **Authz:** `customer.write`
- **Request:** `{ "full_name", "primary_email"?, "primary_phone"?, "company_name"?, "preferred_channel"? }`
- **Validation:** name required, 1–160. Email unique among non-null primary emails. Phone unique among non-null primary phones. Channel code must exist
- **Response 201:** customer object
- **Errors:** 409 `CONFLICT` on duplicate email or phone

Customer object:

```json
{
  "id": "uuid",
  "full_name": "Amina Shah",
  "primary_email": "amina@example.com",
  "primary_phone": "+94770000000",
  "status": "active",
  "company_name": null,
  "preferred_channel": "website",
  "notes": "",
  "owner_user_id": null,
  "created_at": "2026-10-05T00:00:00Z",
  "updated_at": "2026-10-05T00:00:00Z"
}
```

### GET /api/v1/customers

- **Authz:** `customer.read`
- **Query:** `q` optional search on name, email, phone. `status` optional. Pagination
- **Response 200:** list of customer objects

### GET /api/v1/customers/{id}

- **Authz:** `customer.read`
- **Response 200:** customer object
- **Errors:** 404

### PATCH /api/v1/customers/{id}

- **Authz:** `customer.write`
- **Request:** any subset of `full_name`, `primary_email`, `primary_phone`, `company_name`, `preferred_channel`, `notes`, `status`, `owner_user_id`
- **Validation:** `status=inactive` allowed for staff. Notes replace on this staff endpoint. The AI tool does not use this route
- **Response 200:** customer
- **Errors:** 404, 409, 400

### POST /api/v1/customers/{id}/contacts

- **Authz:** `customer.write`
- **Request:** `{ "channel": "email", "external_identity": "amina@example.com", "is_verified": true }`
- **Response 201:** `{ "id", "channel", "external_identity", "is_verified" }`
- **Errors:** 409 if that identity belongs to another customer

### GET /api/v1/customers/{id}/timeline

- **Authz:** `customer.read`
- **Response 200:** `{ "items": [ { "id", "event_type", "summary", "occurred_at", "channel", "actor_type", "visibility" } ] }`
- Agents do not receive `visibility=staff` items. Supervisors and admins do.

---

## Leads

### POST /api/v1/leads

- **Authz:** `lead.write`
- **Request:** `{ "customer_id", "title", "product_name"?, "interest_summary", "source_channel", "estimated_value"? }`
- **Validation:** customer exists. Title 3–120. Summary required. `estimated_value` >= 0 if present. Channel enabled or already on the customer
- **Response 201:** lead object, status `new`
- **Errors:** 409 if an open lead with the same product already exists; body includes `existing_id`

Lead object: `{ "id", "customer_id", "conversation_id", "title", "product_name", "source_channel", "status", "interest_summary", "estimated_value", "assigned_user_id", "created_actor_type", "created_at", "updated_at" }`

### GET /api/v1/leads

- **Authz:** `lead.read`
- **Query:** `status`, `assignee` (`me` or a user id), `customer_id`
- **Response 200:** list

### GET /api/v1/leads/{id}

- **Authz:** `lead.read`
- **Response 200:** lead
- **Errors:** 404

### PATCH /api/v1/leads/{id}

- **Authz:** `lead.write`
- **Request:** subset of `title`, `interest_summary`, `status`, `estimated_value`, `assigned_user_id`, `product_name`
- **Validation:** staff may set any status in the enum. `converted` requires `customer.write` as well because it writes a `conversion` journey event. The service rejects unknown transitions from `converted` or `lost` back to `new`
- **Response 200:** lead

### DELETE /api/v1/leads/{id}

- **Authz:** `lead.delete`
- **Response 204**
- **Behavior:** soft-delete is not used. The row is deleted only if status is `new` and no follow-up exists. Otherwise 409. Prefer status `lost` in normal use. Exposed so the permission in the schema has a meaning.

---

## Conversations

### POST /api/v1/conversations

- **Authz:** `conversation.reply`
- **Request:** `{ "customer_id", "channel": "website", "subject"? }`
- **Validation:** customer and channel exist
- **Response 201:** existing open conversation or a new one
- **Used by:** staff starting an outbound thread. The widget does not call this

Conversation object: `{ "id", "customer_id", "channel", "status", "assigned_user_id", "assigned_user_name", "ai_enabled", "locked_by_user_id", "locked_by_name", "subject", "last_message_at" }`. Name fields are null when the corresponding user id is null. They exist so the mobile client does not need a user directory.

### GET /api/v1/conversations

- **Authz:** `conversation.read`
- **Query:** `status`, `channel`, `assigned=me|unassigned|any`
- **Scope:** agents cannot use `assigned=any`. Supervisors can
- **Response 200:** list ordered by `last_message_at` desc

### GET /api/v1/conversations/{id}

- **Authz:** `conversation.read` plus scope
- **Response 200:** conversation
- **Errors:** 404 out of scope

### POST /api/v1/conversations/{id}/takeover

- **Authz:** `conversation.takeover`
- **Request:** `{ }`
- **Response 200:** conversation with `ai_enabled=false`, `locked_by_user_id` set, status `assigned`
- **Errors:** 409 `CONFLICT` if locked by another user who is still active

### POST /api/v1/conversations/{id}/release

- **Authz:** the locking user, or `escalation.assign`
- **Response 200:** `ai_enabled=true`, lock cleared, status `open` if no active escalation remains

---

## Messages

### GET /api/v1/conversations/{id}/messages

- **Authz:** `conversation.read` plus scope
- **Query:** pagination, oldest first within the page
- **Response 200:** `{ "items": [ { "id", "direction", "sender_type", "sender_user_id", "message_type", "content", "created_at" } ] }`

### POST /api/v1/messages

- **Authz:** `conversation.reply`
- **Request:** `{ "conversation_id", "content" }`
- **Validation:** content 1–4000 chars. Caller must hold the lock or the conversation must be unassigned and the caller assigns themselves in the same transaction
- **Response 201:** message. Also sends through the channel adapter
- **Errors:** 409 `CONVERSATION_LOCKED`, 404

Staff messages do not call the AI.

### GET /api/v1/conversations/{id}/ai-actions

- **Authz:** `conversation.read` plus the same scope as the conversation
- **Response 200:** `{ "items": [ { "intent", "tool_name", "tool_status", "confidence_final", "decision", "escalation_reason", "created_at" } ] }`
- Tool arguments are omitted so the staff UI does not become a second prompt log

### POST /api/v1/agent/message

This is the **staff or system** entry that runs the orchestrator on an already stored inbound message. The website widget does not call it directly. The channel router does, in-process. The HTTP form exists so tests and the channel simulator can trigger a turn without a fake webhook.

- **Authz:** `conversation.reply` for staff. Internal calls use a service function instead of HTTP
- **Request:** `{ "message_id": "uuid" }`
- **Validation:** message exists, direction inbound, conversation `ai_enabled` true
- **Response 200:**

```json
{
  "decision": "respond",
  "outbound_message_id": "uuid",
  "escalation_id": null,
  "action_ids": ["uuid"],
  "intent": "lead_request",
  "confidence": 0.86
}
```

- **Errors:** 409 if AI disabled or a turn is already in progress for that message (unique processing lock on `message_id`). 502 if the LLM fails and escalation also fails to persist, which should be rare because escalation is local

### Public widget

#### POST /api/v1/widget/session

- **Auth:** header `X-Widget-Key` matching `WIDGET_KEY`
- **Request:** `{ }`
- **Response 201:** `{ "visitor_session_id", "conversation_id", "customer_id" }`
- **Rate limit:** 30 creations per IP per hour

#### POST /api/v1/widget/messages

- **Auth:** `X-Widget-Key` and body `visitor_session_id`
- **Request:** `{ "visitor_session_id", "content" }`
- **Validation:** content 1–2000. Session must exist
- **Response 202:** `{ "message_id" }` The AI turn runs after the insert. The widget receives the reply on its WebSocket
- **Errors:** 429 at 20 messages per session per 10 minutes

#### GET /api/v1/widget/messages?visitor_session_id=

- **Auth:** widget key
- **Response 200:** messages for that session only

---

## Follow-ups

### POST /api/v1/followups

- **Authz:** `followup.write`
- **Request:** `{ "customer_id", "lead_id"?, "conversation_id"?, "assigned_user_id"?, "scheduled_at", "channel", "reason" }`
- **Validation:** future, within 30 days, customer exists
- **Response 201:** follow-up object
- **Errors:** 400 `FOLLOWUP_REJECTED`

Follow-up object: `{ "id", "customer_id", "lead_id", "scheduled_at", "channel", "reason", "status", "assigned_user_id", "created_actor_type" }`

### GET /api/v1/followups

- **Authz:** `followup.read`
- **Query:** `status`, `due_before`, `assignee=me`
- **Response 200:** list

### POST /api/v1/followups/{id}/complete

- **Authz:** `followup.write`
- **Request:** `{ "notes"? }`
- **Response 200:** status `completed`

### POST /api/v1/followups/{id}/cancel

- **Authz:** `followup.write`
- **Response 200:** status `cancelled`

---

## Tasks

### POST /api/v1/tasks

- **Authz:** `task.write`
- **Request:** `{ "title", "description"?, "customer_id"?, "priority", "due_at"?, "assigned_user_id"? }`
- **Validation:** title 3–140. Priority enum includes `urgent` for staff
- **Response 201:** task

Task object: `{ "id", "title", "description", "priority", "status", "customer_id", "assigned_user_id", "due_at" }`

### GET /api/v1/tasks

- **Authz:** `task.read`
- **Query:** `status`, `assignee=me`

### PATCH /api/v1/tasks/{id}

- **Authz:** `task.write`
- **Request:** subset of `status`, `assigned_user_id`, `priority`, `due_at`
- **Response 200:** task

---

## Escalations

### POST /api/v1/escalations

- **Authz:** `conversation.reply`
- **Request:** `{ "conversation_id", "reason_code": "staff_requested", "reason_detail", "priority" }`
- **Response 201:** escalation. Disables AI on the conversation
- **Errors:** 409 if an active escalation exists; response body includes the existing object

Escalation object: `{ "id", "conversation_id", "customer_id", "reason_code", "reason_detail", "priority", "status", "triggered_by", "assigned_user_id", "sla_due_at", "created_at", "resolved_at" }`

### GET /api/v1/escalations

- **Authz:** `escalation.read`
- **Query:** `status`, `priority`, `assignee=me|unassigned`
- **Scope:** agents see unassigned and their assignments. They do not see other agents' assignments

### POST /api/v1/escalations/{id}/assign

- **Authz:** `escalation.assign`
- **Request:** `{ "user_id" }`
- **Response 200:** status `assigned`

### POST /api/v1/escalations/{id}/takeover

- **Authz:** `conversation.takeover`
- **Response 200:** status `in_progress`, conversation locked to the caller

### POST /api/v1/escalations/{id}/resolve

- **Authz:** the assignee, or `escalation.assign`
- **Request:** `{ "resolution_notes" }`
- **Validation:** notes 1–2000
- **Response 200:** status `resolved`
- **Side effect:** journey event `resolution`. Does not by itself re-enable the AI. Staff call release if the AI should resume

---

## Knowledge base

### GET /api/v1/knowledge/documents

- **Authz:** `knowledge.read`
- **Query:** `status`, `source_type`

### POST /api/v1/knowledge/documents

- **Authz:** `knowledge.write`
- **Request:** `{ "title", "source_type", "body" }`
- **Validation:** body 1–40000 chars. `source_type` enum
- **Response 201:** document, status `draft`

### PATCH /api/v1/knowledge/documents/{id}

- **Authz:** `knowledge.write`
- **Request:** `{ "title"?, "body"? }`
- **Rule:** only drafts. Published documents are edited by creating a new version via this patch, which sets status back to `draft` and increments version only on the next publish
- **Response 200**

### POST /api/v1/knowledge/documents/{id}/publish

- **Authz:** `knowledge.publish`
- **Response 200:** `{ "id", "status": "published", "version", "chunk_count" }`
- **Errors:** 502 `EMBEDDING_FAILED`. Previous published chunks stay if this document was already published and the new embed fails. The implementation keeps old chunks until the new set is ready, as described in the RAG design

### POST /api/v1/knowledge/documents/{id}/archive

- **Authz:** `knowledge.publish`
- **Response 200:** status `archived`. Chunks are deleted so they cannot be retrieved

### POST /api/v1/knowledge/search

- **Authz:** `knowledge.read`
- **Request:** `{ "query": "premium package price" }`
- **Response 200:** `{ "chunks": [ { "document_id", "title", "content", "similarity" } ] }`
- Staff search uses the same retriever. It is not the agent tool, but it calls the same function.

---

## Analytics

### GET /api/v1/analytics/dashboard

- **Authz:** `analytics.read`
- **Query:** `from`, `to` (dates). Maximum span 366 days
- **Scope:** agents receive personal handling counts. Supervisors and admins receive organization metrics
- **Response 200:**

```json
{
  "leads_created": 0,
  "leads_converted": 0,
  "conversion_rate": 0.0,
  "interactions": 0,
  "messages_by_channel": { "website": 0 },
  "median_first_response_seconds": 0,
  "ai_resolution_rate": 0.0,
  "escalation_rate": 0.0,
  "followups_completed": 0,
  "followups_missed": 0
}
```

Definitions of each number are in [ANALYTICS.md](../features/ANALYTICS.md).

### GET /api/v1/analytics/agents

- **Authz:** `analytics.read`, and the caller must be a supervisor or admin. Agents receive 403
- **Query:** `from`, `to`
- **Response 200:** `{ "items": [ { "user_id", "full_name", "replies", "escalations_resolved", "median_takeover_seconds", "followups_completed" } ] }`

---

## Notifications

### GET /api/v1/notifications

- **Authz:** `notification.read`
- **Query:** `unread=true|false`
- **Response 200:** only the caller's rows

### POST /api/v1/notifications/{id}/read

- **Authz:** owner only
- **Response 204**

There is no public "create notification" API. Services create them.

---

## Users (admin)

### GET /api/v1/users

- **Authz:** `user.manage`

### POST /api/v1/users

- **Authz:** `user.manage`
- **Request:** `{ "email", "full_name", "password", "role" }`
- **Validation:** password at least 10 characters, role is `admin`, `supervisor`, or `agent`
- **Response 201:** user without password hash

### PATCH /api/v1/users/{id}

- **Authz:** `user.manage`
- **Request:** `{ "is_active"?, "role"?, "full_name"?, "password"? }`
- **Validation:** if `password` is present it is at least 10 characters, it is stored only as a bcrypt hash, and all refresh families for that user are revoked
- **Response 200:** user without password hash

---

## Webhooks and simulator

### POST /api/v1/webhooks/email

- **Auth:** `X-Channel-Signature` HMAC-SHA256 of the raw body using `EMAIL_WEBHOOK_SECRET`
- **Request:** provider-specific, documented in the integration guide. The adapter maps it to a canonical message
- **Response 200:** `{ "duplicate": false, "message_id" }`
- **Errors:** 401 if the signature fails. Always 200 on duplicates so the sender stops retrying

### POST /api/v1/simulator/inbound

- **Auth:** `SIMULATOR_TOKEN` header, and only if `ENABLE_CHANNEL_SIMULATOR=true`
- **Request:** the canonical message fields except ids assigned by the server: `{ "channel", "external_message_id", "external_identity", "content", "message_type" }`
- **Response 202:** `{ "message_id", "customer_id", "conversation_id" }`
- **Production:** route not mounted

---

## WebSocket

### GET /api/v1/ws/inbox

- **Auth:** access token as query `token` or `Sec-WebSocket-Protocol`. Query token is acceptable on the lab network; do not log the URL
- **Events pushed:** `message.created`, `escalation.opened`, `notification.created`, `conversation.locked`
- **Payload:** `{ "type", "data" }` with the same shapes as the REST objects

### GET /api/v1/ws/widget

- **Auth:** widget key and `visitor_session_id` query parameters
- **Events:** `message.created` for that conversation only

---

## Agent tool boundary

Tools in [AI-ARCHITECTURE.md](../ai/AI-ARCHITECTURE.md) are **not** HTTP endpoints. Clients cannot `POST /api/v1/agent/tools/create_lead`. That omission is intentional. The only way to invoke a tool is the orchestrator after an inbound customer message.
