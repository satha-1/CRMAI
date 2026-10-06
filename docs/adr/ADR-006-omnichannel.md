# ADR-006 Omnichannel Adapter Pattern

## Context

The proposal lists WhatsApp, Facebook, Instagram, website, email, and voice. The team does not have those provider accounts. The agent and CRM must not be rewritten per channel. Pretending the vendors are already integrated would make the design false.

## Decision

All channels implement `ChannelAdapter` and produce a `CanonicalMessage`. The website widget is the only transport required for the MVP. Email is the next real transport, with SMTP optional. WhatsApp, Facebook, Instagram, and voice adapters normalize payloads and send only when tokens exist. Otherwise send records `skipped_unconfigured` or `ChannelNotConnected`. A development simulator feeds canonical or provider-shaped JSON and marks `metadata.simulated=true`.

## Alternatives

- **Integrate one real WhatsApp number first.** Rejected as the critical path. Business verification and templates can consume the whole project and still leave no CRM agent.
- **Separate message schema per channel inside CRM tables.** Rejected. It pushes provider fields into leads and the planner.
- **A commercial omnichannel vendor.** Rejected. Cost, and the team would not own the pipeline they are graded on.

## Rationale

The academic requirement is the pipeline from any channel into one agent. A real website socket proves the pipeline. Adapters prove the extension point. The simulator lets a marker see a Facebook-shaped payload without a fake claim that Facebook delivered it.

## Consequences

- Demos must say when traffic is simulated.
- Live social channels remain future work with named environment variables.
- Voice is transcript-in, text-out. It is not a phone system.
