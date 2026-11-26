# Shared fixtures: day status, streaks, summary

One source of truth for the business rules BR-01, BR-02, BR-03, BR-04 and BR-13
(`docs/01-design-spec.md` §7). The same JSON files drive two test suites:

- `supabase/tests/0007_summary.test.ts` (SQL: `v_day_status`, `get_student_summary`), through the
  loader `supabase/tests/fixtures.ts`;
- the `@awrad/domain` TypeScript tests (Task 1.8: `dayStatus`, `streaks`).

Change an expectation here only together with the rule in the spec. Dates are `YYYY-MM-DD`
strings; there is no time of day anywhere in these files.

## Habits used

Entries refer to the seeded daily habits by `slug` (`supabase/seed.sql`), never by name:

| slug                | kind      | notes                              |
| ------------------- | --------- | ---------------------------------- |
| `quran_wird`        | tristate  |                                    |
| `adhkar`            | checklist | 13 active items (all equal weight) |
| `qiyam`             | tristate  |                                    |
| `tafsir_ibn_juzayy` | tristate  |                                    |
| `sahihayn`          | tristate  |                                    |

Every daily entry list names all five habits (save_log rejects a log missing an active habit).

## Entry shape (`day-status.json`, `summary.json`)

```jsonc
{ "slug": "quran_wird", "status": "done" }        // tristate: "done" | "not_done" | "not_required"
{ "slug": "adhkar", "checkedCount": 10 }          // checklist: the first N active items (by sort_order) are checked
{ "slug": "adhkar", "status": "not_required" }    // checklist excluded from the day (no items)
```

A checklist entry has exactly one of `checkedCount` (0..active items) or `status: "not_required"`.
Its weight is 1 and its achievement is `checkedCount / activeItems` (BR-02); `0` is `not_done`.

## `day-status.json` — one daily log, its state and completion

```jsonc
[
  {
    "name": "2: checklist 10/13, rest done, threshold 100",
    "date": "2026-11-26", // the log date (also used as "today" when loading)
    "thresholdPct": 100, // app setting streak_threshold_pct for this case
    "entries": [/* entry shape */],
    "expect": {
      "state": "failed", // "achieved" | "failed" | "neutral"
      "completionPct": 95, // integer, round(Σachieved / Σrequired × 100); null when neutral
    },
  },
]
```

State: Σrequired = 0 ⇒ `neutral`; else `achieved` if completionPct ≥ thresholdPct, otherwise
`failed`. (`missing` = no log; it never appears in this file.)

## `streaks.json` — a calendar of day states and the two streaks

```jsonc
[
  {
    "name": "A: …",
    "today": "2026-11-26", // the student's local today
    "joinedAt": "2026-11-01", // profiles.joined_at; days before it are ignored
    "days": [{ "date": "2026-11-18", "state": "achieved" }], // "achieved" | "failed" | "neutral"
    "expect": { "longest": 5, "current": 3 },
  },
]
```

Days not listed are `missing`. Rules (BR-04): over the calendar days `[joinedAt, today]`, a run is
a maximal sequence of consecutive days whose state is `achieved` or `neutral`; its length is the
number of `achieved` days in it. `longest` = the longest run (0 if none). `current` = the run
containing today if today is `achieved`/`neutral`, else the run containing yesterday if yesterday
is `achieved`/`neutral`, else 0.

The SQL loader materializes each state as a real daily log:
`achieved` = all five habits done (adhkar 13/13); `failed` = the same but `quran_wird` not_done
(4/5 = 80%); `neutral` = all five `not_required`. Pure TypeScript tests use the states directly.

## `summary.json` — `get_student_summary` over a few logged days

```jsonc
[
  {
    "name": "two-days",
    "today": "2026-11-26",
    "joinedAt": "2026-11-01",
    "days": [{ "date": "2026-11-25", "entries": [/* entry shape */] }],
    "attendance": ["present", "present", "absent", "excused"],
    "expect": {
      "daysLogged": 2, // number of daily logs
      "completionPct": 89, // round(ΣΣachieved / ΣΣrequired × 100) over all logged days; null if 0
      "attendancePct": 67, // round(present / (present + absent) × 100); excused excluded; null if 0
      "longestStreak": 1, // optional
      "currentStreak": 1, // optional
    },
  },
]
```

`attendance[i]` is the student's status at a session dated `today - i` days (all must be on or
after `joinedAt`). The threshold is the default 100 unless a case says `thresholdPct`.
