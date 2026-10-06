# Responsible AI

**Status:** Design commitments for the prototype.  
**Position:** the agent may perform a short list of reversible CRM preparations. It may not make financial decisions, close a sale, or hide that a person can take over.

## 1. Human oversight

- Staff can read every AI message and the decision side panel: intent, tools, confidence, escalation reason.
- Takeover disables the AI immediately.
- Release back to the AI is an explicit action.
- Supervisors publish the only text the agent may treat as policy or price.
- Resolution notes are not fed back into training. A person edits the knowledge base if the organization should answer differently next time.

## 2. Explainability

Each turn stores an `ai_actions` trail. The UI shows the trail without raw prompts. A supervisor with `audit.read` can inspect tool status. "The model decided" is not an acceptable explanation in a demo. The explanation is the intent, the tool results, and the policy rule that fired.

The customer-facing reply does not include chain-of-thought. It includes the concrete outcome: the follow-up time that was stored, or the statement that a person will continue.

## 3. Confidence thresholds

| Situation | Threshold |
| --- | --- |
| Send a knowledge answer | final confidence ≥ 0.55 and a chunk ≥ 0.75 similarity |
| Execute a mutating tool | final confidence ≥ 0.75 and tool success on re-read |
| Billing, human request, angry complaint | capped at or below 0.45 and escalated |

Thresholds are constants in code so a change is reviewed. They are not sliders in the MVP.

## 4. Hallucination mitigation

- Catalog product names are validated against published titles.
- Prices and policies require retrieved chunks.
- CRM claims require a successful tool row in the same turn.
- If grounding is missing, the reply says the agent does not have an approved article, and the policy may escalate.
- The model is not given database credentials, so it cannot "check quickly" by inventing a query.

## 5. Grounded responses

Two grounds only:

1. Retrieved published chunks for business facts.
2. Tool results and the prefetched CRM snapshot for customer facts.

Model weights are not a source for Northline prices. If the seed article changes, the answer changes because retrieval changes, not because someone hopes the model remembers.

## 6. Tool authorization

The allow-list in the AI architecture is the boundary of autonomy. Adding a tool is a design change: schema, service rule, test, and a row in the demo scenarios. It is not a prompt edit.

## 7. Data privacy

- Demo data is fictional.
- Customer text is sent to the configured LLM provider. The README of the implementation, when written, must say that plainly. This document states it now.
- Prompts are not stored. Logs do not contain message bodies.
- The agent snapshot excludes staff-only timeline notes.
- There is no advertising use and no sale of conversation data. The prototype has no such integration.

## 8. Bias

The agent does not score customers for credit, hiring, or policing. Lead qualification uses explicit rules: a named catalog product plus a reachable contact. It does not infer gender, ethnicity, or "seriousness" from a name.

Sentiment is only `neutral`, `frustrated`, or `angry`, and it only affects escalation priority. A frustrated customer is not denied a lead.

If the team observes the model treating similar requests differently, the fix is a better tool argument check or an article, not a hidden score.

## 9. Auditability

`ai_actions` plus `audit_logs` plus journey events reconstruct a turn: what the customer asked (in `messages`, access-controlled), what the agent attempted, what was written, and whether a person took over. Message content stays in `messages` with normal CRM access, not in the log stream.

## 10. AI failure handling

| Failure | Customer-visible behavior |
| --- | --- |
| Timeout or provider outage | Apology that a person will follow up, plus escalation `llm_unavailable` |
| Invalid model output | Same, reason `model_output_invalid` |
| Tool denied | Either a corrected reply that does not claim success, or escalation if the goal is unmet |
| Low confidence | Escalation rather than a guess, except trivial acknowledgements that do not state facts |
| Repeated failures | Escalation `repeated_failure` |

The customer is not shown a stack trace or a raw provider payload.

## 11. Boundaries of autonomous action

**Allowed without a person in the loop**

- Answer from published knowledge when grounding and confidence pass.
- Create or update an open lead inside the allowed transitions.
- Update allow-listed contact fields.
- Schedule one follow-up inside the time window.
- Create an unassigned support task at priority high or below.
- Escalate.

**Not allowed**

- Refunds, credits, invoices, or payment changes.
- Marking a lead converted, lost, or unqualified.
- Deleting or merging customers.
- Assigning or impersonating staff.
- Changing knowledge, roles, or passwords.
- Promising a human SLA shorter than the priority table.
- Continuing to talk after takeover.

These boundaries are the definition of autonomy for the marking scheme and the demo. A feature that needs a forbidden action needs a person, not a smarter prompt.
