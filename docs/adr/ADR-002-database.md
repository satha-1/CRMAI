# ADR-002 Database Selection

## Context

The CRM needs relational integrity: one channel identity must not point at two customers, and a webhook retry must not insert two messages. The agent also needs similarity search over a few hundred knowledge chunks. The team should run the stack on one laptop.

## Decision

Use PostgreSQL 16 with pgvector. UUID primary keys. Alembic migrations. Embeddings are a `vector(768)` column on `knowledge_chunks`.

## Alternatives

- **SQLite.** Rejected. Concurrent staff use and pgvector-equivalent search are weaker, and the demo host would not match development.
- **MySQL.** Capable of the relational model. Rejected because pgvector on PostgreSQL is the shortest path to RAG without a second engine.
- **MongoDB.** Rejected. The important rules are foreign keys and unique constraints.
- **Managed vector database.** Rejected for cost, another secret, and operational load. Revisit only if chunk counts leave the prototype range and pgvector measurements fail.

## Rationale

One database keeps leads and the chunks that describe products consistent in backups and in local setup. Unique constraints implement identity and deduplication even if application code races.

## Consequences

- Embedding dimension is part of the schema. Changing models means a migration and a re-embed.
- Team members need Docker to run PostgreSQL. That is already required for a realistic demo.
- JSONB is allowed for metadata and tool payloads, not as a substitute for lead status.
