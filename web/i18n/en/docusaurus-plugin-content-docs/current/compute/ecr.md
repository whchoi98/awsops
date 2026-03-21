---
sidebar_position: 4
title: ECR
description: ECR repositories, images, vulnerability scan information
---

import Screenshot from '@site/src/components/Screenshot';

# ECR (Elastic Container Registry)

A page for viewing ECR repository and image information.

<Screenshot src="/screenshots/compute/ecr.png" alt="ECR" />

## Key Features

### Stats Cards
- **Repositories**: Total number of repositories (cyan)
- **Scan on Push**: Number of repositories with automatic scan on image push enabled (green)
- **Immutable Tags**: Number of repositories with tag immutability enabled (purple)

### Repository Table
| Column | Description |
|--------|-------------|
| Repository | Repository name |
| URI | Repository URI (image push/pull address) |
| Tag Mutability | Tag mutability (MUTABLE/IMMUTABLE) |
| Scan | Scan on push enabled status |
| Encryption | Encryption type (AES256/KMS) |
| Created | Creation date |

### Detail Panel
Click a repository to view detailed information:
- **Repository section**: Name, URI, ARN, Registry ID, Tag Mutability, Created, Region
- **Tags section**: Tags configured on the repository

## How to Use

1. Click **Compute > ECR** in the sidebar
2. Review the overall repository status from the stats at the top
3. Identify repositories with Scan on Push disabled
4. Click a repository to view detailed URI and settings

## Security Configuration Guide

### Scan on Push
- **Recommended**: Enable on all repositories
- Automatically runs vulnerability scan on image push
- Discovered CVEs can be viewed on the Security page

### Immutable Tags
- **Recommended**: Enable on production repositories
- Tags pushed once cannot be overwritten
- Useful for deployment tracking and rollback

### Encryption
- **AES256**: Default AWS managed encryption
- **KMS**: When using Customer Managed Keys (CMK)

## Tips

:::tip Enable Scan on Push
Repositories with "No" in the Scan column have vulnerability scanning disabled. We recommend enabling it for security.
:::

:::tip Copy Image URI
You can find the full address for `docker pull` or `docker push` in the URI field of the detail panel.
:::

:::info AI Analysis
You can analyze with the AI Assistant using queries like "ECR repository list", "Find repositories with scan disabled", "Analyze container image vulnerabilities", etc.
:::

## Related Pages

- [ECS](../compute/ecs) - ECS services using ECR images
- [EKS](../compute/eks) - EKS clusters using ECR images
- [Security](../security) - Image vulnerabilities (CVE) check
