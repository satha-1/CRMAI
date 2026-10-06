# ADR-004 RAG Strategy

## Context

Answers about prices and policies must come from text the supervisor published. The corpus is small: package descriptions, FAQs, and policies for a fictional company. Customer facts are not documents.

## Decision

Chunk published bodies to about 800 characters with 120 overlap. Embed with the configured model into pgvector at 768 dimensions. Retrieve top candidates by cosine similarity and drop anything below 0.75. Inject the remaining chunks into the planner prompt. If none remain, the agent must not state a price or a policy.

Customer-specific answers use CRM tools, not the vector index.

## Alternatives

- **Put the whole FAQ in the system prompt.** Rejected once the corpus grows past a few pages, and it mixes instructions with data. Acceptable only as a temporary step before phase 7. The design target is retrieval.
- **Keyword search only.** Rejected as the primary method because paraphrases are the demo ("how much is the top tier" versus "Premium price"). Keyword search can be added later if recall is poor. It is not a second product in the MVP.
- **Fine-tune the model on the FAQ.** Rejected. Updates would require training, and the team could not show which sentence grounded an answer.

## Rationale

Retrieval plus a similarity floor gives a visible reason for an answer: chunk ids on `ai_actions`. Publishing is a staff action with an audit row, so the business controls the words.

## Consequences

- Authors paste text. There is no PDF pipeline in the MVP.
- A bad article becomes a bad answer. Review before publish is the control.
- The 0.75 floor may need tuning against the gold set. Changes are recorded with the recall numbers.
