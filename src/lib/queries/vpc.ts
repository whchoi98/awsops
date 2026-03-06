export const queries = {
  summary: `
    SELECT
      (SELECT COUNT(*) FROM aws_vpc) AS vpc_count,
      (SELECT COUNT(*) FROM aws_vpc_subnet) AS subnet_count,
      (SELECT COUNT(*) FROM aws_vpc_security_group) AS security_group_count,
      (SELECT COUNT(*) FROM aws_vpc_nat_gateway) AS nat_gateway_count,
      (SELECT COUNT(*) FROM aws_vpc_internet_gateway) AS internet_gateway_count,
      (SELECT COUNT(*) FROM aws_ec2_transit_gateway) AS tgw_count,
      (SELECT COUNT(*) FROM aws_ec2_application_load_balancer) AS alb_count,
      (SELECT COUNT(*) FROM aws_ec2_network_load_balancer) AS nlb_count
  `,

  vpcDetail: `
    SELECT
      vpc_id, cidr_block, state, is_default, dhcp_options_id,
      instance_tenancy, owner_id, arn, region, tags
    FROM aws_vpc
    WHERE vpc_id = '{vpc_id}'
  `,

  vpcList: `
    SELECT
      vpc_id, cidr_block, state, is_default, owner_id, region,
      tags ->> 'Name' AS name
    FROM aws_vpc
    ORDER BY vpc_id
  `,

  subnetList: `
    SELECT
      subnet_id, vpc_id, cidr_block, availability_zone, state,
      available_ip_address_count, map_public_ip_on_launch,
      tags ->> 'Name' AS name
    FROM aws_vpc_subnet
    ORDER BY vpc_id, availability_zone
  `,

  subnetDetail: `
    SELECT
      subnet_id, subnet_arn, vpc_id, cidr_block, state, owner_id,
      availability_zone, availability_zone_id,
      available_ip_address_count, map_public_ip_on_launch,
      default_for_az, assign_ipv6_address_on_creation,
      region, tags
    FROM aws_vpc_subnet
    WHERE subnet_id = '{subnet_id}'
  `,

  sgList: `
    SELECT
      group_id, group_name, vpc_id, description, region,
      tags ->> 'Name' AS name
    FROM aws_vpc_security_group
    ORDER BY group_name
  `,

  sgDetail: `
    SELECT
      group_id, group_name, arn, vpc_id, description, owner_id,
      ip_permissions, ip_permissions_egress,
      region, tags
    FROM aws_vpc_security_group
    WHERE group_id = '{group_id}'
  `,

  natList: `
    SELECT
      nat_gateway_id, vpc_id, subnet_id, state, create_time,
      tags ->> 'Name' AS name
    FROM aws_vpc_nat_gateway
    ORDER BY create_time DESC
  `,

  igwList: `
    SELECT
      internet_gateway_id, owner_id, region,
      tags ->> 'Name' AS name,
      jsonb_array_elements(attachments) ->> 'VpcId' AS vpc_id,
      jsonb_array_elements(attachments) ->> 'State' AS state
    FROM aws_vpc_internet_gateway
    ORDER BY internet_gateway_id
  `,

  natDetail: `
    SELECT
      nat_gateway_id, arn, state, vpc_id, subnet_id,
      nat_gateway_addresses, create_time, delete_time,
      failure_code, failure_message, provisioned_bandwidth,
      region, tags
    FROM aws_vpc_nat_gateway
    WHERE nat_gateway_id = '{nat_id}'
  `,

  igwDetail: `
    SELECT
      internet_gateway_id, owner_id, attachments,
      region, tags
    FROM aws_vpc_internet_gateway
    WHERE internet_gateway_id = '{igw_id}'
  `,

  routeTableList: `
    SELECT
      route_table_id, vpc_id, owner_id, region,
      tags ->> 'Name' AS name,
      jsonb_array_length(associations) AS association_count,
      jsonb_array_length(routes) AS route_count
    FROM aws_vpc_route_table
    ORDER BY vpc_id, route_table_id
  `,

  tgwList: `
    SELECT
      transit_gateway_id, state, description, owner_id,
      amazon_side_asn, dns_support, vpn_ecmp_support,
      auto_accept_shared_attachments, default_route_table_association,
      default_route_table_propagation, creation_time, region,
      tags ->> 'Name' AS name
    FROM aws_ec2_transit_gateway
    ORDER BY creation_time DESC
  `,

  tgwDetail: `
    SELECT
      transit_gateway_id, transit_gateway_arn, state, description, owner_id,
      amazon_side_asn, dns_support, vpn_ecmp_support, multicast_support,
      auto_accept_shared_attachments, default_route_table_association,
      default_route_table_propagation,
      association_default_route_table_id, propagation_default_route_table_id,
      cidr_blocks, creation_time, region, tags
    FROM aws_ec2_transit_gateway
    WHERE transit_gateway_id = '{tgw_id}'
  `,

  tgwAttachments: `
    SELECT
      transit_gateway_attachment_id, transit_gateway_id,
      resource_id, resource_type, state,
      association_state, creation_time,
      tags ->> 'Name' AS name
    FROM aws_ec2_transit_gateway_vpc_attachment
    ORDER BY creation_time DESC
  `,

  elbList: `
    SELECT
      name, arn, type, scheme, state_code, vpc_id, dns_name,
      ip_address_type, created_time, region,
      'ALB' AS lb_type
    FROM aws_ec2_application_load_balancer
    UNION ALL
    SELECT
      name, arn, type, scheme, state_code, vpc_id, dns_name,
      ip_address_type, created_time, region,
      'NLB' AS lb_type
    FROM aws_ec2_network_load_balancer
    ORDER BY created_time DESC
  `,

  elbDetail: `
    SELECT
      name, arn, type, scheme, state_code, vpc_id, dns_name,
      ip_address_type, canonical_hosted_zone_id,
      availability_zones, security_groups,
      created_time, region, tags
    FROM aws_ec2_application_load_balancer
    WHERE name = '{name}'
    UNION ALL
    SELECT
      name, arn, type, scheme, state_code, vpc_id, dns_name,
      ip_address_type, canonical_hosted_zone_id,
      availability_zones, security_groups,
      created_time, region, tags
    FROM aws_ec2_network_load_balancer
    WHERE name = '{name}'
  `
};
