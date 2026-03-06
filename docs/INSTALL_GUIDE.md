# AWSops Dashboard - Installation Guide

## Architecture Overview

```
Browser → CloudFront (Cognito Auth) → ALB → EC2 (Next.js:3000)
                                                │
                                                ├─ Steampipe (PostgreSQL:9193)
                                                │   ├─ AWS Plugin
                                                │   ├─ Kubernetes Plugin
                                                │   └─ Trivy Plugin (CVE)
                                                │
                                                ├─ Powerpipe (CIS Benchmark)
                                                │
                                                └─ Bedrock AI (us-east-1)
                                                    └─ AgentCore Runtime (Strands)
                                                        └─ AgentCore Gateway (MCP)
                                                            ├─ Lambda: Reachability Analyzer
                                                            ├─ Lambda: Flow Monitor
                                                            ├─ Lambda: Network MCP
                                                            └─ Lambda: Steampipe Query
```

## Dashboard Pages (21 pages)

| Category | Page | Path | Features |
|----------|------|------|----------|
| **Overview** | Dashboard | `/awsops` | Stats, Live Resources, Charts, Warnings |
| | AI Assistant | `/awsops/ai` | Claude Sonnet/Opus 4.6, Steampipe context |
| **Compute** | EC2 | `/awsops/ec2` | Instances, detail panel |
| | Lambda | `/awsops/lambda` | Functions, runtimes |
| | ECS | `/awsops/ecs` | Clusters, services, tasks |
| | EKS | `/awsops/k8s` | Nodes, pods, deployments |
| | EKS Explorer | `/awsops/k8s/explorer` | K9s-style terminal UI |
| **Network** | VPC/Network | `/awsops/vpc` | VPC, Subnet, SG, TGW, ELB, NAT, IGW |
| | Topology | `/awsops/topology` | Interactive resource graph (React Flow) |
| **Storage & DB** | S3 | `/awsops/s3` | Buckets, versioning, public access |
| | RDS | `/awsops/rds` | Instances, engines |
| | DynamoDB | `/awsops/dynamodb` | Tables |
| | ElastiCache | `/awsops/elasticache` | Redis/Memcached clusters |
| **Monitoring** | Monitoring | `/awsops/monitoring` | CPU, Memory, Network, Disk I/O |
| | CloudWatch | `/awsops/cloudwatch` | Alarms |
| | CloudTrail | `/awsops/cloudtrail` | Trails, events |
| | Cost | `/awsops/cost` | Monthly/daily cost, service breakdown |
| **Security** | IAM | `/awsops/iam` | Users, roles, trust policies |
| | Security | `/awsops/security` | Public buckets, open SGs, CVE |
| | CIS Compliance | `/awsops/compliance` | CIS v1.5-v4.0 benchmarks |

## Prerequisites

- AWS Account with admin access
- EC2 Instance (Amazon Linux 2023, t3.medium+)
- Node.js 20+
- Docker
- AWS CLI v2
- kubectl + kubeconfig (for K8s features)
- AWS credentials configured

---

## Installation Steps

### Quick Install (All-in-One)

```bash
# Download and run
curl -sL https://raw.githubusercontent.com/your-repo/awsops/main/scripts/install.sh | bash
```

### Or follow the step-by-step guide below.
