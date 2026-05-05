const SUPABASE_URL = "https://hmkaprlgnnszcknwessn.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2Fwcmxnbm5zemNrbndlc3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQ1MTUsImV4cCI6MjA5MzE1MDUxNX0.LoeW7VFBgwUE0JPXdgjGoDrhnAeZC_Y3NQ8kz0C0sls"

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-to-tracker",
      title: "Save to Tracker",
      contexts: ["selection"]
    })
  })
}

chrome.runtime.onInstalled.addListener(createContextMenu)
chrome.runtime.onStartup.addListener(createContextMenu)

// The Toast UI Injector
const injectToast = (msg, isSuccess) => {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    background: ${isSuccess ? '#18181b' : '#ef4444'};
    color: #fff;
    border: 1px solid ${isSuccess ? '#27272a' : '#b91c1c'};
    padding: 12px 20px; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px; font-weight: 500; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    transform: translateY(20px) scale(0.95); opacity: 0;
  `;
  toast.innerHTML = isSuccess
    ? `<span style="color: #34d399; margin-right: 8px;">✓</span> ${msg}`
    : `<span style="margin-right: 8px;">⚠</span> ${msg}`;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0) scale(1)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.95)';
    setTimeout(() => toast.remove(), 300);
  }, 2500); // Disappears after 2.5 seconds
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-tracker") return

  const selectedText = info.selectionText
  const authData = await chrome.storage.local.get(["access_token", "user_id"])

  if (!authData.access_token || !authData.user_id) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: injectToast, args: ["Please login to the extension first.", false] })
    return
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/tasks`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${authData.access_token}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      task: selectedText,
      status: "pending",
      user_id: authData.user_id,
      source_url: tab.url // <-- Grabbing the deep link
    })
  })

  if (response.ok) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: injectToast, args: ["Saved to Tracker", true] })
  } else {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: injectToast, args: ["Failed to save task", false] })
  }
})