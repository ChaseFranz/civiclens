# CivicLens — Task Breakdown (v1)

Discrete, ready-to-pick-up work items organized by phase from [PLAN.md](PLAN.md). Each task has an acceptance criterion. Check off as you go.

Notation:
- **[S]** small (< 2h)
- **[M]** medium (half day)
- **[L]** large (1–2 days)

---

## Phase 1 — Storage Foundation

- [ ] **[M] Create StorageStack skeleton** — `lib/stacks/storage-stack.ts`, register in `bin/civiclens.ts`. Acc: `cdk synth` produces a stack named `CivicLens-prod-Storage` with no resources yet.
- [ ] **[S] Add raw S3 bucket** — versioned, block public access, lifecycle to IA at 90d, `RemovalPolicy.RETAIN`. Acc: bucket appears in synth; CDK test asserts properties.
- [ ] **[M] Add `civiclens-matters` table** — PK `city`, SK `matter_id`, on-demand, GSIs per DESIGN. Acc: synth includes table + both GSIs; CDK test asserts keys.
- [ ] **[S] Add `civiclens-events` table** — PK `city`, SK `event_id`, GSI by date. Acc: synth + test.
- [ ] **[S] Add `civiclens-subscriptions` table** — PK `email`, SK `subscription_id`, GSI for reverse lookup. Acc: synth + test.
- [ ] **[S] Add `civiclens-ingest-state` table** — PK `city`, SK `resource`. Acc: synth + test.
- [ ] **[S] Deploy StorageStack to prod** — Acc: all tables + bucket exist in AWS console.

---

## Phase 2 — Ingestor

- [ ] **[M] Scaffold `lambda/ingestor/`** — entry point, TypeScript build config, esbuild bundling config in CDK. Acc: empty handler deploys and logs "invoked" when manually invoked.
- [ ] **[M] Legistar client** — `lambda/ingestor/legistar.ts`. Typed wrappers for `/matters`, `/events`, `/eventitems`, `/attachments`. Paginated with `$top` + `$skip` or date filter. Acc: unit test against recorded fixtures pulls 10 matters.
- [ ] **[S] S3 writer helper** — `lambda/ingestor/s3.ts`. Writes JSON with correct content-type. Acc: unit test with mocked S3 client.
- [ ] **[M] Attachment downloader** — follow Legistar attachment URLs to Granicus CDN, stream to S3. Skip if `ETag` matches stored. Acc: re-running on same matter does not re-download.
- [ ] **[L] Attachment text extraction** — `lambda/ingestor/parse.ts`. `pdf-parse` for PDFs, `mammoth` for DOCX. Emit `.txt` to `parsed/` prefix. Acc: unit tests with 3 sample docs produce non-empty text.
- [ ] **[M] Dynamo upsert for matters** — write partial row (no summary). Acc: integration test against local Dynamo (or `aws-sdk-client-mock`) writes correct shape.
- [ ] **[M] Ingest-state cursor** — read/write `last_cursor_date` per `(city, resource)`. Only advance on successful page write. Acc: unit test for happy path + failure case.
- [ ] **[S] SQS queue for `MatterIngested`** — with DLQ. Add to `IngestionStack`. Acc: deploys; messages land in main queue.
- [ ] **[M] IngestionStack wiring** — Ingestor Lambda, EventBridge daily rule at 07:00 UTC, reserved concurrency = 1. IAM: read/write S3 prefix, read/write relevant Dynamo tables, publish to SQS. Acc: deploys; EventBridge target shows Lambda.
- [ ] **[M] Retry + structured logging** — exponential backoff on Legistar 5xx, JSON logs with `matter_id`, `city`, `operation`. Acc: forced 500 in unit test retries 3x then surfaces; logs are parseable JSON.
- [ ] **[S] Manual invoke + smoke test** — run ingestor once in prod, verify S3 has matters, Dynamo has rows, SQS has messages. Acc: spot-check 5 matters in console.
- [ ] **[S] 3-day cron soak** — leave daily rule running, verify no regressions and cursor advances. Acc: 3 successful runs with increasing `last_cursor_date`.

---

## Phase 3 — Summarizer

- [ ] **[M] Scaffold `lambda/summarizer/`** — SQS event source, batch size 1, reserved concurrency 5. Acc: drains queue without errors when handler is a no-op.
- [ ] **[M] Bedrock client wrapper** — `lambda/summarizer/bedrock.ts`. Handles `InvokeModel` with Claude. Acc: unit test with mocked Bedrock client returns expected structure.
- [ ] **[M] Prompt design** — `lambda/summarizer/prompt.ts`. Structured JSON output (`summary_short`, `summary_long`, `affected_parties`, `fiscal_impact`). Temperature 0.2. Acc: dry-run on 5 real matters produces valid JSON.
- [ ] **[S] Token budget guard** — cap attachment concat at ~100K tokens, truncate with marker. Acc: unit test with 200K-token input produces bounded prompt.
- [ ] **[M] Dynamo write** — update matter row with summary fields + `summary_generated_at`. Acc: integration test verifies fields.
- [ ] **[M] Retry-on-parse-failure** — one retry with stricter instruction; on second failure, set `summary_status = "failed"` and send to DLQ. Acc: unit test covers both paths.
- [ ] **[S] CloudWatch metrics** — `SummarizerSuccesses`, `SummarizerFailures` custom metrics. Acc: metrics visible in CloudWatch after run.
- [ ] **[M] Backfill run** — process 100 existing matters; measure success rate. Acc: > 95% success, failures spot-checked for patterns.

---

## Phase 4 — Knowledge Base

- [ ] **[M] KB source doc writer in ingestor** — shape + write to `kb-source/seattle/matters/{id}.json` after summary is available. Acc: JSON conforms to DESIGN schema.
- [ ] **[L] KnowledgeBaseStack** — Bedrock KB with S3 Vectors backend, data source pointing at `kb-source/seattle/` prefix, Titan Text Embeddings v2, metadata schema. Acc: deploys; KB visible in Bedrock console.
- [ ] **[S] Ingestor triggers sync** — call `StartIngestionJob` at end of ingestor run. Acc: ingestor run produces a new ingestion job in KB; job completes successfully.
- [ ] **[M] Metadata filter wiring** — confirm filter on `committee`, `status` works via `Retrieve` API. Acc: manual test via AWS CLI returns filtered results.
- [ ] **[S] 10-query quality check** — hand-crafted queries (bike lanes, housing, police budget, etc.); spot-check relevance. Acc: at least 8 of 10 return clearly-relevant top 3 results.

---

## Phase 5 — Search & Dashboard API

- [ ] **[M] Scaffold `lambda/api/`** — single handler with internal router based on `path + method`. Acc: `/health` returns 200.
- [ ] **[M] ApiStack** — API Gateway REST API, Lambda integration, request validators, per-IP throttling. Acc: deploys; invoke URL returns 200 on `/health`.
- [ ] **[M] `GET /matters/{id}`** — read Dynamo, return matter + summary. 404 on missing. Acc: integration test.
- [ ] **[M] `GET /matters`** — filter by status/committee/date via GSI. Pagination. Acc: integration test with filter.
- [ ] **[M] `GET /events` + `/events/{id}`** — upcoming and recent. Acc: integration test.
- [ ] **[L] `GET /search`** — call Bedrock `RetrieveAndGenerate`, shape response with answer + citations. Support filters. Acc: returns < 3s p95 on 10 queries.
- [ ] **[M] `GET /dashboard`** — compose this-week meetings + last-7-days passed/failed + trending topics. Cache 60s. Acc: returns < 2s.
- [ ] **[S] API Gateway caching** — 60s on `/dashboard`, 300s on `/matters/{id}`. Acc: second call returns `X-Cache: Hit from cloudfront` header (or equivalent).
- [ ] **[M] Integration test suite** — hit deployed API from Jest. Acc: suite runs in CI and passes.

---

## Phase 6 — Subscription & Digest

- [ ] **[L] SES domain verification** — verify sender domain, set up DKIM + SPF, request production access. Acc: test email from SES console delivers.
- [ ] **[M] `POST /subscriptions`** — validate input, write unconfirmed row to Dynamo, send confirmation email. Acc: integration test receives confirmation.
- [ ] **[S] `GET /subscriptions/confirm`** — token validation, flip `confirmed_at`. Acc: integration test flips the flag.
- [ ] **[S] `GET /subscriptions/unsubscribe`** — token validation, delete row. Acc: integration test removes subscription.
- [ ] **[M] Scaffold `lambda/digest/`** — weekly Lambda, EventBridge cron rule, 15min timeout, 2048 MB. Acc: deploys; manual invoke runs without errors on empty subscription set.
- [ ] **[L] Digest content rendering** — group activity by subscription target, render HTML with summaries + links. Acc: snapshot test of HTML output.
- [ ] **[M] Digest fan-out + SES send** — iterate confirmed subs, send per-user email, respect SES send rate. Update `last_digest_sent_at`. Acc: end-to-end test with 3 test emails delivered.
- [ ] **[S] SES bounce/complaint handling** — SNS topic → Lambda to flag problem emails in Dynamo. Acc: synthetic bounce flips a flag.
- [ ] **[S] Unsubscribe in every email** — footer link with token. Acc: link works from a real email client.

---

## Phase 7 — Beta Launch

- [ ] **[S] Recruit 5–10 beta users** — invite friends, share sign-up link. Acc: 5+ confirmed subscriptions.
- [ ] **[M] Set up CloudWatch dashboard** — ingestor, summarizer, API, digest metrics. Acc: dashboard shows last 7 days of activity.
- [ ] **[M] Set up alarms** — ingestor staleness (48h), summarizer DLQ depth, SES bounce rate, digest errors. Acc: alarms configured; one test alarm fires to confirm wiring.
- [ ] **[L] 2-week feedback loop** — collect beta feedback, spot-check 20 summaries for accuracy, tune prompt. Acc: all P0/P1 bugs closed.
- [ ] **[S] Cost review** — compare actual 30-day spend to estimate. Acc: doc updated with real numbers.

---

## Phase 8 — Frontend + Public Launch

- [ ] **[L] React app scaffold** — Vite or Next.js (static export), routing for home / search / matter detail / subscribe. Acc: dev server runs; pages render.
- [ ] **[L] Homepage (dashboard) page** — consume `/dashboard`, render meetings + recent + trending. Acc: visual spot-check.
- [ ] **[M] Search page** — form + results with citations linked to matter detail. Acc: searches return results in < 3s.
- [ ] **[M] Matter detail page** — summary + full metadata + attachments. Acc: loads < 2s.
- [ ] **[M] Subscribe flow** — form → confirmation page → email confirmation → success. Acc: happy path works end to end.
- [ ] **[M] FrontendStack** — CloudFront + S3 (OAC), cache policy for static assets, deploy from CI. Acc: site reachable at CloudFront URL.
- [ ] **[S] Custom domain + cert** — Route53 + ACM. Acc: site reachable at custom domain over HTTPS.
- [ ] **[S] Basic analytics** — Plausible or CloudWatch RUM. Acc: pageviews visible.
- [ ] **[S] Public launch** — blog post, social posts, direct shares. Acc: shipped.

---

## Ongoing / Cross-Cutting

- [ ] **[S] `/review` before every PR** — already a skill; enforce as habit
- [ ] **[S] Budget alarm** — CloudWatch billing alarm at $150/mo
- [ ] **[S] Weekly cost check** — glance at AWS cost explorer

---

## Related Docs

- [SPEC.md](SPEC.md) — product spec
- [DESIGN.md](DESIGN.md) — technical design
- [PLAN.md](PLAN.md) — phasing rationale
