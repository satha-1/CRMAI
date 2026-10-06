# Observability

**Status:** Proposed.  
**Sink:** structured JSON lines on stdout. The host or Docker captures them. No paid APM is required.  
**Correlation:** every HTTP request gets `request_id` UUID. AI logs use `conversation_id` and `message_id`.

## What is logged

| Area | Level | Fields |
| --- | --- | --- |
| API request finished | info | `request_id`, method, path template, status, duration_ms, `user_id` if any |
| Authentication | info | `request_id`, `user_id` or email on failure, action `login` or `login_failed`. No password |
| AI decision | info | `conversation_id`, `customer_id`, `message_id`, `intent`, `tool_name`, `tool_status`, `confidence_final`, `decision`, `escalation_reason`, `model_name`, `latency_ms`, `retrieved_chunk_count` |
| Tool call | info | the AI decision line above, plus `idempotency_key` prefix (first 8 chars) |
| External integration | info or error | `adapter`, operation `send` or `webhook`, `delivery`, duration_ms, provider status code. No message body |
| Escalation | info | `escalation_id`, `priority`, `reason_code`, `assigned_user_id` |
| Errors | error | `request_id`, `code`, exception type. Stack on the server only |

Example AI line:

```json
{
  "level": "info",
  "event": "ai_turn",
  "conversation_id": "…",
  "customer_id": "…",
  "message_id": "…",
  "intent": "lead_request",
  "tool_name": "create_lead",
  "tool_status": "success",
  "confidence_final": 0.86,
  "decision": "tool",
  "escalation_reason": null,
  "latency_ms": 2400,
  "model_name": "configured-model"
}
```

## What is not logged

- Customer message content
- Full prompts or completions
- Authorization headers, widget keys, webhook signatures, refresh tokens
- Password hashes
- Embedding vectors
- SMTP or LLM response bodies

If a demo needs a transcript, it is already in `messages` for an authorized user. Logs are the wrong copy.

`tool_input` in the database may contain an email the customer just provided, because the tool must store what it changed. Log lines do not repeat `tool_input`. A developer debugging locally may turn on `LOG_AI_DEBUG=true` to log tool names and validation errors only. That flag defaults false and must stay false in a shared environment.

## Request logging

Middleware starts a timer, assigns `request_id`, and writes one line at the end. Health checks `GET /health` are logged at debug so they do not bury the demo.

Path templates are logged (`/api/v1/customers/{id}`), not raw paths, so UUIDs do not explode cardinality if the team later counts by path. The raw id is still available as `entity_id` when the handler sets it.

## AI trace versus audit

| Store | Question it answers |
| --- | --- |
| stdout | What happened during the demo, was the provider slow, did a 500 occur |
| `ai_actions` | What the agent intended and which tool result it saw |
| `audit_logs` | Which staff member changed a user, published an article, or took over |
| `messages` | The actual words |

Do not try to make one of these do all four jobs.

## Health

`GET /health` returns `{ "status": "ok" }` if the process is up and a `SELECT 1` succeeds. It does not call the LLM. A separate `GET /health/llm` may be added for a manual check and must require admin auth so it cannot be used to burn quota. Optional, not required for MVP.

## Metrics

Counters in process memory are enough if the team wants them: `ai_turns_total`, `ai_escalations_total`, `webhook_duplicates_total`. Expose them on `GET /metrics` only to admin, as JSON, not a Prometheus requirement. If nobody reads them, skip the endpoint and use SQL on `ai_actions` instead. Prefer SQL over an unused metrics framework.

## Follow-up scanner

Each run logs `scanned`, `notified`, `marked_missed`, and duration. A run that throws logs error and continues next minute.

## Privacy review before demo

Read one AI log line and one error line from a rehearsal. Confirm the customer sentence does not appear. This is a checklist item in the testing strategy.
