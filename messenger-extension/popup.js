const SUPABASE_URL = "https://hmkaprlgnnszcknwessn.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhta2Fwcmxnbm5zemNrbndlc3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQ1MTUsImV4cCI6MjA5MzE1MDUxNX0.LoeW7VFBgwUE0JPXdgjGoDrhnAeZC_Y3NQ8kz0C0sls"

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("email")
  const passwordInput = document.getElementById("password")
  const loginBtn = document.getElementById("loginBtn")
  const logoutBtn = document.getElementById("logoutBtn")
  const status = document.getElementById("status")
  const loginView = document.getElementById("loginView")
  const loggedInView = document.getElementById("loggedInView")
  const userEmailDisplay = document.getElementById("userEmailDisplay")

  // Bulletproof status message renderer
  const showStatus = (msg, isError = false) => {
    status.innerText = msg
    status.style.color = isError ? "#f87171" : "#71717a"
  }

  // UI State Management
  const showLoginView = () => {
    loginView.classList.remove("hidden")
    loginView.classList.add("flex")
    loggedInView.classList.add("hidden")
    loggedInView.classList.remove("flex")
  }

  const showActiveView = (email) => {
    loginView.classList.add("hidden")
    loginView.classList.remove("flex")
    loggedInView.classList.remove("hidden")
    loggedInView.classList.add("flex")
    userEmailDisplay.innerText = email
  }

  // Core Login Logic
  const attemptLogin = async () => {
    const email = emailInput.value.trim()
    const password = passwordInput.value.trim()

    if (!email || !password) {
      return showStatus("Please enter both email and password.", true)
    }

    showStatus("Authenticating...")
    loginBtn.disabled = true
    loginBtn.style.opacity = "0.5"

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error_description || result.msg || "Invalid credentials")
      }

      if (!result.user || !result.user.id) {
        throw new Error("Invalid response from database.")
      }

      await chrome.storage.local.set({
        access_token: result.access_token,
        user_id: result.user.id,
        user_email: result.user.email
      })

      showStatus("")
      showActiveView(result.user.email)
    } catch (err) {
      console.error("Login Error:", err)
      showStatus(`Error: ${err.message}`, true)
    } finally {
      loginBtn.disabled = false
      loginBtn.style.opacity = "1"
    }
  }

  // Click or hit Enter to login
  loginBtn.addEventListener("click", attemptLogin)
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") attemptLogin()
  })

  // Logout
  logoutBtn.addEventListener("click", async () => {
    await chrome.storage.local.clear()
    showStatus("Disconnected")
    showLoginView()
    emailInput.value = ""
    passwordInput.value = ""
  })

  // Check initial state on open
  chrome.storage.local.get(["user_email"], (data) => {
    if (data.user_email) {
      showActiveView(data.user_email)
    } else {
      showLoginView()
    }
  })
})