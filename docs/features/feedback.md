# Contact / Feedback

## What it is

A fully on-device way to reach the team — no form submission, no backend. A short screen
with a feedback-type selector (Bug · Suggestion · Question) and an optional message, which
builds a `mailto:` deep-link opening the user's own mail app:

```
mailto:<support>?subject=<type> — Penny&body=<message>%0A%0A---%0AApp v<version>
```

Plus an optional "Report on GitHub" link-out. App version is pulled from the build config
(no PII).

## Privacy

Never auto-attaches financial data, identifiers, or logs. The email body is only what the
user typed plus the app version — the user's own mail client is the sender, Penny never
transmits anything itself.

## Placement

A row in the Settings drawer, near "Security & Data".

## Mobile (`apps/mobile`)

Ported (`features/feedback/FeedbackPage.tsx`) — same `mailto:` deep-link approach, since
`Linking.openURL('mailto:...')` is RN's direct equivalent to a web `<a href="mailto:">`.

## Files

- `apps/web-react/src/features/feedback/FeedbackPage.tsx` /
  `apps/mobile/src/features/feedback/FeedbackPage.tsx`
