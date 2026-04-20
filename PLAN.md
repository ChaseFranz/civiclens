# CivicLens — Implementation Plan (v1)

Phased plan to get from current foundation to v1 launch. Each phase has an exit criterion — don't start the next phase until the current one is demonstrably working end-to-end.

See [DESIGN.md](DESIGN.md) for technical details and [TASKS.md](TASKS.md) for concrete work items.

---

## Current State (Phase 0 — done)

- Monorepo scaffolded, TypeScript + CDK
- GitHub Actions OIDC deploy working end-to-end on `main` → prod
- Stage-config model (`lib/config.ts`) ready for multi-account
- `CivicLensStack` is an empty shell awaiting resources

---

## Phase 1 — Storage Foundation

**Goal:** provision durable, long-lived resources first so the ingestion work has a stable target.

**Build:**

- `StorageStack` with:
  - `civiclens-raw-{account}-{region}` S3 bucket (versioned, block public access, lifecycle to IA at 90 days, `RETAIN` removal)
  - `civiclens-matters` DynamoDB table (on-demand, GSIs per DESIGN.md)
  - `civiclens-events` DynamoDB table
  - `civiclens-subscriptions` DynamoDB table
  - `civiclens-ingest-state` DynamoDB table
- CDK tests asserting table PKs/SKs, GSI keys, and bucket properties

**Exit criteria:**

- `npx cdk deploy CivicLens-prod-Storage` succeeds
- All tables visible in console; bucket is writable from a manual `aws s3 cp`
- Unit tests pass

---

## Phase 2 — Ingestor (raw fetch only)

**Goal:** pull Seattle matters/events from Legistar into S3 and Dynamo on a schedule. No summaries yet.

**Build:**

- `lambda/ingestor/` — Legistar client, S3 writer, Dynamo writer, pagination cursor
- Attachment download + DOCX/PDF text extraction (`mammoth`, `pdf-parse`)
- `IngestionStack` — Ingestor Lambda, EventBridge daily rule, reserved concurrency = 1
- SQS `MatterIngested` queue + DLQ (summarizer consumes in Phase 3)
- Retry/backoff logic for Legistar 5xx
- Structured logs with `city`, `matter_id`, `operation`

**Exit criteria:**

- Manual invoke populates S3 with raw matters + parsed attachment text
- `civiclens-matters` has rows for all Seattle matters from the last 30 days
- SQS queue has `MatterIngested` messages (unread, will be consumed in Phase 3)
- Daily rule fires successfully 3 days in a row with cursor advancing

---

## Phase 3 — Summarizer

**Goal:** every matter gets a plain-English summary generated once at ingest.

**Build:**

- `lambda/summarizer/` — reads SQS, calls Bedrock Claude, updates Dynamo
- Prompt design + structured JSON output parsing
- Retry-once-on-parse-failure logic
- DLQ handling; Dynamo `summary_status` flag
- CloudWatch metrics: `SummarizerSuccesses`, `SummarizerFailures`
- Add to `IngestionStack`

**Exit criteria:**

- All new matters from Phase 2 ingestion get summaries within 10 minutes of ingest
- Summary success rate > 95% on a 100-matter backfill run
- DLQ-flagged matters visible with failure reason in logs

---

## Phase 4 — Knowledge Base

**Goal:** Bedrock KB indexes summaries + attachment text and returns useful semantic search results.

**Build:**

- `KnowledgeBaseStack` — Bedrock KB with S3 Vectors backend, data source pointing at `s3://.../kb-source/seattle/`
- KB source doc writer in ingestor (writes shaped JSON to `kb-source/` prefix)
- Ingestor triggers `StartIngestionJob` at end of each run
- Metadata schema with `city`, `status`, `type`, `committee`, `introduced_date`

**Exit criteria:**

- KB returns relevant results for 10 hand-crafted test queries (e.g. "bike lanes", "housing affordability", "police budget")
- Metadata filters work (e.g. query filtered to `committee = "Land Use"`)
- Sync job completes in < 10 minutes on full Seattle corpus

---

## Phase 5 — Search & Dashboard API

**Goal:** public REST API backing the civic dashboard and search.

**Build:**

- `lambda/api/` — single Lambda dispatching to route handlers
- `ApiStack` — API Gateway REST API, Lambda integration, request validators, caching on `/dashboard` and `/matters/{id}`
- Routes (per DESIGN.md): `/search`, `/matters`, `/matters/{id}`, `/events`, `/events/{id}`, `/dashboard`
- Per-IP throttling via usage plan
- Integration tests hitting deployed API Gateway URL

**Exit criteria:**

- `/search?q=...` returns answer + citations in < 3s p95
- `/dashboard` returns meetings, recent matters, trending — in < 2s
- All routes validated; invalid input returns 400 with clear error

---

## Phase 6 — Subscription & Digest

**Goal:** users can subscribe by email and receive a weekly digest.

**Build:**

- SES domain verification + production access request
- `POST /subscriptions` with double-opt-in confirmation email
- `GET /subscriptions/confirm` and `/subscriptions/unsubscribe` endpoints
- `lambda/digest/` — weekly fan-out, renders HTML, sends via SES
- `DigestStack` — Digest Lambda, EventBridge weekly rule (Mon 01:00 UTC)
- SES bounce/complaint monitoring + Dynamo flag

**Exit criteria:**

- Subscribing via API sends confirmation email, confirm link flips `confirmed_at`
- Weekly digest test run delivers to 3 beta inboxes with correct content
- Unsubscribe link works end-to-end

---

## Phase 7 — Beta Launch

**Goal:** prove it works with real users before going wider.

**Do:**

- Invite 5–10 beta users (friends, civic-minded folks in Seattle)
- Collect feedback for 2 weeks
- Fix bugs and tune summary prompts based on feedback

**Exit criteria:**

- 4 consecutive weekly digests delivered successfully
- Beta users report summaries are accurate and useful on a spot-check of 20 bills
- No unresolved P0/P1 bugs

---

## Phase 8 — Frontend + Public Launch

**Goal:** ship a usable web UI and announce.

**Build:**

- React app consuming the API
- `FrontendStack` — CloudFront + S3 (OAC), React build pipeline in CI
- Homepage (dashboard), search page, matter detail page, subscription flow
- Basic analytics (CloudWatch RUM or Plausible)

**Exit criteria:**

- Site loads in < 2s on 4G
- Lighthouse score > 90 on performance and accessibility
- Announce publicly (blog post, social)

---

## Phasing Principles

- **Ship each phase end-to-end before starting the next.** Don't build Phase 3 on a broken Phase 2.
- **Storage before compute.** Schemas are expensive to change once data lives in them.
- **Ingestion before UI.** No point building a dashboard with nothing to show.
- **Beta before public.** Cheap to fix before anyone's watching.
- **One thing at a time.** Resist bundling unrelated work into a single phase.

---

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Legistar feed goes stale or changes schema | Monitor `last_cursor_date` age; alarm if no new data in 48h |
| Attachment parsing quality is poor (scanned PDFs) | Track parse success rate; fall back to title-only summary with a flag |
| Bedrock rate limits hit during backfill | Reserved concurrency on summarizer = 5; batch size 1 |
| SES bounce rate triggers suspension | Double-opt-in + easy unsubscribe; bounce monitoring alarm |
| Summary hallucinations | Temperature 0.2, explicit instruction to preserve figures, spot-check in beta |
| Cost blows past estimate | CloudWatch billing alarm at $150/mo; cost review after 30 days |

---

## Related Docs

- [SPEC.md](SPEC.md) — product spec
- [DESIGN.md](DESIGN.md) — technical design
- [TASKS.md](TASKS.md) — task breakdown
