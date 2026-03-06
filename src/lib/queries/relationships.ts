export const queries = {
  // EC2 -> VPC, Subnet, SGs
  ec2Relations: `
    SELECT
      i.instance_id,
      i.instance_type,
      i.instance_state,
      i.vpc_id,
      i.subnet_id,
      i.private_ip_address,
      i.public_ip_address,
      tags ->> 'Name' AS name
    FROM aws_ec2_instance i
    ORDER BY i.vpc_id, i.subnet_id
  `,

  // VPC -> Subnets
  vpcSubnets: `
    SELECT
      v.vpc_id,
      v.cidr_block AS vpc_cidr,
      v.tags ->> 'Name' AS vpc_name,
      s.subnet_id,
      s.cidr_block AS subnet_cidr,
      s.availability_zone,
      s.tags ->> 'Name' AS subnet_name
    FROM aws_vpc v
    LEFT JOIN aws_vpc_subnet s ON v.vpc_id = s.vpc_id
    ORDER BY v.vpc_id, s.availability_zone
  `,

  // ELB -> VPC, SGs
  elbRelations: `
    SELECT
      name AS elb_name,
      arn,
      type,
      scheme,
      vpc_id,
      dns_name,
      availability_zones,
      security_groups
    FROM aws_ec2_application_load_balancer
    UNION ALL
    SELECT
      name AS elb_name,
      arn,
      type,
      scheme,
      vpc_id,
      dns_name,
      availability_zones,
      security_groups
    FROM aws_ec2_network_load_balancer
  `,

  // NAT GW -> VPC, Subnet
  natRelations: `
    SELECT nat_gateway_id, vpc_id, subnet_id, state,
      tags ->> 'Name' AS name
    FROM aws_vpc_nat_gateway
  `,

  // IGW -> VPC
  igwRelations: `
    SELECT
      internet_gateway_id,
      jsonb_array_elements(attachments) ->> 'VpcId' AS vpc_id,
      tags ->> 'Name' AS name
    FROM aws_vpc_internet_gateway
  `,

  // TGW -> Attachments
  tgwRelations: `
    SELECT
      transit_gateway_attachment_id,
      transit_gateway_id,
      resource_id,
      resource_type,
      state,
      tags ->> 'Name' AS name
    FROM aws_ec2_transit_gateway_vpc_attachment
  `,

  // RDS -> VPC, Subnet Group
  rdsRelations: `
    SELECT
      db_instance_identifier,
      engine,
      class AS db_instance_class,
      vpc_id,
      availability_zone,
      endpoint_address
    FROM aws_rds_db_instance
  `,

  // EKS nodes -> instances
  eksNodes: `
    SELECT name, namespace, pod_ip, node_name, phase
    FROM kubernetes_pod
    WHERE phase = 'Running'
    ORDER BY node_name, namespace
    LIMIT 100
  `,
};
