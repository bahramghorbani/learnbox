# Risk register

| Risk                | Owner      | Mitigation               | Signal                | Contingency           |
| ------------------- | ---------- | ------------------------ | --------------------- | --------------------- |
| AI linguistic error | Content QA | review gates             | report/rejection rate | rollback version      |
| Bobo inconsistency  | Brand      | canonical registry       | asset mismatch        | block release         |
| OTP delivery        | Backend    | provider adapter, limits | delivery failures     | switch provider       |
| Review backlog      | Learning   | Recovery Mode            | backlog growth        | reduce new cards      |
| Offline conflicts   | Sync       | idempotent events        | retry/conflict rate   | reconcile server-side |
| Billing errors      | Billing    | sandbox verification     | entitlement mismatch  | disable provider      |
| Privacy/security    | Security   | minimization/audit       | alerts                | incident runbook      |
| Cost growth         | SRE        | budgets/observability    | spend variance        | scale limits          |
