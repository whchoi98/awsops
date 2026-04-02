---
sidebar_position: 5
title: EKS Authentication Setup
description: Guide for authenticating AWSops EC2 instance to EKS clusters
---

# EKS Authentication Setup

The AWSops Kubernetes dashboard (`/k8s/*`) queries EKS cluster data through Steampipe's `kubernetes` plugin. For this to work, the **AWSops EC2 instance role must be authenticated to the EKS cluster**.

## Authentication Architecture

```
EC2 Instance Role (IAM Role)
  → kubeconfig (aws eks update-kubeconfig)
    → EKS API Server
      → Access Entry or aws-auth ConfigMap validation
        → Kubernetes API access granted
          → Steampipe kubernetes plugin → Dashboard display
```

## Prerequisites

### 1. Find EC2 Instance Role ARN

SSH into the AWSops EC2 instance and run:

```bash
# Get EC2 instance role ARN
aws sts get-caller-identity --query "Arn" --output text

# Example output: arn:aws:sts::123456789012:assumed-role/AwsopsEc2Role/i-0abc123
# → IAM Role ARN: arn:aws:iam::123456789012:role/AwsopsEc2Role
```

:::tip ARN Conversion
Convert `sts:assumed-role` format to `iam:role` format:
- `arn:aws:sts::ACCOUNT:assumed-role/ROLE_NAME/i-xxx`
- → `arn:aws:iam::ACCOUNT:role/ROLE_NAME`
:::

### 2. Check EKS Cluster Authentication Mode

```bash
aws eks describe-cluster --name CLUSTER_NAME \
  --query 'cluster.accessConfig.authenticationMode' \
  --output text
```

| Auth Mode | Description | Recommended Method |
|-----------|-------------|-------------------|
| `API` | Access Entry API only | **Method 1** |
| `API_AND_CONFIG_MAP` | Both Access Entry and aws-auth | **Method 1** (recommended) |
| `CONFIG_MAP` | aws-auth ConfigMap only | **Method 2** |

## Method 1: Access Entry API

:::info Permission Requirements
The following commands require **`eks:CreateAccessEntry` and `eks:AssociateAccessPolicy` permissions** on the EKS cluster. Run them as the account or IAM principal that created the cluster, or one with admin access.
:::

### Step 1: Create Access Entry

```bash
aws eks create-access-entry \
  --cluster-name CLUSTER_NAME \
  --principal-arn arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME \
  --type STANDARD
```

### Step 2: Associate ClusterAdmin Policy

```bash
aws eks associate-access-policy \
  --cluster-name CLUSTER_NAME \
  --principal-arn arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster
```

:::tip Least Privilege
For read-only access, use `AmazonEKSViewPolicy` instead of `AmazonEKSClusterAdminPolicy`. Note that some Steampipe CRD table queries may be restricted.
:::

### Step 3: Generate kubeconfig

Run on the AWSops EC2 instance:

```bash
aws eks update-kubeconfig \
  --name CLUSTER_NAME \
  --region ap-northeast-2
```

### Step 4: Configure Steampipe K8s Plugin

```bash
cat > ~/.steampipe/config/kubernetes.spc << 'EOF'
connection "kubernetes" {
  plugin = "kubernetes"
  custom_resource_tables = ["*"]
}
EOF

# Restart Steampipe service
sudo systemctl restart steampipe
```

### Step 5: Test Connection

```bash
# kubectl test
kubectl get nodes

# Steampipe test
steampipe query "SELECT name, phase FROM kubernetes_namespace LIMIT 5"
```

## Method 2: aws-auth ConfigMap

For clusters in `CONFIG_MAP` mode, you must add the IAM role directly to the `aws-auth` ConfigMap in the `kube-system` namespace.

:::info Permission Requirements
The `kubectl edit` command must be run by an **administrator already authenticated to the cluster** — the IAM principal that created the cluster or an existing `system:masters` group member.
:::

### Step 1: Edit aws-auth ConfigMap

```bash
kubectl edit configmap aws-auth -n kube-system
```

### Step 2: Add EC2 Role to mapRoles

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    # Keep existing roles
    - rolearn: arn:aws:iam::ACCOUNT_ID:role/EXISTING_ROLE
      username: existing-user
      groups:
        - system:masters
    # Add AWSops EC2 role
    - rolearn: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME
      username: awsops-ec2
      groups:
        - system:masters
```

:::caution Editing aws-auth
Incorrectly modifying the `aws-auth` ConfigMap can lock you out of the cluster. Always back up before editing:
```bash
kubectl get configmap aws-auth -n kube-system -o yaml > aws-auth-backup.yaml
```
:::

### Step 3: kubeconfig + Steampipe Setup

Same as Method 1, Steps 3–5.

## Multi-Cluster Setup

To monitor multiple EKS clusters, repeat the authentication setup for each:

```bash
# Add kubeconfig for each cluster
aws eks update-kubeconfig --name cluster-1 --region ap-northeast-2
aws eks update-kubeconfig --name cluster-2 --region ap-northeast-2

# Multiple contexts registered
kubectl config get-contexts
```

Steampipe queries the `current-context` cluster. To switch:

```bash
kubectl config use-context arn:aws:eks:ap-northeast-2:ACCOUNT:cluster/CLUSTER_NAME
sudo systemctl restart steampipe
```

## Cross-Account EKS Access

To access EKS clusters in other AWS accounts:

1. Create an Access Entry in the **target account** for the AWSops EC2 role (see Method 1)
2. You may need `AssumeRole` setup for the target account's IAM role
3. Add `--role-arn` to kubeconfig:

```bash
aws eks update-kubeconfig \
  --name CLUSTER_NAME \
  --region ap-northeast-2 \
  --role-arn arn:aws:iam::TARGET_ACCOUNT:role/EKSAccessRole
```

## Automated Setup Script

AWSops includes a script that automates the above process:

```bash
bash scripts/04-setup-eks-access.sh
```

This script automatically:
1. Installs kubectl
2. Discovers EKS clusters (current region + 6 additional regions)
3. Generates kubeconfig
4. Detects auth mode and creates Access Entry or provides aws-auth instructions
5. Configures Steampipe kubernetes plugin
6. Tests connectivity

## Troubleshooting

### "error: You must be logged in to the server"

kubeconfig is missing or expired:
```bash
aws eks update-kubeconfig --name CLUSTER_NAME --region REGION
```

### "AccessDeniedException: User is not authorized"

The EC2 role lacks EKS API permissions. Add this to the IAM policy:
```json
{
  "Effect": "Allow",
  "Action": [
    "eks:DescribeCluster",
    "eks:ListClusters"
  ],
  "Resource": "*"
}
```

### "error: exec plugin: invalid apiVersion"

You may be using AWS CLI v1. Upgrade to v2:
```bash
aws --version  # Verify aws-cli/2.x
```

### Steampipe K8s Tables Not Visible

Check Steampipe K8s plugin configuration:
```bash
cat ~/.steampipe/config/kubernetes.spc
# Verify plugin = "kubernetes"
sudo systemctl restart steampipe
```

## Related Pages

- [EKS Overview](./eks) — EKS cluster dashboard
- [EKS Explorer](./eks-explorer) — K9s-style terminal UI
- [Deployment Guide](../getting-started/deployment) — Full deployment process
