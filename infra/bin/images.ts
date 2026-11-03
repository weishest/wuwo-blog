#!/usr/bin/env node
/**
 * CDK app entry. Runs on plain Node (type stripping), no ts-node.
 *
 *   npx cdk deploy -c allowedOrigin=https://<user>.github.io
 *   npx cdk deploy -c allowedOrigin=https://blog.example.com -c domainName=img.example.com -c certificateArn=arn:aws:acm:us-east-1:…
 */
import { App } from 'aws-cdk-lib';
import { ImagesStack, RESOURCE_PREFIX } from '../lib/images-stack.ts';

const app = new App();
const context = (key: string): string | undefined => {
  const value: unknown = app.node.tryGetContext(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const allowedOrigin = context('allowedOrigin');
if (!allowedOrigin) {
  fail('Set "allowedOrigin" in infra/cdk.json to the blog origin, e.g. "https://<user>.github.io" (or pass -c allowedOrigin=…).');
}
if (!/^https:\/\/[^/]+$/.test(allowedOrigin)) {
  fail(`allowedOrigin must be an https origin without a path or trailing slash, got "${allowedOrigin}".`);
}
const domainName = context('domainName');
const certificateArn = context('certificateArn');
if ((domainName === undefined) !== (certificateArn === undefined)) {
  fail('domainName and certificateArn go together (the certificate must be in us-east-1).');
}
const policyName = context('policyName');
if (policyName && !policyName.startsWith(RESOURCE_PREFIX)) {
  fail(`policyName must start with "${RESOURCE_PREFIX}": the CloudFormation execution policy only allows those names.`);
}

new ImagesStack(app, context('stackName') ?? 'WuwoBlogImages', {
  allowedOrigin,
  domainName,
  certificateArn,
  policyName,
  description: 'Blog images: private S3 bucket behind CloudFront, plus the publisher IAM policy',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
