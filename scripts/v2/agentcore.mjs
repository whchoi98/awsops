#!/usr/bin/env node
// AWSops v2 P1f: build arm64 agent image -> push ECR -> run idempotent boto3 provisioner.
// Run AFTER `terraform apply` (with agentcore_enabled=true) AND AFTER `make migrate`.
// `make migrate` is what creates the awsops_sql_reader DB role and syncs its password from Secrets
// Manager; this script does neither. Skipping it leaves execute_sql and inventory-read failing Data
// API auth, which looks like a credential problem rather than a missing migration
// (docs/runbooks/agent-sql-reader.md). Pass --smoke to invoke after provisioning.
import { execSync } from 'node:child_process';

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const CHDIR = 'terraform/v2/foundation';
const TAG = process.env.AGENT_IMAGE_TAG || 'agent-latest';
const DOCKER = process.env.DOCKER || 'sudo docker';
const SMOKE = process.argv.includes('--smoke') ? '--smoke' : '';

const tfJson = () => JSON.parse(execSync(`terraform -chdir=${CHDIR} output -json`, { encoding: 'utf8' }));
const sh = (cmd) => execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' });

const ac = tfJson().agentcore?.value;
if (!ac) {
  console.error('agentcore output is null — set agentcore_enabled=true in terraform.tfvars and `terraform apply` first.');
  process.exit(1);
}
const repo = ac.ecr_uri;
const registry = repo.split('/')[0];

console.log(`\n[1/3] ECR login -> ${registry}`);
sh(`aws ecr get-login-password --region ${ac.region || REGION} | ${DOCKER} login --username AWS --password-stdin ${registry}`);

console.log(`\n[2/3] build + push arm64 agent image -> ${repo}:${TAG}`);
sh(`${DOCKER} buildx build --platform linux/arm64 -t ${repo}:${TAG} --push agent/`);

console.log(`\n[3/3] idempotent AgentCore provision (Runtime/Gateways/Targets/Memory/Interpreter -> SSM)`);
sh(`python3 scripts/v2/agentcore/provision.py ${SMOKE}`.trim());

console.log('\n✅ make agentcore complete');
