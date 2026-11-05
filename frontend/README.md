# CRMAI frontend

Staff console + public chat widget for CRMAI. **React 18 + TypeScript + Vite**, React Router, TanStack Query,
plain CSS (design tokens in `src/styles/global.css`, taken from the UI mockups). Charts are hand-written SVG; icons are `lucide-react`.

Pages follow `docs/frontend/FRONTEND-ARCHITECTURE.md`. The visual design follows the mockups
(`CRMAI-UI-Mockups.zip`), adapted from a real-estate sales CRM to the AI customer-service CRM described in the docs.

## Run it

```bash
cd frontend
npm install
cp .env.example .env       # VITE_USE_MOCK=true by default
npm run dev                # http://localhost:5173
```

- Staff console: <http://localhost:5173> — demo logins (password `password123`, each one is in both demo companies):

  | Email | Role |
  | --- | --- |
  | `admin@crmai.example` | Admin (team & roles only) |
  | `marketing.manager@crmai.example` | Marketing manager |
  | `marketing.exec@crmai.example` (also `jesse@crmai.example`) | Marketing executive |
  | `sales.manager@crmai.example` | Sales manager |
  | `sales.exec@crmai.example` (also `ishara@crmai.example`) | Sales executive |
- Customer chat widget: <http://localhost:5173/widget.html?key=wk_northline_demo>
  (or `wk_northstar_demo`). It has buttons for the demo scenarios from `docs/ai/DEMO-SCENARIOS.md`.

`npm run build` type-checks and builds both entry points to `dist/`.

### Mock API vs real backend

With `VITE_USE_MOCK=true` the app runs fully in the browser against `src/api/mock/` — an in-memory
implementation of `docs/api/API-SPECIFICATION.md`, saved in `localStorage` so the widget tab and the
staff tab share data. `src/api/mock/agent.ts` is a **scripted stand-in** for the AI orchestrator
(keyword rules for scenarios 1–5, 8, 9) so the demo works without an LLM. It is not the real agent.

When the FastAPI backend is up, set `VITE_USE_MOCK=false`. Vite proxies `/api` to the Kong gateway on `http://localhost:8080`.
No page code changes: pages only call hooks in `src/api/queries.ts`.

To reset demo data: in the browser console, run `localStorage.removeItem('crmai.mockdb')` and reload.

## Multi-company (SaaS) mode

One deployment serves many companies ("workspaces"):

- Every business record has `organization_id`. Every staff request sends **`X-Organization-Id`**.
- A user can belong to several workspaces, with a **different role in each** (`Me.memberships`).
- Workspace switcher in the sidebar; "Create a workspace" from the switcher or `/signup`.
- `/settings` (admin only, `org.manage`): company profile, channels, per-company **widget key** and embed snippet.
- The widget picks the company from its key (`widget.html?key=...`).
- Query cache keys start with the org id, so switching never shows another company's data.

Backend work this needs is listed in `docs/adr/ADR-010-multi-tenancy.md`.

## Structure

```text
src/
  main.tsx                 app entry
  app/router.tsx           routes + permission gates
  app/Layout.tsx           sidebar, workspace switcher, notification bell
  auth/                    AuthProvider (tokens, current workspace, role), RequireAuth, permission matrix
  api/
    types.ts               mirrors the API spec — change it in the same PR as the API
    client.ts              fetch wrapper: bearer token, refresh once, X-Organization-Id, ApiError
    queries.ts             TanStack Query hooks (one place for cache keys + invalidation)
    mock/                  in-browser backend + scripted agent + seed data (2 companies)
  components/              shared UI kit, charts, Timeline, MessageThread, NotificationBell, WorkspaceSwitcher
  features/<area>/         one folder per page area (see ownership below)
  widget/                  public chat widget (built as widget.html)
  lib/format.ts            dates, money, status colours, labels
```

## Roles and lead flow

```
New lead (AI chat / website / staff)
  → Marketing manager assigns it to one of their marketing executives, with a "call by" time   /assign
  → Marketing executive calls, marks it HOT / WARM / COLD                                       /calls
  → hot or warm (interested) lead is handed over to sales
  → Sales manager assigns a site visit: sales executive + date/time + site address             /assign
  → Sales executive: on the way → arrived → visit report                                       /visits
       booked → won · negotiating → deal won / lost · interested → back to the manager for another visit
       · not interested → lost · customer didn't come / new time asked → manager is notified
```

| Role | Menu | What they do |
| --- | --- | --- |
| **Admin** | Team & roles, Workspace settings | Only people: add staff, give the role, set which manager each executive reports to, deactivate. Cannot see leads, calls or visits. |
| **Marketing manager** | Overview, Assign leads, Team calls, Team performance, Customer messages, Escalations, Customers, Pipeline, AI knowledge | Assigns leads (with a call-by deadline) to their own executives, checks every call result and note, sees who is behind (not called in 24 h, overdue callbacks, low answer rate), reads and answers customer messages. |
| **Marketing executive** | Overview, My calls, My leads, Customers | Calls assigned leads, sets hot / warm / cold, books callbacks, hands interested leads to sales. |
| **Sales manager** | Overview, Assign visits, Team visits, Team performance, Pipeline, Customers | Assigns visits for interested leads (with a clash warning if the executive already has a visit within 90 min), sees every executive's day, late reports and reschedule requests, reschedules / reassigns / cancels, checks reports and win rates. |
| **Sales executive** | Overview, My visits, My deals, Customers | Today's agenda with time, customer phone (tap to call), address (opens Google Maps), marketing's call notes and the manager's note. Updates status, writes the visit report (outcome, interest level, what the customer said, next step, follow-up date), marks no-show or asks for a new time, closes negotiating deals. |

Managers only see and assign executives who report to them (set by the admin). Permissions live in
`src/auth/permissions.ts`; the mock API in `src/api/mock/server.ts` enforces the same rules, so it is the reference for the backend.

API routes the backend needs for this: `POST /leads/assign` (`call_by`), `GET /team/workload`, `GET /team/performance`,
`GET /calls`, `GET|POST /leads/:id/calls`, `GET /visits`, `POST /visits` (manager assigns), `PATCH /visits/:id` (reschedule / reassign),
`POST /visits/:id/start`, `/checkin`, `/complete` (the report), `/reschedule-request`, `/cancel` (`no_show`), `GET /leads/:id/visits`.
`User` has `manager_id`; `SiteVisit` has the status flow `scheduled → on_the_way → checked_in → completed | no_show | cancelled`
plus the report fields (see `src/api/types.ts`).

## Pages

| Route | Page | Mockup it follows |
| --- | --- | --- |
| `/login`, `/signup` | Sign in, create company workspace | — |
| `/` | Overview: "Your work" tiles for your role, headline numbers, trend, leads by stage, escalations + follow-ups due | 01 Overview |
| `/assign` | Marketing manager: assign leads + call-by time. Sales manager: assign site visits (exec, time, site) | — |
| `/calls` | Marketing: call list (callbacks due, not called, hot / warm / cold), log a call, hand over | — |
| `/visits` | Sales exec: today's agenda, status, visit report. Sales manager: team's day, late reports, reschedule | — |
| `/performance` | Managers: per-executive numbers, needs-attention list, latest call notes / visit reports | 06 Reports |
| `/inbox/:id?` | Inbox, thread, take over / release AI, escalate, AI decisions panel | — (docs §10) |
| `/escalations` | Queue by priority + SLA, assign, take over, resolve with notes | — (docs §15) |
| `/leads` | Pipeline board (drag to change stage) / list, with temperature and both owners | 02 Pipeline |
| `/leads/:id` | Lead detail: team on the lead, calls, site visits, timeline, follow-ups | 07 Deal details |
| `/customers` | Customer table + side drawer | 03 Contacts |
| `/customers/:id` | Profile: tabs Timeline / Conversations / Leads / Follow-ups, internal notes | — (docs §9) |
| `/followups`, `/tasks` | Grouped list (Overdue/Today/Upcoming/Completed) + detail | 04 Tasks |
| `/knowledge` | AI knowledge docs: draft → publish → retrieved; retrieval tester | 05 Automations |
| `/analytics` | Reports: numbers, trend, channels, AI tool outcomes, staff table | 06 Reports |
| `/users`, `/settings` | Team admin, workspace settings | — |

The mockups' **Automations** screen became **AI knowledge**, because the docs don't include a workflow builder.
The pipeline columns are the lead statuses from the database design.

## Suggested split for 4 people

Each person owns whole folders, so merge conflicts stay rare. Shared files (`api/types.ts`, `api/queries.ts`,
`styles/global.css`, `components/ui.tsx`) need a quick heads-up in the group chat before they change.

| Member | Owns | Backend routes to wire up |
| --- | --- | --- |
| 1 — Platform | `app/`, `auth/`, `api/client.ts`, `features/auth`, `features/users` (team + settings), `NotificationBell`, `WorkspaceSwitcher`, WebSocket | auth, users, organizations, notifications, `/ws/inbox` |
| 2 — Conversations | `features/inbox`, `features/escalations`, `widget/`, `MessageThread` | conversations, messages, ai-actions, escalations, widget, `/ws/widget` |
| 3 — CRM & sales flow | `features/customers`, `features/leads`, `features/assign`, `features/calls`, `features/visits`, `Timeline`, `leadBits` | customers, contacts, timeline, leads, assign, calls, visits, workload |
| 4 — Work & insight | `features/followups`, `features/tasks`, `features/knowledge`, `features/analytics`, `features/dashboard`, `charts.tsx` | follow-ups, tasks, knowledge, analytics |

Switch to the real API one area at a time: when your backend routes exist, test your pages with `VITE_USE_MOCK=false`.

## Not done yet

- WebSocket client (`/ws/inbox`, `/ws/widget`) — real-time is currently polling (4s staff, 2.5s widget). The docs allow polling as the fallback.
- Automated tests (Playwright MVP path in `docs/testing/TESTING-STRATEGY.md`).
- Mobile app (`mobile/`, Expo) — separate project.
