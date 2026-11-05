# Frontend Architecture

**Status:** Implemented in `frontend/` against a mock API (see `frontend/README.md`). Pages live in `src/features/<area>/` instead of one `pages/` folder so four people can own separate folders. Multi-company workspaces: [ADR-010](../adr/ADR-010-multi-tenancy.md).  
**Stack:** React 18, TypeScript, Vite, React Router, TanStack Query.  
**UI kit:** implement with a small set of components. Do not adopt a design system that the team must fight. Plain CSS modules are enough.

The web application is the staff console plus a separate chat widget bundle.

## 1. Application structure

```text
frontend/src/
  main.tsx
  app/router.tsx
  app/layout.tsx
  auth/AuthProvider.tsx
  auth/RequireAuth.tsx
  api/client.ts
  api/types.ts
  pages/
    LoginPage.tsx
    DashboardPage.tsx
    CustomersPage.tsx
    CustomerProfilePage.tsx
    LeadsPage.tsx
    InboxPage.tsx
    ConversationPage.tsx
    FollowUpsPage.tsx
    TasksPage.tsx
    EscalationsPage.tsx
    KnowledgePage.tsx
    AnalyticsPage.tsx
    UsersPage.tsx
  components/
    Timeline.tsx
    MessageThread.tsx
    LeadForm.tsx
    NotificationBell.tsx
  widget/
    WidgetApp.tsx
```

`api/types.ts` mirrors the JSON in the API specification. If the API changes, this file changes in the same phase.

## 2. Pages

| Route | Who | Purpose |
| --- | --- | --- |
| `/login` | public | Email and password |
| `/` | all staff | Dashboard numbers and my follow-ups due today |
| `/customers` | `customer.read` | Search |
| `/customers/:id` | `customer.read` | Profile, contacts, leads, timeline |
| `/leads` | `lead.read` | Filterable list, create, status change |
| `/inbox` | `conversation.read` | Open conversations |
| `/conversations/:id` | `conversation.read` | Thread, AI state, takeover, reply |
| `/followups` | `followup.read` | Due and upcoming |
| `/tasks` | `task.read` | My tasks |
| `/escalations` | `escalation.read` | Queue and detail |
| `/knowledge` | `knowledge.read` | Draft and publish. Hidden without `knowledge.write` for edit controls |
| `/analytics` | `analytics.read` | Dashboard |
| `/users` | `user.manage` | Create staff, deactivate, change role |
| `/widget` | widget key in the page | Public chat. Built as `widget.html` |

No marketing site, no customer self-service portal, no settings labyrinth.

## 3. Components

- **Layout:** nav filtered by permissions, notification bell, logout.
- **MessageThread:** bubbles for customer, AI, and staff. System messages for escalation are visually distinct.
- **Timeline:** journey events from the timeline endpoint.
- **LeadForm:** create and status update.
- **TakeoverBar:** shows whether AI is on, who holds the lock, and the buttons for takeover, reply, and release.

## 4. State management

- TanStack Query caches GET requests and invalidates on mutation success.
- `AuthProvider` holds the access token in memory and the refresh token in `sessionStorage`. Closing the tab drops the refresh token. This is a prototype tradeoff documented in the security design: it is simpler than cookies for the mobile client, which uses the same token pair in secure storage.
- Conversation events from the WebSocket update the query cache for that thread and the inbox list.

Do not duplicate the customer list in a second store.

## 5. API communication

`api/client.ts` attaches the bearer token, refreshes once on `AUTH_EXPIRED`, and throws a typed `ApiError` with `code` and `message`. Pages show `message`. They do not parse HTML.

Widget calls use `X-Widget-Key` from a build-time public variable `VITE_WIDGET_KEY`. That key is not a staff secret. It only identifies the widget and is rate limited. Do not reuse the staff JWT secret as the widget key.

## 6. Authentication and role-based UI

`RequireAuth` redirects to `/login`. Buttons call `has(permission)` which reads `GET /auth/me`. Hiding a button is not the control. The API still returns 403. The UI hides:

- User admin without `user.manage`
- Publish without `knowledge.publish`
- Lead delete without `lead.delete`
- Assign escalation without `escalation.assign`
- Organization-wide analytics labels when the payload is the agent-scoped variant (the API simply returns smaller numbers; the page title says "My activity" when `user.role === "agent"`)

## 7. Real-time updates

After login the layout opens `/api/v1/ws/inbox`. On `message.created` it invalidates the conversation messages query if that page is open, and the inbox query always. On `notification.created` it increments the bell.

Reconnect with backoff up to 15 seconds. On failure, the inbox still works by polling every 20 seconds.

## 8. Notifications

`NotificationBell` lists the last 20 items and marks one read when opened. Click navigates by `entity_type`.

## 9. Customer profile

Header: name, status, email, phone, preferred channel.  
Tabs: Timeline, Conversations, Leads, Follow-ups.  
Edit form for staff fields. Notes textarea is the staff notes field, labeled **Internal notes**.

## 10. Conversation UI

Left: inbox filters (open, pending human, mine).  
Right: thread, composer disabled when locked by someone else, side panel with intent of the latest `ai_actions` row if the team adds `GET /api/v1/conversations/{id}/ai-actions`.

That read endpoint is part of this UI contract even though the main API list focused on writes:

### GET /api/v1/conversations/{id}/ai-actions

- **Authz:** `conversation.read` and scope
- **Response:** list of `{ intent, tool_name, tool_status, confidence_final, decision, escalation_reason, created_at }`
- **No** tool_input bodies in the UI list, so staff are not shown raw model arguments by default

This endpoint is required for the conversation page. Implement it with the conversation routes.

## 11. Lead management

Table with status filter and a status dropdown that calls PATCH. Creating a lead from the customer profile pre-fills `customer_id`.

## 12. Customer journey

The Timeline component is the journey UI. It does not use a separate page.

## 13. Analytics dashboard

Four summary numbers, channel counts, tool status table. Date inputs set `from` and `to`. Agent role shows the heading "My activity."

## 14. AI assistant interface

There is no general "chat with the CRM" box for staff in the MVP. The AI speaks in the customer thread. Staff see its decision metadata in the side panel. A free-form staff copilot would be a second product and is out of scope.

The side panel is the AI interface: last intent, tools used, confidence, and whether the turn escalated.

## 15. Human escalation interface

`/escalations` lists priority, age, SLA due, customer name, reason code. Opening a row shows the conversation and a Take over button. Resolve is a notes form enabled when the current user holds the lock.

## 16. Widget

A single column of messages and a text box. It shows "AI" or "Staff" on outbound messages. It does not show confidence or tools. If the socket drops, it refetches messages.

## 17. Accessibility

Form fields have labels. Status is not color alone; the status word is printed. Focus states are visible. Targets are in [NFR.md](../requirements/NFR.md).
