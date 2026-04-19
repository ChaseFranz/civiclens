import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CivicLensStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // v1 resources will be added here:
    // - S3 bucket (raw Legistar documents + attachments)
    // - DynamoDB table (bill summaries, metadata)
    // - Bedrock Knowledge Base (S3 Vectors backend, semantic search)
    // - EventBridge rule (nightly ingestor trigger)
    // - Lambda: ingestor, search API, summary generator
    // - API Gateway (search + dashboard endpoints)
    // - SES (email digest)
  }
}
