// ===== content.js =====
let autoClickInterval = null;
let scheduledTimeout = null;
let attemptCount = 0;
let initialCartCount = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start") {
    if (message.config.scheduled) {
      scheduleAutoClick(message.config);
    } else {
      startAutoClick(message.config);
    }
    sendResponse({ success: true });
  } else if (message.action === "stop") {
    stopAutoClick();
    stopScheduled();
    sendResponse({ success: true });
  }
  return true;
});

function scheduleAutoClick(config) {
  stopAutoClick();
  stopScheduled();

  const now = new Date(Date.now() + (config.serverTimeOffset || 0));
  const target = new Date(now);
  target.setHours(config.targetHour, config.targetMinute || 0, 0, 0);

  // If target time has passed today, set for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target - now;

  if (isNaN(delay) || delay <= 0) {
    console.error("Invalid scheduled time. Delay must be a positive number.");
    sendStatus("Error: Invalid scheduled time", "status-error");
    return;
  }

  console.log("=== Scheduled for:", target.toLocaleString());
  console.log("=== Starting in:", Math.floor(delay / 1000), "seconds");

  const scheduledTimeStr = target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  sendStatus(
    "Scheduled for " + scheduledTimeStr,
    "status-scheduled"
  );

  // Schedule to start clicking at exact time
  if (delay > 0) {
    scheduledTimeout = setTimeout(() => {
      console.log("=== TARGET TIME REACHED! Starting auto-click ===");
      startAutoClick(config);
    }, delay);
  } else {
    console.warn("Scheduled time is in the past or immediate. Starting auto-click now.");
    startAutoClick(config);
  }
}
  // Schedule to start clicking at exact time
  scheduledTimeout = setTimeout(() => {
    console.log("=== TARGET TIME REACHED! Starting auto-click ===");
    startAutoClick(config);
  }, delay);
}

function stopScheduled() {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
    console.log("=== Scheduled booking cancelled ===");
  }
}

function startAutoClick(config) {
  stopAutoClick();
  attemptCount = 0;

  // Get initial cart count
  initialCartCount = getCartCount();

  const startTime = new Date(Date.now() + (config.serverTimeOffset || 0));
  console.log("=== AUTO-CLICK STARTED ===");
  console.log("Start time:", startTime.toLocaleString());
  console.log("Initial cart count:", initialCartCount);

  sendStatus("CLICKING! Attempt 0...", "status-running");

  autoClickInterval = setInterval(() => {
    attemptCount++;

    // Check if max attempts reached
    if (config.maxAttempts > 0 && attemptCount > config.maxAttempts) {
      sendStatus("Stopped: Max attempts reached", "status-idle");
      console.log("Stopped after", attemptCount, "attempts");
      stopAutoClick();
      return;
    }

    // Check if cart count increased
    const currentCartCount = getCartCount();
    if (currentCartCount > initialCartCount) {
      const endTime = new Date(Date.now() + (config.serverTimeOffset || 0));
      const elapsed = endTime - startTime;
      sendStatus(
        "SUCCESS! Booked in " + (elapsed / 1000).toFixed(2) + "s",
        "status-success"
      );
      console.log("=== SUCCESS! ===");
      console.log("Total attempts:", attemptCount);
      console.log("Time elapsed:", elapsed, "ms");
      stopAutoClick();
      return;
    }

    // Find and click the button
    const bookButton = findBookNowButton();

    if (bookButton) {
      dismissErrors();
      bookButton.click();

      if (attemptCount % 10 === 0) {
        console.log("Attempt", attemptCount);
      }
      sendStatus("Attempt " + attemptCount + "...", "status-running");
    } else {
      console.log("Attempt", attemptCount, ": Button not found");
      sendStatus("Attempt " + attemptCount + ": No button", "status-running");
    }
  }, config.interval);
}

function isClickable(button) {
  return isVisible(button) && !button.disabled;
}

function findBookNowButton() {
  // First: Look for ReserveAmerica's specific button
  const primaryButtons = document.querySelectorAll("button.btn.btn-primary");
  for (let button of primaryButtons) {
    const text = button.textContent.trim().toLowerCase();
    if ((text === "book now" || text === "book") && isClickable(button)) {
      return button;
    }
  }

  // Second: Any button with "Book Now" text
  const allButtons = document.querySelectorAll('button, a[role="button"]');
  for (let button of allButtons) {
    const text = button.textContent.trim().toLowerCase();
    if ((text === "book now" || text === "book") && isClickable(button)) {
      return button;
    }
  }

  return null;
}

function getCartCount() {
  const cartSelectors = [
    '[class*="cart-count"]',
    '[class*="cart-quantity"]',
    '[class*="cartCount"]',
    ".badge",
  ];

  for (let selector of cartSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const count = parseInt(element.textContent.trim());
      if (!isNaN(count)) {
        return count;
      }
    }
  }

  const url = window.location.href.toLowerCase();
  if (url.includes("/cart") || url.includes("/checkout")) {
    return 1;
  }

  return 0;
}

function isVisible(element) {
  if (!element || !element.offsetParent) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

function dismissErrors() {
  const errorSelectors = [".error", ".alert-danger", '[role="alert"]'];
  errorSelectors.forEach((selector) => {
    try {
      const errors = document.querySelectorAll(selector);
      errors.forEach((error) => {
        if (isVisible(error)) {
          const closeBtn = error.querySelector("button, .close");
          if (closeBtn) closeBtn.click();
        }
      });
    } catch (e) {}
  });
}

function stopAutoClick() {
  if (autoClickInterval) {
    clearInterval(autoClickInterval);
    autoClickInterval = null;
    console.log("=== Auto-click stopped ===");
  }
}

function sendStatus(status, className) {
  // Use the callback form so failures (e.g. popup closed / no receiver)
  // are surfaced via chrome.runtime.lastError instead of an unhandled
  // rejected promise.
  try {
    chrome.runtime.sendMessage(
      {
        status: status,
        className: className,
      },
      () => {
        if (chrome.runtime.lastError) {
          // Receiver (popup) likely closed — ignore silently.
          // Use console.debug to help during development.
          console.debug(
            "sendStatus: no receiver:",
            chrome.runtime.lastError.message
          );
        }
      }
    );
  } catch (e) {
    // Best effort - if synchronous error occurs, ignore.
  }
}
