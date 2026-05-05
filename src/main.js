import { supabase } from './supabase.js'
import { inject } from '@vercel/analytics'

// Initialize Vercel Analytics
inject()

// Login elements
const loginView = document.getElementById("loginView")
const appView = document.getElementById("appView")
const emailInput = document.getElementById("emailInput")
const passwordInput = document.getElementById("passwordInput")
const loginBtn = document.getElementById("loginBtn")
const logoutBtn = document.getElementById("logoutBtn")
const loginStatus = document.getElementById("loginStatus")

// App elements
const button = document.getElementById("saveBtn")
const textarea = document.getElementById("taskInput")
const status = document.getElementById("status")
const taskList = document.getElementById("taskList")

function showLogin() {
  loginView.style.display = "block"
  appView.style.display = "none"
}

function showApp() {
  loginView.style.display = "none"
  appView.style.display = "block"
  loadTasks()
}

// Check existing login
async function checkSession() {
  const { data } = await supabase.auth.getSession()

  if (data.session) {
    showApp()
  } else {
    showLogin()
  }
}

// Login
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) {
    loginStatus.innerText = "Enter email and password"
    return
  }

  loginStatus.innerText = "Logging in..."

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    loginStatus.innerText = error.message
  } else {
    loginStatus.innerText = ""
    showApp()
  }
})

// Logout
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut()
  taskList.innerHTML = ""
  showLogin()
})

// Load tasks
async function loadTasks() {
  taskList.innerHTML = "Loading..."

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    taskList.innerHTML = "Error loading tasks: " + error.message
    return
  }

  taskList.innerHTML = ""

  data.forEach((item) => {
    const li = document.createElement("li")

    const text = document.createElement("span")
    let label = item.task
  
    if (item.status === "done" && item.done_by_email) {
      label += " (done by " + item.done_by_email + ")"
    }

    text.innerText = label

    if (item.status === "done") {
      text.style.textDecoration = "line-through"
      text.style.opacity = "0.5"
    }

    const controls = document.createElement("div")

    const toggleBtn = document.createElement("button")
    toggleBtn.innerText = item.status === "pending" ? "Done" : "Undo"

    toggleBtn.onclick = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      if (!user) {
        alert("Session expired")
        return
      }

      const isGoingDone = item.status === "pending"

      const { error } = await supabase
        .from("tasks")
        .update({
          status: isGoingDone ? "done" : "pending",
          done_by: isGoingDone ? user.id : null,
          done_by_email: isGoingDone ? user.email : null
        })
        .eq("id", item.id)

      if (error) {
        console.log(error)
        alert(error.message)
      } else {
        loadTasks()
      }
    }
  

  const deleteBtn = document.createElement("button")
  deleteBtn.innerText = "Delete"

  deleteBtn.onclick = async () => {
    await supabase
      .from("tasks")
      .delete()
      .eq("id", item.id)

    loadTasks()
  }

  controls.appendChild(toggleBtn)
  controls.appendChild(deleteBtn)

  li.appendChild(text)
  li.appendChild(controls)
  taskList.appendChild(li)
})
}

// Save task
// Save task
button.addEventListener("click", async () => {
  const task = textarea.value.trim()

  if (!task) {
    status.innerText = "Write something first"
    return
  }

  button.disabled = true
  status.innerText = "Saving..."

  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user

  if (!user) {
    status.innerText = "Session expired. Please log in again."
    showLogin()
    button.disabled = false
    return
  }

  const { error } = await supabase
    .from("tasks")
    .insert([
      {
        task,
        status: "pending",
        user_id: user.id
      }
    ])

  if (error) {
    status.innerText = "Error: " + error.message
  } else {
    status.innerText = "Saved ✅"
    textarea.value = ""
    loadTasks()
  }

  button.disabled = false
})

supabase
  .channel("tasks-changes")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "tasks"
    },
    () => {
      loadTasks()
    }
  )
  .subscribe()

checkSession()