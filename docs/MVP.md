# MVP

**Minimum viable demonstration:** a staff member and a customer can show that an AI agent, not a script, understood a website chat message, used approved knowledge, wrote CRM records through tools, and refused a refund by escalating.

The repository currently contains design documents only. This page defines what "done" means for the first integrated demo.

## MVP includes

1. **Customer profile.** Provisional customer created from the widget. Staff can open the profile and edit an allow-listed field.
2. **Website channel.** Widget session, inbound message, outbound message on a WebSocket or by refresh.
3. **Conversation management.** One open thread, history, AI on/off, staff reply.
4. **AI understanding.** Intent and entities stored on `ai_actions` for the premium-package utterance and the refund utterance.
5. **Context.** A second message in the same thread refers to the open lead without creating a duplicate.
6. **RAG.** At least three published documents: Premium description, price, refund policy. The price answer cites retrieved content under the rules in the RAG design.
7. **Tool execution.** `create_lead` and `create_followup` run through the executor, visible as rows and as `ai_actions`.
8. **Lead update.** A later utterance or the same turn may set `qualified` only when the rule allows. Staff can set `converted`.
9. **Follow-up.** A row with the timestamp the agent confirmed.
10. **Human escalation.** Refund utterance creates an escalation, disables AI, and does not create a payment record.
11. **Staff dashboard.** Inbox, customer timeline, lead list, escalation queue. Analytics may be the four headline numbers only.
12. **Customer journey.** Timeline shows first contact, inquiry, lead, follow-up, escalation.

Authentication with at least an agent and a supervisor is part of the MVP because otherwise the queue is not real.

## Extended prototype

Build these after the MVP path is reproducible.

- Email adapter with Mailpit
- Simulator demos for WhatsApp, Facebook, Instagram, and voice transcripts
- Mobile app: login, inbox, customer, takeover, follow-up complete
- Full analytics page including the staff table
- Knowledge UI sufficient for a supervisor to publish without using the API client
- In-app notifications for escalation and follow-up due
- User admin screen

## Future enhancement

- Live Meta or WhatsApp credentials and template messages
- A real voice provider and speech-to-text
- Mobile push
- Password reset by email
- File upload for knowledge
- Multi-organization tenancy
- Redis, a separate worker, a second API replica
- Fine-tuning or automatic learning from resolution notes
- Payment integration

## Explicit non-goals for the MVP demo

- Claiming that WhatsApp is connected
- Autonomous refunds or conversions
- A staff chatbot that edits CRM records from an admin prompt box

## Demo script

Run [scenario 1 and scenario 2](ai/DEMO-SCENARIOS.md) on website chat, then open the staff profile and show the timeline and the escalation. That script is the MVP acceptance test together with the Playwright path in the testing strategy.

## If the team runs out of time

Cut in this order, from first cut to last:

1. Mobile
2. Extra channel simulator polish
3. Analytics charts beyond four numbers
4. Email
5. Knowledge UI (seed SQL can publish documents)

Do not cut the tool executor, the escalation policy, or the website thread. Without those, the project is a normal CRM with a text box.
