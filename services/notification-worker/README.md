# Notification worker

Delivers opt-in, rate-limited, respectful reminders with provider abstraction and auditability.

The executable policy is deliberately conservative: it requires opt-in, respects per-category settings and quiet hours, caps daily messages, and suppresses learning reminders after three unopened attempts. It does not request a device permission, persist a device token, or call a delivery provider.
