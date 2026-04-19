import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CivicLensStack } from '../lib/stacks/civiclens-stack';

test('CivicLensStack synthesizes without errors', () => {
  const app = new cdk.App();
  const stack = new CivicLensStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  expect(Template.fromStack(stack)).toBeDefined();
});
