# IOU (Lend & Borrow)

## What it is
The IOU module tracks informal money that flows between you and friends or family — money you have lent to someone, or money you have borrowed from someone. It gives you a clear picture of who owes you what, what you owe others, and flags amounts that have been outstanding for a long time.

## User-facing capabilities
- Log money you lent to someone: name of the person, amount, date, a description of what it was for, and an optional due date
- Log money you borrowed from someone: same details, from the other direction
- See separate views for "Lent" (people who owe you) and "Borrowed" (people you owe)
- See the net position at a glance: total amount lent vs total amount borrowed
- Mark any IOU as settled when the money is returned
- Get ageing alerts that highlight IOUs outstanding for more than 30, 60, or 90 days — so long-forgotten debts do not slip through
- Filter by status (outstanding vs settled) and sort by amount or date

## How it works
IOU records are stored in the encrypted `personal_ious` Dexie store. Each record contains: personName, direction ('lent' or 'borrowed'), amount, date, dueDate, description, and isSettled.

Person names are Category 1 PII — they are encrypted at rest and are **never sent to Chip AI**. When the AI needs context about IOUs, person names are replaced with ordinal labels ("Person 1", "Person 2") that are assigned fresh each session and are not consistent across sessions. This means Chip can reason about the amounts and timing without ever learning the identity of the people involved.

Ageing is calculated at read time by comparing each outstanding IOU's date against today and bucketing into 30/60/90-day bands.

Key files:
- `src/features/iou/IouPage.tsx` — lent/borrowed tabs, net position, ageing alerts
- `src/features/iou/IouForm.tsx` — add/edit IOU form

## Current limitations
- No split tracking — if you paid for a group dinner and are tracking what multiple people owe you, each person needs a separate IOU entry
- No partial settlement — an IOU is either fully outstanding or fully settled; there is no way to mark a partial repayment
- Person names are not linked to contacts or group members — they are free-text only
- No push notification or reminder for due dates

## Planned improvements
- Phase 1.5: Link IOUs to household group members — when a person named in an IOU is also a member of your household group, Penny can link them by @username so settlements can be coordinated within the app
- Phase 1.5: Group IOU settlement flow — for group trips or shared expenses, settle up with multiple people in a single flow

## Ideas welcome
- Should partial settlements be supported (e.g. "they paid back ₹2,000 of the ₹5,000 they owe")?
- Would a group-split calculator (like Splitwise) be a useful addition to this module?
- Should Penny send a reminder notification when a due date is approaching?
