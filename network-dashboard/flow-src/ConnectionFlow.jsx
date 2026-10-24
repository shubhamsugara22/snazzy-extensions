import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MarkerType, BackgroundVariant } from '@xyflow/react';
import FlowNode from './FlowNode.jsx';
import { formatMs, formatBytes, hostOf, isFirstParty } from './utils.js';

const nodeTypes = { flow: FlowNode };
const num = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);

const PHASES = [
  { key: 'redirect', label: 'Redirects', color: '#94a3b8' },
  { key: 'dns', label: 'DNS lookup', color: '#8b5cf6' },
  { key: 'tcp', label: 'TCP connect', color: '#f59e0b' },
  { key: 'tls', label: 'TLS handshake', color: '#22c55e' },
  { key: 'ttfb', label: 'Request → first byte', color: '#1a5cff' },
  { key: 'download', label: 'Response download', color: '#0ea5a4' }
];

function arrow(color) {
  return { type: MarkerType.ArrowClosed, width: 14, height: 14, color, markerUnits: 'userSpaceOnUse' };
}

function edge(id, source, target, color, label, opts = {}) {
  return {
    id, source, target, type: 'default', animated: true, markerEnd: arrow(color),
    style: { stroke: color, strokeWidth: 2.5, opacity: 0.8, ...(opts.dashed ? { strokeDasharray: '6 4' } : {}) },
    label, labelStyle: { fontSize: 11.5, fontWeight: 600, fill: '#334155' },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.95 }, labelBgPadding: [6, 3], labelBgBorderRadius: 6
  };
}

function computePhases(nav) {
  const n = nav || {};
  const dns = num(n.domainLookupEnd - n.domainLookupStart);
  const tcp = num(n.connectEnd - n.connectStart);
  const tlsRaw = n.secureConnectionStart > 0 ? num(n.connectEnd - n.secureConnectionStart) : null;
  // TCP excludes the TLS portion that is reported inside connect time
  const tcpOnly = tcp !== null && tlsRaw !== null ? Math.max(0, tcp - tlsRaw) : tcp;
  return {
    redirect: num(n.redirectEnd - n.redirectStart) || 0,
    dns, tcp: tcpOnly, tls: tlsRaw,
    ttfb: num(n.responseStart - n.requestStart),
    download: num(n.responseEnd - n.responseStart)
  };
}

export default function ConnectionFlow({ nav, conn, pageHost, serverIp, publicIp, resources }) {
  const n = nav || {};
  const phases = useMemo(() => computePhases(n), [n]);
  const protocol = n.nextHopProtocol || 'unknown';
  const secure = n.secureConnectionStart > 0 || protocol === 'h2' || protocol === 'h3';
  const reused = (phases.dns || 0) === 0 && (phases.tcp || 0) === 0;

  const origins = useMemo(() => {
    const set = new Set();
    (resources || []).forEach(r => {
      const h = hostOf(r.name);
      if (!isFirstParty(h, pageHost)) set.add(h);
    });
    return set.size;
  }, [resources, pageHost]);

  const { nodes, edges } = useMemo(() => {
    const ns = [
      {
        id: 'client', type: 'flow', position: { x: 0, y: 250 },
        data: {
          kind: 'browser', color: '#0f172a', icon: '💻', title: 'Your browser', subtitle: 'Client',
          rows: [
            ['Public IP', publicIp || 'n/a'],
            ['Link type', conn?.effectiveType || 'n/a'],
            ['Downlink', conn?.downlink != null ? `${conn.downlink} Mbps` : 'n/a'],
            ['Data saver', conn?.saveData ? 'On' : 'Off']
          ]
        }
      },
      {
        id: 'network', type: 'flow', position: { x: 480, y: 270 },
        data: {
          kind: 'network', color: '#64748b', icon: '📶', title: 'Network path', subtitle: 'ISP / transit',
          rows: [
            ['Round-trip', conn?.rtt != null ? `${conn.rtt} ms` : 'n/a'],
            ['Connection', reused ? 'Reused' : 'New'],
            ['Redirects', n.redirectCount ?? 0]
          ]
        }
      },
      {
        id: 'server', type: 'flow', position: { x: 980, y: 240 },
        data: {
          kind: 'server', color: '#c8102e', icon: '🖥️', title: pageHost || 'Server', subtitle: 'Origin / edge',
          badge: { text: secure ? 'HTTPS' : 'HTTP', tone: secure ? 'good' : 'bad' },
          rows: [
            ['Server IP', serverIp || 'n/a'],
            ['Protocol', protocol],
            ['TTFB', formatMs(phases.ttfb)],
            ['Page size', formatBytes(n.transferSize || 0)]
          ]
        }
      },
      {
        id: 'dns', type: 'flow', position: { x: 480, y: 500 },
        data: {
          kind: 'dns', color: '#8b5cf6', icon: '🔎', title: 'DNS resolver', subtitle: 'Name resolution',
          rows: [['Lookup time', phases.dns === 0 ? 'cached' : formatMs(phases.dns)], ['Hostname', pageHost || 'n/a'], ['Resolved to', serverIp || 'n/a']]
        }
      },
      {
        id: 'origins', type: 'flow', position: { x: 980, y: 20 },
        data: {
          kind: 'domain', color: '#c8102e', icon: '↗', title: 'Third-party origins', subtitle: `${origins} other domain${origins === 1 ? '' : 's'}`,
          rows: [['Requests', (resources || []).filter(r => !isFirstParty(hostOf(r.name), pageHost)).length]]
        }
      }
    ];

    const tlsLabel = phases.tls !== null ? ` · TLS ${formatMs(phases.tls)}` : '';
    const es = [
      edge('e-client-net', 'client', 'network', '#f59e0b', `TCP ${formatMs(phases.tcp)}${tlsLabel}`),
      edge('e-net-server', 'network', 'server', '#1a5cff', `Request → TTFB ${formatMs(phases.ttfb)}`),
      edge('e-client-dns', 'client', 'dns', '#8b5cf6', `DNS ${phases.dns === 0 ? 'cached' : formatMs(phases.dns)}`),
      edge('e-dns-server', 'dns', 'server', '#8b5cf6', 'resolves IP', { dashed: true }),
      edge('e-net-origins', 'network', 'origins', '#c8102e', `${origins} hosts`, { dashed: true })
    ];
    return { nodes: ns, edges: es };
  }, [n, conn, pageHost, serverIp, publicIp, resources, phases, protocol, secure, reused, origins]);

  const total = PHASES.reduce((s, p) => s + (phases[p.key] || 0), 0);
  const compression = n.encodedBodySize && n.decodedBodySize ? Math.round((1 - n.encodedBodySize / n.decodedBodySize) * 100) : null;

  return (
    <div className="flow-wrap">
      <div className="flow-stats">
        <Stat label="Protocol" value={protocol} />
        <Stat label="Security" value={secure ? 'Encrypted (TLS)' : 'Unencrypted'} />
        <Stat label="Time to first byte" value={formatMs(phases.ttfb)} />
        <Stat label="Connection setup" value={formatMs((phases.dns || 0) + (phases.tcp || 0) + (phases.tls || 0))} />
        <Stat label="Compression" value={compression !== null ? `${Math.max(0, compression)}% saved` : 'n/a'} />
      </div>

      <div className="flow-canvas" style={{ height: 560 }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.1 }} minZoom={0.4} maxZoom={1.6}
          nodesConnectable={false} proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#d3d9e6" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="phase-card">
        <div className="phase-head">
          <h4>Request timeline</h4>
          <span>{total ? `${formatMs(total)} total` : ''}</span>
        </div>
        <div className="phase-bar">
          {PHASES.filter(p => phases[p.key] > 0).map(p => (
            <div key={p.key} className="phase-seg" title={`${p.label}: ${formatMs(phases[p.key])}`}
              style={{ flexGrow: phases[p.key], background: p.color }} />
          ))}
          {total === 0 && <div className="phase-seg" style={{ flexGrow: 1, background: '#e5e9f2' }} />}
        </div>
        <ul className="phase-legend">
          {PHASES.map(p => (
            <li key={p.key}>
              <i style={{ background: p.color }} />
              <span>{p.label}</span>
              <b>{phases[p.key] === null ? 'n/a' : formatMs(phases[p.key])}</b>
            </li>
          ))}
        </ul>
        {reused && <p className="phase-note">DNS and TCP are 0 ms because the connection was reused or cached.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="flow-stat"><span>{label}</span><b>{value}</b></div>;
}
