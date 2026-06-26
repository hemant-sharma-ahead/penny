# Goals

## What it is
The goals module lets you set financial targets and track progress toward them over time. Whether you are saving for an emergency fund, a home down payment, a vacation, or retirement, each goal gets its own progress tracker, SIP calculator, and contribution history — plus Chip's projection of when you will get there.

## User-facing capabilities
- Create a financial goal with a name, target amount, target date, icon, and colour
- See a visual progress ring showing what percentage of your goal you have achieved
- Calculate the monthly SIP (systematic investment plan) amount needed to reach your goal — enter the target amount, number of years, and expected annual return percentage
- Log contributions manually to update your progress
- View a full history of every contribution toward each goal
- Get a Chip insight on each goal: "At your current savings rate, you will reach this goal in X months"
- Track multiple goals simultaneously with a summary view

Goal types are not enforced — you can name them anything. Common examples include: Emergency fund, Home purchase down payment, Vacation, Child's education, Wedding, Car purchase, Retirement corpus.

## How it works
Goals are stored in the encrypted `goals` Dexie store. Each goal record tracks: name, targetAmount, currentAmount, targetDate, sipAmount, sipFrequency, and expectedReturn (used for the SIP calculation).

Contributions are stored separately in the encrypted `goal_contributions` store, linked to a goal by ID. The `currentAmount` on the goal record is updated each time a contribution is logged.

The SIP calculator uses the standard future value of a series formula: it works backwards from the target corpus to calculate the required monthly investment given the expected return rate and time horizon. The calculation happens entirely on-device.

Chip's projection insight reads the average monthly contribution rate from the contribution history and extrapolates linearly to estimate when the goal will be reached, flagging if the current pace falls short of the target date.

Key files:
- `src/features/goals/GoalsPage.tsx` — thin shell: header summary + tab strip → GoalsTab | SipCalculatorTab
- `src/features/goals/GoalsTab.tsx` — goals list + FAB + GoalForm; `GoalCard.tsx` owns its own contribution row
- `src/features/goals/SipCalculatorTab.tsx` + `useSipCalculator.ts` — standalone SIP calculator
- `src/features/goals/GoalForm.tsx` — create/edit goal form
- `src/core/goals/sipCalculator.ts` — SIP math; `meta.ts` — risk colour/return metadata

## Current limitations
- Contributions must be logged manually — there is no way to automatically link an expense or bank transaction as a goal contribution
- No goal categories or grouping (e.g. "short-term" vs "long-term")
- The SIP calculator assumes a constant return rate; it does not model volatility or step-up SIP scenarios
- No milestone tracking within a goal (e.g. celebrate hitting 25%, 50%, 75%)

## Planned improvements
- Phase 1.5: Joint goals — share a goal with household group members, with each person's contributions tracked separately
- Phase 2: Automatic contribution detection — tag an expense or income transaction as a contribution to a specific goal
- Phase 2: Goal milestone celebrations — visual rewards when you hit 25%, 50%, 75%, and 100%
- Phase 2: Step-up SIP modelling — plan for increasing your monthly contribution by a percentage each year

## Ideas welcome
- Should goals support sub-goals or milestones within a single goal?
- Would a goal-to-investment account linking be useful (e.g. "this goal is funded by my ELSS fund")?
- What goal types or templates would make setup faster?
