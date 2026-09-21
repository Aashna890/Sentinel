// background.js  —  Sentinel Extension Service Worker
// Handles: OAuth2 login/logout, Gmail push watch registration,
//          periodic poll for new threat alerts, badge + notifications.

const API_BASE = 'http://localhost:8000'; // ← change to your deployed backend URL

// ─── Storage helpers ─────────────────────────────────────────────────────────

const store = {
  get:    (keys) => chrome.storage.local.get(keys),
  set:    (obj)  => chrome.storage.local.set(obj),
  remove: (keys) => chrome.storage.local.remove(keys),
};

async function getToken()  { const d = await store.get('token'); return d.token ?? null; }
async function setToken(t) { await store.set({ token: t }); }
async function clearToken(){ await store.remove(['token', 'user']); }

// ─── Google OAuth2 (chrome.identity) ─────────────────────────────────────────

export async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (googleToken) => {
      if (chrome.runtime.lastError || !googleToken) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'OAuth cancelled'));
        return;
      }

      try {
        // Exchange the Google token for a Sentinel JWT
        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ google_token: googleToken }),
        });

        if (!res.ok) throw new Error('Backend auth failed');
        const { token, user } = await res.json();

        await store.set({ token, user, google_token: googleToken });
        await registerGmailWatch(token);
        startPolling();
        resolve({ token, user });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function signOut() {
  const { google_token } = await store.get('google_token');
  if (google_token) {
    // Revoke so Chrome forgets the cached token
    chrome.identity.removeCachedAuthToken({ token: google_token }, () => {});
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${google_token}`).catch(() => {});
  }
  await clearToken();
  chrome.action.setBadgeText({ text: '' });
}

// ─── Gmail Push Watch ─────────────────────────────────────────────────────────
// Tells Gmail to push new-message events to your backend Pub/Sub webhook.
// The watch expires after 7 days; we re-register via an alarm.

async function registerGmailWatch(sentinelToken) {
  try {
    await fetch(`${API_BASE}/gmail/watch`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${sentinelToken}`,
      },
    });
    console.log('[Sentinel] Gmail watch registered');
  } catch (err) {
    console.warn('[Sentinel] Could not register Gmail watch:', err.message);
  }
}

// ─── Polling for new alerts ───────────────────────────────────────────────────
// Every 30 s we ask the backend for unacknowledged alerts.
// In production the backend pushes via SSE/WebSocket instead.

function startPolling() {
  chrome.alarms.create('sentinel_poll', { periodInMinutes: 0.5 }); // 30 s
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sentinel_poll')         await pollAlerts();
  if (alarm.name === 'sentinel_watch_renew')  await renewWatch();
});

// Renew the Gmail watch every 6 days (it expires at 7)
chrome.alarms.create('sentinel_watch_renew', { periodInMinutes: 60 * 24 * 6 });

async function pollAlerts() {
  const token = await getToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/alerts?unacknowledged=true`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;

    const alerts = await res.json();
    const { seenAlertIds = [] } = await store.get('seenAlertIds');

    const fresh = alerts.filter(a => !seenAlertIds.includes(a.id));
    if (fresh.length === 0) return;

    // Update badge
    const { badgeCount = 0 } = await store.get('badgeCount');
    const newCount = badgeCount + fresh.length;
    await store.set({ badgeCount: newCount });
    chrome.action.setBadgeText({ text: String(newCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

    // Fire a Chrome notification for each new alert
    for (const alert of fresh) {
      chrome.notifications.create(`sentinel_alert_${alert.id}`, {
        type:     'basic',
        iconUrl:  'icons/icon48.png',
        title:    `⚠️ Sentinel: ${alert.severity?.toUpperCase() ?? 'THREAT'} detected`,
        message:  alert.title,
        contextMessage: alert.indicator ?? '',
        priority: 2,
        buttons: [{ title: 'View Case' }, { title: 'Dismiss' }],
      });
    }

    // Remember which alerts we have already shown
    await store.set({ seenAlertIds: [...seenAlertIds, ...fresh.map(a => a.id)] });

    // Broadcast to content script so it can inject the banner
    chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
      tabs.forEach(tab =>
        chrome.tabs.sendMessage(tab.id, { type: 'SENTINEL_ALERTS', alerts: fresh }).catch(() => {})
      );
    });
  } catch (err) {
    console.warn('[Sentinel] Poll error:', err.message);
  }
}

async function renewWatch() {
  const token = await getToken();
  if (token) await registerGmailWatch(token);
}

// ─── Notification button clicks ───────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (!notifId.startsWith('sentinel_alert_')) return;
  chrome.notifications.clear(notifId);

  if (btnIdx === 0) {
    // "View Case" — open the web app
    chrome.tabs.create({ url: `${API_BASE.replace(':8000', ':5173')}/cases` });
  }
  // btnIdx === 1 → Dismiss: do nothing extra
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith('sentinel_alert_')) {
    chrome.notifications.clear(notifId);
    chrome.tabs.create({ url: `${API_BASE.replace(':8000', ':5173')}/cases` });
  }
});

// ─── Messages from popup.js ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    switch (msg.type) {
      case 'SIGN_IN': {
        try        { reply({ ok: true,  data: await signInWithGoogle() }); }
        catch (e)  { reply({ ok: false, error: e.message }); }
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
      case 'CLEAR_BADGE': {
        await store.set({ badgeCount: 0 });
        chrome.action.setBadgeText({ text: '' });
        reply({ ok: true });
        break;
      }
    }
  })();
  return true; // keep channel open for async reply
});

// ─── On install / startup ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const token = await getToken();
  if (token) startPolling();
});

chrome.runtime.onStartup.addListener(async () => {
  const token = await getToken();
  if (token) {
    startPolling();
    await pollAlerts(); // immediate check on browser start
  }
});