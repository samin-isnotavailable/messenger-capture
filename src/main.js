import { supabase } from "./supabase.js";
import { inject } from '@vercel/analytics'

// Initialize Vercel Analytics
inject()

// Login elements
const appHeader = document.getElementById("appHeader");
const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginStatus = document.getElementById("loginStatus");

// App elements
const button = document.getElementById("saveBtn");
const textarea = document.getElementById("taskInput");
const prioritySelect = document.getElementById("prioritySelect");
const dueDateInput = document.getElementById("dueDateInput");
const status = document.getElementById("status");
const taskList = document.getElementById("taskList");

// Filter element
const toggleCompletedBtn = document.getElementById("toggleCompletedBtn");
let hideCompleted = false;

// --- Foolproof Window Dragging (Rust Invoke) ---
if (appHeader) {
  appHeader.addEventListener("mousedown", (e) => {
    if (e.target.closest("#logoutBtn")) return;
    if (window.__TAURI__) {
      window.__TAURI__.core.invoke("drag_window");
    }
  });
}
// ----------------------------------------------

// View toggling
function showLogin() {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
  appView.classList.remove("flex");
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  appView.classList.add("flex");
  loadTasks();
}

async function checkSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) showApp();
  else showLogin();
}

// Login
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    loginStatus.innerText = "Enter email and password";
    loginStatus.className =
      "text-center text-sm text-red-400 mt-4 min-h-[20px]";
    return;
  }

  loginStatus.innerText = "Logging in...";
  loginStatus.className = "text-center text-sm text-zinc-400 mt-4 min-h-[20px]";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginStatus.innerText = error.message;
    loginStatus.className =
      "text-center text-sm text-red-400 mt-4 min-h-[20px]";
  } else {
    loginStatus.innerText = "";
    showApp();
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  taskList.innerHTML = "";
  showLogin();
});

// Toggle Completed Tasks Logic
if (toggleCompletedBtn) {
  toggleCompletedBtn.addEventListener("click", () => {
    hideCompleted = !hideCompleted;

    if (hideCompleted) {
      toggleCompletedBtn.innerHTML = `<i class="ph-bold ph-eye text-[14px]"></i> <span>Show Done</span>`;
      toggleCompletedBtn.classList.add(
        "text-indigo-400",
        "bg-indigo-500/10",
        "border-indigo-500/20",
      );
      toggleCompletedBtn.classList.remove(
        "text-zinc-300",
        "bg-white/5",
        "border-white/10",
      );
    } else {
      toggleCompletedBtn.innerHTML = `<i class="ph-bold ph-eye-slash text-[14px]"></i> <span>Hide Done</span>`;
      toggleCompletedBtn.classList.remove(
        "text-indigo-400",
        "bg-indigo-500/10",
        "border-indigo-500/20",
      );
      toggleCompletedBtn.classList.add(
        "text-zinc-300",
        "bg-white/5",
        "border-white/10",
      );
    }

    loadTasks();
  });
}

// Load tasks
async function loadTasks() {
  taskList.innerHTML =
    '<li class="text-sm text-zinc-500 text-center py-4">Loading tasks...</li>';

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    taskList.innerHTML = `<li class="text-sm text-red-400 text-center py-4">Error: ${error.message}</li>`;
    return;
  }

  taskList.innerHTML = "";
  let visibleTasks = 0;

  data.forEach((item) => {
    if (hideCompleted && item.status === "done") return;
    visibleTasks++;

    const li = document.createElement("li");
    // FIXED: Strict horizontal layout to prevent stacking in narrow popup windows
    li.className =
      "group flex justify-between items-center gap-4 p-4 rounded-2xl bg-[#121214] border border-white/5 hover:border-white/10 transition-all duration-200 shadow-sm relative overflow-hidden";

    let stripColor = "bg-zinc-700";
    if (item.priority === "high") stripColor = "bg-red-500";
    if (item.priority === "low") stripColor = "bg-blue-500";
    if (item.priority === "medium") stripColor = "bg-indigo-500";

    const priorityStrip = document.createElement("div");
    priorityStrip.className = `absolute left-0 top-0 bottom-0 w-[3px] ${stripColor} opacity-50`;
    li.appendChild(priorityStrip);

    // --- VIEW STATE CONTAINER ---
    const viewState = document.createElement("div");
    viewState.className = "flex-1 flex flex-col min-w-0 pl-1";

    const text = document.createElement("span");
    text.className =
      "text-[15px] leading-relaxed break-words whitespace-pre-wrap transition-colors ";

    if (item.status === "done") {
      text.className += "text-zinc-500 line-through decoration-zinc-700";
    } else {
      text.className += "text-zinc-100";
    }

    text.innerText = item.task;
    viewState.appendChild(text);

    const metaContainer = document.createElement("div");
    metaContainer.className = "flex items-center gap-3 mt-2.5 flex-wrap w-full";

    if (item.status !== "done") {
      const prioritySpan = document.createElement("span");
      let pColor = "text-zinc-400",
        pIcon = "ph-flag",
        pText = "Med";

      if (item.priority === "high") {
        pColor = "text-red-400";
        pIcon = "ph-flag-banner";
        pText = "High";
      } else if (item.priority === "low") {
        pColor = "text-blue-400";
        pText = "Low";
      }

      prioritySpan.className = `text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${pColor}`;
      prioritySpan.innerHTML = `<i class="ph-bold ${pIcon}"></i> ${pText}`;
      metaContainer.appendChild(prioritySpan);
    }

    if (item.due_date && item.status !== "done") {
      const dateSpan = document.createElement("span");
      const dateStr = new Date(item.due_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      dateSpan.className =
        "text-[11px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1";
      dateSpan.innerHTML = `<i class="ph-bold ph-calendar-blank"></i> ${dateStr}`;
      metaContainer.appendChild(dateSpan);
    }

    if (item.source_url && item.status !== "done") {
      const linkSpan = document.createElement("a");
      linkSpan.href = item.source_url;
      linkSpan.target = "_blank";
      linkSpan.className =
        "text-[11px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ml-auto mr-2";
      linkSpan.innerHTML = `<i class="ph-bold ph-link"></i> Open Chat`;
      metaContainer.appendChild(linkSpan);
    }

    if (item.status === "done" && item.done_by_email) {
      const doneBy = document.createElement("span");
      doneBy.className =
        "text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1";
      doneBy.innerHTML = `<i class="ph-fill ph-check-circle"></i> Completed by ${item.done_by_email}`;
      metaContainer.appendChild(doneBy);
    }

    if (metaContainer.hasChildNodes()) viewState.appendChild(metaContainer);

    // --- EDIT STATE CONTAINER ---
    const editState = document.createElement("div");
    editState.className = "hidden flex-1 flex-col gap-3 w-full pl-1";

    const editInput = document.createElement("textarea");
    editInput.className =
      "w-full bg-[#09090b] border border-white/10 rounded-xl p-3 text-sm text-zinc-100 outline-none focus:border-indigo-500 resize-y min-h-[80px]";
    editInput.value = item.task;

    const editControlsRow = document.createElement("div");
    editControlsRow.className = "flex gap-2 items-center flex-wrap";

    const editPriority = document.createElement("select");
    editPriority.className =
      "bg-[#09090b] border border-white/10 rounded-lg text-xs font-medium text-zinc-300 px-3 py-2 outline-none cursor-pointer focus:border-indigo-500 appearance-none";
    editPriority.innerHTML = `
      <option value="low" ${item.priority === "low" ? "selected" : ""}>Low Priority</option>
      <option value="medium" ${!item.priority || item.priority === "medium" ? "selected" : ""}>Medium Priority</option>
      <option value="high" ${item.priority === "high" ? "selected" : ""}>High Priority</option>
    `;

    const editDate = document.createElement("input");
    editDate.type = "date";
    editDate.className =
      "bg-[#09090b] border border-white/10 rounded-lg text-xs font-medium text-zinc-300 px-3 py-2 outline-none cursor-pointer focus:border-indigo-500 [color-scheme:dark]";
    editDate.value = item.due_date || "";

    const editActions = document.createElement("div");
    editActions.className = "flex gap-2 ml-auto";

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className =
      "bg-white/5 hover:bg-white/10 text-zinc-300 font-medium text-xs px-4 py-2 rounded-lg transition-colors";
    cancelEditBtn.innerText = "Cancel";

    const saveEditBtn = document.createElement("button");
    saveEditBtn.className =
      "bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition-colors shadow-sm";
    saveEditBtn.innerText = "Save";

    editActions.append(cancelEditBtn, saveEditBtn);
    editControlsRow.append(editPriority, editDate, editActions);
    editState.append(editInput, editControlsRow);

    // --- ACTION BUTTONS (FIXED ALIGNMENT) ---
    const controls = document.createElement("div");
    controls.className = "flex items-center gap-1.5 shrink-0"; // Forced strictly horizontal

    const isPending = item.status === "pending";

    const toggleBtn = document.createElement("button");
    toggleBtn.innerHTML = isPending
      ? `<i class="ph-bold ph-check"></i>`
      : `<i class="ph-bold ph-arrow-counter-clockwise"></i>`;
    toggleBtn.className = `p-2 rounded-xl transition-colors flex items-center justify-center ${
      isPending
        ? "bg-white/5 text-zinc-400 hover:bg-emerald-500/20 hover:text-emerald-400"
        : "bg-white/5 text-zinc-400 hover:bg-orange-500/20 hover:text-orange-400"
    }`;
    toggleBtn.title = isPending ? "Mark Done" : "Undo";

    toggleBtn.onclick = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return alert("Session expired");

      await supabase
        .from("tasks")
        .update({
          status: isPending ? "done" : "pending",
          done_by: isPending ? user.id : null,
          done_by_email: isPending ? user.email : null,
        })
        .eq("id", item.id);
    };

    const editBtn = document.createElement("button");
    editBtn.innerHTML = `<i class="ph-bold ph-pencil-simple"></i>`;
    editBtn.className =
      "p-2 rounded-xl bg-white/5 text-zinc-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors flex items-center justify-center";
    editBtn.title = "Edit Task";

    editBtn.onclick = () => {
      viewState.classList.add("hidden");
      controls.classList.add("hidden");
      editState.classList.remove("hidden");
      editState.classList.add("flex");
    };

    cancelEditBtn.onclick = () => {
      editState.classList.remove("flex");
      editState.classList.add("hidden");
      viewState.classList.remove("hidden");
      controls.classList.remove("hidden");
      editInput.value = item.task;
      editPriority.value = item.priority || "medium";
      editDate.value = item.due_date || "";
    };

    saveEditBtn.onclick = async () => {
      saveEditBtn.disabled = true;
      saveEditBtn.innerText = "...";

      const { error } = await supabase
        .from("tasks")
        .update({
          task: editInput.value.trim(),
          priority: editPriority.value,
          due_date: editDate.value || null,
        })
        .eq("id", item.id);

      if (error) {
        alert("Error saving: " + error.message);
        saveEditBtn.disabled = false;
        saveEditBtn.innerText = "Save";
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = `<i class="ph-bold ph-trash"></i>`;
    deleteBtn.className =
      "p-2 rounded-xl bg-white/5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors flex items-center justify-center";
    deleteBtn.title = "Delete Task";

    deleteBtn.onclick = async () => {
      if (confirm("Are you sure you want to delete this task?")) {
        const { error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", item.id);
        if (error) {
          alert("Failed to delete: " + error.message);
          console.error(error);
        }
      }
    };

    controls.appendChild(toggleBtn);
    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);

    li.appendChild(viewState);
    li.appendChild(editState);
    li.appendChild(controls);
    taskList.appendChild(li);
  });

  if (visibleTasks === 0) {
    taskList.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-zinc-500">
        <i class="ph-fill ph-check-circle text-4xl mb-2 opacity-30"></i>
        <p class="text-sm font-medium">You're all caught up!</p>
      </div>
    `;
  }
}

// Save task (Manual entry from the dashboard)
button.addEventListener("click", async () => {
  const task = textarea.value.trim();
  const priority = prioritySelect.value;
  const dueDate = dueDateInput.value || null;

  if (!task) {
    status.innerText = "Write something first";
    status.className = "text-xs font-medium text-red-400 ml-2";
    return;
  }

  button.disabled = true;
  button.classList.add("opacity-50", "cursor-not-allowed");
  status.innerText = "Saving...";
  status.className = "text-xs font-medium text-zinc-500 ml-2";

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    status.innerText = "Session expired.";
    status.className = "text-xs font-medium text-red-400 ml-2";
    showLogin();
    button.disabled = false;
    button.classList.remove("opacity-50", "cursor-not-allowed");
    return;
  }

  const { error } = await supabase.from("tasks").insert([
    {
      task,
      status: "pending",
      user_id: user.id,
      priority: priority,
      due_date: dueDate,
    },
  ]);

  if (error) {
    status.innerText = "Error: " + error.message;
    status.className = "text-xs font-medium text-red-400 ml-2";
  } else {
    status.innerText = "Saved";
    status.className = "text-xs font-medium text-emerald-400 ml-2";

    textarea.value = "";
    prioritySelect.value = "medium";
    dueDateInput.value = "";

    setTimeout(() => {
      if (status.innerText === "Saved") status.innerText = "";
    }, 3000);
  }

  button.disabled = false;
  button.classList.remove("opacity-50", "cursor-not-allowed");
});

// Real-time listener
supabase
  .channel("tasks-changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "tasks" },
    () => {
      loadTasks();
    },
  )
  .subscribe();

// Init
checkSession();
