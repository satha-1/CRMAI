# ADR-001 Architecture Style

**Status:** To be superseded by [ADR-011](ADR-011-microservices-kong-gateway.md), which is proposed and not yet accepted.

## Context

The system must connect a CRM, several channels, and an AI agent that calls CRM actions. The team has four people. The repository had no existing services to split. The academic deliverable is a working prototype, not a platform.

## Decision

Build a modular monolith: one FastAPI process, one PostgreSQL database, and separate web and mobile clients. Modules are Python packages with a one-way dependency rule. The AI package calls CRM services through the tool executor. It does not open its own SQL for business writes.

## Alternatives

- **Microservices** for CRM, AI, and channels. Rejected. Network failures and three deployables would dominate the project.
- **Modular monolith in Node.js.** Viable. Rejected in favor of Python because tool schemas, the agent loop, and embeddings sit in one language the AI work already needs. See ADR-003.
- **Serverless functions per tool.** Rejected. Local debugging of a multi-step turn would be worse, and cold starts fight the latency target.

## Rationale

Customer, lead, and message writes belong in one transaction boundary with the audit row. In-process calls keep that boundary simple. Packages still let four people work on services, UI, agent, and adapters without stepping on one file.

## Consequences

- Scaling out the API later requires moving the follow-up scanner to a single worker first.
- A bad import from `ai` to `db` sessions can bypass the design. Code review watches that.
- The system is not multi-region. That is acceptable.
