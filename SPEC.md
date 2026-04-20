# CivicLens — Product Spec

## Vision

A civic intelligence platform that makes local government activity accessible to everyday residents. Most people have no idea what their city council is doing — bills pass, zoning changes, budgets get amended — and nobody told them. CivicLens fixes that.

---

## Problem

Local government data is technically public but practically inaccessible:

- Meeting agendas are PDFs buried on city websites
- Legislation is written in legal language nobody understands
- There's no alert system for things that affect you
- Keyword search doesn't work on legal text — you need semantic understanding

---

## Personas

**Resident Rachel** — lives in Seattle, works full-time, cares about her neighborhood but doesn't have hours to read city council agendas. Wants a weekly digest of what affects her and a way to know when public comment windows are open.

**Advocate Alex** — runs a small housing advocacy group. Tracks every housing-related bill, watches committee activity, and mobilizes comment campaigns. Needs real-time alerts and deep search across history.

**Journalist Jordan** — local beat reporter. Needs to quickly find legislative history on a topic, cross-reference council voting patterns, and get citations back to source documents.

**Policy Wonk Pat** — researcher at a think tank. Wants bulk queries across cities: "which cities have moved on rent stabilization in the last 18 months?" (post-v1 need).

---

## Data Foundation

**Primary source:** Legistar Web API (Granicus)

- Covers hundreds of US municipalities
- Exposes: legislation (matters), meeting agendas (events), event items, votes, council members (persons), committees (bodies), attachments
- Launch cities: Seattle, Boston, Phoenix, Denver (confirmed active feeds)
- No API key for most cities; rate limits not formally documented

**Key endpoints used:**

- `GET /matters` — legislation records
- `GET /events` — meetings
- `GET /events/{id}/eventitems` — agenda items per meeting
- `GET /matters/{id}/attachments` — attached documents (PDF/DOCX)
- `GET /matters/{id}/histories` — lifecycle events (referred, voted on, passed)
- `GET /persons` — council members

---

## Features

Each feature below includes user stories in the form: **As a** *persona*, **I want** *capability*, **so that** *outcome*.

### 1. Semantic Search

Natural language search across all legislation, meeting minutes, and agendas. Powered by Bedrock Knowledge Base + RetrieveAndGenerate.

**User stories:**

- As Rachel, I want to search "bike lanes near Capitol Hill" and get relevant bills without knowing the legal terminology, so that I can follow issues in my neighborhood.
- As Alex, I want to filter search results by date range, committee, and matter status, so that I can find every housing bill in committee this session.
- As Jordan, I want every search result to link back to the original source document with a citation, so that I can verify claims before publishing.

**Acceptance:**

- Plain-language queries return semantically relevant results (not keyword match)
- Results include: title, snippet, citation, link to source, date, matter status
- Filters: city, date range, committee, matter type, status
- p95 latency < 3 seconds

---

### 2. Plain English Summaries

Every bill and meeting agenda gets an AI-generated summary. Claude reads the full attachment text, not just the title. Summaries are generated once at ingest and stored — not regenerated per request.

**User stories:**

- As Rachel, I want a plain-English summary of each bill that tells me what it does, who it affects, and where it is in the process, so that I don't have to read legal text.
- As Jordan, I want summaries to preserve fiscal impact numbers accurately, so that I can quote them without fact-checking every figure.
- As Alex, I want to see both a short TL;DR and a detailed summary for each bill, so that I can quickly triage then deep-dive when needed.

**Acceptance:**

- Each matter has: one-line summary, detailed summary (~200 words), affected parties, fiscal impact, current status
- Summaries regenerate when a new attachment version is added
- Generation failures are logged and retried; matters without summaries are flagged in the UI

---

### 3. Alerts & Subscriptions

Users subscribe to topics they care about. Email digests are the v1 delivery channel.

**Subscription types:**

- Topic-based — "housing", "public safety", "transit", "parks", "zoning"
- Neighborhood — geo-tagged activity near an address (post-v1)
- Council member — follow a specific councilmember's activity
- Bill tracking — follow a specific matter through its lifecycle
- Committee — everything from e.g. Finance or Land Use committee

**User stories:**

- As Rachel, I want to subscribe by email and get a weekly digest of housing bills, so that I stay informed without being overwhelmed.
- As Alex, I want to track a specific bill and get notified when its status changes, so that I know the moment it moves to a vote.
- As Alex, I want an instant alert (not just weekly) when a bill I track passes or fails, so that I can mobilize public comment in time.
- As any user, I want to unsubscribe with one click, so that I never feel trapped in spam.

**Acceptance:**

- Email subscription requires double-opt-in confirmation (SES verified)
- Weekly digest runs Sunday evening for the past 7 days of activity
- Instant alerts trigger on matter status transitions (introduced, passed, failed, referred)
- All emails include an unsubscribe link

---

### 4. Meeting Intelligence

Surfaces what's coming up before it happens — not just after.

**User stories:**

- As Rachel, I want to see this week's upcoming council meetings and what's on the agenda, so that I know if anything I care about is being decided.
- As Alex, I want public comment deadlines prominently displayed for each upcoming meeting, so that I can submit comment on time.
- As Rachel, I want clear instructions on how to participate (phone-in, in-person, written), so that I actually show up.
- As Jordan, I want post-meeting outcomes (what passed, vote tallies) within 24 hours, so that I can publish quickly.

**Acceptance:**

- Upcoming meetings view shows next 14 days
- Each meeting lists: agenda items with plain-English descriptions, public comment deadline, participation instructions
- Past meetings show: what passed, what failed, vote breakdowns

---

### 5. Council Member Profiles & Voting Records *(post-v1)*

Transparency layer on top of elected officials.

**User stories:**

- As Jordan, I want a councilmember's full voting history filterable by topic, so that I can write profiles grounded in data.
- As Rachel, I want to see how my district's councilmember has voted on housing, so that I can decide how to vote in the next election.
- As Alex, I want alignment scores between councilmembers (who votes together), so that I understand coalition dynamics.

---

### 6. Neighborhood Watch *(post-v1)*

Hyper-local filter for residents who care about their immediate area.

**User stories:**

- As Rachel, I want to get alerts when zoning changes or development permits are filed within a mile of my address, so that I can weigh in before decisions are finalized.

**Dependency:** reliable geo-tagging of legislation — not trivial; deferred from v1.

---

### 7. Bill Lifecycle Tracker *(post-v1)*

Full history of any piece of legislation from introduction to outcome.

**User stories:**

- As Alex, I want a timeline view of a bill (introduced → referred → committee → vote → passed), so that I can see where it is and what comes next.
- As Jordan, I want to see diffs between attachment versions, so that I can report on what changed during markup.

---

### 8. Civic Dashboard

Homepage experience — what's happening in your city right now. No auth required for v1.

**User stories:**

- As Rachel, I want a homepage that shows this week's meetings, recent bills that passed, and trending topics, so that I get a snapshot of civic activity without searching.
- As any user, I want to see upcoming public comment deadlines prominently, so that I don't miss chances to participate.

**Acceptance:**

- Homepage shows: this week's meetings, last 7 days of passed/failed bills, trending topics, upcoming comment deadlines
- No authentication required

---

### 9. Multi-City Support *(post-v1)*

Built for scale from day one, launched with one city. Infrastructure already accepts a city identifier; UI surface deferred.

---

## Launch Scope (v1)

Focus on Seattle. Prove the concept end-to-end.

**In scope:**

- Ingestion pipeline (Legistar → S3 → Bedrock KB)
- Plain English summaries on every new matter
- Semantic search API
- Civic dashboard (read-only, no auth)
- Weekly email digest via SES

**Out of scope (post-v1):**

- Council member profiles
- Neighborhood watch (geo-tagging)
- Multi-city UI
- Bill lifecycle tracker (timeline view)
- Push notifications
- Instant alerts (weekly digest only for v1)

---

## Success Metrics

**v1 launch criteria:**

- Seattle Legistar data ingested end-to-end; KB returns relevant results for 10 test queries
- All new matters in the last 7 days have summaries
- Dashboard loads in < 2 seconds
- At least 3 beta users receive weekly digest for 4 consecutive weeks with no delivery failures

**Post-launch health:**

- Ingestion job success rate > 99% (nightly)
- Summary generation success rate > 95%
- Search p95 latency < 3s
- Digest email bounce rate < 2%

---

## Open Questions

1. **Monetization** — free tier with weekly digest, paid tier for real-time alerts + neighborhood watch?
2. **Geo-tagging** — how do we reliably extract addresses from bill text to power neighborhood watch?
3. **Attachment parsing** — DOCX/PDF extraction quality will determine summary quality; how do we handle scanned PDFs?
4. **Legistar coverage gaps** — what's the fallback when a city's feed goes stale (happened with Chicago)?
5. **Branding** — CivicLens is a working name.

---

## Related Docs

- [DESIGN.md](DESIGN.md) — technical design for v1
- [PLAN.md](PLAN.md) — phased implementation plan
- [TASKS.md](TASKS.md) — discrete work items
