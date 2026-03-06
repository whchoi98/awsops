#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsopsStack } from '../lib/awsops-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { AgentCoreStack } from '../lib/agentcore-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-2',
};

// Main infrastructure stack: VPC, ALB, EC2, CloudFront, SSM endpoints
const infra = new AwsopsStack(app, 'AwsopsStack', {
  env,
  description: 'AWSops Dashboard - VPC, ALB, EC2, CloudFront infrastructure',
});

// Cognito authentication stack: User Pool, Lambda@Edge, CloudFront integration
const cognito = new CognitoStack(app, 'AwsopsCognitoStack', {
  env: { account: env.account, region: 'us-east-1' }, // Lambda@Edge must be in us-east-1
  crossRegionReferences: true,
  description: 'AWSops Dashboard - Cognito authentication with Lambda@Edge',
  distribution: infra.distribution,
});
cognito.addDependency(infra);

// AgentCore AI stack (placeholder)
const agentCore = new AgentCoreStack(app, 'AwsopsAgentCoreStack', {
  env,
  description: 'AWSops Dashboard - Bedrock AgentCore Runtime and Gateway',
});
agentCore.addDependency(infra);

app.synth();
