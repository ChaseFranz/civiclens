export const GITHUB_ORG = 'ChaseFranz';
export const GITHUB_REPO = 'civiclens';

export interface StageConfig {
  name: string;
  account: string;
  region: string;
  branch: string; // GitHub branch that deploys to this stage
}

export const stages: StageConfig[] = [
  {
    name: 'prod',
    account: '027375206117',
    region: 'us-east-1',
    branch: 'main',
  },
];
