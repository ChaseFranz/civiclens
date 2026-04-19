import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class FoundationStack extends cdk.Stack {
  public readonly githubOidcProvider: iam.IOpenIdConnectProvider;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // One OIDC provider per AWS account — creating a second for the same issuer URL fails.
    // All GithubOidcStacks in this account share this provider.
    this.githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
  }
}
