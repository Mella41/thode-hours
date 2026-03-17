const API_BASE = '';

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authError = document.getElementById('auth-error');
const forgotForm = document.getElementById('forgot-form');
const forgotEmailInput = document.getElementById('forgot-email');
const forgotHint = document.getElementById('forgot-hint');
const forgotPasswordLink = document.getElementById('forgot-password-link');

const welcomeText = document.getElementById('welcome-text');
const currentMonthLabel = document.getElementById('current-month-label');
const monthPrevBtn = document.getElementById('month-prev');
const monthNextBtn = document.getElementById('month-next');
const logoutBtn = document.getElementById('logout-btn');

const logForm = document.getElementById('log-form');
const logDate = document.getElementById('log-date');
const logArrival = document.getElementById('log-arrival');
const logDeparture = document.getElementById('log-departure');
const logProductivity = document.getElementById('log-productivity');
const logError = document.getElementById('log-error');
const logSuccess = document.getElementById('log-success');
const logLockMessage = document.getElementById('log-lock-message');
const logSubmitBtn = logForm.querySelector('button[type="submit"]');

const logsTitle = document.getElementById('logs-title');
const logsSubtitle = document.getElementById('logs-subtitle');
const yourTotal = document.getElementById('your-total');
const logsTableBody = document.getElementById('logs-table-body');
const leaderboardBody = document.getElementById('leaderboard-body');

let selectedMonth = null; // in "YYYY-MM" format
let currentUser = null;
let viewedUserId = null;
let viewedUserName = '';

function getCurrentMonthISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(isoMonth) {
  const [yearStr, monthStr] = isoMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return isoMonth;
  const date = new Date(year, month - 1, 1);
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  return formatter.format(date);
}

function getCurrentDateISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function saveSession(user) {
  localStorage.setItem('thodeUser', JSON.stringify(user));
}

function loadSession() {
  try {
    const raw = localStorage.getItem('thodeUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('thodeUser');
}

function updateLogsHeader() {
  if (!currentUser) return;
  if (!viewedUserId || viewedUserId === currentUser.userId) {
    logsTitle.textContent = 'Your month at Thode';
    logsSubtitle.textContent = '';
  } else {
    logsTitle.textContent = 'Logs at Thode';
    logsSubtitle.textContent = `Showing logs for ${viewedUserName}`;
  }
}

function updateLogFormState() {
  const today = getCurrentDateISO();
  logDate.value = today;
  logDate.min = today;
  logDate.max = today;

  const isCurrentMonth = selectedMonth === getCurrentMonthISO();
  const disabled = !isCurrentMonth;

  [logArrival, logDeparture, logProductivity].forEach((input) => {
    input.disabled = disabled;
  });
  logSubmitBtn.disabled = disabled;

  if (disabled) {
    logLockMessage.textContent = 'You can only add hours while viewing the current month.';
  } else {
    logLockMessage.textContent = '';
  }
}

function showAuth() {
  authSection.classList.remove('hidden');
  appSection.classList.add('hidden');
}

function showApp() {
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
}

function switchTab(toSignup) {
  if (toSignup) {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.add('visible');
    loginForm.classList.remove('visible');
    forgotForm.classList.remove('visible');
  } else {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.add('visible');
    signupForm.classList.remove('visible');
    forgotForm.classList.remove('visible');
  }
  authError.textContent = '';
}

tabLogin.addEventListener('click', () => switchTab(false));
tabSignup.addEventListener('click', () => switchTab(true));

async function api(path, options = {}) {
  const session = loadSession();
  const headers = {
    'Content-Type': 'application/json'
  };
  if (session && session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const res = await fetch(API_BASE + path, {
    headers,
    ...options
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  if (!identifier || !password) {
    authError.textContent = 'Please enter email or username and password.';
    return;
  }
  try {
    const user = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    });
    saveSession(user);
    currentUser = user;
    initLoggedIn(user);
  } catch (err) {
    authError.textContent = err.message || 'Failed to log in.';
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const username = document.getElementById('signup-username').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  if (!username || !email || !password) {
    authError.textContent = 'Please fill in all fields.';
    return;
  }
  try {
    const user = await api('/api/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    saveSession(user);
    currentUser = user;
    initLoggedIn(user);
  } catch (err) {
    authError.textContent = err.message || 'Failed to sign up.';
  }
});

forgotPasswordLink.addEventListener('click', () => {
  loginForm.classList.remove('visible');
  signupForm.classList.remove('visible');
  forgotForm.classList.add('visible');
  authError.textContent = '';
});

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  forgotHint.textContent = 'We’ll email you a link if an account exists.';
  const email = forgotEmailInput.value.trim();
  if (!email) {
    authError.textContent = 'Please enter your email.';
    return;
  }
  try {
    await api('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    forgotHint.textContent = 'If an account exists, we sent a reset link.';
  } catch (err) {
    authError.textContent = err.message || 'Failed to send reset email.';
  }
});

logoutBtn.addEventListener('click', () => {
  clearSession();
  showAuth();
});

logForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  logError.textContent = '';
  logSuccess.textContent = '';
  const user = loadSession();
  if (!user) {
    logError.textContent = 'You are not logged in.';
    return;
  }

  const arrival = logArrival.value;
  const departure = logDeparture.value;
  const productivity = logProductivity.value;

  if (!arrival || !departure || !productivity) {
    logError.textContent = 'Please fill in arrival, departure, and productivity.';
    return;
  }

  const [ah, am] = arrival.split(':').map(Number);
  const [dh, dm] = departure.split(':').map(Number);
  if (
    Number.isNaN(ah) ||
    Number.isNaN(am) ||
    Number.isNaN(dh) ||
    Number.isNaN(dm)
  ) {
    logError.textContent = 'Times must be in HH:MM format.';
    return;
  }

  const startMin = ah * 60 + am;
  const endMin = dh * 60 + dm;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (endMin > nowMinutes || startMin > nowMinutes) {
    logError.textContent = 'You cannot log time in the future.';
    return;
  }

  try {
    await api('/api/logs', {
      method: 'POST',
      body: JSON.stringify({
        arrival,
        departure,
        productivity
      })
    });
    logSuccess.textContent = 'Saved!';
    logArrival.value = '';
    logDeparture.value = '';
    logProductivity.value = 'Super locked';
    await refreshSummaryAndLeaderboard();
  } catch (err) {
    logError.textContent = err.message || 'Failed to save log.';
  }
});

async function loadSummary(userId) {
  const params = new URLSearchParams({
    userId: String(userId)
  });
  if (selectedMonth) {
    params.set('month', selectedMonth);
  }
  return api(`/api/summary?${params.toString()}`);
}

async function loadLeaderboard() {
  const params = new URLSearchParams();
  if (selectedMonth) {
    params.set('month', selectedMonth);
  }
  const query = params.toString();
  return api(`/api/leaderboard${query ? `?${query}` : ''}`);
}

function renderSummary(summary) {
  const total = summary.totalHours || 0;
  yourTotal.textContent = `Total this month: ${total.toFixed(2)} hours`;

  logsTableBody.innerHTML = '';
  summary.logs.forEach((log) => {
    const tr = document.createElement('tr');
    const dateTd = document.createElement('td');
    const arrTd = document.createElement('td');
    const depTd = document.createElement('td');
    const hoursTd = document.createElement('td');
    const prodTd = document.createElement('td');
    const actionsTd = document.createElement('td');

    dateTd.textContent = log.date;
    arrTd.textContent = log.arrival;
    depTd.textContent = log.departure;
    hoursTd.textContent = log.hours.toFixed(2);
    prodTd.textContent = log.productivity || '';

    const isToday = log.date === getCurrentDateISO();
    const isOwnLog = currentUser && viewedUserId === currentUser.userId;
    if (isToday && isOwnLog) {
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.className = 'btn subtle btn-small';
      delBtn.type = 'button';
      delBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        try {
          await api(`/api/logs/${encodeURIComponent(log.id)}`, {
            method: 'DELETE'
          });
          await refreshSummaryAndLeaderboard();
        } catch (err) {
          console.error(err);
          alert(err.message || 'Failed to delete log.');
        }
      });
      actionsTd.appendChild(delBtn);
    }

    tr.appendChild(dateTd);
    tr.appendChild(arrTd);
    tr.appendChild(depTd);
    tr.appendChild(hoursTd);
    tr.appendChild(prodTd);
    tr.appendChild(actionsTd);
    logsTableBody.appendChild(tr);
  });
}

function renderLeaderboard(data, currentUserId) {
  leaderboardBody.innerHTML = '';
  data.leaderboard.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (row.userId === currentUserId) {
      tr.style.fontWeight = '600';
    }

    const rankTd = document.createElement('td');
    const nameTd = document.createElement('td');
    const hoursTd = document.createElement('td');
    const avgProdTd = document.createElement('td');

    rankTd.textContent = index + 1;
    nameTd.textContent = row.name;
    hoursTd.textContent = (row.totalHours || 0).toFixed(2);
    if (row.avgProductivity == null) {
      avgProdTd.textContent = '–';
    } else {
      avgProdTd.textContent = Number(row.avgProductivity).toFixed(2);
    }

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(hoursTd);
    tr.appendChild(avgProdTd);

    tr.classList.add('clickable-row');
    tr.addEventListener('click', () => {
      if (!currentUser) return;
      viewedUserId = row.userId;
      viewedUserName = row.name;
      updateLogsHeader();
      (async () => {
        try {
          const summary = await loadSummary(viewedUserId);
          renderSummary(summary);
        } catch (err) {
          console.error(err);
        }
      })();
    });

    leaderboardBody.appendChild(tr);
  });
}

async function refreshSummaryAndLeaderboard() {
  if (!currentUser) {
    const u = loadSession();
    if (!u || !u.userId) return;
    currentUser = u;
  }
  try {
    const [summary, leaderboard] = await Promise.all([
      loadSummary(viewedUserId || currentUser.userId),
      loadLeaderboard()
    ]);
    renderSummary(summary);
    renderLeaderboard(leaderboard, currentUser.userId);
  } catch (err) {
    console.error(err);
  }
}

function initLoggedIn(user) {
  const displayName = user.username || user.name || 'Friend';
  welcomeText.textContent = `Hi, ${displayName}`;
  selectedMonth = getCurrentMonthISO();
  currentMonthLabel.textContent = formatMonthLabel(selectedMonth);
  currentUser = user;
  viewedUserId = user.userId;
  viewedUserName = user.name;
  updateLogFormState();
  updateLogsHeader();
  showApp();
  refreshSummaryAndLeaderboard();
}

window.addEventListener('DOMContentLoaded', () => {
  selectedMonth = getCurrentMonthISO();
  currentMonthLabel.textContent = formatMonthLabel(selectedMonth);
  updateLogFormState();

  const user = loadSession();
  if (user && user.userId) {
    currentUser = user;
    viewedUserId = user.userId;
    viewedUserName = user.name;
    initLoggedIn(user);
  } else {
    showAuth();
  }
});

monthPrevBtn.addEventListener('click', () => {
  if (!selectedMonth) {
    selectedMonth = getCurrentMonthISO();
  }
  const [yearStr, monthStr] = selectedMonth.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr);
  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  selectedMonth = `${year}-${String(month).padStart(2, '0')}`;
  currentMonthLabel.textContent = formatMonthLabel(selectedMonth);
  updateLogFormState();
  refreshSummaryAndLeaderboard();
});

monthNextBtn.addEventListener('click', () => {
  if (!selectedMonth) {
    selectedMonth = getCurrentMonthISO();
  }
  const [yearStr, monthStr] = selectedMonth.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr);
  month += 1;
  if (month === 13) {
    month = 1;
    year += 1;
  }
  selectedMonth = `${year}-${String(month).padStart(2, '0')}`;
  currentMonthLabel.textContent = formatMonthLabel(selectedMonth);
  updateLogFormState();
  refreshSummaryAndLeaderboard();
});

