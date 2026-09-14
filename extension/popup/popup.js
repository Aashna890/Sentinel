// popup.js  —  Sentinel Extension Popup Controller

const APP_URL = 'http://localhost:5173'; // ← change to your deployed web app URL

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const views = {
  loading:   $('loading'),
  signedOut: $('signed-out'),
  signedIn:  $('signed-in'),
};

// ─── Show / hide views ────────────────────────────────────────────────────────
function showView(name) {
  Object.entries(views).forEach(([k, el]) =>
    el.classList.toggle('hidden', k !== name)
  );
}

// ─── Render signed-in state ───────────────────────────────────────────────────
function renderUser(user, badgeCount) {
  const name  = user?.full_name || user?.name || 'Analyst';
  const email = user?.email ?? '';

  $('user-name').textContent   = name;
  $('user-email').textContent  = email;
  $('user-avatar').textContent = name.charAt(0).toUpperCase();
  $('alert-count').textContent = badgeCount > 0 ? String(badgeCount) : '0';
  $('btn-open-app').href = `${APP_URL}/dashboard`;

  if (badgeCount > 0) {
    $('stat-alerts').style.setProperty('--val-color', '#ef4444');
    $('alert-count').style.color = '#f87171';
  }
}

// ─── Fetch live counts from background ───────────────────────────────────────
async function sendMsg(type, payload = {}) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type, ...payload }, resolve)
  );
}

async function init() {
  showView('loading');

  const { ok, data } = await sendMsg('GET_STATE');
  if (!ok || !data.token) {
    showView('signedOut');
    return;
  }

  renderUser(data.user, data.badgeCount);
  showView('signedIn');
}

// ─── Event listeners ──────────────────────────────────────────────────────────

$('btn-signin').addEventListener('click', async () => {
  $('btn-signin').disabled = true;
  $('btn-signin').textContent = 'Connecting…';

  const { ok, data, error } = await sendMsg('SIGN_IN');
  if (ok) {
    renderUser(data.user, 0);
    showView('signedIn');
  } else {
    alert('Sign-in failed: ' + (error ?? 'unknown error'));
    $('btn-signin').disabled = false;
    $('btn-signin').innerHTML = `
      <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">…</svg>
      Continue with Google`;
  }
});

$('btn-signout').addEventListener('click', async () => {
  await sendMsg('SIGN_OUT');
  showView('signedOut');
});

$('btn-scan-now').addEventListener('click', async () => {
  $('btn-scan-now').disabled = true;
  $('btn-scan-now').textContent = 'Scanning…';
  $('scan-status').textContent = '…';

  // Trigger an immediate poll
  await sendMsg('POLL_NOW');

  $('scan-status').textContent = 'Done';
  setTimeout(() => {
    $('scan-status').textContent = 'Live';
    $('btn-scan-now').disabled = false;
    $('btn-scan-now').textContent = 'Scan Now';
  }, 2000);

  // Refresh badge count
  const { data } = await sendMsg('GET_STATE');
  $('alert-count').textContent = String(data?.badgeCount ?? 0);
  await sendMsg('CLEAR_BADGE');
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();