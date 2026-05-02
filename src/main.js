import { supabase } from './supabase.js'

const button = document.getElementById("saveBtn")
const textarea = document.getElementById("taskInput")
const status = document.getElementById("status")
const taskList = document.getElementById("taskList")

async function loadTasks() {
  taskList.innerHTML = "Loading..."

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    taskList.innerHTML = "Error loading tasks"
    return
  }

  taskList.innerHTML = ""

  data.forEach((item) => {
    const li = document.createElement("li")

    li.style.display = "flex"
    li.style.justifyContent = "space-between"
    li.style.marginBottom = "10px"

    const text = document.createElement("span")
    text.innerText = item.task

    if (item.status === "done") {
      text.style.textDecoration = "line-through"
      text.style.opacity = "0.5"
    }

    const controls = document.createElement("div")

    // Toggle button
    const toggleBtn = document.createElement("button")
    toggleBtn.innerText = item.status === "pending" ? "Done" : "Undo"

    toggleBtn.onclick = async () => {
      await supabase
        .from("tasks")
        .update({ status: item.status === "pending" ? "done" : "pending" })
        .eq("id", item.id)

      loadTasks()
    }

    // Delete button
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

button.addEventListener("click", async () => {
  const task = textarea.value.trim()

  if (!task) {
    status.innerText = "Write something first"
    return
  }

  status.innerText = "Saving..."

  const { error } = await supabase
    .from("tasks")
    .insert([{ task, status: "pending" }])

  if (error) {
    status.innerText = error.message
  } else {
    status.innerText = "Saved ✅"
    textarea.value = ""
    loadTasks()
  }
})

loadTasks()