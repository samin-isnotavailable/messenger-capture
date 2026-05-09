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

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu()
})

chrome.runtime.onStartup.addListener(() => {
  createContextMenu()
})

createContextMenu()

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-tracker") return

  const selectedText = info.selectionText

  const authData = await chrome.storage.local.get([
    "access_token",
    "user_id",
    "user_email"
  ])

  if (!authData.access_token || !authData.user_id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => alert("Please login from the extension first.")
    })
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
      user_id: authData.user_id
    })
  })

  if (response.ok) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => alert("Saved to Tracker ✅")
    })
  } else {
    const errorText = await response.text()

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (msg) => alert("Save failed: " + msg),
      args: [errorText]
    })
  }
})