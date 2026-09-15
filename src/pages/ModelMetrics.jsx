// ─────────────────────────────────────────────────────────────────────────────
// ModelMetrics.jsx
// ML Model Performance page — shows training metrics for all three models.
// Data comes from /api/metrics which reads ml_pipeline/models/metrics.json
// written by train.py after each training run.
//
// Displays:
//  • Dataset summary (size, class distribution)
//  • NLP model (TF-IDF + LinearSVC) — accuracy, F1, per-class, confusion matrix
//  • Structured model (XGBoost) — accuracy, F1, feature importances bar chart
//  • Anomaly detector (Isolation Forest) — separation gap
//  • Ensemble weight breakdown
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { api } from '@/api/apiClient';
import { Brain, BarChart2, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

// ── Colour palette consistent with the rest of the app ───────────────────────
const CLASS_COLORS = {
  legitimate:    '#22c55e',
  spam:          '#eab308',
  phishing:      '#f97316',
  bec:           '#ef4444',
  impersonation: '#a855f7',
  threat:        '#ef4444',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function MetricBadge({ label, value, color = 'cyan' }) {
  const colors = {
    cyan:   'bg-cyan-500/10 text-cyan-300',
    green:  'bg-emerald-500/10 text-emerald-300',
    amber:  'bg-amber-500/10 text-amber-300',
    red:    'bg-red-500/10 text-red-300',
  };
  return (
    <div className={`rounded-xl p-4 text-center ${colors[color]}`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs mt-1 opacity-70">{label}</div>
    </div>
  );
}

// Confusion matrix rendered as a coloured grid
function ConfusionMatrix({ matrix, labels }) {
  if (!matrix?.length) return <p className="text-sm text-slate-500">No data</p>;
  const max = Math.max(...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-xs text-center">
        <thead>
          <tr>
            <th className="text-slate-600 pr-2 text-right text-[10px]">Actual ↓ / Predicted →</th>
            {labels.map(l => (
              <th key={l} className="px-2 py-1 text-slate-400 capitalize font-medium">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="text-slate-400 capitalize text-right pr-2 font-medium">{labels[i]}</td>
              {row.map((val, j) => {
                const intensity = max > 0 ? val / max : 0;
                const isDiag    = i === j;
                return (
                  <td key={j}
                      className="px-3 py-2 rounded font-mono font-medium"
                      style={{
                        background: isDiag
                          ? `rgba(34,197,94,${0.1 + intensity * 0.5})`
                          : val > 0 ? `rgba(239,68,68,${0.05 + intensity * 0.4})` : 'transparent',
                        color: isDiag ? '#22c55e' : val > 0 ? '#ef4444' : '#475569',
                      }}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-600 mt-2">
        Green diagonal = correct predictions · Red off-diagonal = misclassifications
      </p>
    </div>
  );
}

// Horizontal bar chart for feature importances
function FeatureImportanceChart({ features }) {
  if (!features?.length) return null;
  const maxVal = features[0]?.importance ?? 0;
  return (
    <div className="space-y-2">
      {features.map(({ feature, importance }) => (
        <div key={feature}>
          <div className="flex justify-between text-xs text-slate-400 mb-0.5">
            <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
            <span className="font-mono text-slate-300">{(importance * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-700"
              style={{ width: `${(importance / maxVal) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ModelMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.functions.getMetrics();
        setMetrics(data);
      } catch (e) {
        setError(e.message || 'Could not load metrics. Run train.py first.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="p-20 flex justify-center">
      <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="rounded-2xl border border-amber-800/40 bg-amber-500/5 p-6 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-amber-300 font-medium mb-1">Metrics not available</p>
          <p className="text-xs text-amber-400/70">{error}</p>
          <p className="text-xs text-slate-500 mt-2">
            Run <code className="bg-slate-800 px-1 rounded">python train.py</code> from the backend
            folder, then restart the server.
          </p>
        </div>
      </div>
    </div>
  );

  const { nlp_model: nlp, structured_model: xgb, anomaly_model: iso, ensemble_weights } = metrics;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">ML Model Performance</h1>
        <p className="text-sm text-slate-400 mt-1">
          Training metrics from{' '}
          <span className="text-slate-300">
            {metrics.trained_at ? new Date(metrics.trained_at).toLocaleString() : '—'}
          </span>
          {' '}· {metrics.dataset_size?.toLocaleString()} emails
        </p>
      </div>

      {/* Dataset summary */}
      <Section icon={Brain} title="Training dataset">
        <div className="space-y-2">
          {Object.entries(metrics.label_counts || {}).map(([label, count]) => {
            const pct = ((count / metrics.dataset_size) * 100).toFixed(1);
            return (
              <div key={label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="capitalize text-slate-400">{label}</span>
                  <span className="font-mono text-slate-300">{count.toLocaleString()} ({pct}%)</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: CLASS_COLORS[label] || '#94a3b8',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* NLP Model */}
      <Section icon={Brain} title="NLP classifier — TF-IDF + LinearSVC (40% ensemble weight)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <MetricBadge label="Accuracy"    value={`${(nlp.accuracy * 100).toFixed(1)}%`}    color="green" />
          <MetricBadge label="F1 weighted" value={`${(nlp.f1_weighted * 100).toFixed(1)}%`} color="cyan" />
          <MetricBadge label="Classes"     value={nlp.confusion_labels?.length ?? '—'}       color="amber" />
          <MetricBadge label="Model type"  value="LinearSVC"                                  color="amber" />
        </div>

        {/* Per-class metrics */}
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-xs text-slate-300">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800">
                <th className="text-left py-2">Class</th>
                <th className="text-right py-2">Precision</th>
                <th className="text-right py-2">Recall</th>
                <th className="text-right py-2">F1</th>
                <th className="text-right py-2">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {Object.entries(nlp.per_class || {}).map(([cls, vals]) => (
                <tr key={cls}>
                  <td className="py-2 capitalize flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block"
                          style={{ background: CLASS_COLORS[cls] || '#94a3b8' }} />
                    {cls}
                  </td>
                  <td className="text-right">{(vals.precision * 100).toFixed(1)}%</td>
                  <td className="text-right">{(vals.recall    * 100).toFixed(1)}%</td>
                  <td className="text-right font-medium">{(vals.f1 * 100).toFixed(1)}%</td>
                  <td className="text-right text-slate-500">{vals.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Confusion matrix</h4>
        <ConfusionMatrix matrix={nlp.confusion_matrix} labels={nlp.confusion_labels} />
      </Section>

      {/* XGBoost */}
      <Section icon={BarChart2} title="Structured model — XGBoost (35% ensemble weight)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <MetricBadge label="Accuracy"    value={`${(xgb.accuracy * 100).toFixed(1)}%`}    color="green" />
          <MetricBadge label="F1 weighted" value={`${(xgb.f1_weighted * 100).toFixed(1)}%`} color="cyan" />
          <MetricBadge label="Precision"   value={`${(xgb.precision  * 100).toFixed(1)}%`}  color="amber" />
          <MetricBadge label="Recall"      value={`${(xgb.recall     * 100).toFixed(1)}%`}  color="amber" />
        </div>

        <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3">
          Feature importances (top 15 of 25 engineered features)
        </h4>
        <FeatureImportanceChart features={xgb.feature_importances} />

        <h4 className="text-xs text-slate-500 uppercase tracking-wider mt-5 mb-3">Confusion matrix</h4>
        <ConfusionMatrix matrix={xgb.confusion_matrix} labels={xgb.confusion_labels} />
      </Section>

      {/* Isolation Forest */}
      <Section icon={ShieldCheck} title="Anomaly detector — Isolation Forest (15% ensemble weight)">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <MetricBadge label="Legit score mean"  value={iso.legit_score_mean?.toFixed(3)}  color="green" />
          <MetricBadge label="Threat score mean" value={iso.threat_score_mean?.toFixed(3)} color="red" />
          <MetricBadge label="Separation gap"    value={iso.separation_gap?.toFixed(3)}    color="cyan" />
        </div>
        <p className="text-xs text-slate-500">
          The Isolation Forest is trained exclusively on legitimate emails. Scores closer to 0 indicate
          emails that deviate from normal patterns — a higher separation gap means better anomaly
          discrimination. Contamination parameter: {(iso.contamination * 100).toFixed(0)}%.
        </p>
      </Section>

      {/* Ensemble weights */}
      <Section icon={Brain} title="Ensemble scoring weights">
        <div className="space-y-3">
          {[
            { label: 'NLP classifier (TF-IDF + LinearSVC)', weight: ensemble_weights?.nlp,        color: 'bg-cyan-500' },
            { label: 'Structured model (XGBoost)',           weight: ensemble_weights?.structured, color: 'bg-violet-500' },
            { label: 'Anomaly detector (Isolation Forest)',  weight: ensemble_weights?.anomaly,    color: 'bg-amber-500' },
            { label: 'Header forensics bonus (max)',         weight: ensemble_weights?.header_bonus_max, color: 'bg-red-500' },
          ].map(({ label, weight, color }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{label}</span>
                <span className="font-mono text-slate-300">{((weight ?? 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${(weight ?? 0) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Final fraud score = (NLP × 0.40) + (XGBoost × 0.35) + (Isolation Forest × 0.15) +
          header bonus (up to 21 pts for SPF/DKIM/DMARC failures, reply-to mismatch, lookalike domain).
        </p>
      </Section>
    </div>
  );
}