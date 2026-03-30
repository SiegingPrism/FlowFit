(async () => {
  const STORAGE_KEY = "flowsphere.app.v1";
  const DEFAULT_STATE = {
    tasks: {},
    habits: {},
    connectedApps: {
      googleFit: false,
      gmailSend: false,
      gmailReadOnly: false,
    },
    reviews: {
      daily: null,
      weekly: null,
    },
    profile: {
      name: "Alex Johnson",
      role: "Professional",
    },
    theme: "neon-dark",
    stats: {
      workoutsLogged: 0,
      focusMinutes: 75,
    },
  };

  const state = await loadState();
  ensureToastWrap();
  applyTheme();
  wireGlobalActions();
  syncGreetingDate();
  initializeProfile();
  initializeDashboardTasks();
  initializeTaskCards();
  initializeHabitRows();
  initializeAddTaskButtons();
  initializeTaskSubpages();
  initializeInsightsReviewForms();
  initializeSettingsSwitches();
  initializeQuickHealthLog();
  initializeThemePage();
  initializeProfileEditor();
  refreshDashboardSummaries();

  async function loadState() {
    try {
      let remoteState = null;
      let currentUser = null;

      if (window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session && session.user) {
          currentUser = session.user;
          const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('app_state')
            .eq('id', session.user.id)
            .single();
            
          if (!error && data && data.app_state) {
            remoteState = data.app_state;
          }
        }
      }

      // Case 1: Existing logged-in user with remote state
      if (remoteState) {
        return mergeDeep(structuredClone(DEFAULT_STATE), remoteState);
      }

      const finalState = structuredClone(DEFAULT_STATE);

      // Case 2: Brand new user (first time logging in)
      if (currentUser) {
        // Clear local storage so they don't see the previous user's local tasks
        localStorage.removeItem(STORAGE_KEY);

        // Customize the dashboard using their email handle
        if (currentUser.email) {
           const namePart = currentUser.email.split('@')[0];
           finalState.profile.name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
        finalState.profile.role = "New Member";
        
        // Give them some default onboarding tasks
        finalState.tasks = {
          "welcome": { title: "Welcome to FlowSphere!", completed: false, createdAt: new Date().toISOString(), duration: 5, priority: "Urgent" },
          "setup-profile": { title: "Go to Settings and complete your profile", completed: false, createdAt: new Date().toISOString(), duration: 15, priority: "High" }
        };

        // Create their remote state baseline so it persists
        if (window.supabaseClient) saveStateToSupabase(finalState);
        return finalState;
      }

      // Case 3: Offline fallback / Unathenticated dev mode
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return finalState;
      
      const merged = mergeDeep(finalState, JSON.parse(raw));
      if (window.supabaseClient) saveStateToSupabase(merged);
      return merged;
    } catch (_e) {
      console.error("Error loading state:", _e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  let saveTimeout = null;
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    
    // Sync to Supabase debounced
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveStateToSupabase(state);
    }, 1500);
  }

  async function saveStateToSupabase(currentState) {
    if (!window.supabaseClient) return;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session || !session.user) return;
    
    const { error } = await window.supabaseClient
      .from('profiles')
      .update({ app_state: currentState })
      .eq('id', session.user.id);
      
    if (error) console.error("Error syncing to Supabase:", error);
  }

  function mergeDeep(base, incoming) {
    if (!incoming || typeof incoming !== "object") return base;
    Object.keys(incoming).forEach((key) => {
      if (
        incoming[key] &&
        typeof incoming[key] === "object" &&
        !Array.isArray(incoming[key]) &&
        base[key] &&
        typeof base[key] === "object"
      ) {
        base[key] = mergeDeep(base[key], incoming[key]);
      } else {
        base[key] = incoming[key];
      }
    });
    return base;
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function ensureToastWrap() {
    if (document.querySelector(".toast-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }

  function toast(message) {
    const wrap = document.querySelector(".toast-wrap");
    if (!wrap) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    wrap.appendChild(item);
    requestAnimationFrame(() => item.classList.add("show"));
    window.setTimeout(() => item.classList.remove("show"), 1700);
    window.setTimeout(() => item.remove(), 2100);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
  }

  function syncGreetingDate() {
    const greetingDate = document.querySelector(".greeting-date");
    if (greetingDate) {
      const now = new Date();
      greetingDate.textContent = now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }

    const greeting = document.querySelector(".greeting");
    if (greeting) {
      const hour = new Date().getHours();
      let timeOfDay = "evening";
      if (hour < 12) timeOfDay = "morning";
      else if (hour < 17) timeOfDay = "afternoon";
      const userFirstName = state.profile.name.split(' ')[0] || "User";
      greeting.innerHTML = `Good ${timeOfDay}, ${escapeHtml(userFirstName)}! <span style="font-size: 1.1em">👋</span>`;
    }
  }

  function initializeDashboardTasks() {
    const container = document.getElementById("dashboard-tasks-container");
    if (!container) return;
    
    // Get top 3 pending tasks from personalized state
    const allTasks = Object.entries(state.tasks).map(([id, value]) => ({ id, ...value }));
    const tasksToRender = allTasks.filter(task => !task.completed).slice(0, 3);
    
    container.innerHTML = "";
    if (!tasksToRender.length) {
      container.innerHTML = `<p class="muted" style="margin-top: 10px;">You're all caught up! Use + Add to create a priority task.</p>`;
      return;
    }

    tasksToRender.forEach(task => {
      const isUrgent = String(task.priority).toLowerCase() === "urgent";
      const card = document.createElement("article");
      card.className = "task-card";
      card.dataset.taskId = task.id;
      card.style.setProperty("--strip", isUrgent ? "var(--red)" : "var(--accent)");
      
      card.innerHTML = `
        <div>
          <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
          <p class="task-card__desc">${escapeHtml(task.priority || "Medium")} priority task</p>
          <div class="task-meta">
            <span>📅 ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span>⏱ ${escapeHtml(task.duration || "30")}m</span>
            <span class="pill">${escapeHtml(task.priority || "Medium")}</span>
            <span class="pill">Planned</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          ${isUrgent ? '<span class="badge badge--red">Urgent</span>' : ''}
          <span class="checkbox-ring" role="button" tabindex="0" aria-label="Toggle ${escapeHtml(task.title)}"></span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function initializeProfile() {
    const nameNodes = document.querySelectorAll(".settings-profile p");
    if (nameNodes.length >= 2) {
      nameNodes[0].textContent = state.profile.name;
      nameNodes[1].textContent = state.profile.role;
    }

    const avatar = document.querySelector(".avatar-lg");
    if (avatar) {
      avatar.textContent = state.profile.name.charAt(0).toUpperCase();
    }
  }

  function initializeProfileEditor() {
    const nameInput = document.querySelector("#profile-name");
    const roleInput = document.querySelector("#profile-role");
    const saveButton = document.querySelector('[data-action="save-profile"]');
    if (!nameInput || !roleInput || !saveButton) return;

    nameInput.value = state.profile.name;
    roleInput.value = state.profile.role;
    saveButton.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const role = roleInput.value.trim();
      if (!name) {
        toast("Name is required.");
        return;
      }
      state.profile.name = name;
      state.profile.role = role || "Professional";
      saveState();
      toast("Profile updated");
    });
  }

  function initializeThemePage() {
    const buttons = Array.from(document.querySelectorAll("[data-theme-select]"));
    if (!buttons.length) return;
    buttons.forEach((button) => {
      button.classList.toggle("btn--primary", button.dataset.themeSelect === state.theme);
      button.classList.toggle("btn--ghost", button.dataset.themeSelect !== state.theme);
      button.addEventListener("click", () => {
        const nextTheme = button.dataset.themeSelect;
        state.theme = nextTheme;
        applyTheme();
        saveState();
        buttons.forEach((item) => {
          item.classList.toggle("btn--primary", item.dataset.themeSelect === nextTheme);
          item.classList.toggle("btn--ghost", item.dataset.themeSelect !== nextTheme);
        });
        toast(`Theme set to ${nextTheme.replace("-", " ")}`);
      });
    });
  }

  function wireGlobalActions() {
    document.querySelectorAll('a[aria-label="Notifications"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        toast("No new notifications");
      });
    });

    const connectGoogleButton = Array.from(document.querySelectorAll(".btn")).find(
      (btn) => btn.textContent.trim() === "Connect"
    );
    if (connectGoogleButton) {
      connectGoogleButton.addEventListener("click", () => {
        toast("Google connection flow will be wired to OAuth in production.");
      });
    }

    const quickActionButtons = Array.from(document.querySelectorAll(".btn.btn--ghost")).filter(
      (btn) => /fetch steps|send test email/i.test(btn.textContent)
    );
    quickActionButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        toast(btn.textContent.includes("Fetch") ? "Pulled latest steps." : "Test email sent.");
      });
    });

    const removeButtons = document.querySelectorAll('.schedule-card .icon-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.schedule-card');
        if (card) {
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 200);
          toast("Event removed from schedule.");
        }
      });
    });

    const logFab = Array.from(document.querySelectorAll(".fab")).find(b => b.textContent.trim() === "Log");
    if (logFab) {
      logFab.addEventListener('click', () => {
        state.stats.workoutsLogged += 1;
        saveState();
        refreshWorkoutNodes();
        toast("Quick Log added!");
      });
    }

    const claimButtons = Array.from(document.querySelectorAll(".btn")).filter(b => b.textContent.includes("Claim"));
    claimButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.disabled && btn.textContent.includes("Claim")) {
          toast("Rewards claimed! XP and Coins added.");
          btn.disabled = true;
          btn.textContent = "✓ Claimed";
        }
      });
    });
  }

  function initializeTaskCards() {
    const cards = Array.from(document.querySelectorAll(".task-card"));
    if (!cards.length) return;

    cards.forEach((card) => {
      const titleNode = card.querySelector(".task-card__title");
      if (!titleNode) return;

      const id = slugify(titleNode.textContent);
      card.dataset.taskId = id;
      if (!(id in state.tasks)) {
        state.tasks[id] = {
          title: titleNode.textContent.trim(),
          completed: false,
          createdAt: new Date().toISOString(),
        };
      }

      if (state.tasks[id].completed) card.classList.add("is-complete");

      const checkbox = card.querySelector(".checkbox-ring");
      if (!checkbox) return;
      checkbox.setAttribute("role", "button");
      checkbox.setAttribute("tabindex", "0");
      checkbox.setAttribute("aria-label", `Toggle ${titleNode.textContent}`);

      const toggle = () => {
        state.tasks[id].completed = !state.tasks[id].completed;
        card.classList.toggle("is-complete", state.tasks[id].completed);
        saveState();
        refreshDashboardSummaries();
      };

      checkbox.addEventListener("click", toggle);
      checkbox.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });

    saveState();
  }

  function initializeHabitRows() {
    const rows = Array.from(document.querySelectorAll(".habit-row"));
    if (!rows.length) return;

    rows.forEach((row) => {
      const title = row.querySelector("strong")?.textContent.trim();
      if (!title) return;
      const id = slugify(title);
      row.dataset.habitId = id;

      if (!(id in state.habits)) {
        state.habits[id] = { name: title, completed: true };
      }

      row.classList.toggle("is-complete", state.habits[id].completed);

      row.addEventListener("click", () => {
        state.habits[id].completed = !state.habits[id].completed;
        row.classList.toggle("is-complete", state.habits[id].completed);
        saveState();
        refreshDashboardSummaries();
      });
    });

    saveState();
  }

  function initializeAddTaskButtons() {
    const addButtons = Array.from(document.querySelectorAll(".fab, .btn")).filter((button) =>
      /^\+\s*add$/i.test(button.textContent.trim())
    );
    if (!addButtons.length) return;

    addButtons.forEach((button) => {
      button.addEventListener("click", () => {
        openAddTaskModal();
      });
    });
  }

  function openAddTaskModal() {
    let backdrop = document.getElementById('add-task-modal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'add-task-modal';
      backdrop.className = 'modal-backdrop';
      backdrop.style.display = 'none';
      backdrop.innerHTML = `
        <div class="modal-backdrop__hit" aria-label="Close modal"></div>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-task-title">
          <h3 id="add-task-title" style="margin: 0 0 16px; font-size: 1.1rem;">Add New Task</h3>
          <input type="text" id="add-task-name" class="input-dark" placeholder="Task title" />
          
          <div class="slider-row" style="margin-top: 12px; margin-bottom: 12px;">
            <label style="display:block; font-size:0.82rem; color:var(--text-muted); margin-bottom:8px;">Duration (minutes)</label>
            <input type="number" id="add-task-duration" class="input-dark" value="30" />
          </div>
          
          <div class="slider-row" style="margin-bottom: 20px;">
            <label style="display:block; font-size:0.82rem; color:var(--text-muted); margin-bottom:8px;">Priority</label>
            <select id="add-task-priority" class="input-dark" style="appearance: none;">
              <option value="Low">Low</option>
              <option value="Medium" selected>Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          
          <div class="btn-row" style="display: flex; gap: 10px;">
            <button type="button" class="btn btn--ghost" id="add-task-cancel" style="flex: 1;">Cancel</button>
            <button type="button" class="btn btn--primary" id="add-task-save" style="flex: 1;">Save Task</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      
      backdrop.querySelector('.modal-backdrop__hit').addEventListener('click', closeAddTaskModal);
      backdrop.querySelector('#add-task-cancel').addEventListener('click', closeAddTaskModal);
      
      backdrop.querySelector('#add-task-save').addEventListener('click', () => {
        const title = document.getElementById('add-task-name').value.trim();
        const duration = document.getElementById('add-task-duration').value.trim() || "30";
        const priority = document.getElementById('add-task-priority').value;
        
        if (!title) {
          toast("Task title is required");
          return;
        }
        
        const id = slugify(`${title}-${Date.now()}`);
        state.tasks[id] = {
          title: title,
          completed: false,
          createdAt: new Date().toISOString(),
          duration,
          priority,
        };
        saveState();
        toast("Task added");

        if (location.pathname.endsWith("tasks.html") || location.pathname.endsWith("index.html") || location.pathname.endsWith("/")) {
          appendTaskCardToTasksPage(state.tasks[id], id);
        }
        refreshDashboardSummaries();
        closeAddTaskModal();
      });
    }
    
    document.getElementById('add-task-name').value = '';
    document.getElementById('add-task-duration').value = '30';
    document.getElementById('add-task-priority').value = 'Medium';
    backdrop.style.display = 'flex';
    setTimeout(() => document.getElementById('add-task-name').focus(), 50);
  }

  function closeAddTaskModal() {
    const backdrop = document.getElementById('add-task-modal');
    if (backdrop) {
      backdrop.style.display = 'none';
    }
  }

  function appendTaskCardToTasksPage(task, id) {
    const main = document.querySelector("main");
    if (!main) return;

    const card = document.createElement("article");
    card.className = "task-card";
    card.dataset.taskId = id;
    card.style.setProperty("--strip", "var(--accent)");
    card.innerHTML = `
      <div>
        <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
        <p class="task-card__desc">Added from quick capture</p>
        <div class="task-meta">
          <span>📅 ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span>⏱ ${escapeHtml(task.duration || "30")}m</span>
          <span class="pill">${escapeHtml(task.priority || "Medium")}</span>
          <span class="pill">Planned</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
        <span class="badge badge--green">${escapeHtml(task.priority || "Medium")}</span>
        <span class="checkbox-ring" role="button" tabindex="0" aria-label="Toggle ${escapeHtml(task.title)}"></span>
      </div>
    `;
    
    // Find where to insert it. If there's a section title for Tasks/Priorities, put it after. 
    // Otherwise just append to main.
    const sections = Array.from(document.querySelectorAll('.section-title'));
    const prioritySection = sections.find(s => s.textContent.includes('Priorities') || s.textContent.includes('Tasks'));
    
    if (prioritySection && prioritySection.nextElementSibling) {
       main.insertBefore(card, prioritySection.nextElementSibling);
    } else {
       main.appendChild(card);
    }
    
    initializeTaskCards();
  }

  function initializeTaskSubpages() {
    const path = location.pathname.split("/").pop() || "";
    const isSubPage = ["tasks-inbox.html", "tasks-today.html", "tasks-upcoming.html", "tasks-projects.html"].includes(path);
    if (!isSubPage) return;

    const main = document.querySelector("main");
    const hint = main?.querySelector("p.muted");
    if (!main || !hint) return;

    const allTasks = Object.entries(state.tasks).map(([id, value]) => ({ id, ...value }));
    let tasksToRender = allTasks;
    if (path === "tasks-today.html") {
      tasksToRender = allTasks.filter((task) => !task.completed).slice(0, 5);
    } else if (path === "tasks-upcoming.html") {
      tasksToRender = allTasks.filter((task) => !task.completed).slice(0, 8);
    } else if (path === "tasks-projects.html") {
      tasksToRender = allTasks.filter((task) => /design|review|presentation|project|build/i.test(task.title));
    }

    if (!tasksToRender.length) {
      hint.textContent = "No tasks yet. Use + Add from Today or Tasks to create one.";
      return;
    }

    hint.remove();
    tasksToRender.slice(0, 8).forEach((task) => appendTaskCardToSubPage(main, task));
    initializeTaskCards();
  }

  function appendTaskCardToSubPage(main, task) {
    const id = task.id || slugify(task.title);
    const card = document.createElement("article");
    card.className = "task-card";
    card.dataset.taskId = id;
    card.style.setProperty("--strip", task.completed ? "var(--text-dim)" : "var(--accent)");
    card.innerHTML = `
      <div>
        <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
        <p class="task-card__desc">${task.completed ? "Completed" : "Pending"}</p>
        <div class="task-meta">
          <span>⏱ ${escapeHtml(task.duration || "30")}m</span>
          <span class="pill">${escapeHtml(task.priority || "Medium")}</span>
          <span class="pill">${task.completed ? "Done" : "Planned"}</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
        <span class="badge ${task.completed ? "badge--outline" : "badge--green"}">${task.completed ? "Done" : "Open"}</span>
        <span class="checkbox-ring"></span>
      </div>
    `;
    if (task.completed) card.classList.add("is-complete");
    main.appendChild(card);
  }

  function initializeInsightsReviewForms() {
    const dailyModal = document.querySelector("#daily-review");
    const weeklyModal = document.querySelector("#weekly-review");

    if (dailyModal) {
      const saveButton = Array.from(dailyModal.querySelectorAll("button")).find((button) =>
        /save/i.test(button.textContent)
      );
      if (saveButton) {
        saveButton.addEventListener("click", () => {
          const ranges = dailyModal.querySelectorAll('input[type="range"]');
          const text = dailyModal.querySelectorAll('input[type="text"]');
          state.reviews.daily = {
            energy: Number(ranges[0]?.value || 0),
            mood: Number(ranges[1]?.value || 0),
            biggestWin: text[0]?.value?.trim() || "",
            obstacle: text[1]?.value?.trim() || "",
            adjustment: text[2]?.value?.trim() || "",
            updatedAt: new Date().toISOString(),
          };
          saveState();
          location.hash = "";
          toast("Daily review saved");
        });
      }
      hydrateReviewInputs(dailyModal, state.reviews.daily);
    }

    if (weeklyModal) {
      const saveButton = Array.from(weeklyModal.querySelectorAll("button")).find((button) =>
        /save/i.test(button.textContent)
      );
      if (saveButton) {
        saveButton.addEventListener("click", () => {
          const text = weeklyModal.querySelectorAll('input[type="text"]');
          state.reviews.weekly = {
            highlight: text[0]?.value?.trim() || "",
            lesson: text[1]?.value?.trim() || "",
            focus: text[2]?.value?.trim() || "",
            adjustment: text[3]?.value?.trim() || "",
            updatedAt: new Date().toISOString(),
          };
          saveState();
          location.hash = "";
          toast("Weekly review saved");
        });
      }
      hydrateReviewInputs(weeklyModal, state.reviews.weekly);
    }
  }

  function hydrateReviewInputs(container, values) {
    if (!container || !values) return;
    const rangeInputs = container.querySelectorAll('input[type="range"]');
    const textInputs = container.querySelectorAll('input[type="text"]');
    if ("energy" in values && rangeInputs[0]) rangeInputs[0].value = values.energy;
    if ("mood" in values && rangeInputs[1]) rangeInputs[1].value = values.mood;
    if ("biggestWin" in values && textInputs[0]) textInputs[0].value = values.biggestWin;
    if ("obstacle" in values && textInputs[1]) textInputs[1].value = values.obstacle;
    if ("adjustment" in values && textInputs[2]) textInputs[2].value = values.adjustment;
    if ("highlight" in values && textInputs[0]) textInputs[0].value = values.highlight;
    if ("lesson" in values && textInputs[1]) textInputs[1].value = values.lesson;
    if ("focus" in values && textInputs[2]) textInputs[2].value = values.focus;
    if ("adjustment" in values && textInputs[3]) textInputs[3].value = values.adjustment;
  }

  function initializeSettingsSwitches() {
    const switches = Array.from(document.querySelectorAll('[role="switch"]'));
    if (!switches.length) return;

    const keys = ["googleFit", "gmailSend", "gmailReadOnly"];
    switches.forEach((button, index) => {
      const key = keys[index];
      if (!key) return;
      setSwitchVisualState(button, Boolean(state.connectedApps[key]));
      button.addEventListener("click", () => {
        state.connectedApps[key] = !state.connectedApps[key];
        setSwitchVisualState(button, state.connectedApps[key]);
        saveState();
      });
    });
  }

  function setSwitchVisualState(button, on) {
    button.setAttribute("aria-checked", on ? "true" : "false");
    button.classList.toggle("is-on", on);
    button.textContent = on ? "●" : "○";
  }

  function initializeQuickHealthLog() {
    const quickLogButton = Array.from(document.querySelectorAll(".btn")).find((button) =>
      /quick log/i.test(button.textContent)
    );
    if (!quickLogButton) return;

    quickLogButton.addEventListener("click", () => {
      state.stats.workoutsLogged += 1;
      saveState();
      refreshWorkoutNodes();
      toast("Workout logged");
    });
    refreshWorkoutNodes();
  }

  function refreshWorkoutNodes() {
    const nodes = Array.from(document.querySelectorAll("strong")).filter((node) =>
      /workouts?/i.test(node.textContent)
    );
    nodes.forEach((node) => {
      node.textContent = `${state.stats.workoutsLogged} Workouts`;
    });
  }

  function refreshDashboardSummaries() {
    const tasks = Object.values(state.tasks);
    const habits = Object.values(state.habits);
    const completedTasks = tasks.filter((task) => task.completed).length;
    const completedHabits = habits.filter((habit) => habit.completed).length;

    const quickWinsBadge = Array.from(document.querySelectorAll(".quest-card")).find((card) =>
      /quick wins/i.test(card.textContent)
    )?.querySelector(".badge");
    if (quickWinsBadge) {
      quickWinsBadge.textContent = `🚩 ${Math.min(completedTasks, 3)}/3`;
    }

    const keepChainCard = Array.from(document.querySelectorAll(".quest-card")).find((card) =>
      /keep the chain/i.test(card.textContent)
    );
    if (keepChainCard) {
      const fill = keepChainCard.querySelector(".progress-bar__fill");
      const claimButton = keepChainCard.querySelector(".btn");
      const percent = Math.min(100, Math.round((completedHabits / 3) * 100));
      if (fill) fill.style.width = `${percent}%`;
      if (claimButton) {
        claimButton.disabled = completedHabits < 3;
        claimButton.textContent = completedHabits >= 3 ? "🎁 Claim" : `🎯 ${completedHabits}/3`;
      }
    }

    const statsValues = Array.from(document.querySelectorAll("p, strong")).filter((el) =>
      /(Task Completion|Orphan Tasks|Productivity \(7d\))/i.test(el.textContent)
    );
    statsValues.forEach((node) => {
      const parent = node.parentElement;
      if (!parent) return;
      const value = parent.querySelector("strong");
      if (!value) return;
      if (/Task Completion/i.test(node.textContent)) {
        const total = tasks.length || 1;
        value.textContent = `${Math.round((completedTasks / total) * 100)}%`;
      }
      if (/Orphan Tasks/i.test(node.textContent)) {
        const orphan = tasks.filter((task) => !task.completed).length;
        value.textContent = String(orphan);
      }
      if (/Productivity \(7d\)/i.test(node.textContent)) {
        const productivity = Math.max(1, Math.round((completedTasks + completedHabits) / 2));
        value.textContent = String(productivity);
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
