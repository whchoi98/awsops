import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * AgentCore Stack - Bedrock AgentCore Runtime and Gateway
 *
 * This stack is a placeholder for the AgentCore AI infrastructure.
 * AgentCore resources (Runtime, Gateway, Lambda functions) are currently
 * deployed via the 06-setup-agentcore.sh script because:
 *
 * 1. AgentCore Runtime and Gateway are not yet available as CloudFormation
 *    resource types (they use CLI/SDK-based provisioning).
 * 2. The ECR image build and push requires Docker runtime context.
 * 3. Lambda functions for MCP tools have complex packaging requirements.
 *
 * When CloudFormation/CDK support is available, this stack should include:
 *
 * - IAM Roles:
 *     - AgentCore Runtime execution role (Bedrock model access, ECR pull)
 *     - AgentCore Gateway execution role (Lambda invoke)
 *     - Lambda execution roles (EC2, VPC, CloudWatch, Steampipe access)
 *
 * - ECR Repository:
 *     - awsops-agent repository for Strands Agent Docker image (arm64)
 *
 * - AgentCore Gateway (ap-northeast-2):
 *     - MCP tool routing to 4 Lambda targets
 *     - Tools: reachability-analyzer, flow-monitor, network-mcp, steampipe-query
 *
 * - AgentCore Runtime (ap-northeast-2):
 *     - Strands Agent with Bedrock Sonnet/Opus 4.6 (us-east-1 cross-region)
 *     - Connected to Gateway for MCP tool access
 *     - ARM64 container on microVM
 *
 * - Lambda Functions (4):
 *     - reachability-analyzer: VPC Reachability Analyzer integration
 *       Tools: analyzeReachability, listInsightsPaths, listAnalyses
 *     - flow-monitor: VPC Flow Logs and security group analysis
 *       Tools: listFlowLogs, queryFlowLogs, findEni, getSecurityGroupRules,
 *              getRouteTables, listVpnConnections
 *     - network-mcp: Advanced network path tracing and TGW analysis
 *       Tools: getPathTraceMethod, getEniDetails, getTgwRoutes,
 *              getTgwAttachments, getSubnetNacls, getVpcConfig, listTransitGateways
 *     - steampipe-query: Pre-defined AWS resource queries (14 query types)
 *       Tools: queryAWSResources
 *
 * - Code Interpreter (ap-northeast-2):
 *     - ID: awsops_code_interpreter-z8d1fmh5Nf
 *     - Python code execution sandbox for data analysis
 *
 * Example future CDK implementation:
 *
 *   // When AWS::BedrockAgentCore::Runtime becomes available:
 *   const runtime = new bedrock_agentcore.Runtime(this, 'AgentRuntime', {
 *     runtimeName: 'awsops_agent',
 *     containerImage: ecr.ContainerImage.fromEcrRepository(repo, 'latest'),
 *     modelId: 'us.anthropic.claude-sonnet-4-6',
 *     memorySize: 2048,
 *   });
 *
 *   // When AWS::BedrockAgentCore::Gateway becomes available:
 *   const gateway = new bedrock_agentcore.Gateway(this, 'AgentGateway', {
 *     gatewayName: 'awsops_gateway',
 *     targets: [
 *       { lambdaFunction: reachabilityFn, tools: [...] },
 *       { lambdaFunction: flowMonitorFn, tools: [...] },
 *       { lambdaFunction: networkMcpFn, tools: [...] },
 *       { lambdaFunction: steampipeQueryFn, tools: [...] },
 *     ],
 *   });
 */
export class AgentCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Placeholder: Tag the stack for identification
    cdk.Tags.of(this).add('Project', 'AWSops');
    cdk.Tags.of(this).add('Component', 'AgentCore');

    new cdk.CfnOutput(this, 'Status', {
      value: 'Placeholder - Deploy via 06-setup-agentcore.sh',
      description: 'AgentCore stack status',
    });

    new cdk.CfnOutput(this, 'AgentRuntimeArn', {
      value: 'arn:aws:bedrock-agentcore:ap-northeast-2:730335239360:runtime/awsops_agent-0gr2NL8TG8',
      description: 'AgentCore Runtime ARN (deployed via script)',
    });

    new cdk.CfnOutput(this, 'CodeInterpreterIdentifier', {
      value: 'awsops_code_interpreter-z8d1fmh5Nf',
      description: 'Code Interpreter ID (ap-northeast-2)',
    });
  }
}
