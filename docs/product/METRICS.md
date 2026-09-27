# Metrics

Track onboarding completion, first review completion, D1/D7/D30 retention, meaningful weekly
sessions, review accuracy/backlog, stabilized words, personal words, notification opt-in, crashes,
and conversion. Do not log phone numbers or free text in analytics.

## Start and Plus event contract

| Event                                             | When emitted               | Minimum safe properties            |
| ------------------------------------------------- | -------------------------- | ---------------------------------- |
| `free_pack_started`                               | learner begins a free pack | `pack_id`, `content_version`       |
| `first_session_completed`                         | first completed session    | `session_length_bucket`            |
| `learned_word_count_25` / `_50` / `_100`          | threshold first reached    | `pack_id`                          |
| `paywall_eligible`                                | remote rule first passes   | `rule_version`, `signal`           |
| `paywall_viewed` / `paywall_dismissed`            | offer shown or closed      | `offer_version`, `placement`       |
| `subscription_started` / `_completed` / `_failed` | provider flow state        | `tier_id`, `period_id`, `provider` |
| `free_content_completed`                          | pack completed             | `pack_id`, `content_version`       |
| `personal_word_limit_reached`                     | configured limit reached   | `limit_version`                    |

Use stable IDs, coarse buckets and configuration versions. Never record payment instruments,
phone numbers, raw free text, generated prompts or a learner's personal vocabulary in analytics.
