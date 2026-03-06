'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap, MarkerType,
  Position, ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Header from '@/components/layout/Header';
import { queries as relQ } from '@/lib/queries/relationships';

const NODE_COLORS: Record<string, string> = {
  vpc: '#00d4ff',
  subnet: '#00ff88',
  ec2: '#a855f7',
  elb: '#ec4899',
  rds: '#f59e0b',
  nat: '#6b7280',
  igw: '#00d4ff',
  tgw: '#ef4444',
  sg: '#f59e0b',
  k8s_node: '#00ff88',
  k8s_pod: '#a855f7',
};

function makeNode(id: string, label: string, type: string, x: number, y: number, extra?: string): Node {
  const color = NODE_COLORS[type] || '#6b7280';
  return {
    id,
    position: { x, y },
    data: {
      label: (
        <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.3 }}>
          <div style={{ fontSize: 9, color: color, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>{type}</div>
          <div style={{ color: '#e5e7eb', fontWeight: 500 }}>{label}</div>
          {extra && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{extra}</div>}
        </div>
      ),
    },
    style: {
      background: '#0f1629',
      border: `1.5px solid ${color}`,
      borderRadius: 8,
      padding: '8px 12px',
      width: 160,
      color: '#e5e7eb',
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
    labelStyle: { fill: '#6b7280', fontSize: 9 },
    labelBgStyle: { fill: '#0a0e1a' },
    style: { stroke: '#1a2540', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#1a2540', width: 15, height: 15 },
    type: 'smoothstep',
  };
}

export default function TopologyPage() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'infra' | 'k8s'>('infra');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            ec2: relQ.ec2Relations,
            vpcSubnets: relQ.vpcSubnets,
            elb: relQ.elbRelations,
            nat: relQ.natRelations,
            igw: relQ.igwRelations,
            tgw: relQ.tgwRelations,
            rds: relQ.rdsRelations,
            k8s: relQ.eksNodes,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];

  const { nodes: infraNodes, edges: infraEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const seen = new Set<string>();

    const vpcs = get('vpcSubnets');
    const ec2s = get('ec2');
    const elbs = get('elb');
    const nats = get('nat');
    const igws = get('igw');
    const tgws = get('tgw');
    const rdss = get('rds');

    // Unique VPCs
    const vpcMap: Record<string, { name: string; cidr: string; y: number }> = {};
    let vpcY = 0;
    vpcs.forEach((r: any) => {
      if (r.vpc_id && !vpcMap[r.vpc_id]) {
        vpcMap[r.vpc_id] = { name: r.vpc_name || r.vpc_id.slice(-8), cidr: r.vpc_cidr, y: vpcY };
        vpcY += 350;
      }
    });

    // VPC nodes
    Object.entries(vpcMap).forEach(([vpcId, info]) => {
      nodes.push(makeNode(vpcId, info.name, 'vpc', 0, info.y, info.cidr));
    });

    // Subnet nodes
    const subnetPositions: Record<string, { x: number; y: number }> = {};
    const subIdx: Record<string, number> = {};
    vpcs.forEach((r: any) => {
      if (!r.subnet_id) return;
      const vpcInfo = vpcMap[r.vpc_id];
      if (!vpcInfo) return;
      const idx = subIdx[r.vpc_id] || 0;
      subIdx[r.vpc_id] = idx + 1;
      const x = 250;
      const y = vpcInfo.y + idx * 60 - 60;
      subnetPositions[r.subnet_id] = { x, y };
      if (!seen.has(r.subnet_id)) {
        seen.add(r.subnet_id);
        nodes.push(makeNode(r.subnet_id, r.subnet_name || r.subnet_id.slice(-8), 'subnet', x, y, `${r.availability_zone} ${r.subnet_cidr}`));
        edges.push(makeEdge(r.vpc_id, r.subnet_id));
      }
    });

    // EC2 nodes
    const ec2Idx: Record<string, number> = {};
    ec2s.forEach((r: any) => {
      if (!r.instance_id) return;
      const subPos = subnetPositions[r.subnet_id] || { x: 250, y: 0 };
      const idx = ec2Idx[r.subnet_id] || 0;
      ec2Idx[r.subnet_id] = idx + 1;
      const x = 520;
      const y = subPos.y + idx * 55;
      nodes.push(makeNode(r.instance_id, r.name || r.instance_id.slice(-8), 'ec2', x, y,
        `${r.instance_type} ${r.instance_state}`));
      edges.push(makeEdge(r.subnet_id || r.vpc_id, r.instance_id));
    });

    // ELB nodes
    elbs.forEach((r: any, i: number) => {
      if (!r.elb_name) return;
      const vpcInfo = vpcMap[r.vpc_id];
      const baseY = vpcInfo ? vpcInfo.y : 0;
      const id = `elb-${r.elb_name}`;
      nodes.push(makeNode(id, r.elb_name.slice(0, 20), 'elb', 520, baseY - 80 - i * 60,
        `${r.type} ${r.scheme}`));
      if (r.vpc_id) edges.push(makeEdge(r.vpc_id, id, 'ELB'));
    });

    // RDS nodes
    rdss.forEach((r: any, i: number) => {
      if (!r.db_instance_identifier) return;
      const vpcInfo = vpcMap[r.vpc_id];
      const baseY = vpcInfo ? vpcInfo.y : 0;
      const id = `rds-${r.db_instance_identifier}`;
      nodes.push(makeNode(id, r.db_instance_identifier, 'rds', 780, baseY + i * 60,
        `${r.engine} ${r.db_instance_class}`));
      if (r.vpc_id) edges.push(makeEdge(r.vpc_id, id, 'RDS'));
    });

    // NAT nodes
    nats.forEach((r: any, i: number) => {
      if (!r.nat_gateway_id) return;
      const subPos = subnetPositions[r.subnet_id];
      const y = subPos ? subPos.y : i * 60;
      const id = `nat-${r.nat_gateway_id}`;
      nodes.push(makeNode(id, r.name || r.nat_gateway_id.slice(-8), 'nat', 780, y, r.state));
      if (r.subnet_id) edges.push(makeEdge(r.subnet_id, id, 'NAT'));
    });

    // IGW nodes
    igws.forEach((r: any, i: number) => {
      if (!r.internet_gateway_id) return;
      const vpcInfo = vpcMap[r.vpc_id];
      const baseY = vpcInfo ? vpcInfo.y : i * 100;
      const id = `igw-${r.internet_gateway_id}`;
      if (!seen.has(id)) {
        seen.add(id);
        nodes.push(makeNode(id, r.name || r.internet_gateway_id.slice(-8), 'igw', -200, baseY, 'Internet GW'));
        if (r.vpc_id) edges.push(makeEdge(id, r.vpc_id, 'IGW'));
      }
    });

    // TGW nodes
    const tgwSeen = new Set<string>();
    tgws.forEach((r: any) => {
      if (!r.transit_gateway_id) return;
      const tgwId = `tgw-${r.transit_gateway_id}`;
      if (!tgwSeen.has(tgwId)) {
        tgwSeen.add(tgwId);
        nodes.push(makeNode(tgwId, r.name || r.transit_gateway_id.slice(-8), 'tgw', -200, vpcY / 2, 'Transit GW'));
      }
      if (r.resource_id && vpcMap[r.resource_id]) {
        edges.push(makeEdge(tgwId, r.resource_id, 'TGW'));
      }
    });

    return { nodes, edges };
  }, [data]);

  const { nodes: k8sNodes, edges: k8sEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const pods = get('k8s');

    const nodeMap: Record<string, number> = {};
    let nodeIdx = 0;
    pods.forEach((p: any) => {
      if (p.node_name && !(p.node_name in nodeMap)) {
        nodeMap[p.node_name] = nodeIdx++;
      }
    });

    // K8s nodes
    Object.entries(nodeMap).forEach(([name, idx]) => {
      nodes.push(makeNode(`node-${name}`, name.split('.')[0], 'k8s_node', 0, idx * 250, 'Node'));
    });

    // Pods grouped by node
    const podsByNode: Record<string, any[]> = {};
    pods.forEach((p: any) => {
      if (!p.node_name) return;
      podsByNode[p.node_name] = podsByNode[p.node_name] || [];
      podsByNode[p.node_name].push(p);
    });

    Object.entries(podsByNode).forEach(([nodeName, nodePods]) => {
      const nodeY = (nodeMap[nodeName] || 0) * 250;
      nodePods.forEach((p: any, i: number) => {
        const id = `pod-${p.name}`;
        const col = Math.floor(i / 8);
        const row = i % 8;
        nodes.push(makeNode(id, p.name.slice(0, 20), 'k8s_pod', 250 + col * 180, nodeY + row * 50 - 100,
          `${p.namespace} ${p.pod_ip || ''}`));
        edges.push(makeEdge(`node-${nodeName}`, id));
      });
    });

    return { nodes, edges };
  }, [data]);

  const activeNodes = view === 'infra' ? infraNodes : k8sNodes;
  const activeEdges = view === 'infra' ? infraEdges : k8sEdges;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <Header title="Resource Topology" subtitle="AWS Infrastructure Relationship Map" onRefresh={() => fetchData(true)} />

      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-navy-800 rounded-lg border border-navy-600 p-1">
          <button onClick={() => setView('infra')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'infra' ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-gray-400 hover:text-white'}`}>
            Infrastructure
          </button>
          <button onClick={() => setView('k8s')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'k8s' ? 'bg-accent-cyan/10 text-accent-cyan' : 'text-gray-400 hover:text-white'}`}>
            Kubernetes
          </button>
        </div>
        <span className="text-xs text-gray-500">
          {activeNodes.length} nodes, {activeEdges.length} connections
        </span>
        {loading && <span className="text-xs text-accent-cyan animate-pulse">Loading...</span>}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(view === 'infra'
          ? [['vpc','VPC'],['subnet','Subnet'],['ec2','EC2'],['elb','ELB'],['rds','RDS'],['nat','NAT'],['igw','IGW'],['tgw','TGW']]
          : [['k8s_node','Node'],['k8s_pod','Pod']]
        ).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border" style={{ borderColor: NODE_COLORS[type], background: NODE_COLORS[type] + '20' }} />
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      <div className="bg-navy-900 rounded-lg border border-navy-600 overflow-hidden" style={{ height: 'calc(100vh - 260px)' }}>
        {activeNodes.length > 0 ? (
          <ReactFlow
            nodes={activeNodes}
            edges={activeEdges}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{ animated: false }}
          >
            <Background color="#1a2540" gap={20} />
            <Controls style={{ button: { background: '#0f1629', color: '#e5e7eb', border: '1px solid #1a2540' } } as any} />
            <MiniMap
              nodeColor={(n) => {
                const type = n.id.split('-')[0];
                return NODE_COLORS[type] || '#6b7280';
              }}
              maskColor="rgba(10, 14, 26, 0.8)"
              style={{ background: '#0f1629', border: '1px solid #1a2540' }}
            />
          </ReactFlow>
        ) : !loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No resources found. Click refresh to load data.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
