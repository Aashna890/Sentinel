// ─────────────────────────────────────────────────────────────────────────────
// GraphView.jsx — Interactive SVG force-directed graph
// Shows email infrastructure correlation: Email ↔ Domain ↔ IP ↔ URL nodes
// No external libraries — pure SVG + JS physics
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Node styles by type ───────────────────────────────────────────────────────
const NODE_STYLE = {
  email:    { fill: '#0e7490', stroke: '#22d3ee', icon: '✉' },
  domain:   { fill: '#7c3aed', stroke: '#a78bfa', icon: '🌐' },
  ip:       { fill: '#b45309', stroke: '#fbbf24', icon: '⚡' },
  url:      { fill: '#065f46', stroke: '#34d399', icon: '🔗' },
  campaign: { fill: '#991b1b', stroke: '#f87171', icon: '⚠' },
  unknown:  { fill: '#334155', stroke: '#64748b', icon: '?' },
};

// ── Edge styles by type ───────────────────────────────────────────────────────
const EDGE_STYLE = {
  sent_from:            { stroke: '#22d3ee', dash: '' },
  originated_from:      { stroke: '#fbbf24', dash: '4 2' },
  contains_url:         { stroke: '#34d399', dash: '2 3' },
  domain_resolves_to:   { stroke: '#a78bfa', dash: '' },
  shared_infrastructure:{ stroke: '#f87171', dash: '6 3' },
  reply_to_domain:      { stroke: '#fb923c', dash: '4 2' },
  member_of_campaign:   { stroke: '#f87171', dash: '8 4' },
};
const DEFAULT_EDGE = { stroke: '#475569', dash: '3 3' };

// ── Force layout ──────────────────────────────────────────────────────────────

function layoutNodes(rawNodes, rawEdges, W, H) {
  if (!rawNodes.length) return [];

  const cx = W / 2, cy = H / 2;
  const radius = Math.min(W, H) * 0.32;

  // Init positions in a circle
  const nodes = rawNodes.map((n, i) => {
    const angle = (i / rawNodes.length) * 2 * Math.PI;
    return {
      ...n,
      // Normalise type field — backend may send node_type
      type: n.type || n.node_type || 'unknown',
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 30,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 30,
      vx: 0, vy: 0,
    };
  });

  const idMap = {};
  nodes.forEach(n => { if (!n.id) n.id = Math.random().toString(36).slice(2); });
  nodes.forEach(n => { idMap[n.id] = n; });

  const REPEL   = 5000;
  const ATTRACT = 0.05;
  const IDEAL   = 140;
  const DAMP    = 0.82;
  const ITERS   = 180;

  for (let t = 0; t < ITERS; t++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = (b.x - a.x) || 0.01;
        const dy = (b.y - a.y) || 0.01;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f  = REPEL / (d * d);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    // Attraction along edges
    rawEdges.forEach(e => {
      const a = idMap[e.source], b = idMap[e.target];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const f  = (d - IDEAL) * ATTRACT;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });
    // Integrate + clamp
    nodes.forEach(n => {
      n.vx *= DAMP; n.vy *= DAMP;
      n.x = Math.max(40, Math.min(W - 40, n.x + n.vx));
      n.y = Math.max(40, Math.min(H - 40, n.y + n.vy));
    });
  }

  return nodes;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GraphView({ nodes = [], edges = [], width = 680, height = 420 }) {
  const [positioned, setPositioned] = useState([]);
  const [selected,   setSelected]   = useState(null);
  const dragRef  = useRef(null);   // { id, offsetX, offsetY }
  const svgRef   = useRef(null);
  const nodesKey = nodes.map(n => n.id || n.label || '?').join(',');

  // Run layout when nodes change
  useEffect(() => {
    if (!nodes.length) { setPositioned([]); setSelected(null); return; }
    const laid = layoutNodes(nodes, edges, width, height);
    setPositioned(laid);
    setSelected(null);
  }, [nodesKey, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag: record start offset
  const onMouseDown = useCallback((e, id) => {
    e.preventDefault();
    const svg  = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const node = positioned.find(n => n.id === id);
    if (!node) return;
    const scaleX = width  / rect.width;
    const scaleY = height / rect.height;
    dragRef.current = {
      id,
      ox: (e.clientX - rect.left) * scaleX - node.x,
      oy: (e.clientY - rect.top)  * scaleY - node.y,
    };
    setSelected(id);
  }, [positioned, width, height]);

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current || !svgRef.current) return;
    const rect   = svgRef.current.getBoundingClientRect();
    const scaleX = width  / rect.width;
    const scaleY = height / rect.height;
    const x = Math.max(40, Math.min(width  - 40, (e.clientX - rect.left) * scaleX - dragRef.current.ox));
    const y = Math.max(40, Math.min(height - 40, (e.clientY - rect.top)  * scaleY - dragRef.current.oy));
    const id = dragRef.current.id;
    setPositioned(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
  }, [width, height]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  if (!nodes.length) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                    height: 160, borderRadius: 12, border: '1px solid #1e293b',
                    background: '#020617', color: '#475569', fontSize: 13 }}>
        No graph data — analyse more emails to build the correlation network.
      </div>
    );
  }

  // Safety check — if positioned hasn't been computed yet, show loading
  if (!positioned.length) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                    height: 160, borderRadius: 12, border: '1px solid #1e293b',
                    background: '#020617', color: '#64748b', fontSize: 13 }}>
        Computing graph layout…
      </div>
    );
  }

  const posMap = {};
  positioned.forEach(n => { posMap[n.id] = n; });
  const selNode = posMap[selected];
  const R = 22; // node radius

  return (
    <div style={{ borderRadius: 12, border: '1px solid #1e293b',
                  background: '#020617', overflow: 'hidden', userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ cursor: dragRef.current ? 'grabbing' : 'default', display: 'block' }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          {/* Arrow markers */}
          {Object.entries({ ...EDGE_STYLE, default: DEFAULT_EDGE }).map(([k, s]) => (
            <marker key={k} id={`arr-${k}`}
                    viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9Z" fill={s.stroke} opacity="0.8" />
            </marker>
          ))}
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const a = posMap[e.source], b = posMap[e.target];
          if (!a || !b) return null;
          const s  = EDGE_STYLE[e.type] || DEFAULT_EDGE;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d  = Math.sqrt(dx * dx + dy * dy) || 1;
          return (
            <line key={i}
                  x1={a.x + (dx / d) * R} y1={a.y + (dy / d) * R}
                  x2={b.x - (dx / d) * R} y2={b.y - (dy / d) * R}
                  stroke={s.stroke} strokeWidth={1.5}
                  strokeDasharray={s.dash} strokeOpacity={0.65}
                  markerEnd={`url(#arr-${e.type || 'default'})`} />
          );
        })}

        {/* Nodes */}
        {positioned.map(n => {
          const s      = NODE_STYLE[n.type] ?? NODE_STYLE.unknown;
          const score  = n.fraud_score ?? 0;
          const isHigh = score >= 70;
          const isFocus= n.is_focus === true;
          const isSel  = n.id === selected;

          return (
            <g key={n.id} style={{ cursor: 'grab' }}
               onMouseDown={ev => onMouseDown(ev, n.id)}>
              {/* Focus ring */}
              {isFocus && (
                <circle cx={n.x} cy={n.y} r={R + 10}
                        fill="none" stroke="#22d3ee" strokeWidth={1.5}
                        strokeOpacity={0.4} strokeDasharray="4 3" />
              )}
              {/* Selection ring */}
              {isSel && !isFocus && (
                <circle cx={n.x} cy={n.y} r={R + 9}
                        fill="none" stroke="#fff" strokeWidth={1.5} strokeOpacity={0.25} />
              )}
              {/* High-risk pulse */}
              {isHigh && (
                <circle cx={n.x} cy={n.y} r={R + 7}
                        fill="none" stroke="#ef4444" strokeWidth={1.5}
                        strokeOpacity={0.3} strokeDasharray="3 2" />
              )}
              {/* Node body */}
              <circle cx={n.x} cy={n.y} r={R}
                      fill={s.fill} stroke={s.stroke}
                      strokeWidth={isSel ? 2.5 : 1.5} fillOpacity={0.92} />
              {/* Icon */}
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                    fontSize={13} style={{ pointerEvents: 'none' }}>
                {s.icon}
              </text>
              {/* Fraud score badge */}
              {n.fraud_score != null && (
                <text x={n.x + 17} y={n.y - 16}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={8} fontWeight="bold"
                      fill={score >= 70 ? '#ef4444' : score >= 40 ? '#eab308' : '#22c55e'}
                      style={{ pointerEvents: 'none' }}>
                  {score}
                </text>
              )}
              {/* Label below */}
              <text x={n.x} y={n.y + R + 12}
                    textAnchor="middle" fontSize={9} fill="#94a3b8"
                    style={{ pointerEvents: 'none' }}>
                {String(n.label || '').slice(0, 24)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0 16px',
                    padding:'8px 16px', borderTop:'1px solid #1e293b',
                    fontSize:10, color:'#475569' }}>
        {Object.entries(NODE_STYLE).filter(([k]) => k !== 'unknown').map(([type, s]) => (
          <span key={type} style={{ display:'flex', alignItems:'center', gap:4, textTransform:'capitalize' }}>
            <span style={{ width:8, height:8, borderRadius:'50%',
                           background: s.stroke, display:'inline-block' }} />
            {type}
          </span>
        ))}
        <span style={{ marginLeft:'auto' }}>Drag nodes · Click to inspect</span>
      </div>

      {/* Selected node detail */}
      {selNode && (
        <div style={{ padding:'8px 16px', borderTop:'1px solid #1e293b', fontSize:12 }}>
          <span style={{ color:'#64748b', textTransform:'uppercase',
                         letterSpacing:'0.05em', fontSize:10 }}>Selected: </span>
          <span style={{ color:'#e2e8f0', fontWeight:500, textTransform:'capitalize' }}>
            {selNode.type}
          </span>
          <span style={{ color:'#64748b', marginLeft:8 }}>{selNode.label}</span>
          {selNode.fraud_score != null && (
            <span style={{ marginLeft:12, color: selNode.fraud_score >= 70 ? '#ef4444'
                                                : selNode.fraud_score >= 40 ? '#eab308' : '#22c55e' }}>
              Score: {selNode.fraud_score}
              {selNode.threat_level ? ` · ${selNode.threat_level}` : ''}
            </span>
          )}
          {selNode.country && (
            <span style={{ color:'#64748b', marginLeft:12 }}>
              {selNode.country}{selNode.isp ? ` · ${selNode.isp}` : ''}
              {selNode.is_proxy   ? ' · ⚠ Proxy' : ''}
              {selNode.is_hosting ? ' · ☁ Hosting' : ''}
            </span>
          )}
          {selNode.email_count != null && (
            <span style={{ color:'#64748b', marginLeft:12 }}>
              {selNode.email_count} email(s) from domain
            </span>
          )}
        </div>
      )}
    </div>
  );
}