# Analytics

**Status:** Proposed read models. No dashboard is implemented.  
**Endpoint:** `GET /api/v1/analytics/dashboard?from=&to=`  
**Store:** live SQL on the CRM tables. No warehouse and no third-party product analytics.

All rates are 0 when the denominator is 0. Simulated messages (`metadata.simulated=true`) are excluded from channel and AI rates so a channel demo does not inflate production-like numbers. A query flag `include_simulated=true` exists for the supervisor to inspect tests. Default is false.

Agents with `analytics.read` receive only rows where they are `assigned_user_id` or the completing user. Supervisors and admins receive the whole organization. The response shape is the same.

## Metrics

| Metric | Definition | Source |
| --- | --- | --- |
| `leads_created` | Leads with `created_at` in range | `leads` |
| `leads_by_status` | Counts grouped by current status, among leads created in range | `leads` |
| `leads_converted` | Leads created in range whose status is now `converted` | `leads` |
| `conversion_rate` | `leads_converted / leads_created` | derived |
| `interactions` | Journey events in range | `customer_interactions` |
| `messages_by_channel` | Inbound messages in range grouped by channel | `messages` join `conversations` |
| `median_first_response_seconds` | For conversations whose first inbound falls in range, median seconds until the first outbound message | `messages` |
| `ai_resolution_rate` | Conversations with at least one AI outbound in range and no escalation opened in range, divided by conversations with at least one AI outbound | `messages`, `escalations` |
| `escalation_rate` | Escalations opened in range divided by inbound customer messages in range | `escalations`, `messages` |
| `followups_completed` | Follow-ups with `completed_at` in range | `follow_ups` |
| `followups_missed` | Status `missed` and `scheduled_at` in range | `follow_ups` |
| `ai_actions_by_tool` | Count of `ai_actions` in range grouped by `tool_name` and `tool_status` | `ai_actions` |
| `median_ai_latency_ms` | Median `latency_ms` of decision rows in range | `ai_actions` |

`ai_resolution_rate` is a prototype proxy. It means "the AI replied and nobody escalated that conversation during the window." It does not mean the customer was satisfied. The UI label must say **AI handled without escalation**, not "AI success."

## Channel usage

`messages_by_channel` is the chart. Website should dominate until another transport is connected. Disabled channels appear as zero, which shows they are designed but idle.

## Customer engagement

Not a separate marketing score. The profile shows counts for the selected customer via the timeline and conversation list:

- Inbound messages in the last 30 days
- Distinct channels
- Open follow-ups

The dashboard does not rank customers by a hidden score. `high_priority_customer` notifications are explicit: an urgent escalation or a lead with staff-set `estimated_value` above a constant `HIGH_VALUE_LEAD` default 5000. That constant is configuration, and the AI cannot set `estimated_value`.

## Agent performance

For each staff user in range, supervisors can request `GET /api/v1/analytics/agents` (same permission, supervisor and admin only):

| Field | Definition |
| --- | --- |
| `user_id`, `full_name` | Staff |
| `replies` | Outbound messages with `sender_type=staff` |
| `escalations_resolved` | Escalations they resolved |
| `median_takeover_seconds` | From escalation `created_at` to their takeover |
| `followups_completed` | Follow-ups they completed |

This is for coaching during the project demo, not for automated HR decisions. The UI must not show a single "performance score."

## Data freshness

Queries run at request time. With the expected prototype volume this is acceptable. If a query exceeds 1 second in tests, add the index named in the database design before adding a cache.

## UI

One dashboard page:

- Date range, default last 7 days
- Four numbers: leads created, conversion rate, escalation rate, median first response
- A channel bar
- A table of AI tool outcomes
- For supervisors, the staff table

No funnel builder, no CSV export in the MVP. Export can be a later enhancement.
