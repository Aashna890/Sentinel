// ─────────────────────────────────────────────────────────────────────────────
// Alerts.jsx
// Real-time alerts page — shows every high-risk detection flagged by the system
// before the user interacts with it. Analysts can acknowledge alerts to mark
// them as seen. Each alert optionally links to its parent case.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { BellRing, Loader2, Check } from 'lucide-react';

// Tailwind classes for each severity level badge
const SEV_STYLE = {
  low:      'bg-blue-500/10 text-blue-400 ring-blue-500/30',
  medium:   'bg-amber-500/10 text-amber-400 ring-amber-500/30',
  high:     'bg-orange-500/10 text-orange-400 ring-orange-500/30',
  critical: 'bg-red-500/10 text-red-400 ring-red-500/30',
};

export default function Alerts() {
  // All alerts fetched from the backend, sorted newest-first
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch the latest 100 alerts whenever the component mounts
  const load = async () => {
    try {
      setAlerts(await api.entities.Alert.list('-created_date', 100));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Mark an alert as acknowledged on the backend, then reload the list
  const ack = async (alert) => {
    await api.entities.Alert.update(alert.id, { acknowledged: true });
    load();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Real-time Alerts</h1>
      <p className="text-sm text-slate-400 mb-6">
        High-risk detections flagged before user interaction.
      </p>

      {/* Loading spinner while fetching */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
        </div>

      /* Empty state — no alerts exist yet */
      ) : alerts.length === 0 ? (
        <div className="py-20 text-center">
          <BellRing className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            No alerts. High-risk emails analyzed will appear here.
          </p>
        </div>

      /* Alert list */
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex items-start gap-4 ${
                alert.acknowledged ? 'opacity-50' : ''
              }`}
            >
              {/* Severity badge (low / medium / high / critical) */}
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${SEV_STYLE[alert.severity] || SEV_STYLE.medium}`}>
                {alert.severity}
              </div>

              {/* Alert body */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{alert.title}</div>
                {alert.message   && <div className="text-xs text-slate-400 mt-1">{alert.message}</div>}
                {alert.indicator && <div className="text-xs text-slate-500 mt-1 font-mono">{alert.indicator}</div>}
              </div>

              {/* Link to the related case if one exists */}
              {alert.case_id && (
                <Link
                  to={`/cases/${alert.case_id}`}
                  className="text-xs text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  View case
                </Link>
              )}

              {/* Acknowledge button — only shown for unacknowledged alerts */}
              {!alert.acknowledged && (
                <button
                  onClick={() => ack(alert)}
                  className="text-slate-500 hover:text-emerald-400 transition shrink-0"
                  title="Acknowledge"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}