const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  latestOutput: ""
};

const authSection = document.getElementById("authSection");
const dashboardSection = document.getElementById("dashboardSection");
const messageEl = document.getElementById("message");
const userMetaEl = document.getElementById("userMeta");
const generatedOutputEl = document.getElementById("generatedOutput");
const historyListEl = document.getElementById("historyList");
const logoutBtn = document.getElementById("logoutBtn");
const statUsed = document.getElementById("statUsed");
const statRemaining = document.getElementById("statRemaining");
const statLatest = document.getElementById("statLatest");
const sourceBadge = document.getElementById("sourceBadge");

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#ff8c8c" : "#9effa0";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setAuthedUI(isAuthed) {
  authSection.classList.toggle("hidden", isAuthed);
  dashboardSection.classList.toggle("hidden", !isAuthed);
  logoutBtn.classList.toggle("hidden", !isAuthed);
}

function renderUser() {
  if (!state.user) return;
  userMetaEl.textContent = `${state.user.name} (${state.user.email}) · Plan: ${state.user.plan} · Quota: ${state.user.monthly_quota}/month`;
}

function renderHistory(items) {
  historyListEl.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No content generated yet.";
    historyListEl.appendChild(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";

    const title = document.createElement("strong");
    title.textContent = item.keyword || "(no keyword)";

    const metaLine = document.createElement("div");
    metaLine.textContent = `${item.created_at || ""}`;

    const detailLine = document.createElement("div");
    detailLine.textContent = `${item.intent || "-"} | ${item.tone || "-"} | ${item.language || "-"}`;

    li.appendChild(title);
    li.appendChild(document.createTextNode(" · "));
    li.appendChild(metaLine);
    li.appendChild(detailLine);

    li.addEventListener("click", () => {
      state.latestOutput = item.generated_content;
      generatedOutputEl.textContent = state.latestOutput;
    });

    historyListEl.appendChild(li);
  }
}

function renderStats(stats) {
  statUsed.textContent = `${stats.monthly_used}/${stats.monthly_quota}`;
  statRemaining.textContent = String(stats.remaining);
  statLatest.textContent = stats.latest_keyword || "-";
}

async function loadDashboard() {
  const [{ user }, { items }, stats] = await Promise.all([
    api("/api/auth/me"),
    api("/api/content/history"),
    api("/api/dashboard/stats")
  ]);

  state.user = user;
  renderUser();
  renderHistory(items);
  renderStats(stats);
  setAuthedUI(true);
}

async function handleAuth(path, formEvent, successText) {
  formEvent.preventDefault();
  const formData = new FormData(formEvent.target);
  const payload = Object.fromEntries(formData.entries());

  try {
    const { token, user } = await api(path, { method: "POST", body: JSON.stringify(payload) });
    state.token = token;
    state.user = user;
    localStorage.setItem("token", token);
    formEvent.target.reset();
    showMessage(successText);
    await loadDashboard();
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.getElementById("registerForm").addEventListener("submit", (event) => {
  handleAuth("/api/auth/register", event, "Registration successful.");
});

document.getElementById("loginForm").addEventListener("submit", (event) => {
  handleAuth("/api/auth/login", event, "Login successful.");
});

document.getElementById("generateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitBtn = event.target.querySelector("button[type=\"submit\"]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Generating...";
  const payload = Object.fromEntries(new FormData(event.target).entries());
  payload.includeFaq = Boolean(payload.includeFaq);

  try {
    const { item, generation_source } = await api("/api/content/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.latestOutput = item.generated_content;
    generatedOutputEl.textContent = state.latestOutput;
    sourceBadge.textContent = `Source: ${generation_source}`;
    showMessage(`Content generated via ${generation_source}.`);
    await loadDashboard();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Generate";
  }
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  if (!state.latestOutput) {
    showMessage("No generated output to copy yet.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(state.latestOutput);
    showMessage("Output copied to clipboard.");
  } catch {
    showMessage("Clipboard copy failed in this browser.", true);
  }
});

logoutBtn.addEventListener("click", () => {
  state.token = "";
  state.user = null;
  state.latestOutput = "";
  localStorage.removeItem("token");
  generatedOutputEl.textContent = "";
  setAuthedUI(false);
  showMessage("Logged out.");
});

(async function bootstrap() {
  if (!state.token) return setAuthedUI(false);

  try {
    await loadDashboard();
  } catch {
    localStorage.removeItem("token");
    state.token = "";
    setAuthedUI(false);
  }
})();
