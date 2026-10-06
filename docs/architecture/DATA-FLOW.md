# Data Flow

The system has one store, PostgreSQL. Arrows are data movement, not deployment nodes. External providers receive only what that adapter must send.

## Level 0

```mermaid
flowchart LR
    Customer[Customer]
    Staff[Staff]
    P1[CRMAI]
    LLM[LLM provider]
    Mail[Email provider]

    Customer -->|messages| P1
    P1 -->|replies| Customer
    Staff -->|CRM commands| P1
    P1 -->|screens and alerts| Staff
    P1 -->|prompts and tool definitions| LLM
    LLM -->|structured output| P1
    P1 -->|outbound mail when configured| Mail
    Mail -->|inbound webhook| P1
```

WhatsApp, Facebook, Instagram, and voice providers are the same shape as Mail when a token exists. Until then they are not level-0 externals. The simulator is part of P1, enabled only in development.

## Level 1

```mermaid
flowchart TB
    Customer[Customer]
    Staff[Staff]
    LLM[LLM provider]

    CH[1.0 Channel edge]
    ID[2.0 Identity and conversation]
    AI[3.0 AI orchestration]
    CRM[4.0 CRM services]
    KB[5.0 Knowledge]
    ESC[6.0 Escalation]
    AN[7.0 Analytics]

    DS1[(D1 Messages and customers)]
    DS2[(D2 Leads tasks follow-ups)]
    DS3[(D3 Knowledge chunks)]
    DS4[(D4 AI actions and audit)]

    Customer --> CH
    CH --> ID
    ID --> DS1
    ID --> AI
    AI --> LLM
    LLM --> AI
    AI --> KB
    KB --> DS3
    AI --> CRM
    CRM --> DS2
    CRM --> DS1
    AI --> ESC
    ESC --> Staff
    Staff --> CRM
    Staff --> ESC
    CRM --> AN
    DS2 --> AN
    DS4 --> AN
    AI --> DS4
    ESC --> Customer
    AI --> CH
    CH --> Customer
```

## Level 2 — Customer to channel to AI to CRM

```mermaid
flowchart LR
    M[Inbound text] --> N[Canonical message]
    N --> Dup{New external id?}
    Dup -->|no| Drop[Stop]
    Dup -->|yes| Cust[Customer id]
    Cust --> Hist[Transcript and snapshot]
    Hist --> Plan[Planner]
    Plan --> Tool[Named tool]
    Tool --> Rule[Service rules]
    Rule --> Row[Lead follow-up task or profile row]
    Row --> Reply[Outbound text]
```

The planner never receives a connection string. The only data leaving toward the LLM is the prompt built from the snapshot, the recent transcript, and retrieved chunks.

## Level 2 — Customer to channel to human

```mermaid
flowchart LR
    M[Inbound text] --> Store[Message row]
    Store --> Lock{ai_enabled?}
    Lock -->|false| Notify[Notify lock holder]
    Notify --> StaffReply[Staff outbound]
    StaffReply --> Cust[Customer]
    Lock -->|true| Policy[Policy escalate]
    Policy --> Queue[Escalation row]
    Queue --> StaffReply
```

## Level 2 — AI to CRM tools

```mermaid
flowchart LR
    Call[Tool name and arguments] --> Schema[Pydantic validation]
    Schema --> Auth[Allow-list and confidence]
    Auth --> Svc[Customer Lead FollowUp Task or Escalation service]
    Svc --> DB[(Tables)]
    DB --> Reread[Re-read changed row]
    Reread --> Audit[ai_actions]
    Audit --> Planner[Result JSON]
```

Denied and failed branches still write `ai_actions` and return to the planner. They do not write the CRM table.

## Level 2 — Knowledge to RAG to AI

```mermaid
flowchart LR
    Doc[Published body] --> Chunks[Chunks]
    Chunks --> Vec[Embeddings]
    Vec --> DB[(knowledge_chunks)]
    Q[Customer question] --> Qv[Query embedding]
    Qv --> DB
    DB --> Floor[Drop below 0.75]
    Floor --> Prompt[Approved knowledge block]
```

Draft text does not enter this flow.

## Level 2 — CRM to analytics

```mermaid
flowchart LR
    Leads[(leads)] --> Q[Dashboard query]
    Msg[(messages)] --> Q
    Esc[(escalations)] --> Q
    Act[(ai_actions)] --> Q
    Fu[(follow_ups)] --> Q
    Q --> JSON[Aggregate JSON]
    JSON --> UI[Dashboard]
```

The query reads copies of the operational tables. Nothing is written back. Message content is not selected by these queries, only counts and timestamps.
