# CivicLens

A civic intelligence platform that makes local government activity accessible to everyday residents. Monitors city council legislation, meeting agendas, and votes — then surfaces it in plain English via AI-powered summaries, semantic search, and personalized alerts.

## Data Source

**Legistar Web API** (Granicus) — `https://webapi.legistar.com/v1/{city}/`

- No API key required for most cities
- Launch city: **Seattle** (slug: `seattle`)
- Confirmed active cities: Seattle, Boston, Phoenix, Denver
- Key endpoints: `/matters`, `/events`, `/events/{id}/eventitems`, `/matters/{id}/attachments`, `/matters/{id}/histories`, `/persons`

## Architecture

**Stack:** AWS CDK (TypeScript), Lambda, S3, DynamoDB, Bedrock Knowledge Base (S3 Vectors backend), SES

```
Legistar API → EventBridge (nightly) → Lambda (ingestor)
                                              ↓
                                         S3 (raw docs + attachments)
                                              ↓
                                    Bedrock Knowledge Base (S3 Vectors)
                                              ↓
                              Lambda (API) → API Gateway → Frontend
```

## Features (per SPEC.md)

1. Semantic search across all legislation and meeting minutes
2. Plain English summaries — Claude reads full attachment text
3. Alerts & subscriptions (topic, neighborhood, council member, bill)
4. Meeting intelligence — upcoming agendas, public comment deadlines
5. Council member profiles and voting records
6. Neighborhood watch — geo-tagged zoning/permit activity
7. Bill lifecycle tracker
8. Civic dashboard
9. Multi-city support (post-v1)

## v1 Scope (Seattle only)

- [ ] Ingestion pipeline: Legistar → S3 → Bedrock KB sync
- [ ] Semantic search endpoint
- [ ] Plain English bill summaries (generated on ingest, stored in DynamoDB)
- [ ] Civic dashboard API
- [ ] Email digest subscription (SES)

## Project Structure

```
bin/          CDK app entrypoint
lib/          CDK stack definitions
lambda/       Lambda function handlers
assets/       Static assets
test/         CDK and unit tests
SPEC.md       Full product specification
```

## Key Decisions

- **S3 Vectors** as Bedrock KB backend (not OpenSearch Serverless) — avoids $700/mo floor cost
- Summaries generated on ingest and stored — not regenerated per request
- Attachment text fetched from Legistar's Granicus CDN URLs and parsed (DOCX/PDF)
- Multi-city is an architectural concern from day one even though v1 is Seattle-only

## Git Conventions

Use **Conventional Commits** for all commits: `<type>[scope]: <description>`

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `chore` — build, tooling, dependencies
- `refactor` — code change without feature/fix
- `test` — adding or updating tests
- `docs` — documentation only
- `ci` — CI/CD changes

**Examples:**
```
feat(ingestor): add Legistar matter fetching with pagination
fix(search): handle empty query string in semantic search
chore(deps): add @aws-sdk/client-bedrock-runtime
refactor(stack): split civiclens-stack into ingestion and api stacks
```

Use `/commit` skill to generate a conventional commit message from staged changes.

## Commands

```bash
npm run build       # compile TypeScript
npm run watch       # watch mode
npm test            # run jest tests
npx cdk synth       # synthesize CloudFormation
npx cdk deploy      # deploy to AWS
npx cdk diff        # diff against deployed stack
```

## AWS Setup Required

Before deploying, configure AWS credentials:
```bash
aws configure
```
CDK bootstrap (first time per account/region):
```bash
npx cdk bootstrap
```
