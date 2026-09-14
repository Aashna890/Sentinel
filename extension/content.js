// content.js  —  Injected into https://mail.google.com/*
// Responsibilities:
//   1. Detect when a new email is opened in Gmail
//   2. Extract the Message-ID from the DOM / Gmail API
//   3. Inject an inline threat banner when the background script
//      reports that email as a threat

// ─── Banner injection ─────────────────────────────────────────────────────────

/**
 * Create and insert the threat warning banner above the email body.
 * @param {object} alert  - Alert object from the backend
 * @param {Element} container - The Gmail email-body wrapper element
 */
function injectBanner(alert, container) {
  // Avoid double-injecting
  if (container.querySelector('.sentinel-banner')) return;

  const sev = alert.severity ?? 'high';
  const COLOR_MAP = {
    low:      { bg: '#1e3a5f', border: '#3b82f6', text: '#93c5fd', icon: 'ℹ️' },
    medium:   { bg: '#3b2a00', border: '#eab308', text: '#fde68a', icon: '⚠️' },
    high:     { bg: '#3b1a00', border: '#f97316', text: '#fed7aa', icon: '🚨' },
    critical: { bg: '#3b0000', border: '#ef4444', text: '#fca5a5', icon: '🔴' },
  };
  const c = COLOR_MAP[sev] ?? COLOR_MAP.high;

  const banner = document.createElement('div');
  banner.className = 'sentinel-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <div class="sentinel-banner-inner" style="
      background:    ${c.bg};
      border:        1.5px solid ${c.border};
      border-radius: 8px;
      padding:       12px 16px;
      margin:        8px 0 12px;
      display:       flex;
      align-items:   flex-start;
      gap:           12px;
      font-family:   system-ui, sans-serif;
    ">
      <span style="font-size:20px;line-height:1.3">${c.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="
          font-weight: 600;
          font-size:   13px;
          color:       ${c.text};
          margin-bottom: 4px;
        ">Sentinel: ${sev.toUpperCase()} threat detected</div>
        <div style="font-size:12px;color:${c.text};opacity:.85;line-height:1.5">
          ${escHtml(alert.title ?? '')}
          ${alert.indicator ? `<span style="font-family:monospace;margin-left:6px;opacity:.7">${escHtml(alert.indicator)}</span>` : ''}
        </div>
        ${alert.case_id ? `
          <a href="http://localhost:5173/cases/${alert.case_id}"
             target="_blank"
             rel="noopener"
             style="
               display:        inline-block;
               margin-top:     8px;
               font-size:      12px;
               color:          ${c.text};
               border:         1px solid ${c.border};
               border-radius:  4px;
               padding:        2px 10px;
               text-decoration:none;
             ">
            View forensic report →
          </a>` : ''}
      </div>
      <button class="sentinel-dismiss"
        title="Dismiss"
        style="
          background: none;
          border:     none;
          color:      ${c.text};
          cursor:     pointer;
          font-size:  18px;
          line-height:1;
          opacity:    .6;
          padding:    0;
          flex-shrink:0;
        ">×</button>
    </div>
  `;

  banner.querySelector('.sentinel-dismiss').addEventListener('click', () => banner.remove());
  container.insertBefore(banner, container.firstChild);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Gmail DOM observation ────────────────────────────────────────────────────
// Gmail is a SPA. We watch for the email-view pane to appear
// (identified by the [data-message-id] attribute Gmail sets on each email).

const EMAIL_SELECTOR = 'div[data-message-id]';

// Map of messageId → alert (populated by background push)
const pendingAlerts = new Map();

function tryInjectForVisible() {
  document.querySelectorAll(EMAIL_SELECTOR).forEach(el => {
    const mid = el.dataset.messageId;
    if (mid && pendingAlerts.has(mid)) {
      // Find the body area — Gmail wraps it in a div with class 'a3s'
      const body = el.querySelector('.a3s.aiL') ?? el.querySelector('.a3s') ?? el;
      injectBanner(pendingAlerts.get(mid), body);
    }
  });
}

const observer = new MutationObserver(tryInjectForVisible);
observer.observe(document.body, { childList: true, subtree: true });

// ─── Messages from background.js ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'SENTINEL_ALERTS') return;

  /** @type {Array<{id,title,severity,indicator,case_id,gmail_message_id}>} */
  const alerts = msg.alerts ?? [];

  alerts.forEach(alert => {
    if (alert.gmail_message_id) {
      pendingAlerts.set(alert.gmail_message_id, alert);
    }
  });

  // Try immediately in case the email is already open
  tryInjectForVisible();
});