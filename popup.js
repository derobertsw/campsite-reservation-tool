// ===== popup.js =====
let serverTimeOffset = 0;
let clockInterval = null;
let countdownInterval = null;
let isRunning = false;

function setRunningState(running) {
  isRunning = running;
  const btn = document.getElementById("toggleStart");
  if (!btn) return;
  if (running) {
    btn.textContent = "Stop";
    btn.classList.remove("btn-start");
    btn.classList.add("btn-stop");
    _setControlsEnabled(false);
  } else {
    btn.textContent = "Start Clicking Now";
    btn.classList.remove("btn-stop");
    btn.classList.add("btn-start");
    _setControlsEnabled(true);
  }
}
// Disable/enable inputs when running state changes
function _setControlsEnabled(enabled) {
  const scheduleBtn = document.getElementById("schedule");
  const targetHour = document.getElementById("targetHour");
  const interval = document.getElementById("interval");
  const maxAttempts = document.getElementById("maxAttempts");
  if (scheduleBtn) scheduleBtn.disabled = !enabled;
  if (targetHour) targetHour.disabled = !enabled;
  if (interval) interval.disabled = !enabled;
  if (maxAttempts) maxAttempts.disabled = !enabled;
}

// Update the duration tip dynamically: interval (ms) * maxAttempts
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function updateDurationTip() {
  const intervalEl = document.getElementById("interval");
  const maxEl = document.getElementById("maxAttempts");
  const tipEl = document.getElementById("durationTip");
  if (!tipEl || !intervalEl || !maxEl) return;

  const interval = parseInt(intervalEl.value, 10) || 0; // ms
  const max = parseInt(maxEl.value, 10);

  const secondsPer = (interval / 1000).toFixed(interval % 1000 === 0 ? 0 : 1);

  if (!max || max <= 0) {
    tipEl.textContent = `Keep trying until stopped at ${secondsPer}s per attempt`;
    return;
  }

  const totalMs = interval * max;
  const human = formatDuration(totalMs);
  tipEl.textContent = `Keep trying for about ${human} at ${secondsPer}s per attempt`;
}

// Start clock immediately
startClock();

document.getElementById("schedule").addEventListener("click", async () => {
  const config = {
    scheduled: true,
    targetHour: parseInt(document.getElementById("targetHour").value),
    interval: parseInt(document.getElementById("interval").value),
    maxAttempts: parseInt(document.getElementById("maxAttempts").value),
    serverTimeOffset: serverTimeOffset,
  };

  // Update the duration tip when the schedule button is clicked
  updateDurationTip();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(
    tab.id,
    {
      action: "start",
      config: config,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        updateStatus("Error: Reload the page and try again", "status-error");
      } else {
        // Reflect running state in the popup toggle button
        setRunningState(true);
      }
    }
  );

  startCountdown(config.targetHour);
});

// Toggle Start / Stop button handler
document.getElementById("toggleStart").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!isRunning) {
    // Start immediately
    const config = {
      scheduled: false,
      interval: parseInt(document.getElementById("interval").value),
      maxAttempts: parseInt(document.getElementById("maxAttempts").value),
      serverTimeOffset: serverTimeOffset,
    };

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "start",
        config: config,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          updateStatus("Error: Reload the page and try again", "status-error");
        } else {
          setRunningState(true);
        }
      }
    );

    updateStatus("Starting now...", "status-running");
    stopCountdown();
  } else {
    // Stop
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "stop",
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log(
            "sendMessage(stop) failed:",
            chrome.runtime.lastError.message
          );
        }
      }
    );

    setRunningState(false);
    _setControlsEnabled(true);
    updateStatus("Stopped by user", "status-idle");
    stopCountdown();
  }
});

async function startClock() {
  // Get server time from ReserveAmerica
  try {
    const response = await fetch("https://www.reserveamerica.com", {
      method: "HEAD",
    });
    const serverDateHeader = response.headers.get("date");
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader);
      const localTime = new Date();
      serverTimeOffset = serverTime.getTime() - localTime.getTime();
      console.log("Server time offset:", serverTimeOffset, "ms");
    }
  } catch (e) {
    console.log("Could not fetch server time, using local time");
  }

  // Update clock every second
  clockInterval = setInterval(updateClock, 100);
  updateClock();
}

function updateClock() {
  const now = new Date(Date.now() + serverTimeOffset);
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  const timeString =
    String(displayHours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    " " +
    ampm;

  document.getElementById("serverTime").textContent = timeString;
}

function startCountdown(targetHour) {
  const countdownEl = document.getElementById("countdown");
  const countdownTimeEl = document.getElementById("countdownTime");

  countdownEl.classList.add("show");

  countdownInterval = setInterval(() => {
    const now = new Date(Date.now() + serverTimeOffset);
    const target = new Date(now);
    target.setHours(targetHour, 0, 0, 0);

    // If target time has passed today, set for tomorrow
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    const diff = target - now;

    if (diff <= 0) {
      countdownTimeEl.textContent = "STARTING NOW!";
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    countdownTimeEl.textContent =
      String(hours).padStart(2, "0") +
      ":" +
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0");
  }, 100);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  document.getElementById("countdown").classList.remove("show");
}

function updateStatus(text, className) {
  const status = document.getElementById("status");
  status.textContent = text;
  status.className = className;
}

// Listen for status updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.status) {
    updateStatus(message.status, message.className || "status-idle");
    // If content script reports idle or success, clear running state
    if (
      message.className === "status-idle" ||
      message.className === "status-success"
    ) {
      setRunningState(false);
    }
  }
});

// Initialize toggle button text correctly on load
document.addEventListener("DOMContentLoaded", () => {
  setRunningState(false);
  // Initialize dynamic duration tip and wire live updates
  updateDurationTip();
  const intervalEl = document.getElementById("interval");
  const maxEl = document.getElementById("maxAttempts");
  if (intervalEl) intervalEl.addEventListener("input", updateDurationTip);
  if (maxEl) maxEl.addEventListener("input", updateDurationTip);
});
