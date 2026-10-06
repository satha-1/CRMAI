# ADR-003 AI and LLM Strategy

## Context

The agent must classify intent, extract entities, choose tools, and phrase replies. Those steps need a model with structured output or tool calling. The provider must be replaceable because keys, prices, and model names change. The repository had no existing model code.

## Decision

Define an `LLMClient` with structured completion, tool-call completion, and embeddings. The default adapter speaks the OpenAI-compatible HTTP API. The model id and base URL come from environment variables. The orchestrator in application code owns the loop, the round cap, and the policy. A framework does not own the loop.

Recommended starting point for a student budget: a small tool-calling model behind that API (hosted Gemini Flash or a small OpenAI model, whichever the team can key). The architecture does not depend on a specific model brand.

## Alternatives

- **LangChain or LangGraph as the core.** Rejected as the place where control lives. They hide the loop the team must explain and defend. Calling a library helper inside `LLMClient` is acceptable. Burying policy inside an agent class is not.
- **Local open-weight model only.** Rejected as the default. Laptop GPU assumptions are not shared by the whole team, and latency is unknown. A local model may implement `LLMClient` later if someone measures it.
- **Rules and keywords only.** Rejected. The proposal requires an agent that selects tools. Keywords can stay as the short phrase list for "real person," beside the model, not instead of it.
- **Node backend calling Python only for AI.** Rejected. Two services before there is a product.

## Rationale

The academic risk is a demo that cannot explain why a tool ran. A short orchestrator the team wrote is easier to defend than a graph inside a dependency. The compatible HTTP API lets the team switch hosts without rewriting CRM tools.

## Consequences

- Prompt and schema work is the team's job.
- Live tests need a key and are optional in CI.
- Provider outages are a product path: escalate, do not guess.
- Python is the backend language as a result of this decision and ADR-001.
