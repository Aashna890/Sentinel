// content.js — Sentinel Extension Content Script
// Injected into https://mail.google.com/* ONLY.

const APP_URL = 'http://localhost:5173';
const API_BASE = 'http://localhost:8000';

// ─── Gmail DOM helpers ────────────────────────────────────────────────────────

function findEmailContainer() {
  return (
    document.querySelector('.a3s.aiL') ||
    document.querySelector('[data-message-id]') ||
    document.querySelector('.gs')
  );
}

// Extract as much context as possible from the currently open email
function extractEmailData() {
  const container = findEmailContainer();
  if (!container) return null;

  // Body text
  const bodyEl = document.querySelector('.a3s.aiL') || container;
  const bodyText = bodyEl?.innerText?.trim() ?? '';

  // Subject
  const subjectEl = document.querySelector('h2.hP');
  const subject = subjectEl?.innerText?.trim() ?? '';

  // Sender
  const senderEl = document.querySelector('.gD');
  const senderName  = senderEl?.getAttribute('name') ?? '';
  const senderEmail = senderEl?.getAttribute('email') ?? '';

  // All links in the email
  const links = Array.from(bodyEl.querySelectorAll('a[href]'))
    .map(a => a.href)
    .filter(h => h.startsWith('http'));

  // Reply-To header (if shown in expanded headers)
  const replyToEl = document.querySelector('[data-hovercard-id]');
  const replyTo = replyToEl?.getAttribute('data-hovercard-id') ?? '';

  return {
    subject,
    sender_name:  senderName,
    sender_email: senderEmail,
    body:         bodyText,
    links,
    reply_to:     replyTo,
  };
}

// ─── Banner injection ─────────────────────────────────────────────────────────

function removeScanningBanner() {
  document.getElementById('sentinel-scanning')?.remove();
}

function injectScanningBanner() {
  removeScanningBanner();
  const container = findEmailContainer();
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'sentinel-scanning';
  wrapper.className = 'sentinel-banner';

  const inner = document.createElement('div');
  inner.className = 'sentinel-banner-inner';
  inner.style.cssText = [
    'background:rgba(34,211,238,0.08)',
    'border:1px solid #22d3ee',
    'border-radius:8px',
    'padding:10px 14px',
    'margin-bottom:10px',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'font-family:system-ui,sans-serif',
    'font-size:13px',
    'color:#e2e8f0',
  ].join(';');

  inner.innerHTML = `
    <span style="font-size:18px;flex-shrink:0">🔍</span>
    <span style="flex:1">Sentinel is analyzing this email…</span>
  `;

  wrapper.appendChild(inner);
  container.parentNode.insertBefore(wrapper, container);
}

function injectResultBanner(result) {
  removeScanningBanner();
  const container = findEmailContainer();
  if (!container) return;

  // result shape: { threat: bool, severity: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'|'SAFE',
  //                 title: str, indicator: str, case_id?: str, id?: str }
  const isSafe = !result.threat || (result.severity ?? '').toUpperCase() === 'SAFE';
  const bannerId = 'sentinel-result-' + Date.now();

  if (isSafe) {
    const wrapper = document.createElement('div');
    wrapper.id = bannerId;
    wrapper.className = 'sentinel-banner';
    const inner = document.createElement('div');
    inner.className = 'sentinel-banner-inner';
    inner.style.cssText = [
      'background:rgba(34,197,94,0.10)',
      'border:1px solid #22c55e',
      'border-radius:8px',
      'padding:10px 14px',
      'margin-bottom:10px',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'font-family:system-ui,sans-serif',
      'font-size:13px',
      'color:#e2e8f0',
    ].join(';');
    inner.innerHTML = `
      <span style="font-size:18px;flex-shrink:0">✅</span>
      <span style="flex:1;color:#86efac"><strong>Sentinel — No threats detected</strong>
        <div style="margin-top:3px;color:#64748b;font-size:12px">${result.title ?? 'This email appears safe.'}</div>
      </span>
      <button onclick="this.closest('.sentinel-banner').remove()"
              style="background:none;border:none;cursor:pointer;color:#475569;font-size:16px;padding:0;opacity:.7">✕</button>
    `;
    wrapper.appendChild(inner);
    container.parentNode.insertBefore(wrapper, container);
    return;
  }

  // Threat detected — reuse existing injectBanner logic
  injectBanner({ ...result, id: result.id ?? bannerId });
}

function injectBanner(alert) {
  const container = findEmailContainer();
  if (!container) return;
  const existingId = 'sentinel-banner-' + alert.id;
  if (document.getElementById(existingId)) return;

  const sev = (alert.severity ?? 'HIGH').toUpperCase();
  const colors = {
    CRITICAL: { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#fca5a5' },
    HIGH:     { bg: 'rgba(249,115,22,0.12)', border: '#f97316', text: '#fdba74' },
    MEDIUM:   { bg: 'rgba(234,179,8,0.12)',  border: '#eab308', text: '#fde047' },
    LOW:      { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#93c5fd' },
  };
  const c = colors[sev] ?? colors.HIGH;

  const wrapper = document.createElement('div');
  wrapper.id = existingId;
  wrapper.className = 'sentinel-banner';

  const inner = document.createElement('div');
  inner.className = 'sentinel-banner-inner';
  inner.style.cssText = [
    'background:' + c.bg,
    'border:1px solid ' + c.border,
    'border-radius:8px',
    'padding:10px 14px',
    'margin-bottom:10px',
    'display:flex',
    'align-items:flex-start',
    'gap:10px',
    'font-family:system-ui,sans-serif',
    'font-size:13px',
    'color:#e2e8f0',
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  icon.style.cssText = 'font-size:18px;flex-shrink:0;margin-top:1px;';

  const body = document.createElement('div');
  body.style.cssText = 'flex:1;min-width:0;';

  const title = document.createElement('strong');
  title.style.color = c.text;
  title.textContent = 'Sentinel — ' + sev + ' threat detected';
  body.appendChild(title);

  const desc = document.createElement('div');
  desc.style.cssText = 'margin-top:3px;color:#cbd5e1;';
  desc.textContent = alert.title ?? 'Potential threat in this email';
  body.appendChild(desc);

  if (alert.indicator) {
    const ind = document.createElement('div');
    ind.style.cssText = 'margin-top:4px;font-family:monospace;font-size:11px;color:#64748b;';
    ind.textContent = alert.indicator;
    body.appendChild(ind);
  }

  if (alert.case_id) {
    const link = document.createElement('a');
    link.href = APP_URL + '/cases/' + encodeURIComponent(alert.case_id);
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.cssText = 'display:inline-block;margin-top:6px;color:#22d3ee;font-size:12px;text-decoration:none;';
    link.textContent = 'View forensic report →';
    body.appendChild(link);
  }

  const dismiss = document.createElement('button');
  dismiss.style.cssText = 'background:none;border:none;cursor:pointer;color:#475569;font-size:16px;line-height:1;padding:0;opacity:.7;flex-shrink:0;';
  dismiss.title = 'Dismiss';
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', function() { wrapper.remove(); });

  inner.appendChild(icon);
  inner.appendChild(body);
  inner.appendChild(dismiss);
  wrapper.appendChild(inner);

  container.parentNode.insertBefore(wrapper, container);
}

// ─── Scan the on-screen email ─────────────────────────────────────────────────

async function scanCurrentEmail(token) {
  const emailData = extractEmailData();

  if (!emailData || !emailData.body) {
    injectResultBanner({
      threat: false,
      severity: 'SAFE',
      title: 'No email body found. Please open an email first.',
    });
    return;
  }

  injectScanningBanner();

  try {
    const res = await fetch(`${API_BASE}/api/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(emailData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? err.message ?? res.statusText);
    }

    const result = await res.json();
    // Expected response shape from your backend:
    // { threat: bool, severity: str, title: str, indicator: str, case_id?: str }
    injectResultBanner(result);

  } catch (err) {
    removeScanningBanner();
    injectResultBanner({
      threat: true,
      severity: 'HIGH',
      title: 'Scan failed: ' + err.message,
      indicator: 'Check that your backend is running at ' + API_BASE,
    });
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
  // Push alerts from background polling
  if (msg.type === 'SENTINEL_ALERTS' && Array.isArray(msg.alerts)) {
    msg.alerts.forEach(function(alert) { injectBanner(alert); });
  }

  // On-demand scan triggered by "Scan Now" button in popup
  if (msg.type === 'SCAN_EMAIL') {
    scanCurrentEmail(msg.token).then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async
  }
});

// ─── SPA URL observer ────────────────────────────────────────────────────────

var lastUrl = location.href;
var observer = new MutationObserver(function() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Clean up old banners when navigating to a different email
    document.querySelectorAll('.sentinel-banner').forEach(el => el.remove());
  }
});
observer.observe(document.body, { childList: true, subtree: true });