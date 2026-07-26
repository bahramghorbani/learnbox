# Security baseline

Secrets live only in approved secret stores or local ignored `.env` files. Authentication uses short-lived OTPs, rate limits, abuse monitoring, secure refresh-token rotation, and device/session management. Sensitive admin actions require audit logs. Production access, payment, legal acceptance, and user-data deletion require explicit owner approval.
