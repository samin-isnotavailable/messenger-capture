import { supabase } from "./supabase.js";

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
    loginStatus.className = "text-center text-sm text-red-400 mt-4 min-h-[20px]";
    return;
  }

  loginStatus.innerText = "Logging in...";
  loginStatus.className = "text-center text-sm text-zinc-400 mt-4 min-h-[20px]";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginStatus.innerText = error.message;
    loginStatus.className = "text-center text-sm text-red-400 mt-4 min-h-[20px]";
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
      toggleCompletedBtn.classList.add("text-violet-400", "bg-violet-500/10", "rounded-md");
      toggleCompletedBtn.classList.remove("text-zinc-400");
    } else {
      toggleCompletedBtn.innerHTML = `<i class="ph-bold ph-eye-slash text-[14px]"></i> <span>Hide Done</span>`;
      toggleCompletedBtn.classList.remove("text-violet-400", "bg-violet-500/10", "rounded-md");
      toggleCompletedBtn.classList.add("text-zinc-400");
    }

    loadTasks();
  });
}

// Load tasks
async function loadTasks() {
  taskList.innerHTML = '<li class="text-xs text-zinc-600 text-center py-6 font-medium tracking-wide uppercase">Syncing...</li>';

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

  data.forEach((item, index) => {
    if (hideCompleted && item.status === "done") return;
    visibleTasks++;

    const li = document.createElement("li");

    // Determine colors based on priority
    let borderTheme = "border border-zinc-500/20";
    let glowTheme = "hover:border-zinc-500/50 hover:shadow-[0_0_15px_rgba(113,113,122,0.1)]";
    let iconColor = "text-zinc-400";

    if (item.status !== "done") {
      if (item.priority === "high") {
        borderTheme = "border-l-4 border-l-rose-500 border-y-white/5 border-r-white/5";
        glowTheme = "hover:border-rose-500/40 hover:shadow-[0_0_20px_rgba(244,63,94,0.15)]";
        iconColor = "text-rose-400";
      } else if (item.priority === "low") {
        borderTheme = "border-l-4 border-l-emerald-500 border-y-white/5 border-r-white/5";
        glowTheme = "hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]";
        iconColor = "text-emerald-400";
      } else {
        borderTheme = "border-l-4 border-l-amber-500 border-y-white/5 border-r-white/5";
        glowTheme = "hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]";
        iconColor = "text-amber-400";
      }
    }

    // ANIMATION & WIDE LAYOUT
    li.className = `animate-task task-card-hover group flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-5 rounded-2xl bg-[#121214] ${borderTheme} ${glowTheme} transition-all duration-300 relative`;
    li.style.animationDelay = `${index * 0.05}s`;

    // --- VIEW STATE CONTAINER ---
    const viewState = document.createElement("div");
    viewState.className = "flex-1 flex flex-col min-w-0";

    const text = document.createElement("span");
    text.className = "text-[15px] leading-relaxed break-words whitespace-pre-wrap font-medium transition-colors ";
    text.className += item.status === "done" ? "text-zinc-600 line-through decoration-zinc-700/50" : "text-zinc-100";
    text.innerText = item.task;
    viewState.appendChild(text);

    // COLORFUL METADATA
    const metaContainer = document.createElement("div");
    metaContainer.className = "flex items-center gap-3 mt-3 flex-wrap w-full";

    if (item.status !== "done") {
      const prioritySpan = document.createElement("span");
      prioritySpan.className = `meta-pill ${iconColor} bg-white/5`;
      const icon = item.priority === "high" ? "ph-warning-circle pulse-icon" : item.priority === "low" ? "ph-arrow-down" : "ph-minus";
      prioritySpan.innerHTML = `<i class="ph-bold ${icon}"></i> ${item.priority || "Medium"}`;
      metaContainer.appendChild(prioritySpan);
    }

    if (item.due_date && item.status !== "done") {
      const dateSpan = document.createElement("span");
      const dateStr = new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      dateSpan.className = "meta-pill text-violet-400 bg-violet-500/10 border-violet-500/20";
      dateSpan.innerHTML = `<i class="ph-bold ph-calendar-star"></i> ${dateStr}`;
      metaContainer.appendChild(dateSpan);
    }

    if (item.source_url && item.status !== "done") {
      const linkSpan = document.createElement("a");
      linkSpan.href = item.source_url;
      linkSpan.target = "_blank";
      linkSpan.className = "text-[11px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ml-auto mr-2";
      linkSpan.innerHTML = `<i class="ph-bold ph-link"></i> Open Chat`;
      metaContainer.appendChild(linkSpan);
    }

    if (item.status === "done" && item.done_by_email) {
      const doneBy = document.createElement("span");
      doneBy.className = "meta-pill text-zinc-500 border-zinc-700/30";
      doneBy.innerHTML = `<i class="ph-fill ph-check-circle"></i> ${item.done_by_email.split('@')[0]}`;
      metaContainer.appendChild(doneBy);
    }

    if (metaContainer.hasChildNodes()) viewState.appendChild(metaContainer);

    // --- EDIT STATE CONTAINER ---
    const editState = document.createElement("div");
    editState.className = "hidden flex-1 flex-col gap-3 w-full";

    const editInput = document.createElement("textarea");
    editInput.className = "w-full bg-[#09090b] border border-indigo-500/50 rounded-xl p-3 text-sm text-zinc-100 outline-none focus:border-indigo-400 resize-y min-h-[80px] shadow-inner";
    editInput.value = item.task;

    const editControlsRow = document.createElement("div");
    editControlsRow.className = "flex gap-2 items-center flex-wrap justify-end mt-1";

    const editPriority = document.createElement("select");
    editPriority.className = "bg-[#09090b] border border-white/10 rounded-lg text-xs font-medium text-zinc-300 px-3 py-2 outline-none cursor-pointer appearance-none";
    editPriority.innerHTML = `
      <option value="low" ${item.priority === "low" ? "selected" : ""}>Low Priority</option>
      <option value="medium" ${!item.priority || item.priority === "medium" ? "selected" : ""}>Medium Priority</option>
      <option value="high" ${item.priority === "high" ? "selected" : ""}>High Priority</option>
    `;

    const editDate = document.createElement("input");
    editDate.type = "date";
    editDate.className = "bg-[#09090b] border border-white/10 rounded-lg text-xs font-medium text-zinc-300 px-3 py-2 outline-none cursor-pointer [color-scheme:dark]";
    editDate.value = item.due_date || "";

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className = "text-zinc-400 hover:text-zinc-200 font-medium text-xs px-4 py-2 transition-colors";
    cancelEditBtn.innerText = "Cancel";

    const saveEditBtn = document.createElement("button");
    saveEditBtn.className = "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors shadow-sm";
    saveEditBtn.innerText = "Save";

    editControlsRow.append(editPriority, editDate, cancelEditBtn, saveEditBtn);
    editState.append(editInput, editControlsRow);

    // --- ACTION BUTTONS ---
    const controls = document.createElement("div");
    controls.className = "flex items-center gap-2 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300";

    const isPending = item.status === "pending";

    const toggleBtn = document.createElement("button");
    toggleBtn.innerHTML = isPending ? `<i class="ph-bold ph-check text-lg"></i>` : `<i class="ph-bold ph-arrow-counter-clockwise text-lg"></i>`;
    toggleBtn.className = `w-10 h-10 rounded-xl transition-all transform hover:scale-110 flex items-center justify-center shadow-lg ${isPending ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:shadow-emerald-500/30" : "bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white"
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
    editBtn.innerHTML = `<i class="ph-bold ph-pencil-simple text-lg"></i>`;
    editBtn.className = "w-10 h-10 rounded-xl bg-white/5 text-zinc-400 hover:bg-blue-500 hover:text-white hover:shadow-blue-500/30 hover:scale-110 transition-all shadow-lg flex items-center justify-center";
    editBtn.title = "Edit Task";

    editBtn.onclick = () => {
      viewState.classList.add("hidden");
      controls.classList.add("hidden");
      editState.classList.remove("hidden");
      editState.classList.add("flex");
      li.classList.remove("hover:bg-[#121214]"); // Lock background
    };

    cancelEditBtn.onclick = () => {
      editState.classList.remove("flex");
      editState.classList.add("hidden");
      viewState.classList.remove("hidden");
      controls.classList.remove("hidden");
      li.classList.add("hover:bg-[#121214]");
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
    deleteBtn.innerHTML = `<i class="ph-bold ph-trash text-lg"></i>`;
    deleteBtn.className = "w-10 h-10 rounded-xl bg-white/5 text-zinc-400 hover:bg-rose-500 hover:text-white hover:shadow-rose-500/30 hover:scale-110 transition-all shadow-lg flex items-center justify-center";
    deleteBtn.title = "Delete Task";

    deleteBtn.onclick = async () => {
      if (confirm("Are you sure you want to delete this task?")) {
        const { error } = await supabase.from("tasks").delete().eq("id", item.id);
        if (error) {
          alert("Failed to delete: " + error.message);
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
      <div class="flex flex-col items-center justify-center py-16 text-zinc-500 animate-task">
        <i class="ph-thin ph-check-circle text-5xl mb-3 opacity-20"></i>
        <p class="text-xs font-semibold tracking-wide uppercase">Inbox Zero</p>
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
  .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
    loadTasks();
  })
  .subscribe();

// Init
checkSession();