# Architecture Review

**Date:** 5 October 2026  
**Subject:** the design in `docs/`, reviewed against the brief.  
**Repository at review:** no application code. This review judges the design, not a running system.

## Functional requirements

| Requirement | Verdict |
| --- | --- |
| Unified profiles | Covered by customers and channel contacts, with a conflict path instead of silent merges |
| Omnichannel | Covered as an adapter architecture. Only website chat is a real MVP transport. The other five are specified and testable through the simulator or email. The review treats a claim of live WhatsApp as a defect if someone adds it to a slide without a token |
| Autonomous CRM operations | Covered by named tools and service rules |
| Journey | Covered by an append-only event log and a profile timeline |
| AI decision support | Covered by the orchestrator, stored on `ai_actions` |
| Human escalation | Covered, including lock and the decision not to train on notes |
| Web and mobile | Web is on the MVP path. Mobile is an extended phase with an explicit screen list |
| Analytics | Aggregate SQL, modest metrics, labels that do not over-claim "AI success" |
| External APIs | LLM is required. Messaging vendors are optional and named as absent |

No proposal requirement is missing from the design. Several are intentionally thinner than a commercial CRM. That is recorded in the MVP page.

## AI requirements

The agent can create a lead and a follow-up, or escalate a refund, and both outcomes are auditable. That meets the brief's demand that AI is the core, not a side chat.

The design refuses unrestricted SQL, caps tool rounds, and checks claims against tool rows. Those are the right controls for this scope.

## Academic feasibility

A four-person team can implement phases 1–9 if they stop at the MVP checkpoint. The documents name the files, tables, and routes. The main academic risk is spending the term on channel vendors or on a framework that hides the agent loop. ADR-003 and ADR-006 exist to prevent that.

The design is explainable in a viva: one process, one database, one executor.

## Four-person feasibility

The component matrix splits CRM, UI, agent, and integrations. The dangerous dependency is the agent waiting on services. The roadmap puts a widget without AI in phase 5 and a fake LLM in parallel, so both sides have a running seam.

Mobile and four extra live channels do not fit the same calendar as a careful agent. They are sequenced after phase 9.

## Security

The threat list matches the agent: injection, tool abuse, exfiltration, hallucinated writes. Controls are mostly simple (allow-list, HMAC, bcrypt, short JWT). Gaps that are accepted for the prototype:

- In-memory rate limits
- Refresh token in `sessionStorage` on the web
- No application-level field encryption
- No password reset

These are documented. They are not enterprise security, and the review does not pretend they are.

## Scalability

Sufficient for a demo dataset and about ten staff sockets. The single scheduler is a known limit. No change is recommended unless the team deploys two API copies.

## Maintainability

Normative names are shared across the HLD, LLD, API, and schema. That will rot if implementation renames routes without editing the docs. The project structure page says to update the docs in the same change.

The tool list is the extension point. That is maintainable. A generic "do anything" tool would not be.

## Implementation complexity

Highest complexity, correctly placed: orchestrator, executor, and identity rules.  
Lowest complexity that still looks like a feature: analytics counts.

The knowledge path avoids file parsing on purpose. That cut is still recommended.

## Cost

Expected cash cost is an LLM API key and, if used, a small VM. pgvector, Compose, and the simulator avoid per-channel vendor fees. Embedding and chat on every widget message can still spend quota. Caps: three tool rounds, 20 turns per conversation per hour, and no LLM call on the health check.

## External dependencies

| Dependency | Required to demonstrate the core? |
| --- | --- |
| PostgreSQL pgvector | Yes |
| LLM with tool calling and embeddings | Yes for live AI, no for the scripted test suite |
| SMTP | No |
| Meta, WhatsApp, telephony | No |

The design does not describe these missing vendor integrations as if they already work.

## Over-engineered components

None of the following are in the design, and they should stay out: microservices, Kubernetes, a workflow engine, a separate vector database, LangGraph as the control plane, a customer marketing-score model, push notifications.

The permission table is slightly more formal than three `if role` checks. It is still justified because the brief asks for roles and the AI principal must not be a role escalation. Keep the seed matrix fixed. Do not build a permission-editor UI.

`GET /metrics` is optional in the observability doc. Skip it if SQL is enough. That is the one place the design already offers a simpler path; take it.

## Under-designed components

- **Timezone of "tomorrow afternoon."** Scenario 1 now says to encode 14:00 and the lab timezone in the prompt. Implement that as a constant `DEFAULT_AFTERNOON_LOCAL` in config when coding. The schema stores UTC. The reply should render the local time. This is the sharpest product ambiguity left.
- **Verification of a cross-channel match.** The rule is specified, but the staff UI control to mark a contact verified is only the contacts POST. Add a button on the profile in phase 5 so the demo does not need an API client. Small, and worth doing.
- **Concurrency of two AI turns on one conversation.** Duplicate external ids are handled. Two different messages arriving while a turn is in flight are not fully serialized. Add a per-conversation lock (a row flag `turn_in_progress` or `SELECT FOR UPDATE` on the conversation) in phase 6. Without it, two tool calls could interleave.

These three are recommended changes before implementation of the agent, not new subsystems.

## Missing components

- A root README with setup commands. Correctly postponed until phase 1, when commands are real.
- Evaluation log file. Created on the first live run.
- No CI workflow file yet. Phase 14 and phase 2 are when it becomes real. The design names the steps.

No missing runtime component blocks the MVP definition.

## Risks

| Risk | Review note |
| --- | --- |
| Provider latency or quota | Fallback demo is documented. Measure once in phase 6, not the night before marking |
| Scope creep on channels | Phase order is the mitigation |
| Hallucinated writes | Claim check plus tests. Still rehearse scenario 2 on the live model |
| Identity merge mistakes | Unique constraint and conflict escalation. Do not add fuzzy name matching |
| Document drift | Update docs when behavior changes |
| Empty repo | There is no legacy code to protect. The risk flips: people generating a second, conflicting stack. The project structure page is the counter |

## Recommended changes

1. Keep this design. Do not introduce a second architecture in code.
2. Implement phases 1–9 before mobile and before live social channels.
3. Add the conversation turn lock and the "verify contact" button when those phases start.
4. Use a fake `LLMClient` in CI from the first agent test.
5. Seed fictional data only.

## Closing judgment

The architecture is implementable, internally consistent, and matched to a four-person prototype. It puts autonomy in a tool loop with a policy the team can unit test. It does not pretend that unavailable messaging networks are already connected. That is the right shape for the brief as it stands against an empty repository.
