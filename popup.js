// ===== popup.js =====
let serverTimeOffset = 0;
let clockInterval = null;
let countdownInterval = null;

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
      }
    }
  );

  startCountdown(config.targetHour);
});

document.getElementById("startNow").addEventListener("click", async () => {
  const config = {
    scheduled: false,
    interval: parseInt(document.getElementById("interval").value),
    maxAttempts: parseInt(document.getElementById("maxAttempts").value),
    serverTimeOffset: serverTimeOffset,
  };

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
      }
    }
  );

  updateStatus("Starting now...", "status-running");
  stopCountdown();
});

document.getElementById("stop").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Provide a callback so any "no receiver" error is reported via
  // chrome.runtime.lastError instead of an unhandled rejected promise.
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

  updateStatus("Stopped by user", "status-idle");
  stopCountdown();
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
  }
});
