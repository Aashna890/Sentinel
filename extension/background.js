// background.js  —  Sentinel Extension Service Worker
// Handles: OAuth2 login/logout, Gmail push watch, periodic polling,
//          badge + notifications, and on-demand email scan via content.js.

const API_BASE = 'http://localhost:8000';
const APP_URL  = 'http://localhost:5173';

// ─── Storage helpers ──────────────────────────────────────────────────────────

const store = {
  get:    (keys) => chrome.storage.local.get(keys),
  set:    (obj)  => chrome.storage.local.set(obj),
  remove: (keys) => chrome.storage.local.remove(keys),
};

async function getToken()   { const d = await store.get('token'); return d.token ?? null; }
async function clearToken() { await store.remove(['token', 'user', 'google_token', 'seenAlertIds', 'badgeCount']); }

// ─── Authenticated fetch ───────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.message ?? res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

// ─── OAuth2 ───────────────────────────────────────────────────────────────────

async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (googleToken) => {
      if (chrome.runtime.lastError || !googleToken) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'OAuth cancelled'));
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ google_token: googleToken }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Backend auth failed');
        const { token, user } = await res.json();
        await store.set({ token, user, google_token: googleToken, badgeCount: 0, seenAlertIds: [] });
        await registerGmailWatch(token);
        startPolling();
        resolve({ token, user });
      } catch (err) { reject(err); }
    });
  });
}

async function signOut() {
  const { google_token } = await store.get('google_token');
  if (google_token) {
    chrome.identity.removeCachedAuthToken({ token: google_token }, () => {});
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${google_token}`).catch(() => {});
  }
  await clearToken();
  chrome.action.setBadgeText({ text: '' });
  chrome.alarms.clear('sentinel_poll');
}

// ─── Gmail watch ──────────────────────────────────────────────────────────────

async function registerGmailWatch(sentinelToken) {
  try {
    await fetch(`${API_BASE}/api/gmail/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sentinelToken}` },
    });
    console.log('[Sentinel] Gmail watch registered');
  } catch (err) {
    console.warn('[Sentinel] Gmail watch failed:', err.message);
  }
}

// ─── Polling ──────────────────────────────────────────────────────────────────

function startPolling() {
  chrome.alarms.clear('sentinel_poll', () => {
    chrome.alarms.create('sentinel_poll', { periodInMinutes: 0.5 });
  });
}

chrome.alarms.create('sentinel_watch_renew', { periodInMinutes: 60 * 24 * 6 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sentinel_poll')        await pollAlerts();
  if (alarm.name === 'sentinel_watch_renew') { const t = await getToken(); if (t) await registerGmailWatch(t); }
});

async function pollAlerts() {
  const token = await getToken();
  if (!token) return;
  let alerts = [];
  try { alerts = await apiFetch('/api/alerts?unacknowledged=true') ?? []; }
  catch (err) { console.warn('[Sentinel] Poll error:', err.message); return; }

  const { seenAlertIds = [] } = await store.get('seenAlertIds');
  const fresh = alerts.filter(a => !seenAlertIds.includes(a.id));
  if (!fresh.length) return;

  const { badgeCount = 0 } = await store.get('badgeCount');
  const newCount = badgeCount + fresh.length;
  await store.set({ badgeCount: newCount, seenAlertIds: [...seenAlertIds, ...fresh.map(a => a.id)] });

  chrome.action.setBadgeText({ text: String(newCount) });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

  for (const alert of fresh) {
    chrome.notifications.create(`sentinel_alert_${alert.id}`, {
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: `⚠️ Sentinel: ${(alert.severity ?? 'HIGH').toUpperCase()} threat`,
      message: alert.title ?? 'Threat detected',
      contextMessage: alert.indicator ?? '',
      priority: 2,
      buttons: [{ title: 'View Case' }, { title: 'Dismiss' }],
    });
  }

  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) =>
    tabs.forEach(tab =>
      chrome.tabs.sendMessage(tab.id, { type: 'SENTINEL_ALERTS', alerts: fresh }).catch(() => {})
    )
  );
  return fresh;
}

// ─── On-demand scan — inject content script first, then send SCAN_EMAIL ──────

async function scanActiveEmail() {
  const token = await getToken();

  // Find the best Gmail tab: prefer the active one, fall back to any
  const getGmailTab = () => new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs.find(t => t.url?.startsWith('https://mail.google.com'));
      if (t) { resolve(t); return; }
      chrome.tabs.query({ url: 'https://mail.google.com/*' }, (all) => resolve(all[0] ?? null));
    });
  });

  const tab = await getGmailTab();
  if (!tab) return { ok: false, error: 'No Gmail tab open. Please open Gmail first.' };

  // Ensure content script is injected (safe to call even if already injected)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['content.js'],
    });
  } catch (_) {
    // Already injected — ignore the error
  }

  // Small delay so the script has time to register its listener
  await new Promise(r => setTimeout(r, 150));

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_EMAIL', token }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(res ?? { ok: true });
      }
    });
  });
}

// ─── Live counts ──────────────────────────────────────────────────────────────

async function getLiveCounts() {
  try {
    const [alertsRes, casesRes] = await Promise.all([
      apiFetch('/api/alerts?unacknowledged=true'),
      apiFetch('/api/cases'),
    ]);
    return { alertCount: (alertsRes ?? []).length, caseCount: (casesRes ?? []).length };
  } catch { return { alertCount: null, caseCount: null }; }
}

// ─── Notification clicks ──────────────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener((id, btn) => {
  if (!id.startsWith('sentinel_alert_')) return;
  chrome.notifications.clear(id);
  if (btn === 0) chrome.tabs.create({ url: `${APP_URL}/cases` });
});
chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('sentinel_alert_')) {
    chrome.notifications.clear(id);
    chrome.tabs.create({ url: `${APP_URL}/cases` });
  }
});

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    switch (msg.type) {

      case 'SIGN_IN': {
        try   { reply({ ok: true,  data:  await signInWithGoogle() }); }
        catch (e) { reply({ ok: false, error: e.message }); }
        break;
      }

      case 'SIGN_OUT': {
        await signOut();
        reply({ ok: true });
        break;
      }

      case 'GET_STATE': {
        const token = await getToken();
        const { user, badgeCount = 0 } = await store.get(['user', 'badgeCount']);
        reply({ ok: true, data: { token, user, badgeCount } });
        break;
      }

      // "Scan Now" button — scan the email currently open in Gmail
      case 'POLL_NOW': {
        const scanResult = await scanActiveEmail();
        console.log('[Sentinel] Scan result:', scanResult);
        const fresh = await pollAlerts();
        reply({ ok: true, newAlerts: (fresh ?? []).length, scan: scanResult });
        break;
      }

      case 'GET_COUNTS': {
        reply({ ok: true, data: await getLiveCounts() });
        break;
      }

      case 'GET_RECENT_ALERTS': {
        try {
          const alerts = await apiFetch('/api/alerts?unacknowledged=true') ?? [];
          const sorted = alerts
            .sort((a, b) => (b.created_date ?? '').localeCompare(a.created_date ?? ''))
            .slice(0, 5);
          reply({ ok: true, data: sorted });
        } catch (e) { reply({ ok: false, error: e.message, data: [] }); }
        break;
      }

      case 'CLEAR_BADGE': {
        await store.set({ badgeCount: 0 });
        chrome.action.setBadgeText({ text: '' });
        reply({ ok: true });
        break;
      }

      default:
        reply({ ok: false, error: `Unknown message type: ${msg.type}` });
    }
  })();
  return true; // keep async channel open
});

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const token = await getToken();
  if (token) startPolling();
});

chrome.runtime.onStartup.addListener(async () => {
  const token = await getToken();
  if (token) { startPolling(); await pollAlerts(); }
});