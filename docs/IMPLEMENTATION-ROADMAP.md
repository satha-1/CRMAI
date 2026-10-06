# Implementation Roadmap

The MVP is the goal of phases 1–9. Later phases are the extended prototype. Dates are not assigned because the course calendar was not in the repository. Order is the constraint.

Each phase lists tasks, dependencies, deliverables, and acceptance criteria.

## Phase 1 — Foundation

**Tasks.** Initialize git, `backend` FastAPI app, Compose with PostgreSQL pgvector, settings module, health check, error body, logging middleware, Alembic, `.env.example`, `.gitignore`.

**Dependencies.** None.

**Deliverables.** `docker compose up` serves `/health` and a migrated empty schema from the database design (tables may land incrementally, but `users` and `customers` exist by the end of phase 2).

**Acceptance.** A new clone follows a short README command and sees `{"status":"ok"}`. The README is written in this phase because the repo needs a run command; keep it to setup only.

## Phase 2 — Authentication and users

**Tasks.** Roles, permissions, seed admin, login, refresh rotation, `require_permission`, deactivate user.

**Dependencies.** Phase 1.

**Deliverables.** Auth routes in the API spec.

**Acceptance.** TC-SEC-01 and TC-SEC-02 pass. Wrong password and unknown email return the same message.

## Phase 3 — CRM core

**Tasks.** Customers, contacts, leads, follow-ups, tasks, journey writer, audit on staff updates.

**Dependencies.** Phase 2.

**Deliverables.** Services and routes. Seed script is optional here.

**Acceptance.** Staff token can create a customer and a lead. AI-allowed transition rules are unit-tested even before the agent exists. Agent role cannot delete a lead.

## Phase 4 — Conversation management

**Tasks.** Channels seed, conversations, messages, lock fields, history endpoint, `ai-actions` list endpoint returning an empty list for now.

**Dependencies.** Phase 3.

**Deliverables.** Inbox API.

**Acceptance.** Two messages persist in order. Lock flag can be set by a service test.

## Phase 5 — Website channel

**Tasks.** Widget session and message routes, WebSocket, staff web login, inbox, conversation page, customer profile with timeline. Outbound staff reply. No model yet: a placeholder outbound is not required. The message simply appears for staff.

**Dependencies.** Phase 4.

**Deliverables.** Widget and staff thread against the real API.

**Acceptance.** A message sent in the widget is visible in the staff inbox after refresh. Duplicate widget message id does not double-insert. TC-CH-01 without AI, plus TC-CH-04.

## Phase 6 — AI agent

**Tasks.** `LLMClient`, scripted fake, orchestrator, intent schema, planner, confidence, policy, `ai_actions` writes. Wire router to `handle_inbound` when `ai_enabled`.

**Dependencies.** Phase 5. An API key for manual trials.

**Deliverables.** Turns that reply or escalate with a fake model.

**Acceptance.** TC-AI-01 and TC-AI-02 pass on the fake model. A live call answers a trivial seeded FAQ or escalates cleanly on timeout.

## Phase 7 — RAG

**Tasks.** Documents, chunker, embed, publish transaction, retriever, seed Premium, price, and refund articles. Knowledge routes.

**Dependencies.** Phase 6.

**Deliverables.** Grounded FAQ path.

**Acceptance.** TC-RAG-01. Draft documents are not retrieved. Price utterance does not answer if chunks are withheld.

## Phase 8 — CRM tool execution

**Tasks.** Registry, executor, idempotency, re-read, claim check, tools: get/update customer, create/update lead, follow-up, history, search, task. `send_message` registered but denied.

**Dependencies.** Phases 3 and 6. RAG tool needs phase 7.

**Deliverables.** Autonomous lead and follow-up.

**Acceptance.** TC-AI-04, TC-AI-05, TC-AI-06, TC-AI-07. Second delivery of the same inbound event does not create two leads.

## Phase 9 — Human escalation

**Tasks.** Escalation service, policy wiring, notifications rows, takeover and resolve UI, AI disabled on lock.

**Dependencies.** Phases 5 and 8.

**Deliverables.** Refund path and staff takeover.

**Acceptance.** TC-ESC-01 and TC-ESC-02. Timeline matches the journey demo trace. This completes the MVP.

## Phase 10 — Additional channels

**Tasks.** Email webhook and SMTP badge. Simulator route. WhatsApp, Facebook, Instagram, and voice normalize functions. UI badge for simulated and skipped delivery.

**Dependencies.** Phase 5. AI path already channel-agnostic.

**Deliverables.** Extended channel demo.

**Acceptance.** TC-CH-02 and TC-CH-03. Production config test asserts the simulator route is absent.

## Phase 11 — Mobile

**Tasks.** Expo app: login, home, search, profile, inbox, reply, takeover, follow-ups, escalations, notifications.

**Dependencies.** Phase 9 APIs stable.

**Deliverables.** Staff flows on Android emulator or Expo web.

**Acceptance.** TC-MOB-01. Knowledge publish is not in the app.

## Phase 12 — Analytics

**Tasks.** Dashboard SQL, agent scope, page with four numbers and channel counts. Optional staff table.

**Dependencies.** Phase 8 data existing. Works without mobile.

**Deliverables.** `GET /analytics/dashboard`.

**Acceptance.** TC-AN-01. Agent token does not receive another user's reply count.

## Phase 13 — Testing

**Tasks.** Fill gaps in the case index, add the Playwright path, run one live eval, write scores, log-privacy checklist.

**Dependencies.** MVP phases. Can start unit tests from phase 2 onward. This phase is the hardening pass, not the first test.

**Deliverables.** Green fake-model suite. Eval note with model name and date.

**Acceptance.** Exit criteria in the testing strategy.

## Phase 14 — Deployment

**Tasks.** Dockerfile, Compose for the demo host, TLS if a hostname exists, backup tried once, simulator flag false, secrets outside git.

**Dependencies.** Phase 9 minimum, later phases if they are in the demo.

**Deliverables.** A host the team can restart.

**Acceptance.** Clean machine brings up health and a seeded login. Restore or reseed has been rehearsed.

## Working agreement

- One vertical slice beats a finished schema with no UI. Phase 5 before a perfect analytics query.
- Member 1 and Member 2 can work in parallel after phase 3's customer route exists.
- Member 3 starts the fake LLM and policy tests during phase 3–5 so phase 6 is integration, not research.
- Member 4 builds the webhook signature test with a stub adapter during phase 5.

## MVP checkpoint

Stop at the end of phase 9 and run demo scenarios 1 and 2. Only then start phase 10. Extra channels are the most likely way to miss the project's actual point.
