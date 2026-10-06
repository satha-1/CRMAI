# ADR-009 Deployment Strategy

## Context

The prototype must run on student machines and once on a demo host. The team does not need elastic scale. Kubernetes would add cluster concepts the course is not evaluating.

## Decision

Docker Compose runs PostgreSQL with pgvector, the API, and optionally Mailpit. The web app is static files. GitHub Actions runs migrations and the fake-LLM test suite. The demo host is one machine with TLS terminated by Caddy when a hostname exists. Secrets stay in the environment. One API replica, because the scheduler lives in-process. Backups are `pg_dump` or a documented reseed.

## Alternatives

- **Kubernetes.** Rejected. No scaling requirement justifies it.
- **Platform-as-a-service for the API and a managed database.** Acceptable later if Compose on a VM is blocked by the university network. The application shape does not change. Do not adopt it until a team member has an account.
- **No containers, host Python only.** Rejected as the shared setup. Containers make PostgreSQL and pgvector the same for everyone.

## Rationale

Compose is the smallest setup that includes the vector type and a known Python version. CI without a live model key keeps pull requests reliable.

## Consequences

- Horizontal scaling is a later change, not a config flag.
- Students need Docker.
- A missing LLM key degrades the demo. The team rehearses the fallback: show stored `ai_actions` from a successful run.
