const API_BASE = '';

const THEME_STORAGE_KEY = 'thodeTheme';

function getStoredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.textContent = dark ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-pressed', String(dark));
  });
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
}

applyTheme(getStoredTheme());

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
const changePasswordForm = document.getElementById('change-password-form');
const changePasswordCurrent = document.getElementById('change-password-current');
const changePasswordNew = document.getElementById('change-password-new');
const changePasswordConfirm = document.getElementById('change-password-confirm');
const changePasswordError = document.getElementById('change-password-error');
const changePasswordSuccess = document.getElementById('change-password-success');

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
const headerMonthHours = document.getElementById('header-month-hours');
const logsTableBody = document.getElementById('logs-table-body');
const leaderboardBody = document.getElementById('leaderboard-body');
const leaderboardAllTimeBody = document.getElementById('leaderboard-alltime-body');
const achievementsTitle = document.getElementById('achievements-title');
const achievementsCurrent = document.getElementById('achievements-current');
const achievementsPast = document.getElementById('achievements-past');
const openPastAchievementsBtn = document.getElementById('open-past-achievements-btn');
const pastAchievementsModal = document.getElementById('past-achievements-modal');
const closePastAchievementsBtn = document.getElementById('close-past-achievements-btn');
const presenceToggleBtn = document.getElementById('presence-toggle-btn');
const presenceStatus = document.getElementById('presence-status');
const presenceList = document.getElementById('presence-list');
const recentActivityScroll = document.getElementById('recent-activity-scroll');
const recentActivityList = document.getElementById('recent-activity-list');
const dailyHighlightsList = document.getElementById('daily-highlights-list');
const checkOutModal = document.getElementById('check-out-modal');
const checkOutModalSubtitle = document.getElementById('check-out-modal-subtitle');
const checkOutLogDate = document.getElementById('check-out-log-date');
const checkOutArrival = document.getElementById('check-out-arrival');
const checkOutDeparture = document.getElementById('check-out-departure');
const checkOutProductivity = document.getElementById('check-out-productivity');
const checkOutPreview = document.getElementById('check-out-preview');
const checkOutCancelBtn = document.getElementById('check-out-cancel-btn');
const checkOutConfirmBtn = document.getElementById('check-out-confirm-btn');
const openAchievementsBtn = document.getElementById('open-achievements-btn');
const achievementsExplorerSection = document.getElementById('achievements-explorer-section');
const achievementsExplorerGrid = document.getElementById('achievements-explorer-grid');
const feedbackForm = document.getElementById('feedback-form');
const feedbackInput = document.getElementById('feedback-input');
const feedbackSuccess = document.getElementById('feedback-success');
const feedbackError = document.getElementById('feedback-error');

let selectedMonth = null; // in "YYYY-MM" format
let currentUser = null;
let viewedUserId = null;
let viewedUserName = '';
let presenceState = { isCheckedIn: false, users: [] };
let presencePollIntervalId = null;
let recentActivityPollIntervalId = null;
let recentActivityRotateIntervalId = null;

const RECENT_ACTIVITY_LIMIT = 20;
const CHECK_IN_REMINDER_THRESHOLD_MINUTES = 240; // 4 hours
const CHECK_IN_REMINDER_REPEAT_MINUTES = 120; // remind at most once every 2 hours
const NOTIFICATION_PREF_KEY = 'thodeCheckinNotificationsEnabled';
let checkInReminderSessionAt = null;
let checkInReminderLastPromptMs = 0;
let checkOutContext = {
  startDt: null,
  endDt: null,
  startDateISO: null,
  endDateISO: null,
  isOvernightSplit: false
};
let latestRenderedSummary = null;

const ACHIEVEMENT_DEFS = [
  { key: 'welcome_to_thode', tier: 'D', icon: '🟤', title: 'Welcome to Thode', subtitle: 'Unlock a 3-day streak' },
  { key: 'getting_comfortable', tier: 'D', icon: '🟤', title: 'Getting Comfortable', subtitle: 'Spend 3 hours at Thode in one day' },
  { key: 'warm_up_session', tier: 'D', icon: '🟤', title: 'Warm-Up Session', subtitle: 'Productivity level 3 for 4+ hours in one day' },
  { key: 'in_the_zone', tier: 'C', icon: '⚪', title: 'In the Zone', subtitle: 'Reach a 5-day streak' },
  { key: 'half_day_warrior', tier: 'C', icon: '⚪', title: 'Half-Day Warrior', subtitle: 'Spend 5 hours at Thode in one day' },
  { key: 'academic_night_owl', tier: 'C', icon: '⚪', title: 'Academic Night Owl', subtitle: 'Stay at Thode past 11 PM' },
  { key: 'steady_grind', tier: 'C', icon: '⚪', title: 'Steady Grind', subtitle: 'Locked (level 4) for 5+ hours in one day' },
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

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getNotificationsEnabled() {
  return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
}

function setNotificationsEnabled(enabled) {
  localStorage.setItem(NOTIFICATION_PREF_KEY, enabled ? 'true' : 'false');
}

async function ensureReminderNotificationPermission() {
  if (!notificationsSupported()) return false;

  if (Notification.permission === 'granted') {
    setNotificationsEnabled(true);
    return true;
  }
  if (Notification.permission === 'denied') {
    setNotificationsEnabled(false);
    return false;
  }

  // Only ask after user explicitly opted in.
  if (!getNotificationsEnabled()) return false;

  try {
    const result = await Notification.requestPermission();
    const granted = result === 'granted';
    setNotificationsEnabled(granted);
    return granted;
  } catch {
    setNotificationsEnabled(false);
    return false;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalISODateFromDate(d) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function toLocalTimeHHMMFromDate(d) {
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${hh}:${mm}`;
}

function formatLocalTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function parseHHMMToMinutes(timeStr) {
  const [h, m] = String(timeStr || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function computeHoursHHMM(arrival, departure) {
  const startMin = parseHHMMToMinutes(arrival);
  const endMin = parseHHMMToMinutes(departure);
  if (startMin === null || endMin === null) return null;
  if (endMin <= startMin) return null;
  return (endMin - startMin) / 60;
}

function setCheckOutModalVisible(visible) {
  if (!checkOutModal) return;
  checkOutModal.classList.toggle('hidden', !visible);
  checkOutModal.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function setPastAchievementsModalVisible(visible) {
  if (!pastAchievementsModal) return;
  pastAchievementsModal.classList.toggle('hidden', !visible);
  pastAchievementsModal.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateCheckOutPreview() {
  if (!checkOutPreview || !checkOutConfirmBtn) return;
  const arrival = checkOutArrival && checkOutArrival.value;
  const departure = checkOutDeparture && checkOutDeparture.value;
  if (!arrival || !departure) {
    checkOutPreview.textContent = '';
    checkOutConfirmBtn.disabled = true;
    return;
  }

  if (checkOutContext.isOvernightSplit) {
    // Split into two logs:
    // - start day: arrival -> 24:00
    // - next day: 00:00 -> departure
    const hours1 = computeHoursHHMM(arrival, '24:00');
    const hours2Raw = computeHoursHHMM('00:00', departure);
    const hours2 = hours2Raw == null ? 0 : hours2Raw;

    if (hours1 == null) {
      checkOutPreview.textContent = 'Start time must be before midnight.';
      checkOutConfirmBtn.disabled = true;
      return;
    }

    const total = hours1 + hours2;
    if (total <= 0) {
      checkOutPreview.textContent = 'No time to log.';
      checkOutConfirmBtn.disabled = true;
      return;
    }

    const startDay = checkOutContext.startDateISO;
    const endDay = checkOutContext.endDateISO;
    checkOutPreview.textContent =
      `This will split into 2 logs:\n` +
      `${startDay}: ${arrival} -> 24:00 (${hours1.toFixed(2)}h)\n` +
      `${endDay}: 00:00 -> ${departure} (${hours2.toFixed(2)}h)\n` +
      `Total: ${total.toFixed(2)} hours.`;
    checkOutConfirmBtn.disabled = false;
    return;
  }

  const hours = computeHoursHHMM(arrival, departure);
  if (hours == null) {
    checkOutPreview.textContent = 'Departure must be after start time.';
    checkOutConfirmBtn.disabled = true;
    return;
  }

  checkOutPreview.textContent = `This will log ${hours.toFixed(2)} hours.`;
  checkOutConfirmBtn.disabled = false;
}

function openCheckOutModal({ startDt, endDt }) {
  if (!checkOutModal) return;

  const startDateISO = toLocalISODateFromDate(startDt);
  const endDateISO = toLocalISODateFromDate(endDt);
  checkOutContext = {
    startDt,
    endDt,
    startDateISO,
    endDateISO,
    isOvernightSplit: startDateISO !== endDateISO
  };

  checkOutModalSubtitle.textContent =
    `Checked in at ${formatLocalTime(startDt.toISOString())} and checking out at ${formatLocalTime(endDt.toISOString())}.`;
  if (checkOutLogDate) {
    // Constrain the date picker to only yesterday/today.
    const todayISO = getCurrentDateISO();
    const yesterdayISO = getYesterdayDateISO();
    checkOutLogDate.min = yesterdayISO;
    checkOutLogDate.max = todayISO;
    checkOutLogDate.value = startDateISO;
    // Prevent confusion: when splitting, the app will always log as "yesterday + today".
    checkOutLogDate.disabled = checkOutContext.isOvernightSplit;
  }

  if (checkOutArrival) checkOutArrival.value = toLocalTimeHHMMFromDate(startDt);
  if (checkOutDeparture) checkOutDeparture.value = toLocalTimeHHMMFromDate(endDt);
  if (checkOutProductivity && logProductivity) {
    checkOutProductivity.value = logProductivity.value;
  }

  updateCheckOutPreview();
  setCheckOutModalVisible(true);
}

function closeCheckOutModal() {
  setCheckOutModalVisible(false);
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
  checkInReminderSessionAt = null;
  checkInReminderLastPromptMs = 0;
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
  if (res.status === 401) {
    // Expired/invalid token: force re-auth so users don't see blank app sections.
    clearSession();
    currentUser = null;
    showAuth();
    authError.textContent = 'Session expired. Please log in again.';
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

if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (changePasswordError) changePasswordError.textContent = '';
    if (changePasswordSuccess) changePasswordSuccess.textContent = '';
    const currentPassword = changePasswordCurrent && changePasswordCurrent.value;
    const newPassword = changePasswordNew && changePasswordNew.value;
    const confirm = changePasswordConfirm && changePasswordConfirm.value;
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirm) {
      if (changePasswordError) changePasswordError.textContent = 'New passwords do not match.';
      return;
    }
    try {
      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (changePasswordSuccess) {
        changePasswordSuccess.textContent = 'Password updated.';
      }
      changePasswordForm.reset();
    } catch (err) {
      if (changePasswordError) changePasswordError.textContent = err.message || 'Failed to change password.';
    }
  });
}

logoutBtn.addEventListener('click', () => {
  clearSession();
  showAuth();
  currentUser = null;
  if (presencePollIntervalId) {
    clearInterval(presencePollIntervalId);
    presencePollIntervalId = null;
  }
  if (recentActivityPollIntervalId) {
    clearInterval(recentActivityPollIntervalId);
    recentActivityPollIntervalId = null;
  }
  stopRecentActivityRotation();
  checkInReminderSessionAt = null;
  checkInReminderLastPromptMs = 0;
});

if (feedbackForm) {
  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (feedbackError) feedbackError.textContent = '';
    if (feedbackSuccess) feedbackSuccess.textContent = '';

    const message = (feedbackInput && feedbackInput.value ? feedbackInput.value : '').trim();
    if (!message) {
      if (feedbackError) feedbackError.textContent = 'Please enter feedback before sending.';
      return;
    }

    try {
      await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ message })
      });
      if (feedbackInput) feedbackInput.value = '';
      if (feedbackSuccess) feedbackSuccess.textContent = 'Thanks! Your feedback was sent.';
    } catch (err) {
      if (feedbackError) feedbackError.textContent = err.message || 'Failed to send feedback.';
    }
  });
}

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

async function loadAllTimeLeaderboard() {
  return api('/api/leaderboard/all-time');
}

function renderSummary(summary) {
  latestRenderedSummary = summary;
  const total = summary.totalHours || 0;
  yourTotal.textContent = `Total this month: ${total.toFixed(2)} hours`;
  if (headerMonthHours) {
    headerMonthHours.textContent = `${total.toFixed(2)} h`;
  }

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
    const isYesterday = log.date === getYesterdayDateISO();
    const isOwnLog = currentUser && viewedUserId === currentUser.userId;
    if ((isToday || isYesterday) && isOwnLog) {
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
  if (!latestRenderedSummary || !achievementsExplorerGrid) return;
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

    const unlockedDefs = defs.filter((def) => isUnlocked(def, latestRenderedSummary));
    const lockedCount = defs.length - unlockedDefs.length;

    unlockedDefs.forEach((def) => {
      const li = document.createElement('li');
      li.textContent = `${def.icon} ${def.title} - ${def.subtitle}`;
      ul.appendChild(li);
    });

    for (let i = 0; i < lockedCount; i += 1) {
      const li = document.createElement('li');
      li.className = 'ach-redacted';
      li.textContent = '🔒 Locked achievement';
      ul.appendChild(li);
    }

    section.appendChild(ul);
    achievementsExplorerGrid.appendChild(section);
  });
}

function renderPresence() {
  if (!presenceToggleBtn || !presenceStatus || !presenceList) return;
  presenceToggleBtn.textContent = presenceState.isCheckedIn ? 'Check out' : 'Check in';
  const myEntry = currentUser
    ? (presenceState.users || []).find((u) => Number(u.userId) === Number(currentUser.userId))
    : null;

  presenceStatus.textContent = presenceState.isCheckedIn
    ? (myEntry && myEntry.checkedInAt
        ? `You checked in at ${formatLocalTime(myEntry.checkedInAt)}.`
        : 'You are currently checked in.')
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
    li.textContent = u.checkedInAt ? `${u.name} (${formatLocalTime(u.checkedInAt)})` : u.name;
    presenceList.appendChild(li);
  });
}

function maybePromptLongCheckIn(myEntry) {
  if (!currentUser || !presenceState.isCheckedIn || !myEntry || !myEntry.checkedInAt) {
    checkInReminderSessionAt = null;
    checkInReminderLastPromptMs = 0;
    return;
  }

  const checkedInMs = new Date(myEntry.checkedInAt).getTime();
  if (Number.isNaN(checkedInMs)) return;

  if (checkInReminderSessionAt !== myEntry.checkedInAt) {
    checkInReminderSessionAt = myEntry.checkedInAt;
    checkInReminderLastPromptMs = 0;
  }

  const nowMs = Date.now();
  const elapsedMinutes = (nowMs - checkedInMs) / (1000 * 60);
  if (elapsedMinutes < CHECK_IN_REMINDER_THRESHOLD_MINUTES) return;

  if (
    checkInReminderLastPromptMs > 0 &&
    (nowMs - checkInReminderLastPromptMs) / (1000 * 60) < CHECK_IN_REMINDER_REPEAT_MINUTES
  ) {
    return;
  }

  if (checkOutModal && !checkOutModal.classList.contains('hidden')) return;

  checkInReminderLastPromptMs = nowMs;
  const elapsedHours = (elapsedMinutes / 60).toFixed(1);

  const canNotify =
    notificationsSupported() &&
    Notification.permission === 'granted' &&
    getNotificationsEnabled();

  if (canNotify) {
    try {
      const n = new Notification('Still at Thode?', {
        body: `You've been checked in for ${elapsedHours} hours. Open Thode Hours to confirm or check out.`,
        tag: 'thode-long-checkin-reminder',
        renotify: true
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return;
    } catch {
      // Fall through to in-app prompt if Notification fails.
    }
  }

  const stillHere = window.confirm(
    `You've been checked in for ${elapsedHours} hours.\n\n` +
      "Press OK to confirm you're still at Thode.\n" +
      'Press Cancel to check out now.'
  );

  if (!stillHere && presenceToggleBtn) {
    presenceToggleBtn.click();
  }
}

async function loadPresence() {
  if (!presenceToggleBtn || !presenceStatus || !presenceList) return;
  const data = await api('/api/presence');
  presenceState = {
    isCheckedIn: !!data.isCheckedIn,
    users: data.users || []
  };
  renderPresence();
  const myEntry = currentUser
    ? (presenceState.users || []).find((u) => Number(u.userId) === Number(currentUser.userId))
    : null;
  maybePromptLongCheckIn(myEntry);
}

function stopRecentActivityRotation() {
  if (recentActivityRotateIntervalId) {
    clearInterval(recentActivityRotateIntervalId);
    recentActivityRotateIntervalId = null;
  }
}

function startRecentActivityRotation() {
  stopRecentActivityRotation();
  const el = recentActivityScroll;
  if (!el) return;
  el.scrollTop = 0;
  recentActivityRotateIntervalId = setInterval(() => {
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 4) return;
    const step = 44;
    if (el.scrollTop >= maxScroll - step) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      el.scrollBy({ top: step, behavior: 'smooth' });
    }
  }, 4500);
}

function renderRecentActivity(items) {
  if (!recentActivityList) return;
  recentActivityList.innerHTML = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'recent-activity-empty';
    li.textContent = 'No recent achievements yet.';
    recentActivityList.appendChild(li);
    stopRecentActivityRotation();
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'recent-activity-item';
    const name = item.userName != null ? String(item.userName) : 'Someone';
    const tier = item.tier != null ? String(item.tier) : '?';
    const title = item.title != null ? String(item.title) : 'Achievement';
    li.textContent = `${name} unlocked a Tier ${tier} achievement; ${title}`;
    recentActivityList.appendChild(li);
  });
  startRecentActivityRotation();
}

function winnerNamesLine(winners) {
  if (!Array.isArray(winners) || winners.length === 0) return 'No one';
  return winners.join(', ');
}

function renderDailyHighlights(highlights) {
  if (!dailyHighlightsList) return;
  dailyHighlightsList.innerHTML = '';

  if (!highlights) {
    const li = document.createElement('li');
    li.textContent = 'No highlights for yesterday yet.';
    dailyHighlightsList.appendChild(li);
    return;
  }

  const lines = [];
  const longest = highlights.longestAtThode;
  if (longest && longest.hours > 0) {
    lines.push(
      `${winnerNamesLine(longest.winners)} spent the longest at Thode yesterday (${Number(longest.hours).toFixed(2)}h).`
    );
  } else {
    lines.push('No one logged hours yesterday.');
  }

  const productive = highlights.longestProductive;
  if (productive && productive.hours > 0) {
    lines.push(
      `${winnerNamesLine(productive.winners)} was productive for the longest yesterday (${Number(productive.hours).toFixed(2)}h).`
    );
  } else {
    lines.push('No productivity highlights from yesterday yet.');
  }

  const achievements = highlights.mostAchievements;
  if (achievements && achievements.count > 0) {
    lines.push(
      `${winnerNamesLine(achievements.winners)} unlocked the most achievements yesterday (${achievements.count}).`
    );
  } else {
    lines.push('No achievements were unlocked yesterday.');
  }

  const streak = highlights.highestStreak;
  if (streak && streak.streak > 0) {
    lines.push(
      `${winnerNamesLine(streak.winners)} achieved the highest streak at present of ${streak.streak}.`
    );
  } else {
    lines.push('No active streaks were present yesterday.');
  }

  lines.forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    dailyHighlightsList.appendChild(li);
  });
}

async function loadDailyHighlights() {
  if (!dailyHighlightsList || !currentUser) return;
  try {
    const data = await api('/api/activity/daily-highlights');
    renderDailyHighlights(data.highlights || null);
  } catch (err) {
    console.error(err);
  }
}

async function loadRecentActivity() {
  if (!recentActivityList || !currentUser) return;
  try {
    const data = await api(`/api/activity/recent-achievements?limit=${RECENT_ACTIVITY_LIMIT}`);
    renderRecentActivity(data.items || []);
    await loadDailyHighlights();
  } catch (err) {
    console.error(err);
  }
}

function renderLeaderboard(data, currentUserId, targetBody) {
  if (!targetBody) return;
  targetBody.innerHTML = '';
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

    targetBody.appendChild(tr);
  });
}

async function refreshSummaryAndLeaderboard() {
  if (!currentUser) {
    const u = loadSession();
    if (!u || !u.userId) return;
    currentUser = u;
  }
  try {
    const [summary, leaderboard, allTimeLeaderboard] = await Promise.all([
      loadSummary(viewedUserId || currentUser.userId),
      loadLeaderboard(),
      loadAllTimeLeaderboard()
    ]);
    renderSummary(summary);
    renderLeaderboard(leaderboard, currentUser.userId, leaderboardBody);
    renderLeaderboard(allTimeLeaderboard, currentUser.userId, leaderboardAllTimeBody);
    renderAchievementsModal();
    await loadPresence();
    await loadRecentActivity();
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
  if (feedbackSuccess) feedbackSuccess.textContent = '';
  if (feedbackError) feedbackError.textContent = '';

  // Keep presence accurate even if backend auto-checks users out.
  if (presencePollIntervalId) clearInterval(presencePollIntervalId);
  presencePollIntervalId = setInterval(() => {
    if (!currentUser) return;
    loadPresence().catch(() => {});
  }, 30000);

  if (recentActivityPollIntervalId) clearInterval(recentActivityPollIntervalId);
  recentActivityPollIntervalId = setInterval(() => {
    if (!currentUser) return;
    loadRecentActivity().catch(() => {});
  }, 30000);
}

if (openAchievementsBtn) {
  openAchievementsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentUser || !achievementsExplorerSection) return;
    achievementsExplorerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    achievementsExplorerSection.classList.remove('section-flash');
    // Restart animation if user clicks multiple times
    void achievementsExplorerSection.offsetWidth;
    achievementsExplorerSection.classList.add('section-flash');
  });
}

if (presenceToggleBtn) {
  presenceToggleBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    try {
      if (!presenceState.isCheckedIn) {
        const wantsNotifications = window.confirm(
          'Enable check-out reminders as browser notifications?'
        );
        setNotificationsEnabled(wantsNotifications);
        if (wantsNotifications) {
          await ensureReminderNotificationPermission();
        }
        await api('/api/presence/check-in', { method: 'POST' });
        await loadPresence();
        return;
      }

      // Check-out flow: prompt user to optionally log hours.
      const data = await api('/api/presence');
      const users = data.users || [];
      const myEntry = users.find((u) => Number(u.userId) === Number(currentUser.userId));

      if (!myEntry || !myEntry.checkedInAt) {
        const ok = window.confirm('No check-in time found. Check out anyway?');
        if (!ok) return;
        await api('/api/presence/check-out', { method: 'DELETE' });
        await loadPresence();
        return;
      }

      const startDt = new Date(myEntry.checkedInAt);
      const endDt = new Date();

      const startDateISO = toLocalISODateFromDate(startDt);
      const endDateISO = toLocalISODateFromDate(endDt);

      // This app stores logs as same-day intervals in a single row.
      // For overnight sessions, we split into two rows only for "yesterday + today".
      if (startDateISO !== endDateISO) {
        const todayISO = getCurrentDateISO();
        const yesterdayISO = getYesterdayDateISO();

        if (startDateISO !== yesterdayISO || endDateISO !== todayISO) {
          const ok = window.confirm(
            `Overnight logging is only supported for sessions that span yesterday -> today.\n` +
            `Your session is: ${startDateISO} -> ${endDateISO}.\n\n` +
            'Check out without logging, or log manually instead.'
          );
          if (!ok) return;
          await api('/api/presence/check-out', { method: 'DELETE' });
          await loadPresence();
          return;
        }
      }

      openCheckOutModal({ startDt, endDt });
    } catch (err) {
      alert(err.message || 'Failed to update presence.');
    }
  });
}

if (checkOutModal) {
  const overlay = checkOutModal.querySelector('[data-close-modal="true"]');
  async function cancelAndCheckOutWithoutLogging() {
    closeCheckOutModal();
    await api('/api/presence/check-out', { method: 'DELETE' });
    await loadPresence();
  }
  if (overlay) {
    overlay.addEventListener('click', cancelAndCheckOutWithoutLogging);
  }
  if (checkOutCancelBtn) {
    checkOutCancelBtn.addEventListener('click', cancelAndCheckOutWithoutLogging);
  }
  if (checkOutArrival) checkOutArrival.addEventListener('input', updateCheckOutPreview);
  if (checkOutDeparture) checkOutDeparture.addEventListener('input', updateCheckOutPreview);

  if (checkOutConfirmBtn) {
    checkOutConfirmBtn.addEventListener('click', async () => {
      if (!currentUser) return;
      const arrival = checkOutArrival && checkOutArrival.value;
      const departure = checkOutDeparture && checkOutDeparture.value;
      const productivity = checkOutProductivity && checkOutProductivity.value;

      if (!arrival || !departure || !productivity) return;

      try {
        const unlocked = [];

        async function postLog(date, arr, dep) {
          try {
            const result = await api('/api/logs', {
              method: 'POST',
              body: JSON.stringify({ date, arrival: arr, departure: dep, productivity })
            });
            if (result && result.newAchievements && result.newAchievements.length > 0) {
              unlocked.push(...result.newAchievements);
            }
          } catch (err) {
            const msg = String(err && err.message ? err.message : err);
            // If user already has that exact row, don't fail the whole check-out.
            if (msg.includes('already exists')) return;
            throw err;
          }
        }

        if (checkOutContext.isOvernightSplit) {
          const date1 = checkOutContext.startDateISO;
          const date2 = checkOutContext.endDateISO;

          // Segment 1: start day arrival -> 24:00
          const hours1 = computeHoursHHMM(arrival, '24:00');
          if (hours1 != null && hours1 > 0) {
            await postLog(date1, arrival, '24:00');
          }

          // Segment 2: 00:00 -> end day departure (skip if it's exactly 00:00 => 0 hours)
          let hours2 = computeHoursHHMM('00:00', departure);
          if (hours2 == null) hours2 = 0;
          if (hours2 > 0) {
            await postLog(date2, '00:00', departure);
          }
        } else {
          const date = checkOutLogDate && checkOutLogDate.value;
          const todayISO = getCurrentDateISO();
          const yesterdayISO = getYesterdayDateISO();
          if (date !== todayISO && date !== yesterdayISO) {
            alert('You can only log check-out hours for today or yesterday.');
            return;
          }
          await postLog(date, arrival, departure);
        }

        if (unlocked.length > 0) {
          const details = unlocked
            .map((a) => `Tier ${a.tier} achievement: ${a.title}`)
            .join('\n');
          alert(`Congratulations! You've unlocked a new achievement.\n${details}`);
        }

        await api('/api/presence/check-out', { method: 'DELETE' });
        closeCheckOutModal();
        await refreshSummaryAndLeaderboard();
      } catch (err) {
        alert(err.message || 'Failed to log check-out time.');
        // Keep presence checked in so the user can retry with adjusted times.
      }
    });
  }
}

if (openPastAchievementsBtn && pastAchievementsModal && closePastAchievementsBtn) {
  const overlay = pastAchievementsModal.querySelector('[data-close-past-achievements-modal="true"]');
  openPastAchievementsBtn.addEventListener('click', () => {
    setPastAchievementsModalVisible(true);
  });
  closePastAchievementsBtn.addEventListener('click', () => {
    setPastAchievementsModalVisible(false);
  });
  if (overlay) {
    overlay.addEventListener('click', () => {
      setPastAchievementsModalVisible(false);
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  applyTheme(getStoredTheme());
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleTheme());
  });

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

