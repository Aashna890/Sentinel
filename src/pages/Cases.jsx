// ─────────────────────────────────────────────────────────────────────────────
// Cases.jsx
// Case management list page.
// Displays all saved email analysis cases in a searchable, filterable table.
// Analysts can search by subject / sender / IP and filter by threat level.
// Clicking a row navigates to the full CaseDetail page.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { Search, Loader2 } from 'lucide-react';

// Hex colour per threat level — used to colour the level text in the table
const LEVEL_COLOR = {
  legitimate:    '#22c55e',
  suspicious:    '#eab308',
  phishing:      '#f97316',
  impersonation: '#a855f7',
  fraud:         '#ef4444',
};

// Tailwind classes for the status pill in each row
const STATUS_STYLE = {
  new:            'bg-cyan-500/10 text-cyan-400',
  investigating:  'bg-amber-500/10 text-amber-400',
  escalated:      'bg-red-500/10 text-red-400',
  resolved:       'bg-emerald-500/10 text-emerald-400',
  false_positive: 'bg-slate-500/10 text-slate-400',
};

export default function Cases() {
  // Full list of cases fetched from the backend
  const [cases, setCases]     = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and filter state
  const [q, setQ]         = useState('');       // Text query
  const [level, setLevel] = useState('all');    // Threat level filter

  const navigate = useNavigate();

  // Fetch the 200 most recent cases on mount
  useEffect(() => {
    (async () => {
      try {
        setCases(await api.entities.EmailCase.list('-created_date', 200));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Client-side filtering — recomputes only when cases, query, or level changes
  const filtered = useMemo(() => cases.filter(c => {
    // Match text query against subject, sender email, and originating IP
    const matchQ = !q || (c.subject + c.sender_email + (c.originating_ip || ''))
      .toLowerCase()
      .includes(q.toLowerCase());

    // Match threat level filter (or show all if 'all' is selected)
    const matchL = level === 'all' || c.threat_level === level;

    return matchQ && matchL;
  }), [cases, q, level]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Case Management</h1>
      <p className="text-sm text-slate-400 mb-6">
        Search and triage analyzed email cases into investigation campaigns.
      </p>

      {/* ── Search bar + threat level filter ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Text search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search subject, sender, or IP…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>

        {/* Threat level dropdown */}
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          className="px-4 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        >
          <option value="all">All threat levels</option>
          {Object.keys(LEVEL_COLOR).map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* ── Cases table ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-slate-500">
          No cases match your filters.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium px-4 py-3">Subject</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Sender</th>
                <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Origin IP</th>
                <th className="text-left font-medium px-4 py-3">Level</th>
                <th className="text-right font-medium px-4 py-3">Score</th>
                <th className="text-left font-medium px-4 py-3 hidden sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(c => (
                // Clicking any row navigates to the full case detail page
                <tr
                  key={c.id}
                  className="hover:bg-slate-800/40 transition cursor-pointer"
                  onClick={() => navigate(`/cases/${c.id}`)}
                >
                  {/* Subject + sender (collapsed on small screens) */}
                  <td className="px-4 py-3">
                    <span className="font-medium block truncate max-w-xs">
                      {c.subject || '(no subject)'}
                    </span>
                    <div className="text-xs text-slate-500 md:hidden truncate">
                      {c.sender_email}
                    </div>
                  </td>

                  {/* Sender email — hidden on small screens */}
                  <td className="px-4 py-3 hidden md:table-cell text-slate-400 truncate max-w-[200px]">
                    {c.sender_email}
                  </td>

                  {/* Originating IP — hidden on medium and smaller screens */}
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-400 font-mono text-xs">
                    {c.originating_ip || '—'}
                  </td>

                  {/* Threat level coloured text */}
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-medium capitalize"
                      style={{ color: LEVEL_COLOR[c.threat_level] || '#94a3b8' }}
                    >
                      {c.threat_level}
                    </span>
                  </td>

                  {/* Fraud score — colour-coded green/amber/red */}
                  <td
                    className="px-4 py-3 text-right font-semibold"
                    style={{
                      color: (c.fraud_score || 0) >= 70 ? '#ef4444'
                           : (c.fraud_score || 0) >= 40 ? '#eab308'
                           : '#22c55e',
                    }}
                  >
                    {c.fraud_score || 0}
                  </td>

                  {/* Workflow status pill — hidden on very small screens */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[c.status] || STATUS_STYLE.new}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}