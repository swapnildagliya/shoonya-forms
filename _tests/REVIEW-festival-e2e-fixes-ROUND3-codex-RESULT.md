READY TO DEPLOY (backend, then forms).

No remaining unauthenticated Festival write or token leak: both write routes reject missing tokens; tokens are deleted before handlers/logs/emails, while `account_email` is intentionally retained for review. P1-a still returns failure before downstream work; test previews remain write-free.

Backend-first is security-safe. During the short gap, the current tokenless form shows generic failure and fires its unverified backup, so deploy forms immediately and tell any active user to refresh/retry. The typed organiser email remains unbound to the session account—non-blocking for this stated gate, but an authenticated user can still claim another organiser identity; `account_email` preserves the audit trail.

Checks: routing probe passed; App Bridge 124/124; readable contract 179/179. Structural suite remains at its known 136/139 header-count failures.