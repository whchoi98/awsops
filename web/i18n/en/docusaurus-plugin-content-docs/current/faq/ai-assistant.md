---
sidebar_position: 3
---

# AI Assistant FAQ

Questions and answers about the AWSops AI assistant.

<details>
<summary>What questions can I ask?</summary>

The AI assistant answers various questions through 10 specialized routes:

**1. Code (Code Execution)**
- "Analyze this data for me"
- "Draw a chart with Python"
- Execute Python code via Code Interpreter

**2. Network (Network Analysis)**
- "I can't connect from EC2 instance A to B"
- "Check VPC peering routing"
- "Analyze Security Group rules"

**3. Container (Container Analysis)**
- "EKS Pod is in Pending state"
- "What caused the ECS service deployment failure?"
- "Analyze Istio service mesh issues"

**4. IaC (Infrastructure as Code)**
- "Review this CDK code"
- "Why did the CloudFormation stack creation fail?"
- "Tell me Terraform best practices"

**5. Data (Database)**
- "RDS connection is slow"
- "What's causing DynamoDB throttling?"
- "How to resolve ElastiCache memory shortage"

**6. Security (Security)**
- "Analyze permissions in this IAM policy"
- "Simulate S3 bucket access permissions"
- "How to set up cross-account roles"

**7. Monitoring (Monitoring)**
- "How to set up CloudWatch alarms"
- "Find specific events in CloudTrail"
- "Analyze EC2 CPU usage trends"

**8. Cost (Cost)**
- "Analyze this month's costs"
- "What caused the cost spike?"
- "Recommend cost optimization strategies"

**9. AWS Data (Resource Listing/Status)**
- "Show me EC2 instance list"
- "Check RDS instance status"
- "Lambda function statistics by runtime"

**10. General (General)**
- AWS-related questions not fitting the above categories

</details>

<details>
<summary>What if the AI gives an incorrect answer?</summary>

The AI assistant is based on Amazon Bedrock (Claude Sonnet/Opus 4.6).

**Data Accuracy**
- AWS resource data is queried **in real-time** through Steampipe
- The data itself is accurate, but the AI's **interpretation** may be incorrect

**How to Handle Incorrect Answers**

1. **Verify with Follow-up Questions**
   - "What's the source of that information?"
   - "Explain in more detail"

2. **Verify Directly**
   - Check data directly on the relevant dashboard page
   - Validate in the AWS Console

3. **Provide Feedback**
   - Say "That's wrong" or "Please check again" in the conversation to trigger re-analysis
   - Pointing out specific errors enables more accurate responses

**AI Limitations**
- Cannot immediately detect real-time events (ongoing incidents)
- Latest AWS service features may not be in the training data
- May not account for account-specific special configurations or SCP restrictions

</details>

<details>
<summary>Is conversation history saved?</summary>

Yes, conversation history is saved per user.

**Storage Location**
- Server: `data/memory/` directory
- Separated by user: Based on Cognito user ID (sub)

**Retention Period**
- Up to 365 days
- Uses AgentCore Memory Store

**How to View**
- Conversation history can be searched on the AgentCore dashboard page
- Filter by date or keyword

**Privacy Protection**
- Conversation history is accessible only to the respective user
- Other users' conversation history cannot be viewed
- Server administrators can access via file system

**Deletion Request**
Currently, there is no direct deletion feature in the UI. Request an administrator or delete directly on the server:
```bash
rm data/memory/<user-sub>/*
```

</details>

<details>
<summary>Can code be executed?</summary>

Yes, Python code can be executed through the Code Interpreter.

**How to Use**
- "Analyze with Python"
- "Calculate with code"
- "Draw a chart"
- Questions about data analysis and visualization

**Supported Features**
- Python 3.x execution environment
- Key libraries: pandas, numpy, matplotlib, seaborn
- File I/O (within temporary directory)
- Chart/graph generation

**Limitations**
- Sandbox environment (network access restricted)
- Execution time limits
- Cannot call AWS APIs directly (AI queries data first, then analyzes)

**Example Questions**
- "Show me EC2 instance cost by type as a pie chart"
- "Analyze CloudTrail events over the last 30 days by time period"
- "Calculate Lambda function memory usage statistics"

</details>

<details>
<summary>What tools are used?</summary>

The AI assistant uses 125 MCP (Model Context Protocol) tools.

**Gateway Configuration (8)**

| Gateway | Purpose | Key Tools |
|---------|---------|-----------|
| Network | Network analysis | Reachability Analyzer, Flow Logs, TGW, VPN |
| Container | Container analysis | EKS, ECS, Istio diagnostics |
| IaC | Infrastructure code | CDK, CloudFormation, Terraform |
| Data | Database | DynamoDB, RDS, ElastiCache, MSK |
| Security | Security | IAM simulation, policy analysis |
| Monitoring | Monitoring | CloudWatch, CloudTrail |
| Cost | Cost | CE API, budgets, forecasts |
| Ops | Operations | General AWS operations |

**Lambda Functions (19)**
Lambda functions execute as backends for each Gateway.

**Tool Usage Display**
The UI shows which tools were used in AI responses. This is inferred based on keywords in the response content.

</details>

<details>
<summary>What to do when responses are slow?</summary>

Common causes of AI response delays and their solutions.

**1. AgentCore Runtime Cold Start**
- First request takes time to start the container (10-30 seconds)
- Subsequent requests are fast (Warm state)
- Solution: Periodic health checks to maintain Warm state

**2. Complex Questions**
- Questions involving multiple Gateways take longer
- Solution: Split into simpler questions
- Example: "Analyze network issues and also check costs" -> Split into two questions

**3. Large Data Queries**
- CloudTrail events, large resource lists
- Solution: Specify time period or filter conditions
- Example: "CloudTrail events from the last 1 hour" or "EC2 instances with production tag only"

**4. Network Latency**
- Path: CloudFront -> ALB -> EC2 -> AgentCore
- Solution: Check CloudFront Origin Timeout settings (60 seconds recommended)

**Streaming Responses**
AI responses are streamed via SSE (Server-Sent Events). Text is displayed in real-time without waiting for the complete response.

**Timeout**
- Default timeout: 120 seconds
- If timeout occurs, simplify the question or try again

</details>
