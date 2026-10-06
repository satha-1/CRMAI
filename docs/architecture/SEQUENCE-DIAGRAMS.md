# Sequence Diagrams

Participants match the module names in the low-level design. These are the intended call sequences for the prototype, not traces from a running system.

## 1. Customer inquiry

```mermaid
sequenceDiagram
    participant C as Customer
    participant W as WebsiteChatAdapter
    participant R as ChannelRouter
    participant I as IdentityService
    participant V as ConversationService
    participant O as Orchestrator
    C->>W: POST widget message
    W->>R: CanonicalMessage
    R->>R: reject duplicate external id
    R->>I: resolve website session
    I-->>R: customer_id
    R->>V: get_or_open and append_message
    V-->>R: message_id
    R->>O: handle_inbound
    O-->>C: outbound via WebSocket
```

## 2. AI response

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant L as LLMClient
    participant G as Retriever
    participant P as Policy
    participant S as ConversationService
    participant A as Adapter
    O->>O: load summary and snapshot
    O->>L: intent and entities
    L-->>O: faq, product_name
    O->>G: search
    G-->>O: chunks
    O->>L: plan
    L-->>O: final reply and confidence
    O->>P: decide
    P-->>O: respond
    O->>S: append outbound message
    S->>A: send
    A-->>O: provider id
```

## 3. AI CRM tool execution

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant L as LLMClient
    participant E as ToolExecutor
    participant S as LeadService
    participant DB as PostgreSQL
    O->>L: plan
    L-->>O: tool create_lead
    O->>E: execute
    E->>E: validate schema and inject customer_id
    E->>E: check idempotency key
    E->>S: create
    S->>DB: insert lead and journey event
    S-->>E: lead_id
    E->>S: re-read lead
    E->>DB: insert ai_actions success
    E-->>O: tool result
    O->>L: plan with result
    L-->>O: final reply quoting lead
```

## 4. Lead creation

```mermaid
sequenceDiagram
    participant C as Customer
    participant O as Orchestrator
    participant E as ToolExecutor
    participant L as LeadService
    participant N as NotificationService
    C->>O: I want the Premium package
    O->>E: create_lead
    E->>L: create
    alt open lead for product exists
        L-->>E: existing id, created false
    else new interest
        L-->>E: new id, status new
        L->>N: new_lead to supervisors
    end
    E-->>O: result
    O->>C: Confirms interest, does not claim a sale
```

## 5. Follow-up creation

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant E as ToolExecutor
    participant F as FollowUpService
    O->>E: create_followup scheduled_at, channel, reason
    E->>F: create
    alt time invalid or daily cap
        F-->>E: FOLLOWUP_REJECTED
        E-->>O: error result
        O->>O: reply must not claim a booking
    else accepted
        F-->>E: followup_id
        E-->>O: success
        O->>O: reply uses returned timestamp
    end
```

## 6. Human escalation

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant P as Policy
    participant Es as EscalationService
    participant N as NotificationService
    participant C as Customer
    O->>P: billing_requires_human
    P-->>O: escalate
    O->>Es: open
    Es->>Es: ai_enabled false, status pending_human
    Es->>N: ai_escalation
    Es-->>O: escalation_id
    O->>C: A staff member will continue this conversation
```

## 7. Human takeover

```mermaid
sequenceDiagram
    participant Staff as Staff agent
    participant API as API
    participant Es as EscalationService
    participant V as ConversationService
    participant C as Customer
    Staff->>API: POST escalations id takeover
    API->>Es: take_over
    Es->>V: lock_for_staff
    V-->>Staff: ai_enabled false
    C->>API: another inbound message
    API->>V: append only
    Note over API: orchestrator not called
    Staff->>API: POST messages
    API->>C: staff reply
    Staff->>API: POST resolve
```

## 8. Knowledge-base retrieval

```mermaid
sequenceDiagram
    participant Sup as Supervisor
    participant K as KnowledgeService
    participant Emb as LLMClient embed
    participant DB as pgvector
    participant O as Orchestrator
    participant R as Retriever
    Sup->>K: publish document
    K->>K: chunk body
    K->>Emb: embed chunks
    Emb-->>K: vectors
    K->>DB: replace chunks, set published
    O->>R: search customer question
    R->>Emb: embed query
    R->>DB: cosine top candidates
    R-->>O: chunks with similarity at least 0.75
```

## 9. Cross-channel customer identification

```mermaid
sequenceDiagram
    participant C as Customer
    participant Web as Website adapter
    participant Mail as Email adapter
    participant I as IdentityService
    participant O as Orchestrator
    C->>Web: My email is amina@example.com
    Web->>I: bind website session
    I->>I: store primary_email
    C->>Mail: New mail from amina@example.com
    Mail->>I: resolve email identity
    I->>I: same customer, new contact
    I-->>Mail: customer_id and channel_switch
    Mail->>O: turn sees existing open lead
```

If the email match is only textual and not yet verified, `I` marks `is_verified=false` and the executor denies `create_lead`.

## 10. Failed AI action

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant L as LLMClient
    participant E as ToolExecutor
    participant Es as EscalationService
    participant C as Customer
    O->>L: plan
    L-->>O: update_lead status converted
    O->>E: execute
    E-->>O: TOOL_DENIED policy_approval
    O->>L: plan again with denial
    L-->>O: final text I have converted your sale
    O->>O: claim check fails
    O->>Es: escalate ungrounded_claim
    O->>C: handoff sentence only
    Note over O: no lead status change
```
