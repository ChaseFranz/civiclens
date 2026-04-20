# CivicLens

A civic intelligence platform that makes local government activity accessible to everyday residents. Monitors city council legislation, meeting agendas, and votes — then surfaces it in plain English via AI-powered summaries, semantic search, and personalized alerts.

Built on the [Legistar Web API](https://webapi.legistar.com) (Granicus) with AWS CDK, Lambda, Bedrock, and SES.

## Prerequisites

- Node.js 22+
- AWS CLI configured (`aws configure` or SSO login)
- CDK bootstrapped in your target account/region (`npx cdk bootstrap`)

## Commands

```bash
npm run build       # compile TypeScript
npm run watch       # watch mode
npm test            # run jest tests
npx cdk synth       # synthesize CloudFormation template
npx cdk diff        # diff against deployed stack
npx cdk deploy      # deploy to AWS
```

## Architecture

```
Legistar API → EventBridge (nightly) → Lambda (ingestor)
                                              ↓
                                    S3 (raw docs + attachments)
                                              ↓
                               Bedrock Knowledge Base (S3 Vectors)
                                              ↓
                             Lambda (API) → API Gateway → Frontend
```

## Deployment

Pushes to `main` deploy automatically via GitHub Actions using OIDC (no stored AWS credentials). See `.github/workflows/deploy.yml`.

To add a new environment, add an entry to `lib/config.ts` and create a matching GitHub Actions environment with `AWS_ROLE_ARN` and `AWS_REGION` configured.

## Docs

- [SPEC.md](SPEC.md) — product spec, personas, user stories
- [DESIGN.md](DESIGN.md) — technical design for v1
- [PLAN.md](PLAN.md) — phased implementation plan
- [TASKS.md](TASKS.md) — discrete task breakdown
