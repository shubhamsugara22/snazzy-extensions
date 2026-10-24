import { useMemo, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, MarkerType, BackgroundVariant } from '@xyflow/react';
import FlowNode from './FlowNode.jsx';
import { TYPE_META, classifyType, hostOf, isFirstParty, formatBytes } from './utils.js';

const nodeTypes = { flow: FlowNode };
const MAX_DOMAINS = 14;
const OTHERS = '__others__';

function arrow(color) {
  // userSpaceOnUse keeps the arrowhead a constant size regardless of edge thickness
  return { type: MarkerType.ArrowClosed, width: 14, height: 14, color, markerUnits: 'userSpaceOnUse' };
}

function strokeFor(weight, max) {
  return 1.5 + Math.sqrt(weight / max) * 5.5;
}

function buildModel(resources, pageHost, thirdPartyOnly) {
  const types = new Map();
  const domains = new Map();
  const pairs = new Map();

  resources.forEach(r => {
    const host = hostOf(r.name);
    const firstParty = isFirstParty(host, pageHost);
    if (thirdPartyOnly && firstParty) return;
    const type = classifyType(r);
    const bytes = r.transferSize || 0;
    const t = types.get(type) || { id: type, count: 0, bytes: 0 };
    t.count++; t.bytes += bytes; types.set(type, t);
    const d = domains.get(host) || { id: host, host, firstParty, count: 0, bytes: 0, duration: 0 };
    d.count++; d.bytes += bytes; d.duration += r.duration || 0; domains.set(host, d);
    const key = `${type}|${host}`;
    const p = pairs.get(key) || { type, host, count: 0, bytes: 0 };
    p.count++; p.bytes += bytes; pairs.set(key, p);
  });

  const sorted = [...domains.values()].sort((a, b) => (b.bytes - a.bytes) || (b.count - a.count));
  const visible = sorted.slice(0, MAX_DOMAINS);
  const hidden = sorted.slice(MAX_DOMAINS);
  const shown = new Set(visible.map(d => d.host));
  const domainList = [...visible];
  if (hidden.length) {
    domainList.push({
      id: OTHERS, host: `${hidden.length} more domains`, firstParty: false, other: true,
      count: hidden.reduce((s, d) => s + d.count, 0),
      bytes: hidden.reduce((s, d) => s + d.bytes, 0),
      duration: hidden.reduce((s, d) => s + d.duration, 0)
    });
  }

  const agg = new Map();
  pairs.forEach(p => {
    const host = shown.has(p.host) ? p.host : OTHERS;
    const key = `${p.type}|${host}`;
    const a = agg.get(key) || { type: p.type, host, count: 0, bytes: 0 };
    a.count += p.count; a.bytes += p.bytes; agg.set(key, a);
  });

  return {
    typeList: [...types.values()].sort((a, b) => b.bytes - a.bytes),
    domainList,
    links: [...agg.values()]
  };
}

export default function TrafficFlow({ resources, pageHost }) {
  const [thirdPartyOnly, setThirdPartyOnly] = useState(false);
  const [focus, setFocus] = useState(null);

  const model = useMemo(() => buildModel(resources, pageHost, thirdPartyOnly), [resources, pageHost, thirdPartyOnly]);

  const totals = useMemo(() => {
    const all = resources.length;
    const bytes = resources.reduce((s, r) => s + (r.transferSize || 0), 0);
    const hosts = new Set(resources.map(r => hostOf(r.name)));
    const third = resources.filter(r => !isFirstParty(hostOf(r.name), pageHost));
    return {
      all, bytes, domains: hosts.size,
      thirdShare: all ? Math.round((third.length / all) * 100) : 0
    };
  }, [resources, pageHost]);

  const { nodes, edges } = useMemo(() => {
    const { typeList, domainList, links } = model;
    const TYPE_H = 74, DOM_H = 74, GAP = 26;
    const colHeight = n => n * (DOM_H + GAP) - GAP;
    const H = Math.max(colHeight(domainList.length), colHeight(typeList.length), 160);
    const place = (i, n, h) => (H - colHeight(n)) / 2 + i * (h + GAP);

    // adjacency for focus highlighting
    const adj = new Map();
    const link = (a, b) => {
      (adj.get(a) || adj.set(a, new Set()).get(a)).add(b);
      (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
    };
    typeList.forEach(t => link('browser', `t:${t.id}`));
    links.forEach(l => link(`t:${l.type}`, `d:${l.host}`));
    let active = null;
    if (focus && adj.has(focus)) {
      active = new Set([focus]);
      if (focus === 'browser') adj.forEach((_, k) => active.add(k));
      else {
        adj.get(focus).forEach(n => active.add(n));
        if (focus.startsWith('d:')) adj.get(focus).forEach(t => active.add(t));
        active.add('browser');
      }
    }
    const dim = id => active && !active.has(id);

    const ns = [];
    ns.push({
      id: 'browser', type: 'flow', position: { x: 0, y: (H - 120) / 2 }, draggable: true,
      data: {
        kind: 'browser', color: '#0f172a', icon: '🌐', title: 'Browser',
        subtitle: pageHost || 'current page',
        rows: [['Requests', totals.all], ['Transferred', formatBytes(totals.bytes)]]
      }
    });
    typeList.forEach((t, i) => {
      const meta = TYPE_META[t.id];
      ns.push({
        id: `t:${t.id}`, type: 'flow', position: { x: 440, y: place(i, typeList.length, TYPE_H) },
        data: { kind: 'type', color: meta.color, icon: meta.icon, title: meta.label, subtitle: `${t.count} requests · ${formatBytes(t.bytes)}`, dim: dim(`t:${t.id}`) }
      });
    });
    domainList.forEach((d, i) => {
      ns.push({
        id: `d:${d.id}`, type: 'flow', position: { x: 920, y: place(i, domainList.length, DOM_H) },
        data: {
          kind: 'domain', color: d.other ? '#94a3b8' : d.firstParty ? '#15803d' : '#c8102e',
          icon: d.other ? '⋯' : d.firstParty ? '🏠' : '↗',
          title: d.host, subtitle: `${d.count} requests · ${formatBytes(d.bytes)}`,
          badge: d.other ? null : { text: d.firstParty ? '1st party' : '3rd party', tone: d.firstParty ? 'good' : 'bad' },
          dim: dim(`d:${d.id}`)
        }
      });
    });

    const maxT = Math.max(1, ...typeList.map(t => Math.max(t.bytes, t.count * 800)));
    const maxL = Math.max(1, ...links.map(l => Math.max(l.bytes, l.count * 800)));
    const es = [];
    typeList.forEach(t => {
      const color = TYPE_META[t.id].color;
      const id = `t:${t.id}`;
      const off = dim(id);
      es.push({
        id: `e-b-${t.id}`, source: 'browser', target: id, type: 'default',
        style: { stroke: color, strokeWidth: strokeFor(Math.max(t.bytes, t.count * 800), maxT), opacity: off ? 0.12 : 0.6 },
        markerEnd: arrow(color), animated: !off && focus === id,
        label: String(t.count), labelStyle: { fontSize: 11, fontWeight: 600, fill: '#475569' },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 }, labelBgPadding: [4, 2], labelBgBorderRadius: 4
      });
    });
    links.forEach(l => {
      const color = TYPE_META[l.type].color;
      const off = dim(`t:${l.type}`) || dim(`d:${l.host}`);
      es.push({
        id: `e-${l.type}-${l.host}`, source: `t:${l.type}`, target: `d:${l.host}`, type: 'default',
        style: { stroke: color, strokeWidth: strokeFor(Math.max(l.bytes, l.count * 800), maxL), opacity: off ? 0.1 : 0.55 },
        markerEnd: arrow(color), animated: !off && !!focus
      });
    });
    return { nodes: ns, edges: es };
  }, [model, focus, pageHost, totals]);

  const onNodeClick = useCallback((_, node) => setFocus(f => (f === node.id ? null : node.id)), []);
  const onPaneClick = useCallback(() => setFocus(null), []);

  if (!resources.length) return <div className="flow-empty">No resource traffic captured for this page.</div>;

  return (
    <div className="flow-wrap">
      <div className="flow-stats">
        <Stat label="Requests" value={totals.all} />
        <Stat label="Transferred" value={formatBytes(totals.bytes)} />
        <Stat label="Domains" value={totals.domains} />
        <Stat label="Third-party requests" value={`${totals.thirdShare}%`} />
        <label className="flow-toggle">
          <input type="checkbox" checked={thirdPartyOnly} onChange={e => { setThirdPartyOnly(e.target.checked); setFocus(null); }} />
          Third-party only
        </label>
      </div>
      <div className="flow-legend">
        <span><i style={{ background: '#15803d' }} />First-party</span>
        <span><i style={{ background: '#c8102e' }} />Third-party</span>
        <span className="flow-hint">Edge thickness = bytes · click a node to trace its path · scroll to zoom, drag to pan</span>
      </div>
      <div className="flow-canvas" style={{ height: 620 }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodeClick={onNodeClick} onPaneClick={onPaneClick}
          fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.3} maxZoom={1.6}
          nodesConnectable={false} proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#d3d9e6" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={n => n.data?.color || '#94a3b8'} />
        </ReactFlow>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="flow-stat"><span>{label}</span><b>{value}</b></div>;
}
