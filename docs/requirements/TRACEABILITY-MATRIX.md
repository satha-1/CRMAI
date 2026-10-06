# Requirements Traceability Matrix

**Proposal source:** the functional requirements in the project brief.  
**Implementation state:** none of the components exist yet. This matrix maps requirements to the design that should implement them.

| Req | Feature | Architecture component | API | Database | UI | AI component | Test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-01 Unified customer profiles | Profile and channel contacts | `CustomerService`, `IdentityService` | `POST/GET/PATCH /customers`, `POST /customers/{id}/contacts` | `customers`, `customer_contacts` | Customer profile | `get_customer`, `update_customer`. Identity is deterministic, not the model | TC-CUS-01, TC-ID-01 |
| FR-02 Omnichannel | Adapters and canonical message | `ChannelRouter`, adapters | Widget routes, `POST /webhooks/email`, `POST /simulator/inbound` | `channels`, `messages`, `conversations` | Widget, inbox channel label | Orchestrator consumes canonical messages only | TC-CH-01, TC-CH-02, TC-CH-03 |
| FR-03 Autonomous CRM operations | Lead, profile, follow-up, task tools | Tool executor plus CRM services | No public tool HTTP API. Observed via conversation and `GET .../ai-actions` | `leads`, `customers`, `follow_ups`, `tasks`, `ai_actions` | Lead list, follow-ups, conversation side panel | `create_lead`, `update_lead`, `update_customer`, `create_followup`, `create_support_task` | TC-AI-04, TC-AI-05, TC-AI-06 |
| FR-04 Customer journey | Timeline | `JourneyService` | `GET /customers/{id}/timeline` | `customer_interactions` | Timeline component | Services write events after tools. The model does not write the timeline directly | TC-JRN-01 |
| FR-05 AI decision support | Intent, plan, confidence, policy | `AgentOrchestrator` | `POST /agent/message` for tests | `ai_actions`, `ai_conversation_contexts` | AI side panel | Classifier, planner, confidence, policy | TC-AI-01, TC-AI-02, TC-AI-03 |
| FR-06 Human escalation | Queue, lock, resolve | `EscalationService`, policy | `/escalations` | `escalations` | Escalation pages, takeover bar | `escalate_to_human` and policy codes | TC-ESC-01, TC-ESC-02 |
| FR-07 Web application | Staff console and widget | React app | All staff and widget routes | — | Routes in frontend architecture | Side panel and widget display | TC-WEB-01 |
| FR-08 Mobile application | Staff mobile | Expo app | Same staff routes | — | Screens in mobile architecture | Read-only view of AI decisions via conversation | TC-MOB-01 |
| FR-09 CRM analytics | Dashboard | `AnalyticsService` | `GET /analytics/dashboard`, `GET /analytics/agents` | reads leads, messages, ai_actions, escalations, follow_ups | Analytics page | Uses `ai_actions` produced by the agent | TC-AN-01 |
| FR-10 External API integration | LLM client, SMTP, future channel tokens | `LLMClient`, `EmailAdapter` | Webhook route | — | Delivery badge on messages | LLM calls inside orchestrator and RAG | TC-INT-01, TC-INT-02 |

## Channel coverage inside FR-02

| Channel | Design status | MVP? | Test |
| --- | --- | --- | --- |
| Website | Live WebSocket and REST | Yes | TC-CH-01 |
| Email | Adapter, SMTP optional | Extended prototype | TC-CH-02 |
| WhatsApp | Adapter plus simulator, send only if token set | Extended, simulated | TC-CH-03 |
| Facebook | Same | Extended, simulated | TC-CH-03 |
| Instagram | Same | Extended, simulated | TC-CH-03 |
| Voice | Transcript adapter, no dialer | Extended, simulated | TC-CH-03 |

The proposal lists six channels. The architecture includes all six behind one interface. Only website chat is a connected transport in the MVP. The traceability row is satisfied by the adapter and simulator tests, and the MVP definition is explicit that live vendor traffic is not claimed.

## AI tool coverage inside FR-03 and FR-05

| Tool | Requirement moment | Test |
| --- | --- | --- |
| `get_customer` | Context for a reply | TC-AI-03 |
| `update_customer` | Customer stated a new phone or email | TC-AI-05 |
| `create_lead` | Sales interest | TC-AI-04 |
| `update_lead` | Qualification | TC-AI-04 |
| `create_followup` | Asked to be contacted later | TC-AI-06 |
| `get_conversation_history` | Long thread | TC-AI-03 |
| `search_knowledge` | FAQ and pricing | TC-RAG-01 |
| `create_support_task` | Internal work after a complaint | TC-ESC-03 |
| `escalate_to_human` | Billing and low confidence | TC-ESC-01 |
| `send_message` | Disabled by default | TC-AI-07 expects denial |

## Non-functional mapping

| NFR group | Where verified |
| --- | --- |
| Performance and AI latency | TC-PERF-01 |
| Accuracy | TC-AI-EVAL |
| Security | TC-SEC-01 through TC-SEC-05 |
| Duplicate webhooks | TC-CH-04 |

Test outlines are in [TESTING-STRATEGY.md](../testing/TESTING-STRATEGY.md). Use cases UC01–UC16 cover the same requirements from the actor's point of view.
