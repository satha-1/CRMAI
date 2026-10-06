# Component Responsibility Matrix

The repository did not name a team. The ownership column is a recommended split for four people. Replace the role labels with names when the group assigns them.

| Component | Responsibility | Inputs | Outputs | Dependencies | Owner |
| --- | --- | --- | --- | --- | --- |
| API routers | HTTP and WebSocket contract | JSON, tokens | JSON, events | Auth, services, orchestrator | Member 1 |
| Auth and RBAC | Login, refresh, permissions | Credentials | Tokens, current user | users, roles | Member 1 |
| Customer service | Profiles and contacts | Staff DTO, identity calls | Customer rows, journey | PostgreSQL | Member 1 |
| Lead service | Lead rules and transitions | Staff DTO, tool calls | Lead rows | Customer service | Member 1 |
| Follow-up service | Schedule rules, due scan | Tool or staff DTO | Follow-up rows, missed status | Notifications | Member 1 |
| Task service | Internal tasks | Tool or staff DTO | Task rows | Notifications | Member 1 |
| Conversation service | Threads, lock, history | Canonical messages, staff replies | Message rows | Identity | Member 1 |
| Journey service | Append timeline | Service events | Interaction rows | PostgreSQL | Member 1 |
| Staff web app | CRM UI | API JSON, sockets | User actions | API | Member 2 |
| Chat widget | Public website channel UI | Widget API | Customer text | API | Member 2 |
| Mobile app | Staff phone UI | API JSON | User actions | API | Member 2 |
| Orchestrator | Turn loop | message id | TurnResult | LLM, tools, policy, services | Member 3 |
| Intent and planner | Structured model calls | Snapshot, chunks | Intent, tool or reply | LLMClient | Member 3 |
| Tool executor | Authorize and run tools | Tool call, turn context | Tool result, ai_actions | Services | Member 3 |
| Escalation policy | Respond versus escalate | Confidence, intent, tool status | Decision and reason code | Constants | Member 3 |
| RAG | Chunk, embed, search | Documents, query | Chunks | pgvector, LLMClient | Member 3 |
| Knowledge HTTP | Draft and publish | Staff text | Documents | RAG, auth | Member 3 with Member 1 for the route |
| Channel router | Dedupe and dispatch | Provider payloads | Canonical messages | Adapters, conversation | Member 4 |
| Website adapter | Live chat transport | Widget events | Sends on the socket | Router | Member 4 |
| Email adapter | Webhook and SMTP | Mail JSON, outbound text | Canonical, SMTP | Router | Member 4 |
| Other adapters | Normalize and guarded send | Simulator or future payloads | Canonical or ChannelNotConnected | Router | Member 4 |
| Escalation service | Queue, SLA, lock handoff | Policy and staff actions | Escalation rows | Conversation, notifications | Member 4 with Member 1 |
| Notifications | In-app and optional email | Service events | Notification rows, socket events | WebSocket | Member 4 |
| Analytics | Aggregates | Date range, actor | Metric JSON | SQL | Member 4 |
| Observability | Logs and request ids | All modules | Log stream | stdout | Member 4 |
| CI and Compose | Test and run the stack | Git push | Images, migration | GitHub Actions, Docker | Member 4 |

Member 3 owns the agent boundary. Member 1 owns the services the tools call. They meet at the executor: Member 3 must not bypass Member 1's rules with a direct SQL call.

## Suggested phase ownership

| Phase | Lead |
| --- | --- |
| Foundation, schema, auth, CRM services | Member 1 |
| Staff web shell and widget | Member 2 |
| Orchestrator, tools, RAG | Member 3 |
| Adapters, escalation queue wiring, analytics, CI | Member 4 |
| Mobile after the inbox API is stable | Member 2 |
| Evaluation set and demo scripts | Member 3, reviewed by all |

Integration weeks are shared. The risk is Member 3 waiting on services or Member 2 waiting on routes. The roadmap therefore builds CRM services and the widget echo (store and return a message with no AI) before the model is connected.
