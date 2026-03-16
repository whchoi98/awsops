'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap, MarkerType,
  Position, ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Header from '@/components/layout/Header';
import { queries as relQ } from '@/lib/queries/relationships';
import { useAccountContext } from '@/contexts/AccountContext';

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
  const { currentAccountId } = useAccountContext();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'infra' | 'k8s'>('infra');
  const [infraMode, setInfraMode] = useState<'graph' | 'map'>('map');
  const [infraSearch, setInfraSearch] = useState('');
  const [infraSelected, setInfraSelected] = useState<{ type: string; id: string } | null>(null);
  const [k8sSearch, setK8sSearch] = useState('');
  const [k8sSelected, setK8sSelected] = useState<{ type: string; key: string } | null>(null);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            ec2: relQ.ec2Relations,
            vpcSubnets: relQ.vpcSubnets,
            elb: relQ.elbRelations,
            nat: relQ.natRelations,
            igw: relQ.igwRelations,
            tgw: relQ.tgwRelations,
            rds: relQ.rdsRelations,
            k8s: relQ.eksNodes,
            k8sSvc: relQ.k8sServices,
            k8sIng: relQ.k8sIngress,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

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

  // Infra Map Data — for resource map view / 인프라 맵 데이터 — 리소스 맵 뷰용
  const infraMapData = useMemo(() => {
    const vpcs = get('vpcSubnets');
    const ec2s = get('ec2');
    const elbs = get('elb');
    const nats = get('nat');
    const igws = get('igw');
    const tgws = get('tgw');
    const rdss = get('rds');

    // Unique VPCs / 고유 VPC
    const vpcList: any[] = [];
    const vpcSeen = new Set<string>();
    vpcs.forEach((r: any) => {
      if (r.vpc_id && !vpcSeen.has(r.vpc_id)) {
        vpcSeen.add(r.vpc_id);
        vpcList.push({ id: r.vpc_id, name: r.vpc_name || r.vpc_id.slice(-8), cidr: r.vpc_cidr });
      }
    });

    // Subnets / 서브넷
    const subnetList: any[] = [];
    const subSeen = new Set<string>();
    vpcs.forEach((r: any) => {
      if (r.subnet_id && !subSeen.has(r.subnet_id)) {
        subSeen.add(r.subnet_id);
        subnetList.push({ id: r.subnet_id, name: r.subnet_name || r.subnet_id.slice(-8), vpc_id: r.vpc_id, cidr: r.subnet_cidr, az: r.availability_zone });
      }
    });

    // EC2 → subnet / EC2 → 서브넷
    const ec2BySubnet: Record<string, any[]> = {};
    ec2s.forEach((r: any) => {
      if (!r.subnet_id) return;
      if (!ec2BySubnet[r.subnet_id]) ec2BySubnet[r.subnet_id] = [];
      ec2BySubnet[r.subnet_id].push(r);
    });

    // Unique targets / 고유 타겟
    const uniqueIgws = igws.filter((r: any, i: number, arr: any[]) => arr.findIndex((a: any) => a.internet_gateway_id === r.internet_gateway_id) === i);
    const uniqueNats = nats.filter((r: any, i: number, arr: any[]) => arr.findIndex((a: any) => a.nat_gateway_id === r.nat_gateway_id) === i);
    const uniqueTgws = tgws.filter((r: any, i: number, arr: any[]) => arr.findIndex((a: any) => a.transit_gateway_id === r.transit_gateway_id) === i);

    return { vpcList, subnetList, ec2s, elbs, rdss, ec2BySubnet, igws: uniqueIgws, nats: uniqueNats, tgws: uniqueTgws };
  }, [data]);

  // Infra map highlight / 인프라 맵 하이라이트
  const infraHl = useMemo(() => {
    const hl = { vpcs: new Set<string>(), subnets: new Set<string>(), ec2s: new Set<string>(), targets: new Set<string>() };
    const lower = infraSearch.toLowerCase();
    const sel = infraSelected;

    if (infraSearch) {
      infraMapData.ec2s.forEach((e: any) => {
        if ([e.name, e.instance_id, e.private_ip_address, e.public_ip_address, e.instance_type].some(v => (v || '').toLowerCase().includes(lower))) {
          hl.ec2s.add(e.instance_id);
          if (e.subnet_id) hl.subnets.add(e.subnet_id);
          if (e.vpc_id) hl.vpcs.add(e.vpc_id);
        }
      });
      infraMapData.subnetList.forEach((s: any) => {
        if ([s.name, s.id, s.cidr].some(v => (v || '').toLowerCase().includes(lower))) {
          hl.subnets.add(s.id);
          hl.vpcs.add(s.vpc_id);
        }
      });
      infraMapData.vpcList.forEach((v: any) => {
        if ([v.name, v.id, v.cidr].some(val => (val || '').toLowerCase().includes(lower))) hl.vpcs.add(v.id);
      });
      [...infraMapData.igws, ...infraMapData.nats, ...infraMapData.tgws].forEach((t: any) => {
        const tid = t.internet_gateway_id || t.nat_gateway_id || t.transit_gateway_id || '';
        const tname = t.name || '';
        if ([tid, tname].some(v => v.toLowerCase().includes(lower))) hl.targets.add(tid);
      });
    }
    if (sel) {
      if (sel.type === 'vpc') {
        hl.vpcs.add(sel.id);
        infraMapData.subnetList.filter((s: any) => s.vpc_id === sel.id).forEach((s: any) => hl.subnets.add(s.id));
        infraMapData.ec2s.filter((e: any) => e.vpc_id === sel.id).forEach((e: any) => hl.ec2s.add(e.instance_id));
      } else if (sel.type === 'subnet') {
        hl.subnets.add(sel.id);
        const s = infraMapData.subnetList.find((s: any) => s.id === sel.id);
        if (s) hl.vpcs.add(s.vpc_id);
        infraMapData.ec2s.filter((e: any) => e.subnet_id === sel.id).forEach((e: any) => hl.ec2s.add(e.instance_id));
      } else if (sel.type === 'ec2') {
        hl.ec2s.add(sel.id);
        const e = infraMapData.ec2s.find((e: any) => e.instance_id === sel.id);
        if (e) { if (e.subnet_id) hl.subnets.add(e.subnet_id); if (e.vpc_id) hl.vpcs.add(e.vpc_id); }
      } else if (sel.type === 'target') {
        hl.targets.add(sel.id);
      }
    }
    return hl;
  }, [infraSearch, infraSelected, infraMapData]);

  const hasInfraHl = infraSearch.length > 0 || infraSelected !== null;
  const isInfraHl = (type: string, id: string) => {
    if (type === 'vpc') return infraHl.vpcs.has(id);
    if (type === 'subnet') return infraHl.subnets.has(id);
    if (type === 'ec2') return infraHl.ec2s.has(id);
    if (type === 'target') return infraHl.targets.has(id);
    return false;
  };
  const infraDim = (type: string, id: string) => hasInfraHl && !isInfraHl(type, id);
  const toggleInfra = (type: string, id: string) => {
    if (infraSelected?.type === type && infraSelected?.id === id) setInfraSelected(null);
    else setInfraSelected({ type, id });
  };

  // K8s resource map data / K8s 리소스 맵 데이터
  const k8sMapData = useMemo(() => {
    const pods = get('k8s');
    const services = get('k8sSvc');
    const ingresses = get('k8sIng');

    // Pod → Node mapping
    const podsByNode: Record<string, any[]> = {};
    pods.forEach((p: any) => {
      if (!p.node_name) return;
      if (!podsByNode[p.node_name]) podsByNode[p.node_name] = [];
      podsByNode[p.node_name].push(p);
    });

    // Service → Pods mapping via selector labels
    const svcToPods: Record<string, string[]> = {};
    services.forEach((svc: any) => {
      const sel = (() => { try { return JSON.parse(svc.selector || '{}'); } catch { return {}; } })();
      const selKeys = Object.entries(sel);
      if (selKeys.length === 0) return;
      const matchingPods = pods.filter((p: any) => {
        // Simple label match: check if pod name contains app label value
        return selKeys.some(([, v]) => p.name?.includes(String(v)));
      }).map((p: any) => p.name);
      svcToPods[`${svc.namespace}/${svc.name}`] = matchingPods;
    });

    // Ingress → Services mapping via rules
    const ingToSvc: Record<string, string[]> = {};
    ingresses.forEach((ing: any) => {
      const rules = (() => { try { return JSON.parse(ing.rules || '[]'); } catch { return []; } })();
      const svcs: string[] = [];
      rules.forEach((rule: any) => {
        (rule.Http?.Paths || rule.http?.paths || []).forEach((path: any) => {
          const svcName = path.Backend?.Service?.Name || path.backend?.service?.name;
          if (svcName) svcs.push(`${ing.namespace}/${svcName}`);
        });
      });
      ingToSvc[`${ing.namespace}/${ing.name}`] = svcs;
    });

    return { pods, services, ingresses, podsByNode, svcToPods, ingToSvc };
  }, [data]);

  // Search highlight for K8s / K8s 검색 하이라이트
  const k8sHighlight = useMemo(() => {
    if (!k8sSearch) return { pods: new Set<string>(), nodes: new Set<string>(), svcs: new Set<string>(), ings: new Set<string>() };
    const lower = k8sSearch.toLowerCase();
    const hlPods = new Set<string>();
    const hlNodes = new Set<string>();
    const hlSvcs = new Set<string>();
    const hlIngs = new Set<string>();

    k8sMapData.pods.forEach((p: any) => {
      if (p.name?.toLowerCase().includes(lower) || p.namespace?.toLowerCase().includes(lower)) {
        hlPods.add(p.name);
        if (p.node_name) hlNodes.add(p.node_name);
      }
    });
    // Highlight services that match or have matching pods
    Object.entries(k8sMapData.svcToPods).forEach(([svcKey, podNames]) => {
      if (svcKey.toLowerCase().includes(lower) || podNames.some(p => hlPods.has(p))) {
        hlSvcs.add(svcKey);
        podNames.forEach(p => { hlPods.add(p); });
      }
    });
    // Highlight ingresses that match or have matching services
    Object.entries(k8sMapData.ingToSvc).forEach(([ingKey, svcKeys]) => {
      if (ingKey.toLowerCase().includes(lower) || svcKeys.some(s => hlSvcs.has(s))) {
        hlIngs.add(ingKey);
      }
    });
    // Also highlight nodes for highlighted pods
    k8sMapData.pods.forEach((p: any) => { if (hlPods.has(p.name) && p.node_name) hlNodes.add(p.node_name); });

    return { pods: hlPods, nodes: hlNodes, svcs: hlSvcs, ings: hlIngs };
  }, [k8sSearch, k8sMapData]);

  // Click-based highlight / 클릭 기반 하이라이트
  const k8sClickHl = useMemo(() => {
    const hl = { pods: new Set<string>(), nodes: new Set<string>(), svcs: new Set<string>(), ings: new Set<string>() };
    if (!k8sSelected) return hl;

    if (k8sSelected.type === 'pod') {
      const pod = k8sMapData.pods.find((p: any) => p.name === k8sSelected.key);
      if (pod) {
        hl.pods.add(pod.name);
        if (pod.node_name) hl.nodes.add(pod.node_name);
        // Find services selecting this pod
        Object.entries(k8sMapData.svcToPods).forEach(([svcKey, podNames]) => {
          if (podNames.includes(pod.name)) { hl.svcs.add(svcKey); }
        });
        // Find ingresses routing to those services
        Object.entries(k8sMapData.ingToSvc).forEach(([ingKey, svcKeys]) => {
          if (svcKeys.some(s => hl.svcs.has(s))) hl.ings.add(ingKey);
        });
      }
    } else if (k8sSelected.type === 'svc') {
      hl.svcs.add(k8sSelected.key);
      const podNames = k8sMapData.svcToPods[k8sSelected.key] || [];
      podNames.forEach(p => {
        hl.pods.add(p);
        const pod = k8sMapData.pods.find((pp: any) => pp.name === p);
        if (pod?.node_name) hl.nodes.add(pod.node_name);
      });
      Object.entries(k8sMapData.ingToSvc).forEach(([ingKey, svcKeys]) => {
        if (svcKeys.includes(k8sSelected.key)) hl.ings.add(ingKey);
      });
    } else if (k8sSelected.type === 'ing') {
      hl.ings.add(k8sSelected.key);
      const svcKeys = k8sMapData.ingToSvc[k8sSelected.key] || [];
      svcKeys.forEach(s => {
        hl.svcs.add(s);
        (k8sMapData.svcToPods[s] || []).forEach(p => {
          hl.pods.add(p);
          const pod = k8sMapData.pods.find((pp: any) => pp.name === p);
          if (pod?.node_name) hl.nodes.add(pod.node_name);
        });
      });
    } else if (k8sSelected.type === 'node') {
      hl.nodes.add(k8sSelected.key);
      (k8sMapData.podsByNode[k8sSelected.key] || []).forEach((p: any) => {
        hl.pods.add(p.name);
        Object.entries(k8sMapData.svcToPods).forEach(([svcKey, podNames]) => {
          if (podNames.includes(p.name)) hl.svcs.add(svcKey);
        });
      });
      Object.entries(k8sMapData.ingToSvc).forEach(([ingKey, svcKeys]) => {
        if (svcKeys.some(s => hl.svcs.has(s))) hl.ings.add(ingKey);
      });
    }
    return hl;
  }, [k8sSelected, k8sMapData]);

  // Combined highlight: search OR click / 검색 또는 클릭 하이라이트 통합
  const hasK8sSearch = k8sSearch.length > 0;
  const hasK8sClick = k8sSelected !== null;
  const hasK8sHl = hasK8sSearch || hasK8sClick;
  const isK8sHl = (type: string, key: string) => {
    if (hasK8sSearch) {
      if (type === 'pod') return k8sHighlight.pods.has(key);
      if (type === 'svc') return k8sHighlight.svcs.has(key);
      if (type === 'ing') return k8sHighlight.ings.has(key);
      if (type === 'node') return k8sHighlight.nodes.has(key);
    }
    if (hasK8sClick) {
      if (type === 'pod') return k8sClickHl.pods.has(key);
      if (type === 'svc') return k8sClickHl.svcs.has(key);
      if (type === 'ing') return k8sClickHl.ings.has(key);
      if (type === 'node') return k8sClickHl.nodes.has(key);
    }
    return false;
  };
  const k8sDim = (type: string, key: string) => hasK8sHl && !isK8sHl(type, key);
  const toggleK8s = (type: string, key: string) => {
    if (k8sSelected?.type === type && k8sSelected?.key === key) setK8sSelected(null);
    else setK8sSelected({ type, key });
  };

  const activeNodes = view === 'infra' ? infraNodes : [];
  const activeEdges = view === 'infra' ? infraEdges : [];

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
        {view === 'infra' && (
          <div className="flex gap-1 bg-navy-800 rounded-lg border border-navy-600 p-1">
            <button onClick={() => setInfraMode('map')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${infraMode === 'map' ? 'bg-accent-green/10 text-accent-green' : 'text-gray-400 hover:text-white'}`}>
              Map View
            </button>
            <button onClick={() => setInfraMode('graph')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${infraMode === 'graph' ? 'bg-accent-green/10 text-accent-green' : 'text-gray-400 hover:text-white'}`}>
              Graph View
            </button>
          </div>
        )}
        <span className="text-xs text-gray-500">
          {view === 'infra' && infraMode === 'graph' ? `${activeNodes.length} nodes, ${activeEdges.length} connections` : ''}
        </span>
        {loading && <span className="text-xs text-accent-cyan animate-pulse">Loading...</span>}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(view === 'infra'
          ? [['vpc','VPC'],['subnet','Subnet'],['ec2','EC2'],['elb','ELB'],['rds','RDS'],['nat','NAT'],['igw','IGW'],['tgw','TGW']]
          : [['igw','Ingress'],['nat','Service'],['k8s_pod','Pod'],['k8s_node','Node']]
        ).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border" style={{ borderColor: NODE_COLORS[type], background: NODE_COLORS[type] + '20' }} />
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Infrastructure — Graph View (ReactFlow) / 인프라 — 그래프 뷰 */}
      {view === 'infra' && infraMode === 'graph' && (
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
      )}

      {/* Infrastructure — Map View / 인프라 — 맵 뷰 */}
      {view === 'infra' && infraMode === 'map' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">🔍</span>
              <input type="text" value={infraSearch} onChange={(e) => { setInfraSearch(e.target.value); setInfraSelected(null); }}
                placeholder="Search EC2, subnet, VPC..."
                className="bg-navy-800 border border-navy-600 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 w-72 focus:ring-accent-cyan focus:border-accent-cyan focus:outline-none" />
            </div>
            {infraSearch && <button onClick={() => setInfraSearch('')} className="text-xs text-gray-500 hover:text-white">Clear search</button>}
            {infraSelected && (
              <button onClick={() => setInfraSelected(null)} className="text-xs px-2 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30">Clear selection</button>
            )}
          </div>

          <div className="grid grid-cols-5 gap-4 bg-navy-900 rounded-lg border border-navy-600 p-4" style={{ minHeight: 'calc(100vh - 320px)' }}>
            {/* Col 1: External / 외부 연결 (IGW, TGW) */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">External ({infraMapData.igws.length + infraMapData.tgws.length})</h3>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {infraMapData.igws.map((g: any) => {
                  const id = g.internet_gateway_id;
                  return (
                    <div key={id} onClick={() => toggleInfra('target', id)}
                      className={`rounded-lg border-2 p-2 text-xs font-mono cursor-pointer transition-all ${isInfraHl('target', id) ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : infraDim('target', id) ? 'border-navy-700 opacity-30' : 'border-accent-cyan/40 bg-accent-cyan/5 hover:border-accent-cyan'}`}>
                      <p className="text-accent-cyan font-bold">IGW</p>
                      <p className="text-gray-400">{g.name || id.slice(-11)}</p>
                    </div>
                  );
                })}
                {infraMapData.tgws.map((t: any) => {
                  const id = t.transit_gateway_id;
                  return (
                    <div key={id} onClick={() => toggleInfra('target', id)}
                      className={`rounded-lg border-2 p-2 text-xs font-mono cursor-pointer transition-all ${isInfraHl('target', id) ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : infraDim('target', id) ? 'border-navy-700 opacity-30' : 'border-accent-red/40 bg-accent-red/5 hover:border-accent-red'}`}>
                      <p className="text-accent-red font-bold">TGW</p>
                      <p className="text-gray-400">{t.name || id.slice(-11)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Col 2: VPCs */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">VPCs ({infraMapData.vpcList.length})</h3>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {infraMapData.vpcList.map((v: any) => (
                  <div key={v.id} onClick={() => toggleInfra('vpc', v.id)}
                    className={`rounded-lg border p-2 text-xs font-mono cursor-pointer transition-all ${isInfraHl('vpc', v.id) ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : infraDim('vpc', v.id) ? 'border-navy-700 opacity-30' : 'border-accent-cyan/40 bg-navy-800 hover:border-accent-cyan'}`}>
                    <p className="text-white font-semibold">{v.name}</p>
                    <p className="text-accent-cyan">{v.cidr}</p>
                    <p className="text-gray-600 text-[9px]">{v.id}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 3: Subnets */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Subnets ({infraMapData.subnetList.length})</h3>
              <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1">
                {infraMapData.subnetList.map((s: any) => (
                  <div key={s.id} onClick={() => toggleInfra('subnet', s.id)}
                    className={`rounded-lg border p-2 text-xs font-mono cursor-pointer transition-all ${isInfraHl('subnet', s.id) ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : infraDim('subnet', s.id) ? 'border-navy-700 opacity-30' : 'border-accent-green/30 bg-navy-800 hover:border-accent-green'}`}>
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold bg-accent-green/20 text-accent-green">{(s.az || '').slice(-1).toUpperCase()}</span>
                      <span className="text-white truncate">{s.name}</span>
                    </div>
                    <p className="text-gray-500 pl-5">{s.cidr}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 4: Compute (EC2, ELB, RDS) */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Compute ({infraMapData.ec2s.length})</h3>
              <div className="space-y-1 max-h-[65vh] overflow-y-auto pr-1">
                {infraMapData.ec2s.map((e: any) => (
                  <div key={e.instance_id} onClick={() => toggleInfra('ec2', e.instance_id)}
                    className={`rounded border px-2 py-1 text-[10px] font-mono cursor-pointer transition-all ${isInfraHl('ec2', e.instance_id) ? 'border-accent-cyan ring-1 ring-accent-cyan/50 bg-accent-cyan/10' : infraDim('ec2', e.instance_id) ? 'border-navy-700 opacity-20' : 'border-navy-600 bg-navy-800 hover:border-accent-purple'}`}>
                    <span className="text-accent-purple">{e.name || e.instance_id.slice(-11)}</span>
                    <span className="text-gray-600 ml-1">{e.instance_type}</span>
                    <span className={`ml-1 ${e.instance_state === 'running' ? 'text-accent-green' : 'text-accent-red'}`}>●</span>
                  </div>
                ))}
                {infraMapData.elbs.map((lb: any) => (
                  <div key={lb.name} className="rounded border px-2 py-1 text-[10px] font-mono border-accent-pink/30 bg-navy-800">
                    <span className="text-accent-pink">{lb.name}</span>
                    <span className="text-gray-600 ml-1">{lb.lb_type}</span>
                  </div>
                ))}
                {infraMapData.rdss.map((r: any) => (
                  <div key={r.db_instance_identifier} className="rounded border px-2 py-1 text-[10px] font-mono border-accent-orange/30 bg-navy-800">
                    <span className="text-accent-orange">{r.db_instance_identifier}</span>
                    <span className="text-gray-600 ml-1">{r.engine}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 5: NAT Gateways */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">NAT ({infraMapData.nats.length})</h3>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {infraMapData.nats.map((n: any) => {
                  const id = n.nat_gateway_id;
                  return (
                    <div key={id} onClick={() => toggleInfra('target', id)}
                      className={`rounded-lg border-2 p-2 text-xs font-mono cursor-pointer transition-all ${isInfraHl('target', id) ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : infraDim('target', id) ? 'border-navy-700 opacity-30' : 'border-accent-orange/40 bg-accent-orange/5 hover:border-accent-orange'}`}>
                      <p className="text-accent-orange font-bold">NAT</p>
                      <p className="text-gray-400">{n.name || id.slice(-11)}</p>
                      <p className="text-gray-600 text-[9px]">{n.state}</p>
                    </div>
                  );
                })}
                {infraMapData.nats.length === 0 && <p className="text-gray-600 text-xs">No NAT GWs</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kubernetes — Resource Map / K8s — 리소스 맵 */}
      {view === 'k8s' && (
        <div className="space-y-4">
          {/* Search / 검색 */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">🔍</span>
              <input type="text" value={k8sSearch} onChange={(e) => setK8sSearch(e.target.value)}
                placeholder="Search pods, services... (e.g. carts)"
                className="bg-navy-800 border border-navy-600 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 w-72 focus:ring-accent-cyan focus:border-accent-cyan focus:outline-none" />
            </div>
            {hasK8sSearch && (
              <>
                <button onClick={() => setK8sSearch('')} className="text-xs text-gray-500 hover:text-white">Clear search</button>
                <span className="text-xs text-accent-cyan">
                  {k8sHighlight.pods.size} pods · {k8sHighlight.svcs.size} services · {k8sHighlight.nodes.size} nodes
                </span>
              </>
            )}
            {hasK8sClick && (
              <>
                <button onClick={() => setK8sSelected(null)}
                  className="text-xs px-2 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/20">
                  Clear selection
                </button>
                <span className="text-xs text-gray-400">
                  {k8sSelected?.type}: {k8sSelected?.key.split('/').pop()?.slice(0, 30)}
                </span>
              </>
            )}
          </div>

          {/* 4-Column Resource Map / 4컬럼 리소스 맵 */}
          <div className="grid grid-cols-4 gap-4 bg-navy-900 rounded-lg border border-navy-600 p-4" style={{ minHeight: 'calc(100vh - 320px)' }}>
            {/* Col 1: Ingress / 인그레스 */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Ingress ({k8sMapData.ingresses.length})</h3>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {k8sMapData.ingresses.length === 0 ? <p className="text-gray-600 text-xs">No ingresses</p> :
                  k8sMapData.ingresses.map((ing: any) => {
                    const key = `${ing.namespace}/${ing.name}`;
                    const hl = isK8sHl('ing', key);
                    const dim = k8sDim('ing', key);
                    return (
                      <div key={key} onClick={() => toggleK8s('ing', key)}
                        className={`rounded-lg border p-2 text-xs font-mono transition-all cursor-pointer ${hl ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : dim ? 'border-navy-700 opacity-30' : 'border-accent-pink/40 bg-accent-pink/5 hover:border-accent-pink'}`}>
                        <p className="text-white font-semibold">{ing.name}</p>
                        <p className="text-gray-500">{ing.namespace} · {ing.ingress_class_name || 'default'}</p>
                        {(() => { try { const lb = JSON.parse(ing.load_balancer || '{}'); const ings = lb.Ingress || lb.ingress || []; return ings.length > 0 ? <p className="text-accent-pink text-[9px] mt-0.5 truncate">{ings[0].Hostname || ings[0].hostname || ings[0].IP || ings[0].ip}</p> : null; } catch { return null; } })()}
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Col 2: Services / 서비스 */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Services ({k8sMapData.services.length})</h3>
              <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1">
                {k8sMapData.services.map((svc: any) => {
                  const key = `${svc.namespace}/${svc.name}`;
                  const hl = isK8sHl('svc', key);
                  const dim = k8sDim('svc', key);
                  const podCount = (k8sMapData.svcToPods[key] || []).length;
                  return (
                    <div key={key} onClick={() => toggleK8s('svc', key)}
                      className={`rounded-lg border p-2 text-xs font-mono transition-all cursor-pointer ${hl ? 'border-accent-cyan ring-2 ring-accent-cyan/50 bg-accent-cyan/10' : dim ? 'border-navy-700 opacity-30' : 'border-accent-orange/30 bg-navy-800 hover:border-accent-orange'}`}>
                      <div className="flex justify-between"><span className="text-white">{svc.name}</span><span className="text-gray-600">{svc.type}</span></div>
                      <p className="text-gray-500">{svc.namespace} · {svc.cluster_ip} · {podCount} pods</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Col 3: Pods (grouped by namespace) / 파드 (네임스페이스별) */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Pods ({k8sMapData.pods.length})</h3>
              <div className="space-y-1 max-h-[65vh] overflow-y-auto pr-1">
                {k8sMapData.pods.map((p: any) => {
                  const hl = isK8sHl('pod', p.name);
                  const dim = k8sDim('pod', p.name);
                  return (
                    <div key={p.name} onClick={() => toggleK8s('pod', p.name)}
                      className={`rounded border px-2 py-1 text-[10px] font-mono transition-all cursor-pointer ${hl ? 'border-accent-cyan ring-1 ring-accent-cyan/50 bg-accent-cyan/10' : dim ? 'border-navy-700 opacity-20' : 'border-navy-600 bg-navy-800 hover:border-navy-400'}`}>
                      <span className="text-white">{p.name.length > 30 ? p.name.slice(0, 28) + '..' : p.name}</span>
                      <span className="text-gray-600 ml-1">{p.namespace}</span>
                      <span className="text-gray-700 ml-1">{p.node_name?.split('.')[0]?.slice(-12)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Col 4: Nodes / 노드 */}
            <div>
              <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Nodes ({Object.keys(k8sMapData.podsByNode).length})</h3>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {Object.entries(k8sMapData.podsByNode).map(([nodeName, nodePods]: [string, any]) => {
                  const hl = isK8sHl('node', nodeName);
                  const dim = k8sDim('node', nodeName);
                  const hlPodCount = hasK8sHl ? (nodePods as any[]).filter((p: any) => isK8sHl('pod', p.name)).length : 0;
                  return (
                    <div key={nodeName} onClick={() => toggleK8s('node', nodeName)}
                      className={`rounded-lg border p-2 text-xs font-mono transition-all cursor-pointer ${hl ? 'border-accent-green ring-2 ring-accent-green/50 bg-accent-green/10' : dim ? 'border-navy-700 opacity-30' : 'border-accent-green/30 bg-navy-800 hover:border-accent-green'}`}>
                      <p className="text-accent-green font-semibold">{nodeName.split('.')[0]}</p>
                      <p className="text-gray-500">{(nodePods as any[]).length} pods{hlPodCount > 0 ? ` · ${hlPodCount} matched` : ''}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
