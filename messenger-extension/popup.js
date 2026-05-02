const SUPABASE_URL = "https://hmkaprlgnnszcknwessn.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2Fwcmxnbm5zemNrbndlc3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQ1MTUsImV4cCI6MjA5MzE1MDUxNX0.LoeW7VFBgwUE0JPXdgjGoDrhnAeZC_Y3NQ8kz0C0sls"

const emailInput = document.getElementById("email")
const passwordInput = document.getElementById("password")
const loginBtn = document.getElementById("loginBtn")
const logoutBtn = document.getElementById("logoutBtn")
const status = document.getElementById("status")

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) {
    status.innerText = "Enter email and password"
    return
  }

  status.innerText = "Logging in..."

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  })

  const result = await response.json()

  if (!response.ok) {
    status.innerText = result.error_description || result.msg || "Login failed"
    return
  }

  await chrome.storage.local.set({
    access_token: result.access_token,
    user_id: result.user.id,
    user_email: result.user.email
  })

  status.innerText = "Logged in as " + result.user.email
})

logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.clear()
  status.innerText = "Logged out"
})

chrome.storage.local.get(["user_email"], (data) => {
  if (data.user_email) {
    status.innerText = "Logged in as " + data.user_email
  } else {
    status.innerText = "Not logged in"
  }
})