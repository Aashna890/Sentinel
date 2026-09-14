// ─────────────────────────────────────────────────────────────────────────────
// CaseDetail.jsx
// Full forensic report view for a single saved email case.
// Displays: fraud score, threat indicators, BEC patterns, header anomalies,
// SPF/DKIM/DMARC results, relay path trace, origin geolocation (with map),
// domain intelligence, attribution assessment, recommendations, and the raw
// email source. Analysts can also update the case status from this page.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import {
  ArrowLeft, Loader2, MapPin, Server, Globe, ShieldCheck,
  FileWarning, AlertTriangle, Clock, Network,
} from 'lucide-react';

// Colour per threat level — used for the badge and the fraud score number
const LEVEL_COLOR = {
  legitimate:    '#22c55e',
  suspicious:    '#eab308',
  phishing:      '#f97316',
  impersonation: '#a855f7',
  fraud:         '#ef4444',
};

// Allowed case workflow statuses that the analyst can transition between
const STATUS_OPTS = ['new', 'investigating', 'escalated', 'resolved', 'false_positive'];

// Tailwind classes for each status pill
const STATUS_STYLE = {
  new:            'bg-cyan-500/10 text-cyan-400',
  investigating:  'bg-amber-500/10 text-amber-400',
  escalated:      'bg-red-500/10 text-red-400',
  resolved:       'bg-emerald-500/10 text-emerald-400',
  false_positive: 'bg-slate-500/10 text-slate-400',
};

// ── Shared sub-components ─────────────────────────────────────────────────────

/** Card with an icon header — wraps each major section. */
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

/** Label + value display pair used inside sections. */
function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm text-slate-200 mt-0.5 break-words">{value || '—'}</div>
    </div>
  );
}

/** Small coloured pill tag for infrastructure type (Proxy/VPN, Hosting, etc.). */
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

export default function CaseDetail() {
  // The case ID comes from the URL (/cases/:id)
  const { id } = useParams();

  const [c, setC]             = useState(null);   // The full case object
  const [loading, setLoading] = useState(true);   // True while fetching the case
  const [updating, setUpdating] = useState(false); // True while saving a status change

  // Fetch the case by ID when the component mounts (or when the ID changes)
  useEffect(() => {
    (async () => {
      try {
        setC(await api.entities.EmailCase.get(id));
      } catch {
        setC(null); // Case not found — handled below
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Update the case status and reflect the change in local state immediately
  const updateStatus = async (status) => {
    setUpdating(true);
    try {
      setC(await api.entities.EmailCase.update(id, { status }));
    } finally {
      setUpdating(false);
    }
  };

  // ── Early return states ───────────────────────────────────────────────────

  if (loading) return (
    <div className="p-20 flex justify-center">
      <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
    </div>
  );

  if (!c) return (
    <div className="p-8 text-center">
      <p className="text-slate-400 mb-4">Case not found.</p>
      <Link to="/cases" className="text-cyan-400">← Back to cases</Link>
    </div>
  );

  // ── Derived values ────────────────────────────────────────────────────────

  const geo  = c.geolocation   || {};
  const auth = c.authentication || {};
  const attr = c.attribution    || {};

  // We can only show the embedded map if we have lat/lon coordinates
  const hasGeo = geo.lat != null && geo.lon != null;

  // Build an OpenStreetMap embed URL centred on the origin IP's coordinates
  const mapDelta = 0.05; // degrees of padding around the marker
  const mapSrc = hasGeo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${geo.lon - mapDelta},${geo.lat - mapDelta},${geo.lon + mapDelta},${geo.lat + mapDelta}&layer=mapnik&marker=${geo.lat},${geo.lon}`
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* Back navigation */}
      <Link to="/cases" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to cases
      </Link>

      {/* ── Page header: subject, sender, threat level, fraud score ──────── */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {/* Threat level badge */}
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ring-1"
              style={{
                color:       LEVEL_COLOR[c.threat_level],
                background:  `${LEVEL_COLOR[c.threat_level]}1a`,
                borderColor: 'transparent',
              }}
            >
              <AlertTriangle className="w-3 h-3" /> {c.threat_level}
            </span>
            {/* Workflow status badge */}
            <span className={`px-2.5 py-1 rounded-full text-xs ${STATUS_STYLE[c.status]}`}>
              {c.status}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.subject || '(no subject)'}</h1>
          <p className="text-sm text-slate-400 mt-1">
            From{' '}
            <span className="text-slate-300">
              {c.sender_display_name
                ? `${c.sender_display_name} <${c.sender_email}>`
                : c.sender_email}
            </span>
          </p>
        </div>

        {/* Large fraud score number */}
        <div className="text-center">
          <div
            className="text-4xl font-semibold"
            style={{
              color: (c.fraud_score || 0) >= 70 ? '#ef4444'
                   : (c.fraud_score || 0) >= 40 ? '#eab308'
                   : '#22c55e',
            }}
          >
            {c.fraud_score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">fraud score</div>
        </div>
      </div>

      {/* ── Two-column layout: main content + sidebar ────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Main column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">

          {/* AI-generated assessment summary */}
          {c.summary && (
            <Section icon={FileWarning} title="Assessment Summary">
              <p className="text-sm text-slate-300 leading-relaxed">{c.summary}</p>
              {c.classification && (
                <p className="text-xs text-slate-500 mt-2">Classification: {c.classification}</p>
              )}
            </Section>
          )}

          {/* Threat indicators, BEC patterns, and header anomalies */}
          <Section icon={FileWarning} title="Threat Indicators">
            {c.threat_indicators?.length ? (
              <ul className="space-y-1.5 text-sm text-slate-300">
                {c.threat_indicators.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-red-400 mt-0.5">•</span>{t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">None detected</p>
            )}

            {/* Business Email Compromise patterns */}
            {c.bec_patterns?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">BEC Patterns</div>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {c.bec_patterns.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-purple-400 mt-0.5">•</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Anomalies found in email headers (forged fields, relay manipulation, etc.) */}
            {c.header_anomalies?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Header Anomalies</div>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {c.header_anomalies.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>{t}
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
                  <div className="font-medium mt-1">{auth[key] || '—'}</div>
                </div>
              ))}
            </div>
            {/* Alignment checks — did the domain in the auth record match the From header? */}
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <div className="rounded-lg bg-slate-950/50 p-3">
                <span className="text-slate-500">SPF aligned: </span>
                <span className="font-medium">
                  {auth.spf_aligned ? 'Yes' : auth.spf_aligned === false ? 'No' : '—'}
                </span>
              </div>
              <div className="rounded-lg bg-slate-950/50 p-3">
                <span className="text-slate-500">DKIM aligned: </span>
                <span className="font-medium">
                  {auth.dkim_aligned ? 'Yes' : auth.dkim_aligned === false ? 'No' : '—'}
                </span>
              </div>
            </div>
            {auth.notes && <p className="text-xs text-slate-400 mt-3">{auth.notes}</p>}
          </Section>

          {/* SMTP relay path — each hop the email passed through on its way to the recipient */}
          <Section icon={Network} title="Relay Path Trace">
            {c.relay_path?.length ? (
              <div className="space-y-0">
                {c.relay_path.map((hop, i) => (
                  <div key={i} className="flex gap-3 relative">
                    {/* Hop number bubble + connector line */}
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium ring-1 ring-slate-700">
                        {hop.hop || i + 1}
                      </div>
                      {i < c.relay_path.length - 1 && (
                        <div className="w-px flex-1 bg-slate-800 my-1" />
                      )}
                    </div>
                    {/* Hop details: server name, IP, from domain, timestamp */}
                    <div className="flex-1 pb-5">
                      <div className="text-sm font-medium text-slate-200">
                        {hop.by || hop.from || 'Unknown relay'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                        {hop.ip        && <span className="font-mono">{hop.ip}</span>}
                        {hop.from      && <span>from: {hop.from}</span>}
                        {hop.timestamp && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />{hop.timestamp}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No relay path data</p>
            )}
          </Section>

          {/* Recommended next actions for the analyst */}
          {c.recommendations?.length > 0 && (
            <Section icon={ShieldCheck} title="Recommendations">
              <ul className="space-y-1.5 text-sm text-slate-300">
                {c.recommendations.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-cyan-400 mt-0.5">✓</span>{t}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* ── Sidebar (1/3 width) ───────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Origin geolocation — shows an embedded OpenStreetMap if coordinates exist */}
          <Section icon={MapPin} title="Origin Geolocation">
            {hasGeo ? (
              <>
                {/* Embedded map centred on the originating IP's location */}
                <div className="rounded-lg overflow-hidden border border-slate-800 mb-3">
                  <iframe
                    title="Origin location map"
                    src={mapSrc}
                    className="w-full h-48"
                    style={{ border: 0 }}
                    loading="lazy"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Origin IP"    value={c.originating_ip} />
                  <Field label="Country"      value={geo.country} />
                  <Field label="Region"       value={geo.region} />
                  <Field label="City"         value={geo.city} />
                  <Field label="ISP"          value={geo.isp} />
                  <Field label="Organization" value={geo.org} />
                  <Field label="ASN"          value={geo.asname || geo.asn} />
                  <Field label="Coordinates"  value={`${geo.lat}, ${geo.lon}`} />
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
              </>
            ) : (
              <p className="text-sm text-slate-500">No geolocation data available.</p>
            )}
          </Section>

          {/* Domain intelligence: registrar, creation date, MX records */}
          <Section icon={Globe} title="Domain Intelligence">
            <div className="grid grid-cols-1 gap-3 text-sm">
              <Field label="Sender Domain" value={c.sender_domain} />
              <Field label="Registrar"     value={c.domain_intel?.registrar} />
              <Field label="Created"       value={c.domain_intel?.created} />
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">MX Records</div>
                {c.domain_intel?.mx_records?.length ? (
                  <ul className="mt-1 space-y-1 text-xs font-mono text-slate-300">
                    {c.domain_intel.mx_records.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                ) : (
                  <div className="text-sm text-slate-500 mt-0.5">—</div>
                )}
              </div>
              {c.domain_intel?.notes && (
                <p className="text-xs text-slate-400">{c.domain_intel.notes}</p>
              )}
            </div>
          </Section>

          {/* Attribution assessment: confidence bar + likely origin type */}
          <Section icon={Globe} title="Attribution">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  style={{ width: `${attr.confidence || 0}%` }}
                />
              </div>
              <span className="text-sm font-medium">{attr.confidence || 0}%</span>
            </div>
            <Field label="Likely Origin Type" value={attr.likely_origin_type} />
            <p className="text-sm text-slate-300 mt-3">{attr.assessment || '—'}</p>
          </Section>

          {/* Status management — analyst can move the case through the workflow */}
          <Section icon={ShieldCheck} title="Case Status">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTS.map(s => (
                <button
                  key={s}
                  disabled={updating}
                  onClick={() => updateStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    c.status === s
                      ? STATUS_STYLE[s] + ' ring-1 ring-current'  // Active state
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800' // Inactive
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Raw email source — collapsible scrollable block at the bottom */}
      {c.raw_email && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Raw Email Source</h3>
          <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap max-h-64 overflow-auto bg-slate-950/50 p-4 rounded-lg">
            {c.raw_email}
          </pre>
        </div>
      )}
    </div>
  );
}