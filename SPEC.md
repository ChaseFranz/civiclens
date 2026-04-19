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

## Data Foundation

**Primary source:** Legistar Web API (Granicus)
- Covers hundreds of US municipalities
- Exposes: legislation, meeting agendas, votes, council members, committees, attachments
- Launch cities: Seattle, Boston, Phoenix, Denver (confirmed active feeds)

**Ingestion pipeline:**
```
Legistar API → Lambda (poller, runs nightly) → S3 (raw docs + attachments)
                                                      ↓
                                           Bedrock Knowledge Base
                                           (S3 Vectors backend)
```

---

## Features

### 1. Semantic Search
Natural language search across all legislation, meeting minutes, and agendas.

- "Find anything about bike lanes in the last year"
- "What housing bills are currently in committee?"
- "Show me all zoning changes near Capitol Hill"
- Filters: city, date range, committee, matter type, status
- Results include citations back to source documents
- Powered by Bedrock Knowledge Base + RetrieveAndGenerate API

---

### 2. Plain English Summaries
Every bill and meeting agenda gets an AI-generated summary.

- What is this bill trying to do?
- Who does it affect?
- What's the fiscal impact?
- Where is it in the process?
- Claude reads the full attachment text (not just the title)
- Summaries stored and served — not regenerated on every request

---

### 3. Alerts & Subscriptions
Users subscribe to topics they care about. We notify them when relevant activity happens.

**Subscription types:**
- **Topic-based** — "housing", "public safety", "transit", "parks", "zoning"
- **Neighborhood-based** — geo-tagged zoning/permit activity near an address
- **Council member** — follow a specific alderman or councilmember's activity
- **Bill tracking** — follow a specific bill through its lifecycle
- **Committee** — everything coming out of e.g. Finance or Zoning committee

**Delivery:**
- Weekly digest email (default)
- Daily digest option
- Instant alert for high-signal events (bill passed, major vote)
- Push notifications (future)

---

### 4. Meeting Intelligence
Surfaces what's coming up before it happens — not just after.

- Upcoming meeting agendas summarized in plain English
- "What is your city council deciding this week?"
- Public comment deadlines prominently surfaced
- How to participate (phone-in, in-person, written comment)
- Post-meeting: what passed, what failed, vote tallies

---

### 5. Council Member Profiles & Voting Records
Transparency layer on top of elected officials.

- Full voting history per council member
- Voting patterns over time by topic area
- Alignment scores between members (who votes together?)
- Bills they sponsored vs. opposed
- Committee assignments and activity level
- Attendance record

---

### 6. Neighborhood Watch
Hyper-local filter for residents who care about their immediate area.

- Zoning reclassifications within X miles of your address
- Development permit activity
- Infrastructure projects (road work, utilities)
- New business licenses
- Powered by geo-tagging legislation that references specific addresses/neighborhoods

---

### 7. Bill Lifecycle Tracker
Full history of any piece of legislation from introduction to outcome.

- Timeline view: introduced → referred → committee → vote → passed/failed
- All versions of the bill with diffs (if attachments change)
- Who voted how
- Related bills (companion legislation, amendments)

---

### 8. Civic Dashboard
Homepage experience — what's happening in your city right now.

- This week's meetings
- Bills that passed/failed in the last 7 days
- Trending topics (what's getting the most legislative activity)
- Upcoming public comment deadlines
- Personalized feed based on subscriptions

---

### 9. Multi-City Support
Built for scale from day one, launched with one city.

- City switcher in UI
- Legistar slug config per city — adding a new city is low-effort
- City comparison (future): how are other cities handling the same issue?
- National topic trending: "housing bills are moving in 14 cities this month"

---

## Technical Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│         (React, hosted on CloudFront)            │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              API Layer                           │
│         (Lambda + API Gateway)                   │
│  - Search endpoint (Bedrock RetrieveAndGenerate) │
│  - Subscription management                       │
│  - City/matter/council member endpoints          │
└──────┬──────────┬──────────────┬────────────────┘
       │          │              │
┌──────▼───┐ ┌────▼──────┐ ┌────▼────────────────┐
│ DynamoDB │ │    S3     │ │  Bedrock KB          │
│ (users,  │ │ (raw docs,│ │  (S3 Vectors)        │
│  subs,   │ │  attach.) │ │  semantic search     │
│  alerts) │ └────┬──────┘ └─────────────────────┘
└──────────┘      │
            ┌─────▼──────────────────────────────┐
            │     Ingestion Pipeline              │
            │  EventBridge → Lambda → Legistar   │
            │  Fetches new matters, attachments  │
            │  Generates summaries via Claude    │
            │  Triggers KB re-sync               │
            └────────────────────────────────────┘
```

**Stack:**
- Infrastructure: AWS CDK (TypeScript)
- Compute: Lambda
- Storage: S3 (docs), DynamoDB (structured data)
- AI: Bedrock Knowledge Base (S3 Vectors), Claude via Bedrock
- Notifications: SES (email), SNS (future push)
- Frontend: React + CloudFront + S3

---

## Launch Scope (v1)

Focus on Seattle. Prove the concept end-to-end.

**Must-have for v1:**
- [ ] Ingestion pipeline (Legistar → S3 → Bedrock KB)
- [ ] Semantic search
- [ ] Plain English summaries
- [ ] Civic dashboard (read-only, no auth required)
- [ ] Email digest subscription

**Post-v1:**
- Council member profiles
- Neighborhood watch (requires geo-tagging work)
- Multi-city
- Bill lifecycle tracker
- Push notifications

---

## Open Questions

1. **Monetization** — free tier with weekly digest, paid tier for real-time alerts + neighborhood watch?
2. **Geo-tagging** — how do we reliably extract addresses from bill text to power neighborhood watch?
3. **Attachment parsing** — DOCX/PDF extraction quality will determine summary quality
4. **Legistar coverage gaps** — what's the fallback when a city's feed goes stale (happened with Chicago)?
5. **Branding** — CivicLens is a working name
