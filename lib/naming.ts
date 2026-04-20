import type { StageConfig } from './config';

export const APP_NAME = 'civiclens';

const S3_SAFE = /^[a-z0-9-]+$/;

/**
 * Lowercase resource name: civiclens-prod-us-east-1-matters
 * Use for DynamoDB tables, Lambda functions, IAM roles, log groups, SQS queues, etc.
 */
export function resourceName(stage: StageConfig, name: string): string {
  return `${APP_NAME}-${stage.name}-${stage.region}-${name}`;
}

/**
 * Globally-unique S3 bucket name: civiclens-prod-us-east-1-raw-027375206117
 * S3 buckets share a global namespace, so we suffix the account ID.
 */
export function bucketName(stage: StageConfig, name: string): string {
  const candidate = `${resourceName(stage, name)}-${stage.account}`;
  if (!S3_SAFE.test(candidate)) {
    throw new Error(`Invalid S3 bucket name "${candidate}" — stage.name, stage.region, and name must match ${S3_SAFE}`);
  }
  return candidate;
}
