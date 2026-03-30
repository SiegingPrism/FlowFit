(async () => {
  const STORAGE_KEY = "flowsphere.app.v1";
  const DEFAULT_STATE = {
    tasks: {},
    habits: {},
    templates: {
      "push-1": { name: "Push", details: "4 exercises · PPL" },
      "pull-1": { name: "Pull", details: "4 exercises · PPL" },
      "legs-1": { name: "Legs", details: "4 exercises · PPL" },
    },
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
      focusSessions: 2,
    },
  };

  if (window.supabaseClient) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const isAuthPage = location.pathname.endsWith('login.html') || location.pathname.endsWith('signup.html');
    if (!session && !isAuthPage) {
      window.location.replace('login.html');
      return;
    }
  }

  const state = await loadState();
  ensureToastWrap();
  applyTheme();
  wireGlobalActions();
  syncGreetingDate();
  initializeProfile();
  initializeDashboardTasks();
  initializeDashboardHabits();
  initializeHealthTemplates();
  initializeHealthPage();
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
          <div style="display: flex; align-items: center; gap: 12px; justify-content: flex-end;">
            <button class="icon-btn del-task-btn" style="color: var(--red); padding: 4px;" aria-label="Delete">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            <span class="checkbox-ring" role="button" tabindex="0" aria-label="Toggle ${escapeHtml(task.title)}"></span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function calculateRole() {
    const ts = Object.values(state.tasks).filter(t => t.completed).length;
    const hs = Object.values(state.habits).filter(h => h.completed).length;
    const total = ts + hs;
    if (total < 5) return "New Member";
    if (total < 15) return "Rookie";
    if (total < 35) return "Explorer";
    if (total < 75) return "Achiever";
    return "Master";
  }

  function initializeProfile() {
    state.profile.role = calculateRole(); // Compute dynamic role based on dedication

    const nameNodes = document.querySelectorAll(".settings-profile p");
    if (nameNodes.length >= 2) {
      nameNodes[0].textContent = state.profile.name;
      nameNodes[1].textContent = state.profile.role;
    }

    const avatars = document.querySelectorAll(".avatar-lg");
    avatars.forEach(avatar => {
      if (state.profile.avatarImage) {
        avatar.innerHTML = `<img src="${state.profile.avatarImage}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-round);">`;
        avatar.style.border = "none";
        avatar.style.background = "transparent";
      } else {
        avatar.innerHTML = "";
        avatar.textContent = state.profile.name.charAt(0).toUpperCase();
        avatar.style.border = "";
        avatar.style.background = "";
      }
    });
  }

  function initializeProfileEditor() {
    const nameInput = document.querySelector("#profile-name");
    const saveButton = document.querySelector('[data-action="save-profile"]');
    if (!nameInput || !saveButton) return;

    nameInput.value = state.profile.name;

    const fileInput = document.getElementById("profile-avatar-upload");
    const preview = document.getElementById("profile-avatar-preview");
    
    if (preview) {
      if (state.profile.avatarImage) {
        preview.innerHTML = `<img src="${state.profile.avatarImage}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-round);">`;
        preview.style.border = "none";
        preview.style.background = "transparent";
      } else {
        preview.textContent = state.profile.name.charAt(0).toUpperCase();
      }
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          state.profile.avatarImage = re.target.result;
          if (preview) {
             preview.innerHTML = `<img src="${state.profile.avatarImage}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-round);">`;
             preview.style.border = "none";
             preview.style.background = "transparent";
          }
        };
        reader.readAsDataURL(file);
      });
    }

    saveButton.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) {
        toast("Name is required.");
        return;
      }
      state.profile.name = name;
      
      saveState();
      toast("Profile updated successfully!");
      setTimeout(() => {
        window.location.href = "settings.html";
      }, 700);
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
    document.addEventListener("click", (e) => {
      // Handle links
      const link = e.target.closest('a[aria-label="Notifications"]');
      if (link) {
        e.preventDefault();
        toast("No new notifications");
        return;
      }

      // Handle standard buttons & FABs globally
      const btn = e.target.closest('.btn, .fab');
      if (e.target.closest('.schedule-card')) {
        const scheduleCard = e.target.closest('.schedule-card');
        if (e.target.closest('.icon-btn')) {
           scheduleCard.remove();
        } else {
           openPomodoroModal();
        }
        return;
      }
      if (btn) {
        const txt = btn.textContent.trim().toLowerCase();

        // Specific named button actions
        if (txt === "plan") {
          const tmplName = btn.dataset.plan || "Workout";
          const id = slugify(`plan-${tmplName}-${Date.now()}`);
          if (!state.tasks) state.tasks = {};
          state.tasks[id] = {
            title: `Log ${tmplName} Workout`,
            completed: false,
            createdAt: new Date().toISOString(),
            priority: "Medium",
            duration: "60"
          };
          saveState();
          toast(`${tmplName} added to your Tasks!`);
          refreshDashboardSummaries();
          return;
        } else if (txt === "connect") {
          toast("Google connection flow will be wired to OAuth in production.");
          return;
        } else if (txt === "log" || txt === "+ log" || txt === "quick log") {
          // Both FAB and standard quick log buttons
          if (!state.stats) state.stats = { workoutsLogged: 0, focusMinutes: 75, water: 0, steps: 0, recentWorkouts: [] };
          state.stats.workoutsLogged = (parseInt(state.stats.workoutsLogged) || 0) + 1;
          if (!state.stats.recentWorkouts) state.stats.recentWorkouts = [];
          state.stats.recentWorkouts.unshift({ name: "Quick Workout", details: "Logged manually" });
          if (state.stats.recentWorkouts.length > 5) state.stats.recentWorkouts.pop();
          saveState();
          refreshWorkoutNodes();
          initializeHealthPage();
          toast("Workout logged!");
          return;
        } else if (txt === "+ drink" || txt === "drink") {
          if (!state.stats) state.stats = { workoutsLogged: 0, focusMinutes: 75, water: 0, steps: 0, recentWorkouts: [] };
          state.stats.water = parseFloat((state.stats.water || 0)) + 0.25;
          saveState();
          initializeHealthPage();
          toast("Drank 250ml of water 💧");
          return;
        } else if (txt === "+ add" || txt === "add") {
          openAddTaskModal();
          return;
        } else if (txt === "+ add habit" || txt === "add habit") {
          openAddHabitModal();
          return;
        } else if (btn.classList.contains("save-daily-btn") || txt === "💾 save") {
          const energy = document.getElementById("daily-energy-input")?.value || 50;
          const mood = document.getElementById("daily-mood-input")?.value || 50;
          if (!state.reviews) state.reviews = { daily: [] };
          if (!state.reviews.daily) state.reviews.daily = [];
          
          state.reviews.daily.push({
             date: new Date().toISOString(),
             energy: parseInt(energy),
             mood: parseInt(mood),
             win: document.getElementById("daily-win-input")?.value || "",
             obstacle: document.getElementById("daily-obstacle-input")?.value || "",
             adjust: document.getElementById("daily-adjust-input")?.value || "",
          });
          saveState();
          refreshDashboardSummaries();
          toast("Daily review saved!");
          location.hash = ""; 
          return;
        } else if (txt === "fetch steps" || txt === "send test email") {
          toast(txt.includes("fetch") ? "Pulled latest steps." : "Test email sent.");
          return;
        } else if (txt.includes("claim") && !btn.disabled) {
          toast("Rewards claimed! XP and Coins added.");
          btn.disabled = true;
          btn.textContent = "✓ Claimed";
          return;
        }
      }

      // Handle remove buttons
      const removeBtn = e.target.closest('.schedule-card .icon-btn');
      if (removeBtn) {
        const card = removeBtn.closest('.schedule-card');
        if (card) {
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 200);
          toast("Event removed from schedule.");
        }
        return;
      }
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

      const delTaskBtn = card.querySelector(".del-task-btn");
      if (delTaskBtn) {
        delTaskBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Delete this task?")) {
            delete state.tasks[id];
            saveState();
            initializeDashboardTasks();
            initializeTaskCards();
            refreshDashboardSummaries();
          }
        });
      }

      const delDashBtn = card.querySelector(".del-dash-task-btn");
      if (delDashBtn) {
        delDashBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Delete this task?")) {
            delete state.tasks[id];
            saveState();
            initializeDashboardTasks();
            initializeTaskCards();
            refreshDashboardSummaries();
          }
        });
      }

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
    const listContainer = document.getElementById("habits-list-page-container");
    if (!listContainer) return;

    listContainer.innerHTML = "";
    
    // Group habits by category
    const habitsList = Object.entries(state.habits || {}).map(([id, h]) => ({ id, ...h }));
    
    if (!habitsList.length) {
      listContainer.innerHTML = `<p class="muted" style="text-align: center; margin-top: 40px;">No habits yet. Click + Add Habit to start tracking!</p>`;
      return;
    }

    const categories = Array.from(new Set(habitsList.map(h => h.category || 'Personal')));
    
    categories.forEach(cat => {
      const catHabits = habitsList.filter(h => (h.category || 'Personal') === cat);
      if (!catHabits.length) return;
      
      const title = document.createElement('p');
      title.className = "cat-title";
      
      // Auto assign icon based on cat string
      const icon = cat.toLowerCase().includes('health') ? '❤️' : 
                   cat.toLowerCase().includes('work') ? '💼' :
                   cat.toLowerCase().includes('study') ? '🎓' : '👤';
                   
      title.textContent = `${icon} ${cat}`;
      listContainer.appendChild(title);
      
      catHabits.forEach(habit => {
        const row = document.createElement("article");
        row.className = `habit-row ${habit.completed ? 'is-complete' : ''}`;
        
        row.innerHTML = `
          <div class="habit-check">
            <svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style="flex: 1;">
            <strong>${escapeHtml(habit.name)}</strong>
            <p class="muted" style="margin: 6px 0 0; font-size: 0.78rem;">🔥 ${habit.streak || 0} day streak · Daily</p>
          </div>
          <button class="icon-btn" style="color: var(--red); padding: 4px;" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        `;
        
        const check = row.querySelector('.habit-check');
        check.addEventListener('click', (e) => {
           e.stopPropagation();
           state.habits[habit.id].completed = !state.habits[habit.id].completed;
           
           if (!state.habits[habit.id].baseStreak) state.habits[habit.id].baseStreak = state.habits[habit.id].streak || 0;
           
           if (state.habits[habit.id].completed) {
             state.habits[habit.id].streak = state.habits[habit.id].baseStreak + 1;
           } else {
             state.habits[habit.id].streak = state.habits[habit.id].baseStreak;
           }
           saveState();
           initializeHabitRows();
           initializeDashboardHabits();
           refreshDashboardSummaries();
        });
        
        const delBtn = row.querySelector('.icon-btn');
        delBtn.addEventListener('click', (e) => {
           e.stopPropagation();
           if (confirm("Delete this habit forever?")) {
              delete state.habits[habit.id];
              saveState();
              initializeHabitRows();
              initializeDashboardHabits();
              refreshDashboardSummaries();
           }
        });

        listContainer.appendChild(row);
      });
    });
  }

  function initializeAddTaskButtons() {
    // Disabled as it is now handled via global delegated events in wireGlobalActions()
  }

  function initializeDashboardHabits() {
    const container = document.getElementById("dashboard-habits-container");
    if (!container) return;
    
    container.innerHTML = "";
    const habitsList = Object.entries(state.habits).map(([id, val]) => ({ id, ...val }));
    
    if (!habitsList.length) {
      container.innerHTML = `<p class="muted" style="margin:0;font-size:0.8rem;">No habits tracked yet.</p>`;
      return;
    }

    habitsList.forEach(habit => {
      const span = document.createElement("span");
      span.className = habit.completed ? "badge badge--accent" : "badge badge--outline";
      span.style.padding = "8px 12px";
      span.style.cursor = "pointer";
      span.textContent = (habit.completed ? "✓ " : "○ ") + habit.name;
      
      span.addEventListener("click", () => {
        state.habits[habit.id].completed = !state.habits[habit.id].completed;
        saveState();
        initializeDashboardHabits();
        refreshDashboardSummaries();
      });
      container.appendChild(span);
    });
  }

  function initializeHealthTemplates() {
    const container = document.getElementById("templates-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    const addBtn = document.getElementById("add-template-btn");
    if (addBtn && !addBtn.dataset.wired) {
      addBtn.dataset.wired = "true";
      addBtn.addEventListener("click", () => openAddTemplateModal());
    }

    const tList = Object.entries(state.templates || {}).map(([id, t]) => ({ id, ...t }));
    if (!tList.length) {
      container.innerHTML = `<p class="muted" style="margin:0;font-size:0.8rem;">No templates yet.</p>`;
      return;
    }

    tList.forEach(t => {
      const row = document.createElement("div");
      row.className = "flex-between";
      row.style.padding = "10px 0";
      row.style.borderBottom = "1px solid var(--border)";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <p class="muted" style="margin: 4px 0 0; font-size: 0.78rem;">${escapeHtml(t.details)}</p>
        </div>
        <button type="button" class="btn btn--ghost" style="padding: 8px 14px; font-size: 0.8rem;" data-plan="${escapeHtml(t.name)}">Plan</button>
      `;
      container.appendChild(row);
    });
  }

  function initializeHealthPage() {
    const water = parseFloat(state.stats?.water || 0);
    const steps = state.stats?.steps || 0;
    const workouts = parseInt(state.stats?.workoutsLogged || 0);
    
    const stepEl1 = document.getElementById('gym-steps');
    if (stepEl1) stepEl1.textContent = `${steps} Steps`;
    
    const stepEl2 = document.getElementById('gym-steps-2');
    if (stepEl2) stepEl2.textContent = steps;
    
    const wEl1 = document.getElementById('gym-workouts');
    if (wEl1) wEl1.textContent = `${workouts} Workouts`;
    
    const wEl2 = document.getElementById('gym-workouts-2');
    if (wEl2) wEl2.textContent = workouts;
    
    const waterTexts = [document.getElementById('gym-water-text'), document.getElementById('gym-water-text-2')];
    waterTexts.forEach(el => {
      if (el) el.textContent = `${water.toFixed(1)}L / 2.5L`;
    });
    
    const waterBars = [document.getElementById('gym-water-bar'), document.getElementById('gym-water-bar-2')];
    const pct = Math.min(100, (water / 2.5) * 100);
    waterBars.forEach(el => {
      if (el) el.style.width = `${pct}%`;
    });
    
    const rwContainer = document.getElementById('recent-workouts-container');
    if (rwContainer) {
      rwContainer.innerHTML = '';
      const rw = state.stats?.recentWorkouts || [];
      if (!rw.length) {
        rwContainer.innerHTML = '<p class="muted" style="text-align: center; margin: 20px 0;">No workouts logged yet.</p>';
      } else {
        rw.forEach(w => {
          const div = document.createElement('div');
          div.className = 'flex-between';
          div.style.padding = '10px 0';
          div.style.borderBottom = '1px solid var(--border)';
          div.innerHTML = `<span>${escapeHtml(w.name)}</span><span class="muted">${escapeHtml(w.details)}</span>`;
          rwContainer.appendChild(div);
        });
        if (rwContainer.lastElementChild) {
          rwContainer.lastElementChild.style.borderBottom = 'none';
        }
      }
    }
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

  function openAddHabitModal() {
    let backdrop = document.getElementById('add-habit-modal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'add-habit-modal';
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-backdrop__hit" aria-label="Close dialog"></div>
        <div class="modal">
          <div class="modal__handle"></div>
          <div class="flex-between" style="margin-bottom: 24px;">
            <strong>Add New Habit</strong>
            <button class="icon-btn close-btn" style="width: 32px; height: 32px;" aria-label="Close">×</button>
          </div>
          <input class="input-dark" type="text" id="habit-name-input" placeholder="e.g., Read 10 pages" style="margin-bottom: 12px; font-size: 1.1rem; padding: 14px 16px;" autofocus />
          <select class="input-dark" id="habit-cat-select" style="margin-bottom: 16px;">
            <option value="Personal">Personal</option>
            <option value="Health">Health</option>
            <option value="Work">Work</option>
            <option value="Study">Study</option>
          </select>
          <button type="button" class="btn btn--primary btn--block save-btn" style="padding: 14px;">Create Habit</button>
        </div>
      `;
      document.body.appendChild(backdrop);
      
      backdrop.querySelector('.modal-backdrop__hit').addEventListener('click', () => backdrop.style.display = 'none');
      backdrop.querySelector('.close-btn').addEventListener('click', () => backdrop.style.display = 'none');
      
      backdrop.querySelector('.save-btn').addEventListener('click', () => {
         const name = document.getElementById('habit-name-input').value.trim();
         if (!name) return;
         const category = document.getElementById('habit-cat-select').value || "Personal";
         const id = slugify(name + '-' + Date.now());
         if (!state.habits) state.habits = {};
         state.habits[id] = { name, category, completed: false, streak: 0, baseStreak: 0 };
         saveState();
         initializeHabitRows();
         initializeDashboardHabits();
         refreshDashboardSummaries();
         toast("Habit added!");
         backdrop.style.display = 'none';
      });
    }
    
    document.getElementById('habit-name-input').value = '';
    backdrop.style.display = 'flex';
    setTimeout(() => document.getElementById('habit-name-input').focus(), 50);
  }

  function openAddTemplateModal() {
    let backdrop = document.getElementById('add-template-modal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'add-template-modal';
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-backdrop__hit" aria-label="Close dialog"></div>
        <div class="modal">
          <div class="modal__handle"></div>
          <div class="flex-between" style="margin-bottom: 24px;">
            <strong>Add Workout Template</strong>
            <button class="icon-btn close-btn" style="width: 32px; height: 32px;" aria-label="Close">×</button>
          </div>
          <input class="input-dark" type="text" id="template-name-input" placeholder="e.g., Full Body, Core" style="margin-bottom: 12px; font-size: 1.1rem; padding: 14px 16px;" autofocus />
          <input class="input-dark" type="text" id="template-details-input" placeholder="e.g., 5 exercises · Strength" style="margin-bottom: 16px; font-size: 1.1rem; padding: 14px 16px;" />
          <button type="button" class="btn btn--primary btn--block save-btn" style="padding: 14px;">Save Template</button>
        </div>
      `;
      document.body.appendChild(backdrop);
      
      backdrop.querySelector('.modal-backdrop__hit').addEventListener('click', () => backdrop.style.display = 'none');
      backdrop.querySelector('.close-btn').addEventListener('click', () => backdrop.style.display = 'none');
      
      backdrop.querySelector('.save-btn').addEventListener('click', () => {
         const name = document.getElementById('template-name-input').value.trim();
         if (!name) return;
         const details = document.getElementById('template-details-input').value.trim() || "Custom Workout";
         const id = slugify(`${name}-${Date.now()}`);
         if (!state.templates) state.templates = {};
         state.templates[id] = { name, details };
         saveState();
         toast("Template saved!");
         initializeHealthTemplates();
         backdrop.style.display = 'none';
      });
    }
    
    document.getElementById('template-name-input').value = '';
    document.getElementById('template-details-input').value = '';
    backdrop.style.display = 'flex';
    setTimeout(() => document.getElementById('template-name-input').focus(), 50);
  }

  let pomoInterval = null;
  let pomoSeconds = 25 * 60;

  function openPomodoroModal() {
    let backdrop = document.getElementById('pomodoro-modal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'pomodoro-modal';
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-backdrop__hit" aria-label="Close dialog"></div>
        <div class="modal" style="text-align: center;">
          <div class="modal__handle"></div>
          <div class="flex-between" style="margin-bottom: 24px;">
            <strong>🍅 Focus Timer</strong>
            <button class="icon-btn close-btn" style="width: 32px; height: 32px;" aria-label="Close">×</button>
          </div>
          <h1 id="pomo-time" style="font-size: 4rem; margin: 20px 0; font-family: monospace; color: var(--accent);">25:00</h1>
          <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
             <button type="button" id="pomo-start-btn" class="btn btn--primary" style="flex: 1;">Start Focus</button>
             <button type="button" id="pomo-reset-btn" class="btn btn--outline" style="flex: 1;">Reset</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      
      const timeDisplay = backdrop.querySelector('#pomo-time');
      const startBtn = backdrop.querySelector('#pomo-start-btn');
      const resetBtn = backdrop.querySelector('#pomo-reset-btn');
      
      const updateDisplay = () => {
         timeDisplay.textContent = `${String(Math.floor(pomoSeconds/60)).padStart(2,'0')}:${String(pomoSeconds%60).padStart(2,'0')}`;
      };
      
      backdrop.querySelector('.modal-backdrop__hit').addEventListener('click', () => backdrop.style.display = 'none');
      backdrop.querySelector('.close-btn').addEventListener('click', () => backdrop.style.display = 'none');
      
      startBtn.addEventListener('click', () => {
         if (startBtn.textContent === "Start Focus" || startBtn.textContent === "Resume") {
            startBtn.textContent = "Pause";
            pomoInterval = setInterval(() => {
               if (pomoSeconds > 0) {
                 pomoSeconds--;
                 updateDisplay();
               } else {
                 clearInterval(pomoInterval);
                 pomoInterval = null;
                 startBtn.textContent = "Start Focus";
                 toast("Session complete!");
                 
                 if (!state.stats) state.stats = { workoutsLogged: 0, focusMinutes: 0, focusSessions: 0 };
                 state.stats.focusSessions = (state.stats.focusSessions || 0) + 1;
                 state.stats.focusMinutes = (state.stats.focusMinutes || 0) + 25;
                 saveState();
                 refreshDashboardSummaries();
               }
            }, 1000);
         } else {
            clearInterval(pomoInterval);
            pomoInterval = null;
            startBtn.textContent = "Resume";
         }
      });
      
      resetBtn.addEventListener('click', () => {
         clearInterval(pomoInterval);
         pomoInterval = null;
         pomoSeconds = 25 * 60;
         startBtn.textContent = "Start Focus";
         updateDisplay();
      });
    }
    backdrop.style.display = 'flex';
  }

  function appendTaskCardToTasksPage(task, id) {
    const main = document.querySelector("main");
    if (!main) return;

    const isUrgent = String(task.priority).toLowerCase() === "urgent";
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
          ${isUrgent ? '<span class="badge badge--red">Urgent</span>' : ''}
          <div style="display: flex; align-items: center; gap: 12px; justify-content: flex-end;">
            <button class="icon-btn del-dash-task-btn" style="color: var(--red); padding: 4px;" aria-label="Delete">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            <span class="checkbox-ring" role="button" tabindex="0" aria-label="Toggle ${escapeHtml(task.title)}"></span>
          </div>
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

    const fSess = document.getElementById('insight-focus-sessions');
    if (fSess) fSess.textContent = state.stats?.focusSessions || 0;
    const fMin = document.getElementById('insight-focus-minutes');
    if (fMin) fMin.textContent = state.stats?.focusMinutes || 0;
    
    const donut = document.getElementById('insights-donut');
    if (donut) {
       let low = 0, med = 0, high = 0, urg = 0;
       Object.values(state.tasks).forEach(t => {
           if (t.completed) return;
           const p = (t.priority || "Medium").toLowerCase();
           if (p === 'low') low++;
           else if (p === 'high') high++;
           else if (p === 'urgent') urg++;
           else med++;
       });
       const tot = low + med + high + urg || 1; 
       
       const lEl = document.getElementById('leg-low');
       if(lEl) lEl.innerHTML = `<span class="legend-dot" style="background: #3d444d;"></span> Low (${low})`;
       const mEl = document.getElementById('leg-med');
       if(mEl) mEl.innerHTML = `<span class="legend-dot" style="background: var(--accent);"></span> Medium (${med})`;
       const hEl = document.getElementById('leg-high');
       if(hEl) hEl.innerHTML = `<span class="legend-dot" style="background: var(--orange);"></span> High (${high})`;
       const uEl = document.getElementById('leg-urg');
       if(uEl) uEl.innerHTML = `<span class="legend-dot" style="background: var(--red);"></span> Urgent (${urg})`;
       
       const pLow = (low / tot) * 100;
       const pMed = (med / tot) * 100;
       const pHigh = (high / tot) * 100;
       const pUrg = (urg / tot) * 100;
       
       donut.style.background = `conic-gradient(
         #3d444d 0% ${pLow}%, 
         var(--accent) ${pLow}% ${pLow + pMed}%, 
         var(--orange) ${pLow + pMed}% ${pLow + pMed + pHigh}%, 
         var(--red) ${pLow + pMed + pHigh}% 100%
       )`;
    }

    const statsValues = Array.from(document.querySelectorAll("p, strong")).filter((el) =>
      /(Task Completion|Orphan Tasks|Productivity \(7d\))/i.test(el.textContent)
    );

    const reviews = state.reviews?.daily || [];
    let avgMood = 0;
    let avgEnergy = 0;
    if (reviews.length > 0) {
       avgMood = reviews.reduce((acc, r) => acc + (r.mood || 50), 0) / reviews.length;
       avgEnergy = reviews.reduce((acc, r) => acc + (r.energy || 50), 0) / reviews.length;
    }
    const mEl = document.getElementById("insight-avg-mood");
    if (mEl) mEl.textContent = reviews.length ? (avgMood / 10).toFixed(1) : "--"; 
    const eEl = document.getElementById("insight-avg-energy");
    if (eEl) eEl.textContent = reviews.length ? Math.round(avgEnergy) + "%" : "--%";
    
    // Update habit stability percentage
    const hEl = document.getElementById("insight-habit-stability");
    if (hEl) {
       let tot = 0, comp = 0;
       Object.values(state.habits || {}).forEach(h => { tot++; if(h.completed) comp++; });
       hEl.textContent = tot > 0 ? Math.round((comp/tot)*100) + "%" : "--%";
    }
    
    // Wire index.html dashboard elements
    const dashSleep = document.getElementById("dash-sleep-val");
    if (dashSleep) dashSleep.textContent = state.stats?.sleep ? parseFloat(state.stats.sleep).toFixed(1) + "h" : "--";
    const dashSteps = document.getElementById("dash-steps-val");
    if (dashSteps) dashSteps.textContent = state.stats?.steps || "0";
    const dashWater = document.getElementById("dash-water-val");
    if (dashWater) dashWater.textContent = state.stats?.water ? parseFloat(state.stats.water).toFixed(1) + "L" : "0.0L";
    const dashMood = document.getElementById("dash-mood-val");
    if (dashMood) dashMood.textContent = reviews.length ? (avgMood / 10).toFixed(1) : "--";

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
