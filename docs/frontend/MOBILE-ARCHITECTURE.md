# Mobile Architecture

**Status:** Proposed staff application. No mobile code exists.  
**Stack:** React Native with Expo, TypeScript, React Navigation, TanStack Query.  
**Users:** staff agents and supervisors. Customers do not get this app. They use website chat.

Expo is recommended because the web app is also TypeScript and the team can share DTO types by copying `api/types.ts`. A second native language would cost more than it returns on a four-person project.

## 1. Why mobile exists

The proposal requires a mobile application. The useful slice for staff away from a desk is: see the queue, read the customer, reply, complete a follow-up, accept an escalation. Administration of users and the knowledge base stays on the web.

## 2. Screens

| Screen | Function |
| --- | --- |
| Login | Email, password, token pair stored in Expo SecureStore |
| Home | Unread notifications, follow-ups due today, open escalation count |
| Search | `GET /customers?q=` |
| Customer | Profile header, timeline, open leads |
| Inbox | Conversations, same scope rules as web |
| Conversation | Thread, reply, takeover |
| Leads | List and status update |
| Follow-ups | List, complete, cancel |
| Escalations | Queue, takeover, resolve |
| Notifications | Full list |

Navigation: a tab bar with Home, Inbox, Search, Alerts. Leads and follow-ups are reached from Home.

## 3. Web-only features

| Feature | Why it stays on the web |
| --- | --- |
| User management | Rare, higher risk, easier to mis-tap on a phone |
| Knowledge draft and publish | Long text and a publish action that changes what the AI can say |
| Analytics staff table | Dense table. Mobile home shows four numbers only: my open escalations, follow-ups due, unread alerts, leads assigned to me |
| Channel simulator | A development tool |
| Lead delete | Easy to misuse. Status changes are enough on mobile |

If a supervisor publishes an article, they use the browser.

## 4. API and auth

The same `/api/v1` routes. No mobile-specific backend.

- Access token in memory.
- Refresh token in SecureStore.
- On 401 `AUTH_EXPIRED`, refresh once.
- WebSocket when the app is in the foreground. When backgrounded, the MVP does not use push. Opening the app refetches notifications. Push is a future enhancement and needs a provider the project does not yet have.

## 5. Role-based UI

Same permission list from `/auth/me`. Hide assign controls without `escalation.assign`. The API remains the authority.

## 6. Offline

Not supported. If the network fails, screens show the error message from the last request and a retry button. Do not queue CRM writes on the device. A queued lead create that fires twice is worse than a failed request the user can see.

## 7. Conversation behavior

Takeover and reply match the web rules, including 409 when locked. The composer explains "Locked by <name>" using `locked_by_user_id` resolved from a user display name if the conversation payload includes `locked_by_name`.

Add `locked_by_name` and `assigned_user_name` to the conversation JSON in the API implementation so mobile does not need a user directory. They are display fields, null when unset.

## 8. Build

One Expo project under `mobile/`. Android is the demonstration target. iOS is the same codebase if a Mac is available, not a second design. Distribution for the course can be an Expo development build or a web export of the same screens. A store listing is out of scope.

## 9. Phase

Mobile starts after the staff web inbox works against the real API. Building it against mock data in parallel is allowed for layout, but acceptance is against `POST /auth/login` and the conversation routes.
