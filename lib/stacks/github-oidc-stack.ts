import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { GITHUB_ORG, GITHUB_REPO, StageConfig } from '../config';

interface GithubOidcStackProps extends cdk.StackProps {
  stage: StageConfig;
  githubOidcProvider: iam.IOpenIdConnectProvider;
}

export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { stage, githubOidcProvider } = props;

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: `civiclens-github-deploy-${stage.name}`,
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringLike: {
          // Jobs with `environment:` set send this sub claim format, not ref:refs/heads/*
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:${stage.name}`,
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
      description: `GitHub Actions deploy role for ${stage.name} - branch: ${stage.branch}`,
    });

    // Assumes CDK bootstrap roles only — those hold the scoped CloudFormation permissions
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${stage.account}:role/cdk-*`],
    }));

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: `Set as AWS_ROLE_ARN in the GitHub Actions "${stage.name}" environment`,
    });
  }
}
