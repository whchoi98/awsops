'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Network, X, Tag, Shield, Globe, ArrowRightLeft } from 'lucide-react';
import { queries as vpcQ } from '@/lib/queries/vpc';

type TabKey = 'vpcs' | 'subnets' | 'sgs' | 'rtb' | 'tgw' | 'elb' | 'nat' | 'igw';

export default function VPCPage() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('vpcs');
  const [selected, setSelected] = useState<any>(null);
  const [detailType, setDetailType] = useState<string>('');
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            summary: vpcQ.summary,
            vpcList: vpcQ.vpcList,
            subnetList: vpcQ.subnetList,
            sgList: vpcQ.sgList,
            natList: vpcQ.natList,
            igwList: vpcQ.igwList,
            tgwList: vpcQ.tgwList,
            rtbList: vpcQ.routeTableList,
            tgwAttachments: vpcQ.tgwAttachments,
            elbList: vpcQ.elbList,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (type: string, queryTemplate: string, key: string, value: string) => {
    setDetailLoading(true);
    setDetailType(type);
    try {
      const sql = queryTemplate.replace(key, value);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) setSelected(result.detail.rows[0]);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const summary = getFirst('summary') as any;

  const vpcs = get('vpcList');
  const subnets = get('subnetList');
  const sgs = get('sgList');
  const rtbs = get('rtbList');
  const tgws = get('tgwList');
  const tgwAttachments = get('tgwAttachments');
  const elbs = get('elbList');
  const nats = get('natList');
  const igws = get('igwList');

  const subnetPerVpc: Record<string, number> = {};
  subnets.forEach((s: any) => {
    const v = String(s.vpc_id || '').slice(-8);
    subnetPerVpc[v] = (subnetPerVpc[v] || 0) + 1;
  });
  const subnetPieData = Object.entries(subnetPerVpc).map(([name, value]) => ({ name: `...${name}`, value }));

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  const parseArray = (val: any) => {
    if (!val) return [];
    if (typeof val === 'string') try { return JSON.parse(val); } catch { return []; }
    return Array.isArray(val) ? val : [];
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'vpcs', label: `VPCs (${vpcs.length})` },
    { key: 'subnets', label: `Subnets (${subnets.length})` },
    { key: 'sgs', label: `SGs (${sgs.length})` },
    { key: 'rtb', label: `Route Tables (${rtbs.length})` },
    { key: 'tgw', label: `TGW (${tgws.length})` },
    { key: 'elb', label: `ELB (${elbs.length})` },
    { key: 'nat', label: `NAT (${nats.length})` },
    { key: 'igw', label: `IGW (${igws.length})` },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="VPC & Network" subtitle="Virtual Private Cloud, Transit Gateway, Load Balancers" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-4">
        <StatsCard label="VPCs" value={Number(summary?.vpc_count) || 0} icon={Network} color="cyan" />
        <StatsCard label="Subnets" value={Number(summary?.subnet_count) || 0} icon={Network} color="green" />
        <StatsCard label="Security Groups" value={Number(summary?.security_group_count) || 0} icon={Shield} color="purple" />
        <StatsCard label="Route Tables" value={Number(summary?.route_table_count) || 0} icon={ArrowRightLeft} color="orange" />
        <StatsCard label="TGW" value={Number(summary?.tgw_count) || 0} icon={ArrowRightLeft} color="orange" />
        <StatsCard label="ALB" value={Number(summary?.alb_count) || 0} icon={Globe} color="pink" />
        <StatsCard label="NLB" value={Number(summary?.nlb_count) || 0} icon={Globe} color="red" />
        <StatsCard label="NAT GW" value={Number(summary?.nat_gateway_count) || 0} icon={Network} color="cyan" />
        <StatsCard label="IGW" value={Number(summary?.internet_gateway_count) || 0} icon={Network} color="green" />
      </div>

      <PieChartCard title="Subnets per VPC" data={subnetPieData} />

      {/* Tabs */}
      <div className="flex gap-1 bg-navy-800 rounded-lg border border-navy-600 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-gray-400 hover:text-white hover:bg-navy-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* VPCs */}
      {activeTab === 'vpcs' && (
        <DataTable columns={[
          { key: 'vpc_id', label: 'VPC ID' },
          { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'cidr_block', label: 'CIDR' },
          { key: 'state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
          { key: 'is_default', label: 'Default', render: (v: boolean) => v ? 'Yes' : 'No' },
          { key: 'region', label: 'Region' },
        ]} data={loading && !vpcs.length ? undefined : vpcs}
           onRowClick={(row) => fetchDetail('vpc', vpcQ.vpcDetail, '{vpc_id}', row.vpc_id)} />
      )}

      {/* Subnets */}
      {activeTab === 'subnets' && (
        <DataTable columns={[
          { key: 'subnet_id', label: 'Subnet ID' },
          { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'cidr_block', label: 'CIDR' },
          { key: 'availability_zone', label: 'AZ' },
          { key: 'available_ip_address_count', label: 'Free IPs' },
          { key: 'map_public_ip_on_launch', label: 'Public', render: (v: boolean) => v ? <span className="text-accent-orange">Yes</span> : 'No' },
        ]} data={loading && !subnets.length ? undefined : subnets}
           onRowClick={(row) => fetchDetail('subnet', vpcQ.subnetDetail, '{subnet_id}', row.subnet_id)} />
      )}

      {/* Security Groups */}
      {activeTab === 'sgs' && (
        <DataTable columns={[
          { key: 'group_id', label: 'Group ID' },
          { key: 'group_name', label: 'Name' },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'description', label: 'Description' },
          { key: 'region', label: 'Region' },
        ]} data={loading && !sgs.length ? undefined : sgs}
           onRowClick={(row) => fetchDetail('sg', vpcQ.sgDetail, '{group_id}', row.group_id)} />
      )}

      {/* Route Tables */}
      {activeTab === 'rtb' && (
        <DataTable columns={[
          { key: 'route_table_id', label: 'Route Table ID' },
          { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'association_count', label: 'Associations' },
          { key: 'route_count', label: 'Routes' },
          { key: 'region', label: 'Region' },
        ]} data={loading && !rtbs.length ? undefined : rtbs}
           onRowClick={(row) => fetchDetail('rtb', vpcQ.routeTableDetail, '{rt_id}', row.route_table_id)} />
      )}

      {/* Transit Gateways */}
      {activeTab === 'tgw' && (
        <>
          <DataTable columns={[
            { key: 'transit_gateway_id', label: 'TGW ID' },
            { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
            { key: 'state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
            { key: 'description', label: 'Description' },
            { key: 'amazon_side_asn', label: 'ASN' },
            { key: 'dns_support', label: 'DNS' },
            { key: 'region', label: 'Region' },
          ]} data={loading && !tgws.length ? undefined : tgws}
             onRowClick={(row) => fetchDetail('tgw', vpcQ.tgwDetail, '{tgw_id}', row.transit_gateway_id)} />
          {tgwAttachments.length > 0 && (
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3 mt-4">TGW Attachments</h3>
              <DataTable columns={[
                { key: 'transit_gateway_attachment_id', label: 'Attachment ID' },
                { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
                { key: 'transit_gateway_id', label: 'TGW ID' },
                { key: 'resource_id', label: 'Resource' },
                { key: 'resource_type', label: 'Type' },
                { key: 'state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
              ]} data={tgwAttachments} />
            </div>
          )}
        </>
      )}

      {/* Load Balancers */}
      {activeTab === 'elb' && (
        <DataTable columns={[
          { key: 'name', label: 'Name' },
          { key: 'lb_type', label: 'Type', render: (v: string) => (
            <span className={v === 'ALB' ? 'text-accent-cyan' : 'text-accent-purple'}>{v}</span>
          )},
          { key: 'scheme', label: 'Scheme' },
          { key: 'state_code', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
          { key: 'dns_name', label: 'DNS Name' },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'region', label: 'Region' },
        ]} data={loading && !elbs.length ? undefined : elbs}
           onRowClick={(row) => fetchDetail('elb', vpcQ.elbDetail, '{name}', row.name)} />
      )}

      {/* NAT Gateways */}
      {activeTab === 'nat' && (
        <DataTable columns={[
          { key: 'nat_gateway_id', label: 'NAT GW ID' },
          { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'subnet_id', label: 'Subnet' },
          { key: 'state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
          { key: 'create_time', label: 'Created', render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
        ]} data={loading && !nats.length ? undefined : nats}
           onRowClick={(row) => fetchDetail('nat', vpcQ.natDetail, '{nat_id}', row.nat_gateway_id)} />
      )}

      {/* Internet Gateways */}
      {activeTab === 'igw' && (
        <DataTable columns={[
          { key: 'internet_gateway_id', label: 'IGW ID' },
          { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
          { key: 'vpc_id', label: 'VPC' },
          { key: 'state', label: 'State', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
          { key: 'region', label: 'Region' },
        ]} data={loading && !igws.length ? undefined : igws}
           onRowClick={(row) => fetchDetail('igw', vpcQ.igwDetail, '{igw_id}', row.internet_gateway_id)} />
      )}

      {/* Detail Panel */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">
                  {selected?.vpc_id || selected?.subnet_id || selected?.group_id || selected?.transit_gateway_id || selected?.nat_gateway_id || selected?.internet_gateway_id || selected?.name || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-400 capitalize">{detailType} Detail</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                {/* VPC Detail */}
                {detailType === 'vpc' && (<>
                  <Section title="VPC Info" icon={Network}>
                    <Row label="VPC ID" value={selected.vpc_id} />
                    <Row label="CIDR Block" value={selected.cidr_block} />
                    <Row label="State" value={selected.state} />
                    <Row label="Default" value={selected.is_default ? 'Yes' : 'No'} />
                    <Row label="DHCP Options" value={selected.dhcp_options_id} />
                    <Row label="Tenancy" value={selected.instance_tenancy} />
                    <Row label="Owner" value={selected.owner_id} />
                    <Row label="ARN" value={selected.arn} />
                    <Row label="Region" value={selected.region} />
                  </Section>
                </>)}

                {/* Subnet Detail */}
                {detailType === 'subnet' && (<>
                  <Section title="Subnet Info" icon={Network}>
                    <Row label="Subnet ID" value={selected.subnet_id} />
                    <Row label="ARN" value={selected.subnet_arn} />
                    <Row label="VPC ID" value={selected.vpc_id} />
                    <Row label="CIDR Block" value={selected.cidr_block} />
                    <Row label="State" value={selected.state} />
                    <Row label="AZ" value={selected.availability_zone} />
                    <Row label="AZ ID" value={selected.availability_zone_id} />
                    <Row label="Available IPs" value={selected.available_ip_address_count} />
                    <Row label="Auto-assign Public IP" value={selected.map_public_ip_on_launch ? 'Yes' : 'No'} />
                    <Row label="Default for AZ" value={selected.default_for_az ? 'Yes' : 'No'} />
                    <Row label="IPv6 on Creation" value={selected.assign_ipv6_address_on_creation ? 'Yes' : 'No'} />
                    <Row label="Owner" value={selected.owner_id} />
                    <Row label="Region" value={selected.region} />
                  </Section>
                </>)}

                {/* Security Group Detail */}
                {detailType === 'sg' && (<>
                  <Section title="Security Group" icon={Shield}>
                    <Row label="Group ID" value={selected.group_id} />
                    <Row label="Name" value={selected.group_name} />
                    <Row label="VPC ID" value={selected.vpc_id} />
                    <Row label="Description" value={selected.description} />
                    <Row label="Owner" value={selected.owner_id} />
                    <Row label="ARN" value={selected.arn} />
                  </Section>
                  <Section title="Inbound Rules" icon={Shield}>
                    {parseArray(selected.ip_permissions).length > 0 ? (
                      <div className="space-y-2">
                        {parseArray(selected.ip_permissions).map((rule: any, i: number) => (
                          <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono space-y-1">
                            <div className="flex gap-4">
                              <span className="text-accent-cyan">{rule.IpProtocol === '-1' ? 'All Traffic' : rule.IpProtocol?.toUpperCase()}</span>
                              {rule.FromPort !== undefined && <span className="text-gray-400">Port: {rule.FromPort === rule.ToPort ? rule.FromPort : `${rule.FromPort}-${rule.ToPort}`}</span>}
                            </div>
                            {rule.IpRanges?.map((r: any, j: number) => (
                              <div key={j} className="text-gray-300 pl-2">{r.CidrIp} {r.Description && <span className="text-gray-500">({r.Description})</span>}</div>
                            ))}
                            {rule.UserIdGroupPairs?.map((g: any, j: number) => (
                              <div key={`g${j}`} className="text-accent-purple pl-2">{g.GroupId} {g.Description && <span className="text-gray-500">({g.Description})</span>}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No inbound rules</p>}
                  </Section>
                  <Section title="Outbound Rules" icon={Shield}>
                    {parseArray(selected.ip_permissions_egress).length > 0 ? (
                      <div className="space-y-2">
                        {parseArray(selected.ip_permissions_egress).map((rule: any, i: number) => (
                          <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono space-y-1">
                            <div className="flex gap-4">
                              <span className="text-accent-green">{rule.IpProtocol === '-1' ? 'All Traffic' : rule.IpProtocol?.toUpperCase()}</span>
                              {rule.FromPort !== undefined && <span className="text-gray-400">Port: {rule.FromPort === rule.ToPort ? rule.FromPort : `${rule.FromPort}-${rule.ToPort}`}</span>}
                            </div>
                            {rule.IpRanges?.map((r: any, j: number) => (
                              <div key={j} className="text-gray-300 pl-2">{r.CidrIp}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No outbound rules</p>}
                  </Section>
                </>)}

                {/* Route Table Detail */}
                {detailType === 'rtb' && (<>
                  <Section title="Route Table" icon={ArrowRightLeft}>
                    <Row label="Route Table ID" value={selected.route_table_id} />
                    <Row label="VPC ID" value={selected.vpc_id} />
                    <Row label="Owner" value={selected.owner_id} />
                    <Row label="Region" value={selected.region} />
                  </Section>
                  <Section title="Associations" icon={Network}>
                    {(() => {
                      const assocs = parseArray(selected.associations);
                      return assocs.length > 0 ? (
                        <div className="space-y-2">
                          {assocs.map((a: any, i: number) => (
                            <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono space-y-1">
                              <Row label="Association ID" value={a.RouteTableAssociationId || a.route_table_association_id} />
                              <Row label="Subnet" value={a.SubnetId || a.subnet_id || 'Main'} />
                              <Row label="Main" value={a.Main || a.main ? 'Yes' : 'No'} />
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-gray-500 text-sm">No associations</p>;
                    })()}
                  </Section>
                  <Section title="Routes" icon={ArrowRightLeft}>
                    {(() => {
                      const routes = parseArray(selected.routes);
                      return routes.length > 0 ? (
                        <div className="space-y-1">
                          <div className="grid grid-cols-3 gap-2 text-[10px] font-mono uppercase text-gray-500 mb-1 px-2">
                            <span>Destination</span><span>Target</span><span>State</span>
                          </div>
                          {routes.map((r: any, i: number) => {
                            const dest = r.DestinationCidrBlock || r.destination_cidr_block || r.DestinationPrefixListId || r.destination_prefix_list_id || '--';
                            const target = r.GatewayId || r.gateway_id || r.NatGatewayId || r.nat_gateway_id || r.TransitGatewayId || r.transit_gateway_id || r.VpcPeeringConnectionId || r.vpc_peering_connection_id || r.NetworkInterfaceId || r.network_interface_id || 'local';
                            const state = r.State || r.state || '--';
                            return (
                              <div key={i} className={`grid grid-cols-3 gap-2 text-xs font-mono px-2 py-1.5 rounded ${state === 'active' ? 'bg-navy-900' : 'bg-navy-900/50 text-gray-600'}`}>
                                <span className="text-accent-cyan">{dest}</span>
                                <span className="text-gray-300">{target}</span>
                                <span className={state === 'active' ? 'text-accent-green' : 'text-accent-red'}>{state}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : <p className="text-gray-500 text-sm">No routes</p>;
                    })()}
                  </Section>
                </>)}

                {/* TGW Detail */}
                {detailType === 'tgw' && (<>
                  <Section title="Transit Gateway" icon={ArrowRightLeft}>
                    <Row label="TGW ID" value={selected.transit_gateway_id} />
                    <Row label="ARN" value={selected.transit_gateway_arn} />
                    <Row label="State" value={selected.state} />
                    <Row label="Description" value={selected.description} />
                    <Row label="Owner" value={selected.owner_id} />
                    <Row label="ASN" value={selected.amazon_side_asn} />
                    <Row label="DNS Support" value={selected.dns_support} />
                    <Row label="VPN ECMP" value={selected.vpn_ecmp_support} />
                    <Row label="Multicast" value={selected.multicast_support} />
                    <Row label="Auto Accept" value={selected.auto_accept_shared_attachments} />
                    <Row label="Default RT Assoc" value={selected.default_route_table_association} />
                    <Row label="Default RT Prop" value={selected.default_route_table_propagation} />
                    <Row label="Assoc RT ID" value={selected.association_default_route_table_id} />
                    <Row label="Prop RT ID" value={selected.propagation_default_route_table_id} />
                    <Row label="CIDR Blocks" value={parseArray(selected.cidr_blocks).join(', ') || '--'} />
                    <Row label="Created" value={selected.creation_time ? new Date(selected.creation_time).toLocaleString() : '--'} />
                  </Section>
                </>)}

                {/* ELB Detail */}
                {detailType === 'elb' && (<>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={selected.state_code || 'unknown'} />
                    <span className="text-sm font-mono text-gray-400">{selected.type} / {selected.scheme}</span>
                  </div>
                  <Section title="Load Balancer" icon={Globe}>
                    <Row label="Name" value={selected.name} />
                    <Row label="ARN" value={selected.arn} />
                    <Row label="Type" value={selected.type} />
                    <Row label="Scheme" value={selected.scheme} />
                    <Row label="State" value={selected.state_code} />
                    <Row label="DNS Name" value={selected.dns_name} />
                    <Row label="VPC ID" value={selected.vpc_id} />
                    <Row label="IP Type" value={selected.ip_address_type} />
                    <Row label="Hosted Zone" value={selected.canonical_hosted_zone_id} />
                    <Row label="Created" value={selected.created_time ? new Date(selected.created_time).toLocaleString() : '--'} />
                  </Section>
                  <Section title="Availability Zones" icon={Network}>
                    {parseArray(selected.availability_zones).length > 0 ? (
                      <div className="space-y-1">
                        {parseArray(selected.availability_zones).map((az: any, i: number) => (
                          <div key={i} className="text-xs font-mono text-gray-300 pl-2 border-l border-navy-600">
                            {az.ZoneName || az} {az.SubnetId && <span className="text-gray-500">({az.SubnetId})</span>}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">--</p>}
                  </Section>
                  <Section title="Security Groups" icon={Shield}>
                    {parseArray(selected.security_groups).length > 0 ? (
                      <div className="space-y-1">
                        {parseArray(selected.security_groups).map((sg: string, i: number) => (
                          <div key={i} className="text-xs font-mono text-accent-cyan pl-2 border-l border-navy-600">{sg}</div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No security groups (NLB)</p>}
                  </Section>
                </>)}

                {/* NAT Gateway Detail */}
                {detailType === 'nat' && (<>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={selected.state || 'unknown'} />
                  </div>
                  <Section title="NAT Gateway" icon={Network}>
                    <Row label="NAT GW ID" value={selected.nat_gateway_id} />
                    <Row label="ARN" value={selected.arn} />
                    <Row label="State" value={selected.state} />
                    <Row label="VPC ID" value={selected.vpc_id} />
                    <Row label="Subnet ID" value={selected.subnet_id} />
                    <Row label="Created" value={selected.create_time ? new Date(selected.create_time).toLocaleString() : '--'} />
                    <Row label="Deleted" value={selected.delete_time ? new Date(selected.delete_time).toLocaleString() : '--'} />
                    {selected.failure_code && <Row label="Failure Code" value={selected.failure_code} />}
                    {selected.failure_message && <Row label="Failure Message" value={selected.failure_message} />}
                    <Row label="Region" value={selected.region} />
                  </Section>
                  <Section title="Addresses" icon={Globe}>
                    {parseArray(selected.nat_gateway_addresses).length > 0 ? (
                      <div className="space-y-2">
                        {parseArray(selected.nat_gateway_addresses).map((addr: any, i: number) => (
                          <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono space-y-1">
                            <Row label="Public IP" value={addr.PublicIp || addr.public_ip} />
                            <Row label="Private IP" value={addr.PrivateIp || addr.private_ip} />
                            <Row label="Allocation ID" value={addr.AllocationId || addr.allocation_id} />
                            <Row label="ENI" value={addr.NetworkInterfaceId || addr.network_interface_id} />
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No addresses</p>}
                  </Section>
                </>)}

                {/* IGW Detail */}
                {detailType === 'igw' && (<>
                  <Section title="Internet Gateway" icon={Globe}>
                    <Row label="IGW ID" value={selected.internet_gateway_id} />
                    <Row label="Owner" value={selected.owner_id} />
                    <Row label="Region" value={selected.region} />
                  </Section>
                  <Section title="Attachments" icon={Network}>
                    {parseArray(selected.attachments).length > 0 ? (
                      <div className="space-y-2">
                        {parseArray(selected.attachments).map((att: any, i: number) => (
                          <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono space-y-1">
                            <Row label="VPC ID" value={att.VpcId || att.vpc_id} />
                            <Row label="State" value={att.State || att.state} />
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No attachments</p>}
                  </Section>
                </>)}

                {/* Tags (common) */}
                {selected.tags && (
                  <Section title="Tags" icon={Tag}>
                    {Object.keys(parseTags(selected.tags)).length > 0 ? (
                      <div className="space-y-1">
                        {Object.entries(parseTags(selected.tags)).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-sm">
                            <span className="text-accent-purple font-mono text-xs min-w-[120px]">{k}</span>
                            <span className="text-gray-300">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No tags</p>}
                  </Section>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-accent-cyan" />
        <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-gray-500 min-w-[130px] shrink-0">{label}</span>
      <span className="text-gray-200 font-mono text-xs break-all">{value ?? '--'}</span>
    </div>
  );
}
