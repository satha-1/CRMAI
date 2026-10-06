# ADR-005 Agent Tool Architecture

## Context

The proposal forbids unrestricted database access for the agent and names operations such as create lead, update customer, follow-up, and escalate. The model will sometimes request disallowed actions or claim a write that did not happen.

## Decision

Register a fixed set of tools. Each tool has a Pydantic input, a service method, and an authorization note. The executor injects `customer_id` and `actor`, checks confidence for mutations, enforces idempotency, re-reads the row, and writes `ai_actions`. Services repeat business rules. The planner never receives a database handle.

Default tools: `get_customer`, `update_customer`, `create_lead`, `update_lead`, `create_followup`, `get_conversation_history`, `search_knowledge`, `create_support_task`, `escalate_to_human`, `send_message`. `send_message` is denied unless a flag is enabled. There is no refund tool and no SQL tool.

## Alternatives

- **Generate SQL from the model.** Rejected. It is the unrestricted access the brief forbids.
- **Let the model call HTTP routes with a staff token.** Rejected. A prompt injection would hold a person's authority. The agent principal is weaker than any staff role.
- **One generic `update_record` tool.** Rejected. Allow-lists are clearer per operation than a generic patch language.

## Rationale

Named tools are testable. A denied `converted` status is one unit test. Idempotency makes webhook retries safe. The claim check ties customer-visible sentences to tool rows.

## Consequences

- New CRM behavior is not available to the agent until a tool is added on purpose.
- The executor and the services can drift. Integration tests call the executor, not only the service.
- Three rounds per turn cap cost and loops.
