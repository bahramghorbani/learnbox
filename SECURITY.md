# Security baseline

Secrets live only in approved secret stores or local ignored `.env` files. Authentication uses short-lived OTPs, rate limits, abuse monitoring, secure refresh-token rotation, and device/session management. Sensitive admin actions require audit logs. Production access, payment, legal acceptance, and user-data deletion require explicit owner approval.

The web and admin shells send baseline browser security headers, including a restrictive content-security policy, frame denial, MIME sniffing protection, referrer control and disabled unused device permissions. The API sends equivalent transport-safe headers and enables HSTS only in production. These controls are defense in depth; real authentication, rate limiting and provider verification remain required before protected endpoints are exposed.
