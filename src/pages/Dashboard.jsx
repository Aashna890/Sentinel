// ─────────────────────────────────────────────────────────────────────────────
// Dashboard.jsx
// Main threat operations dashboard — the first screen analysts see after login.
// Shows four KPI cards (total cases, high-risk count, average fraud score,
// active alerts), a recent cases list, and a pie chart of threat distribution.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import {
  ShieldAlert, Gauge, BellRing, ArrowRight, ScanSearch, FolderSearch,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// Colour per threat level — used in the pie chart and the recent cases list
const LEVEL_COLORS = {
  legitimate:    '#22c55e',
  suspicious:    '#eab308',
  phishing:      '#f97316',
  impersonation: '#a855f7',
  fraud:         '#ef4444',
};

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * A single KPI card — shows an icon, a label, and a large numeric value.
 * @param {Component} icon    - Lucide icon component
 * @param {string}    label   - Short label beneath the number
 * @param {number}    value   - The KPI value to display
 * @param {string}    accent  - Tailwind classes for the icon background/colour
 */
function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function Dashboard() {
  const [cases, setCases]     = useState([]);
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch cases and alerts in parallel on mount to minimise load time
  useEffect(() => {
    (async () => {
      try {
        const [caseList, alertList] = await Promise.all([
          api.entities.EmailCase.list('-created_date', 100),
          api.entities.Alert.list('-created_date', 20),
        ]);
        setCases(caseList   || []);
        setAlerts(alertList || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Derived KPIs ──────────────────────────────────────────────────────────

  // Count cases with a fraud score of 70 or higher
  const highRisk = cases.filter(c => (c.fraud_score || 0) >= 70).length;

  // Average fraud score across all cases (0 if no cases yet)
  const avgScore = cases.length
    ? Math.round(cases.reduce((sum, c) => sum + (c.fraud_score || 0), 0) / cases.length)
    : 0;

  // Number of alerts that haven't been acknowledged yet
  const unacknowledged = alerts.filter(a => !a.acknowledged).length;

  // Pie chart data — one segment per threat level, filtered to non-zero counts
  const distribution = Object.keys(LEVEL_COLORS).map(key => ({
    name:  key,
    value: cases.filter(c => c.threat_level === key).length,
    color: LEVEL_COLORS[key],
  })).filter(d => d.value > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Threat Operations Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time email threat detection & forensic intelligence
          </p>
        </div>
        {/* Quick link to the analysis page */}
        <Link
          to="/analyze"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-medium transition"
        >
          <ScanSearch className="w-4 h-4" /> Analyze Email
        </Link>
      </div>

      {/* ── KPI cards row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={FolderSearch}
          label="Total Cases"
          value={cases.length}
          accent="bg-blue-500/15 text-blue-400"
        />
        <StatCard
          icon={ShieldAlert}
          label="High Risk"
          value={highRisk}
          accent="bg-red-500/15 text-red-400"
        />
        <StatCard
          icon={Gauge}
          label="Avg Fraud Score"
          value={avgScore}
          accent="bg-amber-500/15 text-amber-400"
        />
        <StatCard
          icon={BellRing}
          label="Active Alerts"
          value={unacknowledged}
          accent="bg-cyan-500/15 text-cyan-400"
        />
      </div>

      {/* ── Main content row: recent cases + threat distribution ─────────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Recent cases list (takes up 2/3 of the row) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Recent Cases</h2>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading…</div>

          ) : cases.length === 0 ? (
            // Empty state — prompt the analyst to run their first analysis
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500 mb-3">
                No cases yet. Analyze your first suspicious email.
              </p>
              <Link
                to="/analyze"
                className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
              >
                Start analysis <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

          ) : (
            // Show the 8 most recent cases
            <div className="space-y-2">
              {cases.slice(0, 8).map(c => (
                <Link
                  key={c.id}
                  to={`/cases/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/60 transition group"
                >
                  {/* Subject + sender */}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.subject || '(no subject)'}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{c.sender_email}</div>
                  </div>

                  {/* Threat level + fraud score + arrow */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="text-xs font-medium"
                      style={{ color: LEVEL_COLORS[c.threat_level] || '#94a3b8' }}
                    >
                      {c.threat_level}
                    </span>
                    <div
                      className="w-12 text-right text-sm font-semibold"
                      style={{
                        color: (c.fraud_score || 0) >= 70 ? '#ef4444'
                             : (c.fraud_score || 0) >= 40 ? '#eab308'
                             : '#22c55e',
                      }}
                    >
                      {c.fraud_score || 0}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Threat distribution pie chart (takes up 1/3 of the row) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Threat Distribution</h2>

          {distribution.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">No data</div>
          ) : (
            <>
              {/* Donut chart — innerRadius creates the hollow centre */}
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {distribution.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend — one row per threat level */}
              <div className="mt-3 space-y-1.5">
                {distribution.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 capitalize text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="text-slate-300">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}