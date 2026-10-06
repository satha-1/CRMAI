# ADR-008 Human-in-the-Loop Strategy

## Context

Some requests are unsafe or impossible for the tool list: refunds, angry complaints, low confidence, explicit requests for a person, identity conflicts. The agent must stop, and a person must see why.

## Decision

A deterministic policy module escalates using reason codes. Escalation creates one active row, turns off `ai_enabled`, and notifies staff. Takeover locks the conversation to one user. The model does not assign staff and does not resolve. Resolution notes stay staff-visible. They are not training data. A supervisor may turn a lesson into a published article. Re-enabling the AI requires an explicit release.

Billing and refund language always escalates, even if the model also retrieved a policy article.

## Alternatives

- **Always let the model decide whether to escalate.** Rejected. A confident wrong answer on a refund is the failure mode this ADR exists to stop.
- **Escalate every turn.** Rejected. The agent would never show autonomous lead and follow-up creation.
- **Shared inbox with no lock.** Rejected. Two staff replies and a late AI reply would collide.

## Rationale

Code is the right place for non-negotiable cases. The model remains free to escalate earlier through `escalate_to_human`. It is not free to skip the policy. The lock matches how a small team actually handles one customer.

## Consequences

- Thresholds will need adjustment after the gold set. They live in one module.
- Urgent SLA of 15 minutes is a demo target, not a staffed contact center.
- "Learning" in the proposal is a human knowledge edit, and the documents say so.
