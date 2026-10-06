# ADR-007 Authentication Strategy

## Context

Staff need accounts and roles. The widget needs a narrower door. The mobile app needs the same API. The team should not operate an identity provider.

## Decision

Email and password with bcrypt. Access JWT of 15 minutes. Refresh token of 7 days, stored hashed, rotated, family revocation on reuse. RBAC permissions in the database, loaded every request. The widget uses `X-Widget-Key` plus a visitor session id, not a staff token. Webhooks use HMAC. The AI has no user account.

## Alternatives

- **University SSO.** Attractive if the course already mandates it. Not assumed, because no identity platform was specified. A later adapter can sit in front of login without changing CRM permissions.
- **Session cookies only.** Good for the web app. Rejected as the only mechanism because the mobile client and the widget are simpler with a bearer token and a widget key.
- **API keys per staff user.** Rejected. No expiry and no rotation story.

## Rationale

The design is implementable with common libraries and matches both clients. Permission rows can change without rewriting JWTs. Keeping the AI off the user table prevents a prompt from "logging in" as staff.

## Consequences

- `sessionStorage` on the web is a prototype compromise documented in the security design.
- Password reset by email is out of the MVP. Admins set passwords.
- In-memory rate limits are per process.
