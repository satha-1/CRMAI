# Use Cases

Actors are the customer, staff agent, supervisor, and administrator. The AI agent is a system actor inside several flows. It is never the only control on a write.

Seed company used in examples: Northline Services.

---

## UC01 Customer sends inquiry

- **Actor:** Customer
- **Preconditions:** Widget key configured. Website channel enabled.
- **Main flow:**
  1. Customer opens the widget. The system creates a provisional customer, contact, and conversation.
  2. Customer sends "What does the Premium package include?"
  3. The router stores the message and starts a turn.
  4. The customer receives a reply on the socket.
- **Alternative:** The customer already has a visitor session. The same conversation is reused.
- **Exception:** Widget key missing. Request rejected. No customer created.
- **Postconditions:** An inbound message exists. Either an AI outbound message or an escalation exists.

## UC02 AI answers FAQ

- **Actor:** Customer, with AI agent as system
- **Preconditions:** A published FAQ or product article matches the question. Conversation `ai_enabled` is true.
- **Main flow:**
  1. Intent `faq` or `product_inquiry`.
  2. Retriever returns a chunk at similarity ≥ 0.75.
  3. Final confidence ≥ 0.55.
  4. Reply states only what the chunk supports.
  5. No mutating tool runs.
- **Alternative:** No chunk qualifies. The reply says an approved article was not found and the policy escalates if the customer needed a decision.
- **Exception:** LLM timeout. Escalation `llm_unavailable`. Inbound message remains.
- **Postconditions:** Outbound message stored. `ai_actions` records intent, chunk ids, and confidence.

## UC03 AI identifies customer

- **Actor:** AI agent (system), Customer
- **Preconditions:** Inbound message normalized.
- **Main flow:**
  1. `IdentityService` finds a contact for the channel identity.
  2. The turn binds that `customer_id`.
  3. The model is not asked to pick an id.
- **Alternative:** No contact. A provisional customer is created and `first_contact` is written.
- **Alternative:** Email in the text matches one customer. The new channel is attached unverified. Mutating tools except task and escalate are denied until verification.
- **Exception:** Email matches two customers. Escalation `identity_conflict`. No merge.
- **Postconditions:** Exactly one customer id is bound to the turn.

## UC04 AI creates lead

- **Actor:** Customer, AI agent
- **Preconditions:** Intent indicates sales. Confidence for mutation ≥ 0.75. Identity allows mutation.
- **Main flow:**
  1. Planner calls `create_lead` with title, summary, and catalog product if recognized.
  2. Executor validates and `LeadService` inserts status `new`, or returns the existing open lead.
  3. Journey `lead_created` on insert.
  4. Reply confirms the product interest without claiming a purchase.
- **Alternative:** Product name is not in the catalog. The entity is dropped. The agent asks which package, or creates a lead without `product_name` if the summary is still specific.
- **Exception:** Tool denied. Reply does not say the lead was created. Escalation if the customer cannot be helped.
- **Postconditions:** At most one open lead for that customer and product.

## UC05 AI updates customer

- **Actor:** Customer, AI agent
- **Preconditions:** Customer gives a new email or phone. Identity verified, or the profile is provisional and the field is the first contact handle.
- **Main flow:**
  1. `update_customer` with the allow-listed field.
  2. Service validates format and uniqueness.
  3. Journey `profile_updated`.
  4. Reply repeats the stored value.
- **Alternative:** Email already on another customer. Tool returns conflict. Escalation `identity_conflict`.
- **Exception:** Model tries to change owner or status. Schema rejects the field.
- **Postconditions:** Only allow-listed columns changed. Notes, if any, appended.

## UC06 AI schedules follow-up

- **Actor:** Customer, AI agent
- **Preconditions:** A reachable contact method exists. `requested_time` parses to a timestamp inside the next 30 days.
- **Main flow:**
  1. Lead exists or is created in an earlier round of the same turn.
  2. `create_followup` stores `scheduled` and the channel.
  3. Journey `follow_up_scheduled`.
  4. Supervisors or the owner are notified when due, not necessarily at creation unless the lead notification already fired.
  5. Reply states the stored timestamp.
- **Alternative:** A follow-up for that lead already exists today. Tool returns the existing rule error. The agent tells the customer a follow-up is already scheduled and quotes the stored time.
- **Exception:** Time is in the past or unparsable. No row. The agent asks for a time. It does not invent 3pm.
- **Postconditions:** Zero or one new follow-up. Staff can complete it later.

## UC07 Customer changes channel

- **Actor:** Customer
- **Preconditions:** An existing customer has a verified email. A new message arrives on email from that address, or the customer types the verified email in website chat.
- **Main flow:**
  1. Identity resolution attaches the new contact.
  2. A conversation opens on the new channel.
  3. Journey `channel_switch`.
  4. The snapshot includes open leads from the same customer, so the agent does not create a duplicate premium lead.
- **Alternative:** Match is unverified. Read tools work. `create_lead` is denied. Staff confirm the contact.
- **Exception:** Two customers share the address because of bad seed data. Escalation, no automatic merge.
- **Postconditions:** One customer, two contacts, two conversations, one open lead.

## UC08 AI retrieves customer context

- **Actor:** AI agent
- **Preconditions:** Customer bound. Conversation has history.
- **Main flow:**
  1. Orchestrator loads summary, last 12 messages, and CRM snapshot before the planner runs.
  2. If the planner calls `get_customer` or `get_conversation_history`, the executor returns the same services' data.
  3. The reply about "your premium request" matches the open lead title.
- **Alternative:** New provisional customer. Snapshot is nearly empty. The agent does not claim a history.
- **Exception:** Database error. Turn fails closed and escalates `data_store_unavailable`.
- **Postconditions:** No extra CRM writes caused only by reading.

## UC09 AI escalates conversation

- **Actor:** Customer, AI agent, policy
- **Preconditions:** A policy rule matches, or the planner calls `escalate_to_human` and the reason code is valid.
- **Main flow:**
  1. Escalation row opens with priority and `sla_due_at`.
  2. AI disabled. Status `pending_human`.
  3. Customer receives the handoff sentence.
  4. Staff are notified according to priority.
- **Alternative:** An active escalation already exists. The same id is returned. No second customer message.
- **Exception:** Billing intent and the model tries to say a refund was issued. Claim check blocks send. Escalation `ungrounded_claim` or `billing_requires_human`.
- **Postconditions:** One active escalation. Further inbound messages do not call the model.

## UC10 Human takes over

- **Actor:** Staff agent
- **Preconditions:** Staff is logged in with `conversation.takeover`. An escalation is active or they open the conversation.
- **Main flow:**
  1. Staff chooses Take over.
  2. Lock is set to that user. Status `in_progress`.
  3. Staff sends a reply through `POST /messages`.
  4. The adapter delivers it.
  5. Staff resolves with notes.
- **Alternative:** Another agent holds the lock. This caller receives 409 unless they are a supervisor using assign.
- **Exception:** WebSocket down. The message is still stored and the widget loads it on refresh.
- **Postconditions:** Resolution note stored. AI remains off until release.

## UC11 Staff manages customer

- **Actor:** Staff agent
- **Preconditions:** `customer.read` and `customer.write`.
- **Main flow:**
  1. Staff searches by name.
  2. Opens the profile and timeline.
  3. Corrects the phone or internal notes.
  4. Audit row `customer.update`.
- **Alternative:** No match. Staff creates a customer with POST.
- **Exception:** Duplicate email. 409. Staff opens the existing profile instead of forcing a second person.
- **Postconditions:** Profile matches the edit. Timeline contains `profile_updated` if the service writes it for staff updates. Staff updates of notes and phone do write `profile_updated`.

## UC12 Staff manages leads

- **Actor:** Staff agent
- **Preconditions:** `lead.write`.
- **Main flow:**
  1. Staff opens the lead created by the AI.
  2. Staff sets status to `qualified` or `converted`.
  3. On `converted`, journey events `conversion` and `purchase` are written.
- **Alternative:** Staff marks `lost`. No purchase event.
- **Exception:** Agent role calls DELETE. 403 if they lack `lead.delete`. Supervisor delete of a non-new lead returns 409.
- **Postconditions:** Status change visible on the customer timeline.

## UC13 Staff views customer journey

- **Actor:** Staff agent
- **Preconditions:** Customer exists with at least the first-contact event.
- **Main flow:**
  1. Staff opens the profile timeline.
  2. Events show actor and channel in time order.
- **Alternative:** Agent role does not see `visibility=staff` resolution notes. Supervisor does.
- **Exception:** Empty customer. The page shows an empty state, not an error.
- **Postconditions:** Read only.

## UC14 Staff views analytics

- **Actor:** Supervisor
- **Preconditions:** `analytics.read`. Some leads and messages exist.
- **Main flow:**
  1. Supervisor opens the dashboard for the last 7 days.
  2. The page shows leads, conversion, escalation rate, median first response, and channel counts.
- **Alternative:** Agent opens the same route and sees "My activity" scoped numbers.
- **Exception:** Range over 366 days. 400.
- **Postconditions:** No data change.

## UC15 Admin manages users

- **Actor:** Administrator
- **Preconditions:** `user.manage`.
- **Main flow:**
  1. Admin creates an agent with email, name, role, and password.
  2. The new user logs in.
  3. Admin deactivates a user. Refresh tokens are revoked and `is_active=false` blocks login.
- **Alternative:** Admin changes role from agent to supervisor. The next request loads new permissions.
- **Exception:** An agent calls `POST /users`. 403.
- **Postconditions:** User row updated. No AI tool can perform this use case.

## UC16 Admin manages knowledge base

- **Actor:** Supervisor or administrator
- **Preconditions:** `knowledge.write` and, for publish, `knowledge.publish`.
- **Main flow:**
  1. Author creates a draft with pricing text.
  2. Author publishes. Chunks and embeddings replace any previous set.
  3. A customer question retrieves the new chunk.
- **Alternative:** Embedding call fails. Publish returns 502. Old published chunks remain.
- **Exception:** An agent calls publish. 403. The AI `search_knowledge` tool cannot write.
- **Postconditions:** Only `published` documents are retrievable. Archive deletes chunks.
