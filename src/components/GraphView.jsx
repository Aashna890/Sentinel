// ─────────────────────────────────────────────────────────────────────────────
// GraphView.jsx
// Interactive SVG graph visualisation for email infrastructure correlation.
// Renders nodes (Email, Domain, IP, URL, Campaign) and typed edges between them.
// Uses a simple force-directed layout computed in JS (no external lib needed).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

// ── Node type colours ─────────────────────────────────────────────────────────
const NODE_STYLE = {
  email:    { fill: '#0e7490', stroke: '#22d3ee', label: '✉' },
  domain:   { fill: '#7c3aed', stroke: '#a78bfa', label: '🌐' },
  ip:       { fill: '#b45309', stroke: '#fbbf24', label: '⚡' },
  url:      { fill: '#065f46', stroke: '#34d399', label: '🔗' },
  campaign: { fill: '#991b1b', stroke: '#f87171', label: '⚠' },
  unknown:  { fill: '#334155', stroke: '#64748b', label: '?' },
};

const EDGE_STYLE = {
  sent_from:           { stroke: '#22d3ee', dash: '' },
  originated_from:     { stroke: '#fbbf24', dash: '4 2' },
  contains_url:        { stroke: '#34d399', dash: '2 3' },
  domain_resolves_to:  { stroke: '#a78bfa', dash: '' },
  shared_infrastructure:{ stroke: '#f87171', dash: '6 3' },
  reply_to_domain:     { stroke: '#fb923c', dash: '4 2' },
  member_of_campaign:  { stroke: '#f87171', dash: '8 4' },
  default:             { stroke: '#475569', dash: '3 3' },
};

// ── Simple force layout (no D3 needed) ───────────────────────────────────────

function initPositions(nodes, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  return nodes.map((n, i) => {
    const angle  = (i / nodes.length) * 2 * Math.PI;
    const radius = Math.min(width, height) * 0.33;
    return {
      ...n,
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0,
    };
  });
}

function runForce(nodes, edges, iterations = 120) {
  const REPEL    = 4000;
  const ATTRACT  = 0.04;
  const IDEAL    = 130;
  const DAMPING  = 0.85;

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x || 0.1;
        const dy = b.y - a.y || 0.1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPEL / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    // Attraction along edges
    edges.forEach(e => {
      const a = nodeMap[e.source];
      const b = nodeMap[e.target];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - IDEAL) * ATTRACT;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });
    // Integrate
    nodes.forEach(n => {
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x  += n.vx;   n.y  += n.vy;
    });
  }
  return nodes;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GraphView({ nodes = [], edges = [], width = 680, height = 420 }) {
  const [laid, setLaid] = useState([]);
  const [selected, setSelected] = useState(null);
  const [drag, setDrag]   = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!nodes.length) { setLaid([]); return; }
    const positioned = initPositions(nodes, width, height);
    const settled    = runForce(positioned, edges, 150);
    // Clamp to canvas
    settled.forEach(n => {
      n.x = Math.max(40, Math.min(width  - 40, n.x));
      n.y = Math.max(40, Math.min(height - 40, n.y));
    });
    setLaid(settled);
  }, [nodes, edges, width, height]);

  const nodeMap = {};
  laid.forEach(n => { nodeMap[n.id] = n; });

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onMouseDown = (e, id) => {
    e.preventDefault();
    setDrag(id);
    setSelected(id);
  };

  const onMouseMove = (e) => {
    if (!drag) return;
    const svg  = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;
    setLaid(prev => prev.map(n => n.id === drag ? { ...n, x, y } : n));
  };

  const onMouseUp = () => setDrag(null);

  const selNode = laid.find(n => n.id === selected);

  if (!nodes.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-500 rounded-xl border border-slate-800 bg-slate-950/30">
        No graph data — analyse more emails to build the correlation graph.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden select-none">
      {/* SVG canvas */}
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: drag ? 'grabbing' : 'default' }}
      >
        <defs>
          {/* Arrow marker per edge colour */}
          {Object.entries(EDGE_STYLE).map(([k, s]) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="10" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={s.stroke} opacity="0.7" />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const a = nodeMap[e.source];
          const b = nodeMap[e.target];
          if (!a || !b) return null;
          const style = EDGE_STYLE[e.type] || EDGE_STYLE.default;
          // Shorten line so it stops at node radius (r=22)
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = 24;
          const x1 = a.x + (dx / dist) * r;
          const y1 = a.y + (dy / dist) * r;
          const x2 = b.x - (dx / dist) * r;
          const y2 = b.y - (dy / dist) * r;
          return (
            <g key={i}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={style.stroke}
                strokeWidth="1.5"
                strokeDasharray={style.dash}
                strokeOpacity="0.6"
                markerEnd={`url(#arrow-${e.type || 'default'})`}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {laid.map(n => {
          const style  = NODE_STYLE[n.type] || NODE_STYLE.unknown;
          const isHigh = n.fraud_score >= 70;
          const isFocus= n.is_focus;
          const isSel  = n.id === selected;
          return (
            <g key={n.id}
               style={{ cursor: 'grab' }}
               onMouseDown={ev => onMouseDown(ev, n.id)}>
              {/* Glow ring for focus node */}
              {isFocus && (
                <circle cx={n.x} cy={n.y} r={32}
                        fill="none" stroke="#22d3ee" strokeWidth="2"
                        strokeOpacity="0.4" strokeDasharray="4 3" />
              )}
              {/* Selection ring */}
              {isSel && !isFocus && (
                <circle cx={n.x} cy={n.y} r={30}
                        fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.3" />
              )}
              {/* High-risk pulse ring */}
              {isHigh && (
                <circle cx={n.x} cy={n.y} r={28}
                        fill="none" stroke="#ef4444" strokeWidth="1.5"
                        strokeOpacity="0.35" strokeDasharray="3 2" />
              )}
              {/* Main circle */}
              <circle cx={n.x} cy={n.y} r={22}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={isSel ? 2.5 : 1.5}
                      fillOpacity="0.9" />
              {/* Icon */}
              <text x={n.x} y={n.y - 1}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="13" style={{ pointerEvents: 'none' }}>
                {style.label}
              </text>
              {/* Fraud score badge */}
              {n.fraud_score != null && (
                <text x={n.x + 16} y={n.y - 16}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="8" fontWeight="bold"
                      fill={n.fraud_score >= 70 ? '#ef4444' : n.fraud_score >= 40 ? '#eab308' : '#22c55e'}
                      style={{ pointerEvents: 'none' }}>
                  {n.fraud_score}
                </text>
              )}
              {/* Label */}
              <text x={n.x} y={n.y + 32}
                    textAnchor="middle" fontSize="9"
                    fill="#94a3b8"
                    style={{ pointerEvents: 'none' }}>
                {(n.label || '').slice(0, 22)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 border-t border-slate-800 text-[10px] text-slate-500">
        {Object.entries(NODE_STYLE).filter(([k]) => k !== 'unknown').map(([type, s]) => (
          <span key={type} className="flex items-center gap-1 capitalize">
            <span className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: s.stroke }} />
            {type}
          </span>
        ))}
        <span className="ml-auto">Drag nodes to rearrange</span>
      </div>

      {/* Selected node detail */}
      {selNode && (
        <div className="px-4 py-3 border-t border-slate-800 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 uppercase tracking-wider">Selected:</span>
            <span className="text-slate-200 font-medium capitalize">{selNode.type}</span>
            <span className="text-slate-400 truncate">{selNode.label}</span>
          </div>
          {selNode.fraud_score != null && (
            <div className="text-slate-400">
              Fraud score: <span style={{
                color: selNode.fraud_score >= 70 ? '#ef4444'
                     : selNode.fraud_score >= 40 ? '#eab308' : '#22c55e'
              }}>{selNode.fraud_score}</span>
              {selNode.threat_level && ` · ${selNode.threat_level}`}
            </div>
          )}
          {selNode.country && (
            <div className="text-slate-400">
              {selNode.country}{selNode.isp ? ` · ${selNode.isp}` : ''}
              {selNode.is_proxy   ? ' · ⚠ Proxy/VPN'  : ''}
              {selNode.is_hosting ? ' · ☁ Cloud host' : ''}
            </div>
          )}
          {selNode.email_count != null && (
            <div className="text-slate-400">
              {selNode.email_count} email(s) from this domain
              {selNode.max_fraud_score != null
                ? ` · max fraud score: ${selNode.max_fraud_score}` : ''}
            </div>
          )}
          <div className="text-slate-600 font-mono break-all">{selNode.id}</div>
        </div>
      )}
    </div>
  );
}