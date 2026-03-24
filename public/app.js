const API_BASE = '';

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authError = document.getElementById('auth-error');
// Forgot password UI removed

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
const achievementsTitle = document.getElementById('achievements-title');
const achievementsCurrent = document.getElementById('achievements-current');
const achievementsPast = document.getElementById('achievements-past');
const presenceToggleBtn = document.getElementById('presence-toggle-btn');
const presenceStatus = document.getElementById('presence-status');
const presenceList = document.getElementById('presence-list');
const openAchievementsBtn = document.getElementById('open-achievements-btn');
const achievementsExplorerSection = document.getElementById('achievements-explorer-section');
const achievementsExplorerGrid = document.getElementById('achievements-explorer-grid');

let selectedMonth = null; // in "YYYY-MM" format
let currentUser = null;
let viewedUserId = null;
let viewedUserName = '';
let presenceState = { isCheckedIn: false, users: [] };
let latestRenderedSummary = null;

const ACHIEVEMENT_DEFS = [
  { key: 'welcome_to_thode', tier: 'D', icon: '🟤', title: 'Welcome to Thode', subtitle: 'Unlock a 3-day streak' },
  { key: 'getting_comfortable', tier: 'D', icon: '🟤', title: 'Getting Comfortable', subtitle: 'Spend 3 hours at Thode in one day' },
  { key: 'warm_up_session', tier: 'D', icon: '🟤', title: 'Warm-Up Session', subtitle: 'Productivity level 3+ for 4 hours' },
  { key: 'in_the_zone', tier: 'C', icon: '⚪', title: 'In the Zone', subtitle: 'Reach a 5-day streak' },
  { key: 'half_day_warrior', tier: 'C', icon: '⚪', title: 'Half-Day Warrior', subtitle: 'Spend 5 hours at Thode in one day' },
  { key: 'academic_night_owl', tier: 'C', icon: '⚪', title: 'Academic Night Owl', subtitle: 'Stay at Thode past 11 PM' },
  { key: 'steady_grind', tier: 'C', icon: '⚪', title: 'Steady Grind', subtitle: 'Locked or better for 3+ hours' },
  { key: 'weekly_regular', tier: 'B', icon: '🔵', title: 'Weekly Regular', subtitle: 'Reach a 7-day streak' },
  { key: 'committed', tier: 'B', icon: '🔵', title: 'Committed', subtitle: 'Spend 7 hours at Thode in one day' },
  { key: 'weekend_scholar', tier: 'B', icon: '🔵', title: 'Weekend Scholar', subtitle: 'Study 4+ hours on a weekend day' },
  { key: 'almost_full_time_thoder', tier: 'A', icon: '🟣', title: 'Almost a Full-Time Thoder', subtitle: 'Spend 30 hours at Thode in one week' },
  { key: 'now_you_have_to_ace_it', tier: 'A', icon: '🟣', title: 'Now You Have to Ace It', subtitle: 'Spend 12 hours at Thode in one day' },
  { key: 'full_time_thoder', tier: 'S', icon: '🏅', title: 'Full-Time Thoder', subtitle: 'Spend 40 hours at Thode in one week' },
  { key: 'night_shift', tier: 'S', icon: '🌙', title: 'The Night Shift', subtitle: 'Stay at Thode past 2:00 AM' },
  { key: 'employee_of_the_month', tier: 'SS', icon: '🔥', title: 'Thode Employee of the Month', subtitle: '44+ hours in a week' },
  { key: 'villain_origin_story', tier: 'SS', icon: '😈', title: 'Villain Origin Story', subtitle: 'Be at Thode between 3-5 AM' },
  { key: 'go_home_please', tier: 'SSS', icon: '🚨', title: 'Go Home. Please.', subtitle: '18-day streak' },
  { key: 'academic_victim', tier: 'SSS', icon: '🚨', title: 'Academic Victim', subtitle: '24 hours straight at Thode' }
];

const TIERS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

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

function getYesterdayDateISO() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
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
    achievementsTitle.textContent = 'Achievements this month';
  } else {
    logsTitle.textContent = 'Logs at Thode';
    logsSubtitle.textContent = `Showing logs for ${viewedUserName}`;
    achievementsTitle.textContent = `Achievements this month (${viewedUserName})`;
  }
}

function updateLogFormState() {
  const today = getCurrentDateISO();
  const yesterday = getYesterdayDateISO();
  const currentMonth = getCurrentMonthISO();
  const yesterdayMonth = yesterday.slice(0, 7);
  const isAllowedMonth = selectedMonth === currentMonth || selectedMonth === yesterdayMonth;

  const allowedDates = [yesterday, today].filter((date) => date.slice(0, 7) === selectedMonth);
  const disabled = !isAllowedMonth || allowedDates.length === 0;

  if (disabled) {
    logDate.value = today;
    logDate.min = today;
    logDate.max = today;
  } else {
    const currentValue = logDate.value;
    logDate.min = allowedDates[0];
    logDate.max = allowedDates[allowedDates.length - 1];
    logDate.value = allowedDates.includes(currentValue)
      ? currentValue
      : allowedDates[allowedDates.length - 1];
  }

  [logDate, logArrival, logDeparture, logProductivity].forEach((input) => {
    input.disabled = disabled;
  });
  logSubmitBtn.disabled = disabled;

  if (disabled) {
    logLockMessage.textContent = 'You can only add hours for today or yesterday.';
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
  } else {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.add('visible');
    signupForm.classList.remove('visible');
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

// Forgot password UI removed

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

  const selectedDate = logDate.value;
  const today = getCurrentDateISO();

  // Only enforce "future time" rule when logging for today.
  if (selectedDate === today) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (endMin > nowMinutes || startMin > nowMinutes) {
      logError.textContent = 'You cannot log time in the future.';
      return;
    }
  }

  try {
    const result = await api('/api/logs', {
      method: 'POST',
      body: JSON.stringify({
        date: logDate.value,
        arrival,
        departure,
        productivity
      })
    });
    logSuccess.textContent = 'Saved!';
    logArrival.value = '';
    logDeparture.value = '';
    logProductivity.value = 'Super locked';
    const unlocked = result.newAchievements || [];
    if (unlocked.length > 0) {
      const details = unlocked.map((a) => `Tier ${a.tier} achievement: ${a.title}`).join('\n');
      alert(`Congratulations! You've unlocked a new achievement.\n${details}`);
    }
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
  latestRenderedSummary = summary;
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

  achievementsCurrent.innerHTML = '';
  const current = summary.achievementsCurrentMonth || [];
  if (current.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No achievements yet this month.';
    achievementsCurrent.appendChild(li);
  } else {
    current.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = `Tier ${a.tier}: ${a.title}`;
      achievementsCurrent.appendChild(li);
    });
  }

  achievementsPast.innerHTML = '';
  const past = summary.pastAchievements || [];
  if (past.length === 0) {
    achievementsPast.textContent = 'No past achievements yet.';
  } else {
    past.forEach((group) => {
      const box = document.createElement('div');
      box.className = 'achievements-month';

      const month = document.createElement('div');
      month.className = 'achievements-month-title';
      month.textContent = group.month;
      box.appendChild(month);

      const ul = document.createElement('ul');
      ul.className = 'achievements-list';
      (group.achievements || []).forEach((a) => {
        const li = document.createElement('li');
        li.textContent = `Tier ${a.tier}: ${a.title}`;
        ul.appendChild(li);
      });
      box.appendChild(ul);
      achievementsPast.appendChild(box);
    });
  }
}

function isUnlocked(def, summary) {
  const current = summary.achievementsCurrentMonth || [];
  const past = summary.pastAchievements || [];
  if (current.some((a) => a.key === def.key)) return true;
  return past.some((group) => (group.achievements || []).some((a) => a.key === def.key));
}

function renderAchievementsModal() {
  if (!latestRenderedSummary) return;
  achievementsExplorerGrid.innerHTML = '';

  TIERS.forEach((tier) => {
    const defs = ACHIEVEMENT_DEFS.filter((a) => a.tier === tier);
    if (defs.length === 0) return;

    const section = document.createElement('section');
    section.className = 'ach-tier-section';

    const title = document.createElement('h4');
    title.className = 'ach-tier-title';
    title.textContent = `Tier ${tier}`;
    section.appendChild(title);

    const ul = document.createElement('ul');
    ul.className = 'ach-tier-list';

    defs.forEach((def) => {
      const li = document.createElement('li');
      const unlocked = isUnlocked(def, latestRenderedSummary);
      if (!unlocked) li.classList.add('ach-locked');
      li.textContent = `${def.icon} ${def.title} - ${def.subtitle}${unlocked ? ' (Unlocked)' : ''}`;
      ul.appendChild(li);
    });

    section.appendChild(ul);
    achievementsExplorerGrid.appendChild(section);
  });
}

function renderPresence() {
  presenceToggleBtn.textContent = presenceState.isCheckedIn ? 'Check out' : 'Check in';
  presenceStatus.textContent = presenceState.isCheckedIn
    ? 'You are currently checked in.'
    : 'Not checked in right now.';

  presenceList.innerHTML = '';
  if (!presenceState.users || presenceState.users.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No one is at Thode right now.';
    presenceList.appendChild(li);
    return;
  }

  presenceState.users.forEach((u) => {
    const li = document.createElement('li');
    li.textContent = u.name;
    presenceList.appendChild(li);
  });
}

async function loadPresence() {
  const data = await api('/api/presence');
  presenceState = {
    isCheckedIn: !!data.isCheckedIn,
    users: data.users || []
  };
  renderPresence();
}

function renderLeaderboard(data, currentUserId) {
  leaderboardBody.innerHTML = '';
  data.leaderboard.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (index === 0) {
      tr.classList.add('leader-top');
    }
    if (row.userId === currentUserId) {
      tr.style.fontWeight = '600';
    }

    const rankTd = document.createElement('td');
    const nameTd = document.createElement('td');
    const hoursTd = document.createElement('td');
    const avgProdTd = document.createElement('td');
    const streakTd = document.createElement('td');

    rankTd.textContent = index + 1;
    if (index === 0) {
      const crown = document.createElement('span');
      crown.className = 'rank-crown';
      crown.textContent = '👑';
      crown.setAttribute('aria-label', 'Top rank');
      crown.title = 'Top rank';
      rankTd.appendChild(document.createTextNode(' '));
      rankTd.appendChild(crown);
    }
    nameTd.textContent = row.name;
    hoursTd.textContent = (row.totalHours || 0).toFixed(2);
    if (row.avgProductivity == null) {
      avgProdTd.textContent = '–';
    } else {
      avgProdTd.textContent = Number(row.avgProductivity).toFixed(2);
    }

    streakTd.textContent = row.streak != null ? row.streak : 0;

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(hoursTd);
    tr.appendChild(avgProdTd);
    tr.appendChild(streakTd);

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
    renderAchievementsModal();
    renderLeaderboard(leaderboard, currentUser.userId);
    await loadPresence();
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

openAchievementsBtn.addEventListener('click', () => {
  if (!currentUser || !achievementsExplorerSection) return;
  achievementsExplorerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

presenceToggleBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  try {
    if (presenceState.isCheckedIn) {
      await api('/api/presence/check-out', { method: 'DELETE' });
    } else {
      await api('/api/presence/check-in', { method: 'POST' });
    }
    await loadPresence();
  } catch (err) {
    alert(err.message || 'Failed to update presence.');
  }
});

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

