#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CivicLensStack } from '../lib/stacks/civiclens-stack';
import { FoundationStack } from '../lib/stacks/foundation-stack';
import { GithubOidcStack } from '../lib/stacks/github-oidc-stack';
import { stages } from '../lib/config';

const app = new cdk.App();

// One FoundationStack per AWS account — holds the GitHub OIDC provider (AWS enforces one per issuer URL per account).
// All stages in the same account share it.
const foundationByAccount = new Map<string, FoundationStack>();

for (const stage of stages) {
  const env = { account: stage.account, region: stage.region };

  if (!foundationByAccount.has(stage.account)) {
    foundationByAccount.set(
      stage.account,
      new FoundationStack(app, `Foundation-${stage.account}`, { env }),
    );
  }
  const foundation = foundationByAccount.get(stage.account)!;

  new CivicLensStack(app, `CivicLens-${stage.name}`, { env });

  new GithubOidcStack(app, `GithubOidc-${stage.name}`, {
    stage,
    githubOidcProvider: foundation.githubOidcProvider,
    env,
  });
}
