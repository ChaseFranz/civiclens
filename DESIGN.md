# CivicLens — Technical Design (v1)

Covers the technical design of the v1 scope from [SPEC.md](SPEC.md): ingestion, summaries, search API, dashboard, and weekly digest. Seattle only.

---

## System Overview

```
                      ┌──────────────────────┐
                      │  EventBridge (cron)  │
                      │   07:00 UTC daily    │
                      └──────────┬───────────┘
                                 │
                 ┌───────────────┼───────────────────┐
                 │               │                   │
        ┌────────▼────────┐ ┌────▼──────────┐ ┌─────▼─────────┐
        │   Ingestor      │ │  Summarizer   │ │  Digest       │
        │   Lambda        │ │  Lambda       │ │  Lambda       │
        │                 │ │               │ │  (weekly)     │
        └────┬────────────┘ └───┬───────────┘ └──────┬────────┘
             │                  │                    │
             │                  │                    │
        ┌────▼──────┐    ┌──────▼──────┐     ┌──────▼─────┐
        │    S3     │    │  DynamoDB   │     │    SES     │
        │  (raw +   │    │  (matters,  │     │  (email    │
        │  attach.) │    │  summaries, │     │   send)    │
        └────┬──────┘    │  subs)      │     └────────────┘
             │           └──────┬──────┘
             │                  │
    ┌────────▼──────────┐       │
    │  Bedrock KB       │       │
    │  (S3 Vectors)     │       │
    └────────┬──────────┘       │
             │                  │
             └───────┬──────────┘
                     │
             ┌───────▼───────┐
             │   API Lambda  │◄──── API Gateway ◄──── Frontend
             └───────────────┘      (REST)            (CloudFront)
```

---

## Stacks

Split the existing `CivicLensStack` shell into focused stacks so that deploys stay fast and blast radius stays small.

- `FoundationStack` — GitHub OIDC provider (already exists; one per account)
- `GithubOidcStack` — per-stage deploy role (already exists)
- `StorageStack` — S3 bucket + DynamoDB tables (stateful; never destroy)
- `IngestionStack` — EventBridge rules, Ingestor Lambda, Summarizer Lambda
- `KnowledgeBaseStack` — Bedrock KB + S3 Vectors index + data source
- `ApiStack` — API Gateway + API Lambda
- `DigestStack` — weekly digest Lambda + EventBridge rule + SES configuration
- `FrontendStack` — CloudFront + S3 for React app (can be added later)

Removal policies: `StorageStack` resources use `RETAIN`; everything else is replaceable.

## Naming Convention

Resource names (not stack names) use helpers from `lib/naming.ts`:

- **Resource names** (Dynamo tables, Lambda functions, IAM roles, SQS queues): `resourceName(stage, name)` → `civiclens-prod-us-east-1-matters`
- **S3 bucket names** (global namespace — account suffix): `bucketName(stage, name)` → `civiclens-prod-us-east-1-raw-027375206117`

Why: the `{app}-{stage}-{region}-` prefix makes CivicLens resources trivial to identify in a shared AWS account, and keeps names unique across stages/regions. Stack names stay as their CDK construct IDs — CloudFormation already scopes stacks per account+region, so the extra prefix is noise.

---

## Data Model

### S3 Bucket: raw document store

Named via `bucketName(stage, 'raw')` — see Naming Convention below. Single bucket, prefix-based layout. Versioning enabled. Lifecycle: transition to IA after 90 days.

```
s3://<bucket>/
  legistar/{city}/matters/{matter_id}.json           # raw Legistar matter record
  legistar/{city}/events/{event_id}.json             # raw event
  legistar/{city}/eventitems/{event_id}.json         # raw event items array
  legistar/{city}/attachments/{matter_id}/{name}     # attached PDF/DOCX as-is
  parsed/{city}/attachments/{matter_id}/{name}.txt   # extracted text for KB
  kb-source/{city}/matters/{matter_id}.json          # shaped KB doc (see below)
  kb-source/{city}/matters/{matter_id}.json.metadata.json  # KB metadata sidecar
```

**KB source format** (`kb-source/...` — this is what Bedrock KB indexes):

```json
{
  "id": "seattle-matter-12345",
  "city": "seattle",
  "matter_id": 12345,
  "title": "...",
  "type": "Ordinance",
  "status": "In Committee",
  "introduced_date": "2026-03-14",
  "sponsors": ["..."],
  "committee": "Land Use",
  "body_text": "<full concatenated attachment text>",
  "url": "https://seattle.legistar.com/LegislationDetail.aspx?ID=..."
}
```

Metadata fields the KB can filter on: `city`, `status`, `type`, `committee`, `introduced_date`.

### DynamoDB

**`civiclens-matters`** — canonical matter state, fast reads for dashboard/API.

- PK: `city` (S)
- SK: `matter_id` (S, zero-padded)
- Attributes: `title`, `type`, `status`, `introduced_date`, `last_action_date`, `committee`, `sponsors` (SS), `url`, `summary_short`, `summary_long`, `affected_parties`, `fiscal_impact`, `summary_generated_at`, `attachments` (L), `ingested_at`
- GSI1 (`status-last_action-index`): PK `city#status`, SK `last_action_date` — powers dashboard "recent activity by status"
- GSI2 (`committee-index`): PK `city#committee`, SK `last_action_date` — powers committee filter

**`civiclens-events`** — meetings.

- PK: `city`, SK: `event_id`
- Attributes: `body` (committee), `date`, `location`, `agenda_status`, `comment_deadline`, `participation_info`, `items` (L of `{matter_id, title, summary}`)
- GSI1 (`date-index`): PK `city`, SK `date` — powers "this week's meetings"

**`civiclens-subscriptions`** — email subscribers.

- PK: `email` (S, lowercased)
- SK: `subscription_id` (S, e.g. `topic#housing`, `matter#seattle#12345`, `committee#seattle#Land Use`)
- Attributes: `created_at`, `confirmed_at`, `unsubscribe_token`, `last_digest_sent_at`
- GSI1 (`subscription-target-index`): PK `subscription_id`, SK `email` — reverse lookup for digest fan-out

**`civiclens-ingest-state`** — idempotency / cursor for Legistar pagination.

- PK: `city`, SK: `resource` (e.g. `matters`, `events`)
- Attributes: `last_cursor_date`, `last_run_at`, `items_fetched`

---

## Ingestion Pipeline

### Ingestor Lambda (`lambda/ingestor/`)

- Runtime: Node.js 22, 1024 MB, 15-min timeout
- Trigger: EventBridge `cron(0 7 * * ? *)` — daily at 07:00 UTC
- Concurrency: reserved = 1 (prevents parallel runs stomping cursors)

**Flow:**

1. Read `last_cursor_date` from `civiclens-ingest-state` for `(seattle, matters)`.
2. Page through `GET /matters?$filter=MatterLastModifiedUtc gt {cursor}&$orderby=MatterLastModifiedUtc&$top=1000`.
3. For each matter:
   - Write raw JSON to `s3://.../legistar/seattle/matters/{id}.json`
   - Fetch attachments list; download each attachment to S3 (skip if ETag matches stored)
   - Parse DOCX/PDF to text using `pdf-parse` and `mammoth`; store under `parsed/`
   - Upsert `civiclens-matters` row (partial — no summary yet)
   - Write KB source doc to `kb-source/seattle/matters/{id}.json`
   - Publish `MatterIngested` event to an SQS queue (decouples summarizer)
4. Repeat for `events` and `eventitems`.
5. Update cursor on success.
6. After all pages processed, invoke `StartIngestionJob` on the Bedrock KB data source (incremental sync).

**Error handling:**

- Retries on transient failures (5xx from Legistar) with exponential backoff, max 3 attempts per page
- Per-matter failures logged to CloudWatch; cursor only advances on page-level success so failed matters get retried next run
- DLQ for the SQS summarizer queue

### Summarizer Lambda (`lambda/summarizer/`)

- Runtime: Node.js 22, 1024 MB, 5-min timeout
- Trigger: SQS (`MatterIngested` events), batch size 1, max concurrency 5 (Bedrock rate limits)

**Flow:**

1. Read matter record + parsed attachment text from S3
2. Call Bedrock `InvokeModel` with Claude Sonnet: prompt includes matter metadata + concatenated attachment text (capped at ~100K tokens)
3. Parse structured JSON response: `{summary_short, summary_long, affected_parties, fiscal_impact}`
4. Update `civiclens-matters` row with summary fields + `summary_generated_at`

**Prompt design** (`lambda/summarizer/prompt.ts`):

- System prompt: "You are a civic analyst. Read the following legislation and produce a structured summary for a general audience. Preserve fiscal figures exactly. Return JSON with fields: summary_short (1 sentence), summary_long (~200 words), affected_parties (array of strings), fiscal_impact (string or null)."
- Temperature: 0.2 (consistent structure)

**Failure policy:**

- On parse error, retry once with a stricter "return only valid JSON" instruction
- After 2 failures, write to DLQ and flag the matter in Dynamo: `summary_status = "failed"`

---

## Bedrock Knowledge Base

- **Embedding model:** Titan Text Embeddings v2
- **Vector store:** S3 Vectors (avoids OpenSearch Serverless floor cost)
- **Data source:** S3, prefix `kb-source/seattle/`
- **Chunking:** default (300 tokens, 20% overlap) — revisit if retrieval quality is poor
- **Metadata fields:** `city`, `status`, `type`, `committee`, `introduced_date`. Bedrock KB does not auto-extract filterable fields from the document body; the ingestor writes a sidecar `{matter_id}.json.metadata.json` next to each KB source doc containing only these fields, per Bedrock's metadata filtering spec.
- **Sync:** triggered by ingestor at the end of each run; incremental mode

---

## API Layer

API Gateway REST API → single API Lambda (`lambda/api/`). Routes dispatched internally.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/search` | Semantic search (query, filters) |
| GET | `/matters/{id}` | Full matter detail + summary |
| GET | `/matters` | List matters (filter by status/committee/date) |
| GET | `/events` | Upcoming and recent meetings |
| GET | `/events/{id}` | Meeting detail with agenda items |
| GET | `/dashboard` | Homepage payload (meetings + recent + trending) |
| POST | `/subscriptions` | Create subscription (triggers confirmation email) |
| GET | `/subscriptions/confirm` | Confirm subscription via token |
| GET | `/subscriptions/unsubscribe` | Unsubscribe via token |

**`/search` implementation:**

- Calls Bedrock `RetrieveAndGenerate` with the KB
- Query filters passed as KB metadata filters (e.g. `status = "In Committee"`)
- Response: `{ answer, citations: [{matter_id, title, snippet, url}], results: [...] }`

**Caching:**

- API Gateway cache on `/dashboard` (60s TTL) and `/matters/{id}` (300s TTL)
- No cache on `/search` (query-dependent)

**Auth:** none for v1 (all endpoints public read except subscription mutations which use token-based confirm/unsubscribe).

---

## Digest Pipeline

### Digest Lambda (`lambda/digest/`)

- Trigger: EventBridge `cron(0 1 ? * MON *)` — Monday 01:00 UTC (~Sunday evening PT)
- Runtime: Node.js 22, 2048 MB, 15-min timeout

**Flow:**

1. Query `civiclens-subscriptions` for all confirmed subscriptions
2. Group by subscription target (topic, committee, matter) and query matching activity from `civiclens-matters` GSI in last 7 days
3. For each email: render HTML with plain-English summaries, send via SES (`SendEmail`)
4. Update `last_digest_sent_at` per subscription

**Throttling:**

- SES sandbox initially: limited to verified recipients; production access requested before launch
- Cap concurrent sends to 10/sec

---

## Security

- **IAM least-privilege:** each Lambda has its own role, scoped to the specific S3 prefixes and DynamoDB tables it touches
- **Secrets:** none required for v1 (Legistar is keyless). If added, use Secrets Manager, not env vars
- **SES unsubscribe tokens:** 32-byte random, stored on subscription row, validated on unsubscribe GET
- **Input validation:** all API inputs validated at edge (API Gateway request validators for shape, Lambda for semantics)
- **Rate limiting:** API Gateway usage plan with per-IP throttle (100 req/min) — public read-heavy API
- **S3 bucket:** block all public access; CloudFront OAC for frontend assets only (not raw doc bucket)

---

## Observability

- **Logs:** CloudWatch Logs, structured JSON (`@timestamp`, `level`, `matter_id`, `city`, `operation`)
- **Metrics:** custom CloudWatch metrics for `IngestorMattersProcessed`, `SummarizerSuccesses`, `SummarizerFailures`, `DigestEmailsSent`, `SearchQueries`
- **Alarms:**
  - Ingestor failure (no successful run in 48h)
  - Summarizer DLQ depth > 5
  - Digest Lambda errors
  - SES bounce rate > 2%
- **Dashboard:** CloudWatch dashboard per stack with the above metrics

---

## Cost Model (rough v1 estimate, Seattle only)

| Component | Monthly |
| --- | --- |
| Bedrock KB (S3 Vectors) | ~$10 storage + per-query |
| Bedrock invoke (summaries + search) | $30–$80 depending on volume |
| Lambda | < $5 |
| DynamoDB (on-demand) | < $5 |
| S3 storage | < $5 |
| API Gateway | < $5 |
| SES | < $1 (< 10K emails) |
| **Total** | **~$60–$110** |

Well below the $700/mo OpenSearch floor we'd hit with the default KB backend.

---

## Out of Scope for v1 Design

These are acknowledged but not designed here — decisions deferred to their respective post-v1 phases:

- Auth / user accounts (subscriptions are email-only in v1)
- Geo-tagging pipeline (neighborhood watch)
- Multi-city routing (config already accepts `city` param; no UI)
- Push notifications
- Amendment / diff tracking
- Instant alerts (weekly digest only)

---

## Related Docs

- [SPEC.md](SPEC.md) — product spec and user stories
- [PLAN.md](PLAN.md) — phased implementation plan
- [TASKS.md](TASKS.md) — discrete work items
