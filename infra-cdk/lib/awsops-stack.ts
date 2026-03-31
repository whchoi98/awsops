import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class AwsopsStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly distribution: cloudfront.Distribution;
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------
    // Parameters
    // -------------------------------------------------------
    const instanceType = new cdk.CfnParameter(this, 'InstanceType', {
      type: 'String',
      default: 't4g.2xlarge',
      allowedValues: [
        't4g.xlarge', 't4g.2xlarge',
        't3.large', 't3.xlarge', 't3.2xlarge',
        'm7g.xlarge', 'm7g.2xlarge',
        'm7i.xlarge', 'm7i.2xlarge',
      ],
      description: 'EC2 instance type for the AWSops server',
    });

    const vscodePassword = new cdk.CfnParameter(this, 'VSCodePassword', {
      type: 'String',
      noEcho: true,
      minLength: 8,
      description: 'Password for VSCode Server (minimum 8 characters)',
    });

    const cloudFrontPrefixListId = new cdk.CfnParameter(this, 'CloudFrontPrefixListId', {
      type: 'String',
      description: 'CloudFront origin-facing managed prefix list ID (pl-22a6434b for ap-northeast-2)',
    });

    // 기존 VPC ID (빈 값이면 새 VPC 생성) / Existing VPC ID (empty = create new VPC)
    const existingVpcId = new cdk.CfnParameter(this, 'ExistingVpcId', {
      type: 'String',
      default: '',
      description: 'Existing VPC ID to use. Leave empty to create a new VPC.',
    });

    // -------------------------------------------------------
    // VPC: 기존 VPC 사용 또는 새로 생성 / Use existing or create new
    // -------------------------------------------------------

    // 기존 VPC 조회 또는 새 VPC 생성 / Lookup existing or create new
    const newVpcCidr = (this.node.tryGetContext('newVpcCidr') as string) || '10.10.0.0/16';
    if (this.node.tryGetContext('useExistingVpc') === 'true') {
      // 기존 VPC 사용 모드 / Use existing VPC mode
      const vpcId = this.node.tryGetContext('vpcId') || '';
      this.vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId }) as unknown as ec2.Vpc;
    } else {
      // 새 VPC 생성 모드 / Create new VPC mode
      this.vpc = new ec2.Vpc(this, 'VPC', {
        ipAddresses: ec2.IpAddresses.cidr(newVpcCidr),
        maxAzs: 2,
        natGateways: 1,
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });
      // 새 VPC에 이름 태그 / Tag new VPC with name
      cdk.Tags.of(this.vpc).add('Name', `${this.stackName}-VPC`);
    }

    // -------------------------------------------------------
    // Transit Gateway Attachment (optional, both new and existing VPC)
    // -------------------------------------------------------
    const tgwId = this.node.tryGetContext('transitGatewayId') as string | undefined;
    if (tgwId) {
      const tgwAttachment = new ec2.CfnTransitGatewayAttachment(this, 'TGWAttachment', {
        transitGatewayId: tgwId,
        vpcId: this.vpc.vpcId,
        subnetIds: this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
        tags: [{ key: 'Name', value: `${this.stackName}-TGW-Attachment` }],
      });

      // Multiple TGW route CIDRs (comma-separated) with backward compat
      const tgwRouteCidrsStr = (this.node.tryGetContext('tgwRouteCidrs') as string)
        || (this.node.tryGetContext('tgwRouteCidr') as string)
        || '';
      const tgwRouteCidrs = tgwRouteCidrsStr
        ? tgwRouteCidrsStr.split(',').map((c: string) => c.trim()).filter(Boolean)
        : [];

      tgwRouteCidrs.forEach((cidr: string, cidrIdx: number) => {
        this.vpc.privateSubnets.forEach((subnet, subnetIdx) => {
          const routeId = tgwRouteCidrs.length === 1
            ? `TGWRoute${subnetIdx}`
            : `TGWRoute-S${subnetIdx}-C${cidrIdx}`;
          new ec2.CfnRoute(this, routeId, {
            routeTableId: subnet.routeTable.routeTableId,
            destinationCidrBlock: cidr,
            transitGatewayId: tgwId,
          }).addDependency(tgwAttachment);
        });
      });

      new cdk.CfnOutput(this, 'TGWAttachmentId', {
        value: tgwAttachment.ref,
        description: 'Transit Gateway Attachment ID',
      });
    }

    // -------------------------------------------------------
    // Security Groups
    // -------------------------------------------------------

    // ALB SG: CloudFront에서만 접근 허용 / Allow from CloudFront only
    const albSg = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'awsops-alb-sg',
      description: 'AWSops ALB SG - CloudFront origin-facing only',
      allowAllOutbound: true,
    });
    // Use single port range (80-3000) to stay within SG rules limit
    // CloudFront prefix list has 120+ entries; each entry counts as 1 rule
    new ec2.CfnSecurityGroupIngress(this, 'ALBIngressFromCloudFront', {
      groupId: albSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 80,
      toPort: 3000,
      sourcePrefixListId: cloudFrontPrefixListId.valueAsString,
      description: 'HTTP/Dashboard ports from CloudFront origin-facing',
    });

    // EC2 SG: ALB에서만 접근 허용 / Allow from ALB only
    const ec2Sg = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
      vpc: this.vpc,
      securityGroupName: 'awsops-ec2-sg',
      description: 'AWSops EC2 SG - ALB traffic only',
      allowAllOutbound: true,
    });
    ec2Sg.addIngressRule(albSg, ec2.Port.tcp(8888), 'VSCode from ALB');
    ec2Sg.addIngressRule(albSg, ec2.Port.tcp(3000), 'Dashboard from ALB');

    // -------------------------------------------------------
    // SSM VPC Endpoints: skipVpcEndpoints=true이면 건너뜀
    // SSM VPC Endpoints: skip if context skipVpcEndpoints=true
    // 00-deploy-infra.sh에서 기존 VPC의 endpoint 존재 여부를 확인 후 context 전달
    // The deploy script checks if endpoints already exist and passes context
    // -------------------------------------------------------
    if (this.node.tryGetContext('skipVpcEndpoints') !== 'true') {
      const ssmSg = new ec2.SecurityGroup(this, 'SSMSecurityGroup', {
        vpc: this.vpc,
        description: 'SSM VPC Endpoints SG - HTTPS from VPC CIDR',
        allowAllOutbound: true,
      });
      // 기존 VPC는 CIDR이 다를 수 있으므로 0.0.0.0/0 대신 VPC CIDR 사용
      // Use VPC CIDR instead of hardcoded range for existing VPCs
      const vpcCidr = this.node.tryGetContext('useExistingVpc') === 'true'
        ? (this.node.tryGetContext('vpcCidr') || '10.0.0.0/8')
        : newVpcCidr;
      ssmSg.addIngressRule(ec2.Peer.ipv4(vpcCidr), ec2.Port.tcp(443), 'HTTPS from VPC CIDR');

      new ec2.InterfaceVpcEndpoint(this, 'SSMEndpoint', {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [ssmSg],
        privateDnsEnabled: true,
      });

      new ec2.InterfaceVpcEndpoint(this, 'SSMMessagesEndpoint', {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [ssmSg],
        privateDnsEnabled: true,
      });

      new ec2.InterfaceVpcEndpoint(this, 'EC2MessagesEndpoint', {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [ssmSg],
        privateDnsEnabled: true,
      });
    } // skipVpcEndpoints=true: 기존 endpoint 존재 시 건너뜀 / skip if already exist

    // -------------------------------------------------------
    // IAM Role for EC2 (SSM + CloudWatch)
    // -------------------------------------------------------
    // EC2 역할: SSM + CloudWatch + ReadOnlyAccess (Steampipe 필수)
    // EC2 Role: SSM + CloudWatch + ReadOnlyAccess (required for Steampipe)
    const ec2Role = new iam.Role(this, 'EC2Role', {
      roleName: 'awsops-ec2-role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        // Steampipe가 AWS 리소스를 조회하려면 ReadOnlyAccess 필요
        // ReadOnlyAccess required for Steampipe to query AWS resources
        iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
      ],
      description: 'AWSops EC2 role - SSM, CloudWatch, ReadOnlyAccess for Steampipe',
    });

    // Bedrock model invoke permissions (AI assistant uses Sonnet/Opus 4.6 via global inference profiles)
    ec2Role.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        'arn:aws:bedrock:*:*:inference-profile/global.*',
        'arn:aws:bedrock:*::foundation-model/anthropic.*',
      ],
    }));

    // -------------------------------------------------------
    // EC2 Instance (Private Subnet, ARM64 Graviton by default)
    // -------------------------------------------------------
    // Determine AMI based on instance type (ARM64 for t4g/m7g, x86 otherwise)
    const al2023Arm64 = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });
    const al2023x86 = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // UserData script for Node.js, Docker, Steampipe, code-server
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -euxo pipefail',
      'exec > >(tee /var/log/user-data.log) 2>&1',
      'echo "Starting user-data script at $(date)"',
      '',
      '# System update',
      'dnf update -y --allowerasing',
      'dnf install -y --allowerasing curl jq tar gzip python3 python3-pip',
      'pip3 install boto3 click bedrock-agentcore',
      '',
      '# Development tools (required for native npm modules)',
      'dnf groupinstall -y "Development Tools" || dnf install -y gcc gcc-c++ make || echo "[WARN] Dev tools install failed"',
      '',
      '# Node.js 20',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - || true',
      'dnf install -y nodejs || true',
      'if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then',
      '  curl -fsSL https://fnm.vercel.app/install | bash',
      '  export FNM_DIR="/root/.local/share/fnm"',
      '  export PATH="$FNM_DIR:$PATH"',
      '  eval "$(fnm env)"',
      '  fnm install 20 && fnm use 20',
      '  ln -sf "$(which node)" /usr/local/bin/node',
      '  ln -sf "$(which npm)" /usr/local/bin/npm',
      '  ln -sf "$(which npx)" /usr/local/bin/npx',
      'fi',
      'echo "Node.js version: $(node -v)"',
      '',
      '# AWS CLI v2',
      'ARCH=$(uname -m)',
      'if [ "$ARCH" = "aarch64" ]; then',
      '  curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o awscliv2.zip',
      'else',
      '  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip',
      'fi',
      'unzip -q awscliv2.zip && ./aws/install && rm -rf aws awscliv2.zip',
      '',
      '# Docker',
      'dnf install -y docker',
      'systemctl enable docker && systemctl start docker',
      'usermod -aG docker ec2-user',
      '',
      '# Steampipe',
      '# Steampipe: install as root (/usr/local/bin requires root), plugins as ec2-user',
      'curl -fsSL https://steampipe.io/install/steampipe.sh | sh',
      'sudo -u ec2-user steampipe plugin install aws kubernetes trivy || true',
      '',
      '# code-server',
      'cd /tmp',
      'if [ "$ARCH" = "aarch64" ]; then',
      '  CS_PKG="code-server-4.106.3-linux-arm64"',
      'else',
      '  CS_PKG="code-server-4.106.3-linux-amd64"',
      'fi',
      'wget -q "https://github.com/coder/code-server/releases/download/v4.106.3/${CS_PKG}.tar.gz"',
      'tar -xzf "${CS_PKG}.tar.gz"',
      'mv "${CS_PKG}" /usr/local/lib/code-server',
      'ln -sf /usr/local/lib/code-server/bin/code-server /usr/local/bin/code-server',
      'rm -f "${CS_PKG}.tar.gz"',
      '',
      '# Configure code-server',
      'mkdir -p /home/ec2-user/.config/code-server',
      `cat > /home/ec2-user/.config/code-server/config.yaml <<CSEOF`,
      'bind-addr: 0.0.0.0:8888',
      'auth: password',
      `password: "${vscodePassword.valueAsString}"`,
      'cert: false',
      'CSEOF',
      'chown -R ec2-user:ec2-user /home/ec2-user/.config',
      '',
      '# code-server systemd service',
      'cat > /etc/systemd/system/code-server.service <<SVCEOF',
      '[Unit]',
      'Description=code-server',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'User=ec2-user',
      'WorkingDirectory=/home/ec2-user',
      `Environment="PASSWORD=${vscodePassword.valueAsString}"`,
      'ExecStart=/usr/local/bin/code-server --config /home/ec2-user/.config/code-server/config.yaml',
      'Restart=always',
      'RestartSec=10',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'SVCEOF',
      'systemctl daemon-reload && systemctl enable code-server && systemctl start code-server',
      '',
      '# CloudWatch agent',
      'if [ "$ARCH" = "aarch64" ]; then',
      '  wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/arm64/latest/amazon-cloudwatch-agent.rpm || true',
      'else',
      '  wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm || true',
      'fi',
      '[ -f amazon-cloudwatch-agent.rpm ] && rpm -U ./amazon-cloudwatch-agent.rpm || true',
      'rm -f amazon-cloudwatch-agent.rpm',
      '',
      'echo "AWSops server setup completed at $(date)"',
    );

    // Use ARM64 AMI by default (t4g.2xlarge is ARM64 Graviton)
    this.instance = new ec2.Instance(this, 'AWSopsServer', {
      instanceName: 'awsops-server',
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: new ec2.InstanceType(instanceType.valueAsString),
      machineImage: al2023Arm64,
      securityGroup: ec2Sg,
      role: ec2Role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(100, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });
    cdk.Tags.of(this.instance).add('Name', `${this.stackName}-AWSops-Server`);

    // -------------------------------------------------------
    // Application Load Balancer (Internet-facing)
    // -------------------------------------------------------
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'PublicALB', {
      loadBalancerName: 'awsops-alb',
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: albSg,
      idleTimeout: cdk.Duration.seconds(3600),
    });
    cdk.Tags.of(this.alb).add('Name', 'awsops-alb');

    // Custom header secret for CloudFront -> ALB validation
    const customSecret = `${this.stackName}-secret-${this.account}`;

    // Port 80 Listener (VSCode: 8888) with custom header validation
    const listener80 = this.alb.addListener('Listener80', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Access Denied',
      }),
    });

    const vscodeTg = new elbv2.ApplicationTargetGroup(this, 'VSCodeTargetGroup', {
      vpc: this.vpc,
      port: 8888,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/',
        port: '8888',
        healthyHttpCodes: '200,302',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      stickinessCookieDuration: cdk.Duration.days(1),
    });
    vscodeTg.addTarget(new elbv2_targets.InstanceTarget(this.instance, 8888));

    listener80.addAction('VSCodeRule', {
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.httpHeader('X-Custom-Secret', [customSecret]),
      ],
      action: elbv2.ListenerAction.forward([vscodeTg]),
    });

    // Port 3000 Listener (Dashboard) with custom header validation
    const listener3000 = this.alb.addListener('Listener3000', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Access Denied',
      }),
    });

    const dashboardTg = new elbv2.ApplicationTargetGroup(this, 'DashboardTargetGroup', {
      vpc: this.vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/awsops',
        port: '3000',
        healthyHttpCodes: '200,302',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      stickinessCookieDuration: cdk.Duration.days(1),
    });
    dashboardTg.addTarget(new elbv2_targets.InstanceTarget(this.instance, 3000));

    listener3000.addAction('DashboardRule', {
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.httpHeader('X-Custom-Secret', [customSecret]),
      ],
      action: elbv2.ListenerAction.forward([dashboardTg]),
    });

    // Allow ALB SG ingress on port 3000 (already added via CfnSecurityGroupIngress above)

    // -------------------------------------------------------
    // CloudFront Distribution
    // -------------------------------------------------------
    const albOriginVSCode = new origins.HttpOrigin(this.alb.loadBalancerDnsName, {
      httpPort: 80,
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      readTimeout: cdk.Duration.seconds(60),
      customHeaders: {
        'X-Custom-Secret': customSecret,
      },
    });

    const albOriginDashboard = new origins.HttpOrigin(this.alb.loadBalancerDnsName, {
      httpPort: 3000,
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      readTimeout: cdk.Duration.seconds(60),
      customHeaders: {
        'X-Custom-Secret': customSecret,
      },
    });

    // Cache policy: no caching (use managed CachingDisabled policy)
    const noCachePolicy = cloudfront.CachePolicy.CACHING_DISABLED;

    // Origin request policy: forward all viewer headers, cookies, query strings
    const allViewerOriginPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER;

    // -------------------------------------------------------
    // Custom Domain (optional, via CDK context)
    // Usage: cdk deploy -c customDomain=awsops.example.com
    // Optionally: -c hostedZoneName=example.com
    // -------------------------------------------------------
    const customDomain = this.node.tryGetContext('customDomain') as string | undefined;
    const hostedZoneNameCtx = this.node.tryGetContext('hostedZoneName') as string | undefined;

    let domainProps: { domainNames?: string[]; certificate?: acm.ICertificate } = {};
    let hostedZone: route53.IHostedZone | undefined;

    if (customDomain) {
      // Derive hosted zone name from domain (e.g., 'awsops.atomai.click' → 'atomai.click')
      const zoneName = hostedZoneNameCtx || customDomain.split('.').slice(-2).join('.');
      hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: zoneName,
      });

      // ACM certificate in us-east-1 (required for CloudFront)
      const certificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
        domainName: customDomain,
        hostedZone,
        region: 'us-east-1',
      });

      domainProps = {
        domainNames: [customDomain],
        certificate,
      };
    }

    this.distribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      ...domainProps,
      comment: `AWSops Dashboard distribution for ${this.stackName}`,
      defaultBehavior: {
        origin: albOriginVSCode,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: noCachePolicy,
        originRequestPolicy: allViewerOriginPolicy,
      },
      additionalBehaviors: {
        '/awsops*': {
          origin: albOriginDashboard,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: noCachePolicy,
          originRequestPolicy: allViewerOriginPolicy,
        },
        '/awsops/_next/*': {
          origin: albOriginDashboard,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });
    cdk.Tags.of(this.distribution).add('Name', `${this.stackName}-CloudFront`);

    // Route 53 A record (alias) pointing custom domain to CloudFront
    if (customDomain && hostedZone) {
      new route53.ARecord(this, 'DomainARecord', {
        zone: hostedZone,
        recordName: customDomain,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(this.distribution),
        ),
      });
    }

    // -------------------------------------------------------
    // Outputs
    // -------------------------------------------------------
    new cdk.CfnOutput(this, 'VPCId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${this.stackName}-VPC-ID`,
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: customDomain
        ? `https://${customDomain}`
        : `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
      exportName: `${this.stackName}-CloudFront-URL`,
    });

    new cdk.CfnOutput(this, 'PublicALBEndpoint', {
      value: `http://${this.alb.loadBalancerDnsName}`,
      description: 'Public ALB DNS Name (direct access denied - use CloudFront)',
      exportName: `${this.stackName}-Public-ALB-DNS`,
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: this.instance.instanceId,
      description: 'EC2 Instance ID',
      exportName: `${this.stackName}-Instance-ID`,
    });

    new cdk.CfnOutput(this, 'SSMAccess', {
      value: `aws ssm start-session --target ${this.instance.instanceId}`,
      description: 'SSM Session Manager access command',
    });
  }
}
