# Error Handling

**Status:** Proposed contract.  
**Body:** the error JSON in [API-SPECIFICATION.md](../api/API-SPECIFICATION.md). AI tools use the same `code` strings inside tool result JSON. They do not throw those codes across the HTTP boundary unless the staff API itself failed.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "scheduled_at must be in the future",
    "details": [{ "field": "scheduled_at", "issue": "past" }],
    "request_id": "uuid"
  }
}
```

Tool result on failure:

```json
{
  "ok": false,
  "code": "TOOL_DENIED",
  "message": "status converted is staff-only",
  "details": []
}
```

## API errors

| Situation | HTTP | code |
| --- | --- | --- |
| Bad JSON or field rules | 400 | `VALIDATION_ERROR` |
| Missing or bad access token | 401 | `AUTH_INVALID` |
| Expired access token | 401 | `AUTH_EXPIRED` |
| Revoked refresh token | 401 | `AUTH_REVOKED` |
| Permission missing | 403 | `FORBIDDEN` |
| Unknown id or out of scope | 404 | `NOT_FOUND` |
| Duplicate contact, locked conversation, active escalation | 409 | `CONFLICT` |
| Login or widget throttle | 429 | `RATE_LIMITED` |
| Unexpected exception | 500 | `INTERNAL` |

`INTERNAL` messages to the client are generic: "Something went wrong." The server log has the stack and the `request_id`.

Validation `details` may name fields. They must not echo a full password or token.

## AI errors

| Situation | Stored decision | Customer effect |
| --- | --- | --- |
| Model returns unparseable JSON once | retry with a repair prompt | none yet |
| Repair also fails | `failed`, reason `model_output_invalid` | handoff sentence, escalation |
| Claim check fails | `escalate`, `ungrounded_claim` | handoff sentence |
| Confidence below policy | `escalate`, `low_confidence` | handoff sentence if no safe partial answer was produced |

A safe partial answer is allowed only when it does not state prices, policies, or CRM writes. Example: "I have your message." Prefer escalation over a speculative answer.

## LLM timeout

The client timeout is 20 seconds. One retry is allowed for transport errors and HTTP 429 or 5xx from the provider. The second failure sets `llm_unavailable`, escalates, and does not call tools guessed locally. Latency recorded in `ai_actions` includes the failed wait.

Staff HTTP routes that embed a query (`POST /knowledge/documents/{id}/publish`) return 502 `UPSTREAM_FAILED` if embeddings fail. They do not escalate, because there is no customer waiting on that request. Previous chunks stay published.

## External API failure

| Dependency | Behavior |
| --- | --- |
| SMTP send | Keep the outbound message, set `metadata.delivery=failed`, retry once after 30 seconds, then create a staff task |
| Channel send when token missing | `metadata.delivery=skipped_unconfigured`. HTTP to the staff client is still 201 because the CRM write succeeded |
| Meta or voice provider, if later enabled | Same as SMTP: store, one retry, staff task. Do not delete the message |

## Database failure

If the inbound insert fails, the widget or webhook receives 503 and may retry. If the insert succeeded and a later write in the turn fails, the transaction around that tool rolls back, `ai_actions` records `failed` in a new transaction when the database is back, and the turn escalates with `data_store_unavailable` if it can write. If it cannot write at all, the log line is the record and the message sits in the inbox without an outbound reply. Staff see the unanswered inbound. A sweeper is not required for the MVP; the inbox filter "no outbound yet" is the operational view.

## Tool failure

Service exceptions that are domain errors return `ok: false` to the planner. Unexpected exceptions are caught at the executor, logged, and returned as `code=TOOL_FAILED`. They increment the failure count. At two failures the policy escalates with `repeated_failure` even if the model wants another try.

## Invalid AI action

Unknown tool name, extra fields, wrong customer id, or a forbidden status:

- Nothing is written to the CRM table.
- `tool_status=denied`.
- The planner sees `TOOL_DENIED`.
- The customer never sees the raw code.

## Webhook failure

| Case | HTTP |
| --- | --- |
| Bad signature | 401, no insert |
| Body fails normalize | 400 `VALIDATION_ERROR`, no insert |
| Duplicate id | 200 `{ "duplicate": true }` |
| Database unavailable | 503 |

## Duplicate messages

Uniqueness on `(channel_id, external_message_id)` is the control. The application catches the unique violation and responds as a duplicate so two parallel retries cannot both start a turn. The loser sees the winner's message id.

## Authentication failure

Login failures write `audit_logs` with the email and `action=user.login_failed` and no password. The client message is always "Invalid email or password." Account lockout is the rate limit, not a permanent lock, so a demo user cannot be locked out for the day by a script. Ten failures per 15 minutes per email return 429.

Inactive users receive the same `AUTH_INVALID` as unknown users.

## Idempotency conflicts

If the idempotency key exists and the new call's arguments match, return the stored tool output. If the key exists and the arguments differ, return `CONFLICT` to the planner and do not execute. That case means a bug in key construction and should be logged at error level.
