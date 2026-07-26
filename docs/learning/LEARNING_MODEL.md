# Learning model

Prioritize active recall and adaptive spaced repetition over exposure. A daily session mixes due review, relearning, appropriate new words, and later skill variants while avoiding guilt and backlog overload.

## Recovery Mode

After a gap, LearnBox offers exactly 5, 10 or 15 minutes rather than the whole backlog. The engine selects only due, active cards and ranks them by overdue time, lapse history, memory fragility and declared content importance. It introduces no new cards during recovery, never includes suspended or archived material, and keeps the session bounded. The learner-facing message frames return as success, not debt.

The policy is deterministic and covered by unit tests; later tuning requires synthetic replay, user research and a feature-flagged rollout.
