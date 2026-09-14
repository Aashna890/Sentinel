// ─────────────────────────────────────────────────────────────────────────────
// AnalyzeEmail.jsx
// Main forensic analysis page.
// The analyst pastes a raw email (full headers + body), clicks "Run Forensic
// Analysis", and the backend returns a structured threat report. The result
// can then be saved as a Case for ongoing investigation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import {
  ScanSearch, Loader2, Save, AlertTriangle, ShieldCheck,
  MapPin, Server, Globe, FileWarning, Brain, Network,
  GitBranch, BarChart2, Link2, Mail,
} from 'lucide-react';

// Tailwind color classes mapped to each threat level returned by the backend
const LEVEL_STYLE = {
  legitimate:    'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30',
  suspicious:    'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  phishing:      'text-orange-400 bg-orange-500/10 ring-orange-500/30',
  impersonation: 'text-purple-400 bg-purple-500/10 ring-purple-500/30',
  fraud:         'text-red-400 bg-red-500/10 ring-red-500/30',
};

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * SVG circular gauge that visually represents the fraud score (0–100).
 * - Green  < 40  (low risk)
 * - Yellow 40–69 (medium risk)
 * - Red   >= 70  (high risk)
 */
function ScoreGauge({ score }) {
  const color = score >= 70 ? '#ef4444' : score >= 40 ? '#eab308' : '#22c55e';
  const radius        = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative w-32 h-32">
      {/* SVG drawn from the top (-rotate-90 makes 0% start at 12 o'clock) */}
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        {/* Background track */}
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
        {/* Filled arc proportional to the score */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * score) / 100}
          className="transition-all duration-700"
        />
      </svg>
      {/* Centred score number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold" style={{ color }}>{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">fraud score</span>
      </div>
    </div>
  );
}

/** Reusable card wrapper with an icon and title bar. */
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

/** Label + value display pair used inside result sections. */
function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200 mt-0.5 break-words">{value || '—'}</div>
    </div>
  );
}

/** Small coloured pill tag (used for Proxy/VPN, Hosting, Mobile, Residential). */
function Tag({ color, children }) {
  const colorMap = {
    red:     'bg-red-500/10 text-red-400',
    amber:   'bg-amber-500/10 text-amber-400',
    blue:    'bg-blue-500/10 text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colorMap[color]}`}>
      {children}
    </span>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function AnalyzeEmail() {
  // Raw email text pasted by the analyst
  const [raw, setRaw]         = useState('');
  // True while the backend analysis request is in-flight
  const [loading, setLoading] = useState(false);
  // Error message shown below the textarea or results panel
  const [error, setError]     = useState('');
  // Full response object from the analysis API { analysis, geolocation }
  const [result, setResult]   = useState(null);
  // True while saving the result as a Case
  const [saving, setSaving]   = useState(false);
  // Set to the new Case's ID after a successful save
  const [savedId, setSavedId] = useState(null);
  // Graph correlation data fetched after save
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const navigate = useNavigate();

  // ── Run forensic analysis ─────────────────────────────────────────────────

  const analyze = async () => {
    if (raw.trim().length < 20) {
      setError('Paste a complete raw email (headers + body).');
      return;
    }

    setError('');
    setResult(null);
    setSavedId(null);
    setGraphData(null);
    setLoading(true);

    try {
      const res = await api.functions.analyzeEmail({ raw_email: raw });
      setResult(res.data);

      // The backend already saves the case inside analyze_and_save().
      // The case ID is returned in result.case.id — extract it immediately
      // so the graph correlation panel loads without needing a separate save.
      const caseId = res.data?.case?.id ?? res.data?.analysis?.id ?? null;
      if (caseId) {
        setSavedId(caseId);
        // Fetch graph correlation in the background
        setGraphLoading(true);
        try {
          const gd = await api.functions.getGraphData(caseId);
          setGraphData(gd);
        } catch (_) {
          // Graph is non-critical
        } finally {
          setGraphLoading(false);
        }
      }
    } catch (e) {
      setError(e.data?.error || e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Save result as a Case ─────────────────────────────────────────────────
  // The backend already saves the case automatically inside analyze_and_save().
  // savedId is set right after analysis. This button just navigates to the case.
  // If for any reason the case ID wasn't captured (older result), we show an error.

  const saveCase = async () => {
    if (savedId) {
      navigate(`/cases/${savedId}`);
      return;
    }
    // Fallback: shouldn't normally be reached, but handle gracefully
    setError('Case was already saved automatically. Check the Cases page.');
  };

  // Shorthand aliases to keep JSX readable
  const a   = result?.analysis;
  const geo = result?.geolocation;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Analyze Suspicious Email</h1>
      <p className="text-sm text-slate-400 mb-6">
        Paste the raw email source (full headers + body) for forensic analysis,
        origin tracing, and threat assessment.
      </p>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* ── Left panel: raw email input ───────────────────────────────── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <textarea
            value={raw}
            onChange={e => setRaw(e.target.value)}
            placeholder={`Paste raw email here, e.g.\n\nReceived: from mail.attacker.com (1.2.3.4) by mx.target.com...\nFrom: "CEO" <ceo@lookalike-domain.com>\nSubject: Urgent: Wire Transfer Request\n...\nDear team, please process this payment immediately...`}
            className="w-full h-[420px] bg-slate-950 border border-slate-700 rounded-lg p-4 text-xs font-mono text-green-400 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />

          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-500">{raw.length} chars</span>
            <button
              onClick={analyze}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-sm font-medium transition"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ScanSearch className="w-4 h-4" />}
              {loading ? 'Analyzing…' : 'Run Forensic Analysis'}
            </button>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{error}</div>
          )}
        </div>

        {/* ── Right panel: analysis results ─────────────────────────────── */}
        <div>

          {/* Spinner shown while analysis is running */}
          {loading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 flex flex-col items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-4" />
              <p className="text-sm text-slate-400">
                Parsing headers, tracing relay path, geolocating origin…
              </p>
            </div>
          )}

          {/* Placeholder shown before the first analysis */}
          {!loading && !result && (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 flex flex-col items-center justify-center h-full text-center">
              <ScanSearch className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">
                Forensic results will appear here after analysis.
              </p>
            </div>
          )}

          {/* Results — only shown after a successful analysis */}
          {!loading && result && a && (
            <div className="space-y-4">

              {/* Score gauge + threat level badge + summary */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 flex items-center gap-5">
                <ScoreGauge score={a.fraud_score || 0} />
                <div className="flex-1">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ring-1 ${LEVEL_STYLE[a.threat_level] || LEVEL_STYLE.suspicious}`}>
                    <AlertTriangle className="w-3 h-3" /> {a.threat_level}
                  </span>
                  <p className="text-sm text-slate-300 mt-3 leading-relaxed">
                    {a.summary || a.classification}
                  </p>
                </div>
              </div>

              {/* Threat indicators + BEC patterns detected by the AI */}
              <Section icon={FileWarning} title="Threat Indicators">
                {a.threat_indicators?.length ? (
                  <ul className="space-y-1.5 text-sm text-slate-300">
                    {a.threat_indicators.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-red-400 mt-0.5">•</span>{t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">None detected</p>
                )}

                {/* Business Email Compromise patterns (payment diversion, fake invoices, etc.) */}
                {a.bec_patterns?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">BEC Patterns</div>
                    <ul className="space-y-1.5 text-sm text-slate-300">
                      {a.bec_patterns.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-purple-400 mt-0.5">•</span>{t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              {/* SPF / DKIM / DMARC authentication results */}
              <Section icon={Server} title="Authentication (SPF / DKIM / DMARC)">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {['spf', 'dkim', 'dmarc'].map(key => (
                    <div key={key} className="rounded-lg bg-slate-950/50 p-3">
                      <div className="text-xs uppercase text-slate-500">{key}</div>
                      <div className="font-medium mt-1">{a.authentication?.[key] || '—'}</div>
                    </div>
                  ))}
                </div>
                {a.authentication?.notes && (
                  <p className="text-xs text-slate-400 mt-3">{a.authentication.notes}</p>
                )}
              </Section>

              {/* IP geolocation of the originating mail server */}
              {geo?.country && (
                <Section icon={MapPin} title="Origin Geolocation">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="IP"           value={geo.ip} />
                    <Field label="Location"     value={`${geo.city || ''}${geo.city ? ', ' : ''}${geo.region || ''} ${geo.country || ''}`.trim()} />
                    <Field label="ISP"          value={geo.isp || '—'} />
                    <Field label="Organization" value={geo.org || '—'} />
                    <Field label="ASN"          value={geo.asname || geo.asn || '—'} />
                    <Field label="Coordinates"  value={geo.lat != null ? `${geo.lat}, ${geo.lon}` : '—'} />
                  </div>
                  {/* Infrastructure type tags */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {geo.is_proxy   && <Tag color="red">Proxy/VPN</Tag>}
                    {geo.is_hosting && <Tag color="amber">Hosting/Cloud</Tag>}
                    {geo.is_mobile  && <Tag color="blue">Mobile</Tag>}
                    {!geo.is_proxy && !geo.is_hosting && !geo.is_mobile && (
                      <Tag color="emerald">Residential</Tag>
                    )}
                  </div>
                </Section>
              )}

              {/* Attribution assessment with confidence bar */}
              <Section icon={Globe} title="Attribution Assessment">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                      style={{ width: `${a.attribution?.confidence || 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{a.attribution?.confidence || 0}%</span>
                </div>
                <p className="text-sm text-slate-300">{a.attribution?.assessment || '—'}</p>
                {a.attribution?.likely_origin_type && (
                  <p className="text-xs text-slate-500 mt-2">
                    Likely origin: {a.attribution.likely_origin_type}
                  </p>
                )}
              </Section>

              {/* Actionable recommendations for the analyst */}
              {a.recommendations?.length > 0 && (
                <Section icon={ShieldCheck} title="Recommendations">
                  <ul className="space-y-1.5 text-sm text-slate-300">
                    {a.recommendations.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-cyan-400 mt-0.5">✓</span>{t}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* ── ML Score Breakdown (Ensemble explainability) ─────────── */}
              {a.ml_scores && Object.keys(a.ml_scores).length > 0 && (
                <Section icon={Brain} title="ML Score Breakdown">
                  <p className="text-xs text-slate-500 mb-3">
                    How the ensemble computed the final fraud score —
                    three independent models combined with fixed weights.
                  </p>
                  <div className="space-y-3">
                    {[
                      { label: 'NLP Classifier (TF-IDF + SVM)',       key: 'nlp_score',        weight: '40%', color: 'bg-cyan-500' },
                      { label: 'Structured Model (XGBoost)',           key: 'structured_score', weight: '35%', color: 'bg-violet-500' },
                      { label: 'Anomaly Detector (Isolation Forest)',  key: 'anomaly_score',    weight: '15%', color: 'bg-amber-500' },
                    ].map(({ label, key, weight, color }) => {
                      const val = a.ml_scores[key] ?? 0;
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>{label}</span>
                            <span className="font-mono">{val}/100 <span className="text-slate-600">({weight} weight)</span></span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div className={`h-full ${color} transition-all duration-700`}
                                 style={{ width: `${val}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {/* Header bonus */}
                    {(a.ml_scores.header_bonus_pts ?? 0) > 0 && (
                      <div className="pt-2 border-t border-slate-800 flex justify-between text-xs">
                        <span className="text-slate-400">Header forensics bonus</span>
                        <span className="text-red-400 font-mono">+{a.ml_scores.header_bonus_pts} pts</span>
                      </div>
                    )}
                    {/* NLP label */}
                    {a.ml_scores.nlp_label && (
                      <div className="flex justify-between text-xs pt-1">
                        <span className="text-slate-500">NLP model prediction</span>
                        <span className={`font-medium capitalize ${
                          a.ml_scores.nlp_label === 'legitimate' ? 'text-emerald-400'
                          : a.ml_scores.nlp_label === 'bec'      ? 'text-red-400'
                          : a.ml_scores.nlp_label === 'phishing'  ? 'text-orange-400'
                          : a.ml_scores.nlp_label === 'impersonation' ? 'text-purple-400'
                          : 'text-amber-400'
                        }`}>{a.ml_scores.nlp_label}</span>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── SHAP Explainability ──────────────────────────────────── */}
              {a.shap_contributions?.length > 0 && (
                <Section icon={BarChart2} title="Explainable AI — Why This Score?">
                  <p className="text-xs text-slate-500 mb-3">
                    SHAP (SHapley Additive exPlanations) shows which features
                    drove the XGBoost model's threat prediction.
                    Positive values push toward threat; negative values push toward legitimate.
                  </p>
                  <div className="space-y-2.5">
                    {a.shap_contributions.map((s, i) => {
                      const isPos   = s.direction === '+';
                      const barPct  = Math.min(Math.abs(s.contribution) * 600, 100);
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300 capitalize">
                              {s.feature.replace(/_/g, ' ')}
                            </span>
                            <span className={`font-mono ${isPos ? 'text-red-400' : 'text-emerald-400'}`}>
                              {isPos ? '+' : ''}{s.contribution.toFixed(3)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-700 ${isPos ? 'bg-red-500' : 'bg-emerald-500'}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* ── Graph Correlation (appears after Save) ───────────────── */}
              {savedId && (
                <Section icon={Network} title="Graph Correlation">
                  {graphLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      Correlating against case database…
                    </div>
                  ) : graphData ? (
                    <div className="space-y-4">
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Related Cases',    value: graphData.correlation?.related_count ?? 0 },
                          { label: 'Graph Nodes',      value: graphData.stats?.total_nodes ?? 0 },
                          { label: 'Campaigns Found',  value: graphData.campaigns?.length ?? 0 },
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-lg bg-slate-950/60 p-3 text-center">
                            <div className="text-xl font-semibold text-cyan-400">{value}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Infrastructure */}
                      {graphData.correlation?.infrastructure && (
                        <div className="text-xs space-y-1 pt-2 border-t border-slate-800">
                          <div className="text-slate-500 uppercase tracking-wider mb-2">
                            Infrastructure fingerprint
                          </div>
                          {[
                            ['Sender Domain',   graphData.correlation.infrastructure.sender_domain],
                            ['Originating IP',  graphData.correlation.infrastructure.originating_ip],
                            ['Reply-To Domain', graphData.correlation.infrastructure.reply_to_domain],
                          ].filter(([, v]) => v).map(([label, val]) => (
                            <div key={label} className="flex justify-between">
                              <span className="text-slate-500">{label}</span>
                              <span className="text-slate-300 font-mono">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Related cases by IP */}
                      {graphData.correlation?.related_by_ip?.length > 0 && (
                        <div className="pt-2 border-t border-slate-800">
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Link2 className="w-3 h-3 text-red-400" />
                            Shared originating IP
                          </div>
                          <div className="space-y-1.5">
                            {graphData.correlation.related_by_ip.slice(0, 3).map(r => (
                              <div key={r.id}
                                   onClick={() => navigate(`/cases/${r.id}`)}
                                   className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 cursor-pointer hover:bg-slate-800/60 transition">
                                <div className="min-w-0">
                                  <div className="text-xs text-slate-300 truncate">{r.subject || '(no subject)'}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{r.value}</div>
                                </div>
                                <span className="text-xs font-semibold ml-3"
                                      style={{ color: r.fraud_score >= 70 ? '#ef4444' : r.fraud_score >= 40 ? '#eab308' : '#22c55e' }}>
                                  {r.fraud_score}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Related cases by domain */}
                      {graphData.correlation?.related_by_domain?.length > 0 && (
                        <div className="pt-2 border-t border-slate-800">
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3 text-purple-400" />
                            Shared sender domain
                          </div>
                          <div className="space-y-1.5">
                            {graphData.correlation.related_by_domain.slice(0, 3).map(r => (
                              <div key={r.id}
                                   onClick={() => navigate(`/cases/${r.id}`)}
                                   className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 cursor-pointer hover:bg-slate-800/60 transition">
                                <div className="min-w-0">
                                  <div className="text-xs text-slate-300 truncate">{r.subject || '(no subject)'}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{r.value}</div>
                                </div>
                                <span className="text-xs font-semibold ml-3"
                                      style={{ color: r.fraud_score >= 70 ? '#ef4444' : r.fraud_score >= 40 ? '#eab308' : '#22c55e' }}>
                                  {r.fraud_score}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Campaigns */}
                      {graphData.campaigns?.length > 0 && (
                        <div className="pt-2 border-t border-slate-800">
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-amber-400" />
                            Campaign detected (DBSCAN clustering)
                          </div>
                          {graphData.campaigns.map(c => (
                            <div key={c.campaign_id}
                                 className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs space-y-1">
                              <div className="text-amber-300 font-medium">{c.label}</div>
                              <div className="text-slate-400">
                                {c.size} emails · max fraud score: {c.max_fraud_score}
                              </div>
                              {c.shared_ips.length > 0 && (
                                <div className="text-slate-500 font-mono">
                                  IPs: {c.shared_ips.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* No correlations found */}
                      {graphData.correlation?.related_count === 0 &&
                       graphData.campaigns?.length === 0 && (
                        <p className="text-sm text-slate-500">
                          No related cases found yet. Graph correlation improves as more
                          emails are analysed and saved.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Graph data unavailable.</p>
                  )}
                </Section>
              )}
              <div className="flex items-center gap-3">
                {savedId ? (
                  <button
                    onClick={() => navigate(`/cases/${savedId}`)}
                    className="px-5 py-2.5 rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 text-sm font-medium"
                  >
                    ✓ Case saved — View full report
                  </button>
                ) : (
                  <button
                    onClick={saveCase}
                    disabled={saving || loading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sm font-medium transition"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save as Case
                  </button>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}