# Non-Functional Requirements

**Status:** Prototype targets. These are course-scale numbers, not a commercial SLA.  
**Measurement:** timings from the lab machine described in the deployment document (one developer laptop or one small VM, Docker Compose, local PostgreSQL). AI timings include the external LLM call and will move if the provider is slow.

## Performance

| ID | Target |
| --- | --- |
| NFR-P1 | Staff list and detail GET requests: p95 under 500 ms with 1,000 customers and 10,000 messages |
| NFR-P2 | Staff write requests that do not call the LLM: p95 under 800 ms |
| NFR-P3 | Website widget message accepted (HTTP 202, before the model returns): p95 under 400 ms |
| NFR-P4 | Dashboard query over 30 days: under 1 second on the same dataset |

## AI response latency

| ID | Target |
| --- | --- |
| NFR-AI1 | Reply with retrieval and no mutating tool: p95 under 8 seconds |
| NFR-AI2 | Reply with one mutating tool round: p95 under 15 seconds |
| NFR-AI3 | Hard timeout to the LLM: 20 seconds, then the failure path in the AI architecture |

If the provider's median latency is already above these numbers, record the measured median in the test log and treat the timeout plus escalation behavior as the requirement that must still hold.

## AI accuracy

Measured on the gold sets in the testing strategy, not on a live customer base.

| ID | Target |
| --- | --- |
| NFR-AC1 | Intent accuracy at least 80 percent on a 40-utterance labeled set |
| NFR-AC2 | Tool selection accuracy at least 80 percent on 20 scripted turns where the expected tool is defined |
| NFR-AC3 | Grounded response rate 100 percent on the price and policy subset: no answer states a price without a retrieved chunk |
| NFR-AC4 | Refund scenario: 100 percent escalate, 0 autonomous refunds, on the scripted billing set (at least 5 utterances) |

80 percent is the bar for a prototype with a small model and a small test set. It is not a claim about production accuracy.

## Scalability

| ID | Target |
| --- | --- |
| NFR-S1 | Support 10 simultaneous staff WebSocket clients in the demo |
| NFR-S2 | Support 5 concurrent AI turns without process crash. Extra turns wait on the server's normal async handling |
| NFR-S3 | Knowledge base up to 500 chunks without a design change |

Beyond that, the expected change is a single worker for the scheduler and a larger database, not a rewrite into microservices.

## Availability

| ID | Target |
| --- | --- |
| NFR-A1 | During a supervised demo window, the stack restarts from Docker Compose in under 10 minutes if the host is healthy |
| NFR-A2 | No 99.9 percent target. Lab availability goal is 95 percent of planned demo hours in the final two weeks, measured informally by the team |

A provider outage must degrade to escalation, not to data loss. Inbound messages commit before the LLM call.

## Reliability

| ID | Target |
| --- | --- |
| NFR-R1 | Replaying the same webhook body does not create a second message or a second lead |
| NFR-R2 | A failed LLM call leaves the inbound message visible to staff |
| NFR-R3 | Follow-up due scanner may miss a minute during restart. It must catch due items on the next run |

## Security

| ID | Target |
| --- | --- |
| NFR-SE1 | Unauthenticated calls to staff routes return 401 |
| NFR-SE2 | Agent role calling user-admin returns 403 |
| NFR-SE3 | Widget session cannot read another session's messages |
| NFR-SE4 | Forged webhook signature returns 401 and stores nothing |
| NFR-SE5 | AI evaluation set: no path from a customer utterance to a refund record, because the record type does not exist |

## Maintainability

| ID | Target |
| --- | --- |
| NFR-M1 | Channel-specific types do not appear in `services/` or `ai/planner.py` |
| NFR-M2 | A new tool requires a registry entry, a schema, and a test, without changing the HTTP client |
| NFR-M3 | Database changes go through Alembic migrations only |

## Usability

| ID | Target |
| --- | --- |
| NFR-U1 | A staff user can find a customer by name and open the timeline in under a minute on the first attempt in usability rehearsal |
| NFR-U2 | Takeover is one button on the conversation page |
| NFR-U3 | Error toasts show the API `message`, not a status code alone |

## Accessibility

| ID | Target |
| --- | --- |
| NFR-ACX1 | Interactive controls are keyboard reachable on the web app |
| NFR-ACX2 | Inputs have associated labels |
| NFR-ACX3 | Status is shown as text, not only as color |
| NFR-ACX4 | Text contrast at least WCAG AA for body text on the staff pages |

A formal external audit is not required. A teammate runs a keyboard pass on login, inbox, conversation, and lead create.

## Observability

| ID | Target |
| --- | --- |
| NFR-O1 | Every HTTP error response includes `request_id`, and the same id is in the log line |
| NFR-O2 | Every AI turn logs intent, tool name, tool status, final confidence, and escalation decision |
| NFR-O3 | Logs do not contain passwords, tokens, or raw customer message content |

## Integration reliability

| ID | Target |
| --- | --- |
| NFR-I1 | Website chat works with no external messaging vendor |
| NFR-I2 | With SMTP unset, outbound email is stored and marked skipped, and the UI shows that state |
| NFR-I3 | Simulator disabled in production configuration: the route is not mounted |

## How to use these in the course

If a target fails, write the measured value next to the id in the test notes and either fix the implementation or revise the target with a one-line reason. Do not leave the document claiming a number the team never measured.
