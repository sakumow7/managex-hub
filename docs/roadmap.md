# Suggested development milestones

## 1. Deepen the domain

- Assets and facility hierarchy, recurring inspection schedules, checklists, and inspection findings.
- Due-date and request-detail editing with field-level audit entries.
- Resolution codes, supervisor acceptance notes, and service-level targets.
- Account management UI, activation/deactivation, password reset, and revocation.

## 2. Improve collaboration

- Order comments, notification preferences, polling or real-time delivery.
- Assignee availability, workload planning, and advanced report date ranges.
- Asset/location recurrence analysis instead of category frequency alone.

## 3. Prepare deployment

- HTTPS, rate limits, secret management, persistent monitoring, backups and restore verification.
- Tenant boundaries and database-level integrity constraints for domain values.
- Structured logs, request IDs, dependency update automation, image scanning.
- Move expensive dashboard queries to SQL and large exports to background jobs.
- Make audit retention and tamper resistance match the actual operating requirements.

## 4. Expand tests and accessibility

- PostgreSQL concurrency tests, migration rollback checks, and broader browser role coverage.
- Automated accessibility checks and keyboard/screen-reader review.
- Mobile workflows, expired sessions, network recovery, and larger datasets.

Keep sample attachments fictional. Any future upload feature needs its own explicit design for type/size limits, storage permissions, and scanning.
