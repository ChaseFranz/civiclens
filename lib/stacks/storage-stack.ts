import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StageConfig } from '../config';

export interface StorageStackProps extends cdk.StackProps {
  stage: StageConfig;
}

export class StorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Resources added in subsequent tasks:
    // - S3 bucket (raw Legistar documents + parsed text + KB source docs)
    // - DynamoDB: civiclens-matters, civiclens-events, civiclens-subscriptions, civiclens-ingest-state
  }
}
