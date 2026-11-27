const STORAGE_KEYS = {
  tasks: "student-task-tracker.tasks.v1",
  subjects: "student-task-tracker.subjects.v1",
  theme: "student-task-tracker.theme.v1"
};

const PRIORITIES = {
  high: { label: "Высокий", rank: 3 },
  medium: { label: "Средний", rank: 2 },
  low: { label: "Низкий", rank: 1 }
};

const SUBJECT_COLORS = ["#4361ee", "#16a34a", "#e89a20", "#a855f7", "#0891b2", "#e35d7b"];
const VIEW_NAMES = {
  home: "Главная",
  all: "Все задачи",
  today: "Сегодня",
  upcoming: "Предстоящие",
  completed: "Выполненные",
  subjects: "Предметы",
  settings: "Настройки"
};

const pageContent = document.querySelector("#page-content");
const modalBackdrop = document.querySelector("#modal-backdrop");
const taskDetails = document.querySelector("#task-details");
const taskForm = document.querySelector("#task-form");
const toastElement = document.querySelector("#toast");
const today = dateToInputValue(new Date());
let currentView = "home";
let toastTimer;
let filterState = { search: "", subject: "", priority: "", status: "", sort: "date" };

const defaultSubjects = ["Программирование", "Математика", "История", "Английский язык", "Информационные технологии"]
  .map((name, index) => ({ id: `subject-${index + 1}`, name, color: SUBJECT_COLORS[index] }));

const subjects = loadCollection(STORAGE_KEYS.subjects, defaultSubjects);
const tasks = loadCollection(STORAGE_KEYS.tasks, createDemoTasks());
let currentTheme = loadTheme();

applyTheme(currentTheme);
updateTopbarDate();
render();

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    currentView = button.dataset.view;
    closeMobileMenu();
    render();
  });
});

document.querySelector("#mobile-menu").addEventListener("click", (event) => {
  const isOpen = document.querySelector("#sidebar").classList.toggle("mobile-open");
  document.body.classList.toggle("menu-open", isOpen);
  event.currentTarget.setAttribute("aria-expanded", String(isOpen));
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  setTheme(currentTheme === "dark" ? "light" : "dark");
});

document.querySelector("#close-modal").addEventListener("click", closeModal);
document.querySelector("#cancel-modal").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeMobileMenu();
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open-task]")) {
    event.preventDefault();
    showTaskDetails(event.target.dataset.openTask);
  }
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#task-title").value.trim();
  const dueDate = document.querySelector("#task-due-date").value;
  const subjectId = document.querySelector("#task-subject").value;
  const error = document.querySelector("#form-error");

  if (!title) {
    error.textContent = "Введите название задачи.";
    error.hidden = false;
    document.querySelector("#task-title").focus();
    return;
  }
  if (!subjectId || !subjects.some((subject) => subject.id === subjectId)) {
    error.textContent = "Выберите предмет из списка.";
    error.hidden = false;
    document.querySelector("#task-subject").focus();
    return;
  }
  if (!dueDate || !isValidInputDate(dueDate)) {
    error.textContent = "Укажите корректную дату выполнения.";
    error.hidden = false;
    document.querySelector("#task-due-date").focus();
    return;
  }
  const priority = document.querySelector("#task-priority").value;
  if (!PRIORITIES[priority]) {
    error.textContent = "Выберите корректный приоритет.";
    error.hidden = false;
    document.querySelector("#task-priority").focus();
    return;
  }

  const taskData = {
    title,
    description: document.querySelector("#task-description").value.trim(),
    subjectId,
    dueDate,
    priority
  };
  const existingId = document.querySelector("#task-id").value;
  const isNewTask = !existingId;
  if (existingId) {
    const task = tasks.find((item) => item.id === existingId);
    if (!task) {
      showToast("Не удалось найти задачу для изменения.");
      return;
    }
    Object.assign(task, taskData);
    showToast("Изменения сохранены");
  } else {
    tasks.unshift({ id: createId(), ...taskData, completed: false, createdAt: new Date().toISOString() });
    showToast("Задача добавлена");
    currentView = "all";
    filterState = { search: "", subject: "", priority: "", status: "", sort: "date" };
  }

  persistCollections();
  if (isNewTask) taskForm.reset();
  closeModal();
  render();
});

pageContent.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    handleTaskAction(actionButton.dataset.action, actionButton.dataset.id);
    return;
  }

  const openButton = event.target.closest("[data-open-task]");
  if (openButton) showTaskDetails(openButton.dataset.openTask);

  const navigateButton = event.target.closest("[data-navigate]");
  if (navigateButton) {
    currentView = navigateButton.dataset.navigate;
    render();
  }

  const subjectDeleteButton = event.target.closest("[data-delete-subject]");
  if (subjectDeleteButton) deleteSubject(subjectDeleteButton.dataset.deleteSubject);
});

taskDetails.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) handleTaskAction(actionButton.dataset.action, actionButton.dataset.id);
});

pageContent.addEventListener("change", (event) => {
  if (event.target.matches("[data-task-toggle]")) {
    const task = tasks.find((item) => item.id === event.target.dataset.taskToggle);
    if (!task) return;
    task.completed = event.target.checked;
    persistCollections();
    render();
    showToast(task.completed ? "Задача отмечена выполненной" : "Задача возвращена в активные");
    return;
  }

  const filter = event.target.dataset.filter;
  if (filter) {
    filterState[filter] = event.target.value;
    renderTaskList();
  }
});

pageContent.addEventListener("input", (event) => {
  if (event.target.matches("[data-filter='search']")) {
    filterState.search = event.target.value;
    renderTaskList();
    const searchInput = pageContent.querySelector("[data-filter='search']");
    if (searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(filterState.search.length, filterState.search.length);
    }
  }
});

function createDemoTasks() {
  const dayOffset = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return dateToInputValue(date);
  };
  return [
    { id: "demo-java", title: "Подготовить лабораторную работу по Java", description: "Закончить практическую часть и оформить выводы.", subjectId: "subject-1", dueDate: dayOffset(1), priority: "high", completed: false },
    { id: "demo-python", title: "Повторить тему циклов Python", description: "Решить несколько задач на for и while.", subjectId: "subject-1", dueDate: dayOffset(3), priority: "medium", completed: false },
    { id: "demo-history", title: "Сделать презентацию по истории", description: "Подготовить план и подобрать иллюстрации.", subjectId: "subject-3", dueDate: dayOffset(6), priority: "low", completed: false },
    { id: "demo-math", title: "Подготовиться к экзамену по математике", description: "Повторить основные формулы и решить пробный вариант.", subjectId: "subject-2", dueDate: dayOffset(-1), priority: "high", completed: false },
    { id: "demo-english", title: "Прочитать текст для английского", description: "Выписать незнакомые слова.", subjectId: "subject-4", dueDate: dayOffset(0), priority: "medium", completed: true }
  ];
}

function loadCollection(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return cloneList(fallback);
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new TypeError("Ожидался список данных.");
    return parsed;
  } catch (error) {
    console.error(`Не удалось загрузить данные (${key}):`, error);
    window.setTimeout(() => showToast("Не удалось прочитать сохранённые данные. Изменения хранятся до перезагрузки."), 0);
    return cloneList(fallback);
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.theme) === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Не удалось прочитать настройку темы:", error);
    return "light";
  }
}

function persistCollections() {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    localStorage.setItem(STORAGE_KEYS.subjects, JSON.stringify(subjects));
  } catch (error) {
    console.error("Не удалось сохранить задачи и предметы:", error);
    showToast("Не удалось сохранить данные в браузере.");
  }
}

function setTheme(theme) {
  currentTheme = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch (error) {
    console.error("Не удалось сохранить настройку темы:", error);
    showToast("Не удалось сохранить выбранную тему.");
  }
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  const button = document.querySelector("#theme-toggle");
  button.innerHTML = theme === "dark" ? "<span>☀</span>" : "<span>☾</span>";
  button.setAttribute("aria-label", theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
  button.title = button.getAttribute("aria-label");
}

function render() {
  document.querySelector("#breadcrumb-current").textContent = VIEW_NAMES[currentView];
  document.querySelectorAll(".nav-link[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });

  if (currentView === "home") renderDashboard();
  else if (currentView === "subjects") renderSubjects();
  else if (currentView === "settings") renderSettings();
  else renderTaskView();
}

function renderDashboard() {
  const done = tasks.filter((task) => task.completed).length;
  const active = tasks.filter((task) => !task.completed).length;
  const overdue = tasks.filter((task) => !task.completed && task.dueDate < today).length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const nextTasks = tasks.filter((task) => !task.completed && task.dueDate >= today)
    .sort(compareByDate).slice(0, 4);
  const todayTasks = tasks.filter((task) => !task.completed && task.dueDate === today).sort(compareByDate);
  const date = new Date();
  const formattedDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
  const overdueNotice = overdue
    ? `<div class="notice">У вас ${overdue} ${pluralize(overdue, "просроченная задача", "просроченные задачи", "просроченных задач")}. Пересмотрите сроки и обновите план.</div>`
    : "";

  pageContent.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-copy">
        <p class="eyebrow">ВАШ УЧЕБНЫЙ ПЛАНИРОВЩИК</p>
        <h1>Добро пожаловать в Student Task Tracker</h1>
        <p>Планируйте задачи и достигайте учебных целей шаг за шагом.</p>
      </div>
      <div class="banner-date"><strong>${escapeHtml(String(date.getDate()).padStart(2, "0"))}</strong><span>${escapeHtml(formattedDate)}</span></div>
    </div>
    <div class="stats-grid">
      ${statCard("Всего задач", tasks.length, "▤", "")}
      ${statCard("Выполнено", done, "✓", "green", `${progress}% от общего числа`)}
      ${statCard("В работе", active, "◷", "amber")}
      ${statCard("Просрочено", overdue, "!", "red")}
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-heading">
          <div><h2>Ближайшие дедлайны</h2><p>Задачи, которые требуют внимания</p></div>
          <button class="text-button" type="button" data-navigate="all">Все задачи →</button>
        </div>
        <div class="task-list">${nextTasks.length ? nextTasks.map(taskRow).join("") : emptyState("Всё под контролем", "Нет предстоящих активных задач.")}</div>
        <div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span class="progress-label">${progress}% выполнено</span></div>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div><h2>Задачи на сегодня</h2><p>${escapeHtml(formattedDate)}</p></div>
          <button class="text-button" type="button" data-navigate="today">Открыть →</button>
        </div>
        <div class="task-list">${todayTasks.length ? todayTasks.map(taskRow).join("") : emptyState("Свободный день", "На сегодня активных задач нет.")}</div>
      </section>
    </div>${overdueNotice}`;
}

function statCard(label, value, icon, tone, caption = "") {
  return `<article class="stat-card"><div class="stat-top">${label}<span class="stat-icon ${tone}">${icon}</span></div><div class="stat-value-row"><span class="stat-value">${value}</span>${caption ? `<span class="stat-caption">${caption}</span>` : ""}</div></article>`;
}

function renderTaskView() {
  const title = VIEW_NAMES[currentView];
  const subtitle = {
    all: "Держите учебные дела в порядке и под контролем.",
    today: "Сосредоточьтесь на том, что нужно сделать сегодня.",
    upcoming: "Планируйте заранее и встречайте дедлайны без спешки.",
    completed: "Ваши выполненные учебные цели."
  }[currentView];
  pageContent.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">МОИ ЗАДАЧИ</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>
      <button class="button button-primary" type="button" data-action="new"><span class="plus">+</span> Добавить задачу</button>
    </div>
    <div class="toolbar">
      <label class="search-box"><span>⌕</span><input type="search" placeholder="Поиск по названию..." value="${escapeHtml(filterState.search)}" data-filter="search" aria-label="Поиск задач"></label>
      <select data-filter="subject" aria-label="Фильтр по предмету"><option value="">Все предметы</option>${subjects.map((subject) => `<option value="${escapeHtml(subject.id)}" ${filterState.subject === subject.id ? "selected" : ""}>${escapeHtml(subject.name)}</option>`).join("")}</select>
      <select data-filter="priority" aria-label="Фильтр по приоритету"><option value="">Все приоритеты</option>${priorityOptions()}</select>
      <select data-filter="status" aria-label="Фильтр по статусу"><option value="">Все статусы</option><option value="active" ${filterState.status === "active" ? "selected" : ""}>Активные</option><option value="completed" ${filterState.status === "completed" ? "selected" : ""}>Выполненные</option></select>
      <select data-filter="sort" aria-label="Сортировка"><option value="date" ${filterState.sort === "date" ? "selected" : ""}>По дате</option><option value="priority" ${filterState.sort === "priority" ? "selected" : ""}>По приоритету</option></select>
    </div>
    <div class="task-list-page" id="task-list-results"></div>`;
  renderTaskList();
}

function renderTaskList() {
  const container = pageContent.querySelector("#task-list-results");
  if (!container) return;
  const filtered = getVisibleTasks();
  container.innerHTML = filtered.length
    ? filtered.map(taskRow).join("")
    : emptyState("Задач не найдено", "Попробуйте изменить фильтры или добавьте новую задачу.");
}

function getVisibleTasks() {
  let visible = [...tasks];
  if (currentView === "today") visible = visible.filter((task) => !task.completed && task.dueDate === today);
  if (currentView === "upcoming") visible = visible.filter((task) => !task.completed && task.dueDate > today);
  if (currentView === "completed") visible = visible.filter((task) => task.completed);
  if (filterState.search) {
    const query = filterState.search.trim().toLocaleLowerCase("ru");
    visible = visible.filter((task) => task.title.toLocaleLowerCase("ru").includes(query));
  }
  if (filterState.subject) visible = visible.filter((task) => task.subjectId === filterState.subject);
  if (filterState.priority) visible = visible.filter((task) => task.priority === filterState.priority);
  if (filterState.status === "active") visible = visible.filter((task) => !task.completed);
  if (filterState.status === "completed") visible = visible.filter((task) => task.completed);
  if (filterState.sort === "priority") {
    visible.sort((a, b) => PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank || compareByDate(a, b));
  } else {
    visible.sort(compareByDate);
  }
  return visible;
}

function taskRow(task) {
  const subject = subjects.find((item) => item.id === task.subjectId);
  const dateDiff = daysFromToday(task.dueDate);
  const overdue = !task.completed && dateDiff < 0;
  const soon = !task.completed && dateDiff >= 0 && dateDiff <= 2;
  const dueClass = overdue ? "late" : soon ? "soon" : "";
  const rowClass = overdue ? "overdue" : soon ? "soon" : "";
  return `<article class="task-row ${rowClass}">
    <input class="task-check" type="checkbox" data-task-toggle="${escapeHtml(task.id)}" ${task.completed ? "checked" : ""} aria-label="${task.completed ? "Вернуть задачу в активные" : "Отметить выполненной"}: ${escapeHtml(task.title)}">
    <div class="task-main" data-open-task="${escapeHtml(task.id)}" role="button" tabindex="0" aria-label="Подробнее: ${escapeHtml(task.title)}">
      <p class="task-title ${task.completed ? "is-done" : ""}">${escapeHtml(task.title)}</p>
      <div class="task-meta"><span><i class="subject-dot" style="background:${escapeHtml(subject ? subject.color : "#94a3b8")}"></i>${escapeHtml(subject ? subject.name : "Без предмета")}</span><span class="priority priority-${escapeHtml(task.priority)}">${PRIORITIES[task.priority]?.label || "Средний"}</span>${task.completed ? '<span class="status-pill">Выполнено</span>' : ""}</div>
    </div>
    <div class="task-end"><span class="due-date ${dueClass}">${escapeHtml(formatDueDate(task.dueDate))}</span></div>
  </article>`;
}

function renderSubjects() {
  pageContent.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">УЧЕБНЫЕ ДИСЦИПЛИНЫ</p><h1>Предметы</h1><p class="page-subtitle">Группируйте задачи по курсам и следите за нагрузкой.</p></div></div>
    <form class="subject-add" id="subject-form">
      <input id="subject-name" type="text" maxlength="50" placeholder="Название нового предмета" aria-label="Название нового предмета" required>
      <button class="button button-primary" type="submit"><span class="plus">+</span> Добавить</button>
    </form>
    <div class="subjects-grid">${subjects.map((subject) => {
      const count = tasks.filter((task) => task.subjectId === subject.id).length;
      return `<article class="subject-card">
        <div class="subject-card-top"><span class="subject-color" style="background:${escapeHtml(subject.color)}1c;color:${escapeHtml(subject.color)}">▧</span><button class="subject-delete" type="button" data-delete-subject="${escapeHtml(subject.id)}" aria-label="Удалить предмет ${escapeHtml(subject.name)}">×</button></div>
        <h3>${escapeHtml(subject.name)}</h3><p>${count} ${pluralize(count, "задача", "задачи", "задач")}</p>
      </article>`;
    }).join("")}</div>`;

  pageContent.querySelector("#subject-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = pageContent.querySelector("#subject-name");
    const name = input.value.trim();
    if (!name) {
      input.setCustomValidity("Введите название предмета.");
      input.reportValidity();
      return;
    }
    if (subjects.some((subject) => subject.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"))) {
      input.setCustomValidity("Такой предмет уже есть.");
      input.reportValidity();
      input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
      return;
    }
    subjects.push({ id: createId(), name, color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length] });
    persistCollections();
    render();
    showToast("Предмет добавлен");
  });
}

function renderSettings() {
  pageContent.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">ПЕРСОНАЛИЗАЦИЯ</p><h1>Настройки</h1><p class="page-subtitle">Настройте приложение под себя.</p></div></div>
    <section class="panel settings-panel">
      <div class="panel-heading"><div><h2>Внешний вид</h2><p>Персональные настройки интерфейса</p></div></div>
      <div class="settings-item"><div><strong>Тёмная тема</strong><p>Выберите комфортное оформление для приложения.</p></div>
        <label class="switch" aria-label="Тёмная тема"><input id="settings-theme" type="checkbox" ${currentTheme === "dark" ? "checked" : ""}><span class="switch-track"></span></label>
      </div>
      <div class="settings-item"><div><strong>Ваши данные</strong><p>Задачи и предметы хранятся локально в этом браузере.</p></div><span class="stat-icon">▣</span></div>
    </section>`;
  pageContent.querySelector("#settings-theme").addEventListener("change", (event) => setTheme(event.target.checked ? "dark" : "light"));
}

function handleTaskAction(action, id) {
  if (action === "new") openTaskModal();
  if (action === "edit") openTaskModal(id);
  if (action === "delete") deleteTask(id);
  if (action === "toggle-detail") {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    persistCollections();
    closeModal();
    render();
    showToast(task.completed ? "Задача отмечена выполненной" : "Задача возвращена в активные");
  }
}

function openTaskModal(id = "") {
  const task = tasks.find((item) => item.id === id);
  if (id && !task) {
    showToast("Задача не найдена.");
    return;
  }
  taskForm.hidden = false;
  taskDetails.hidden = true;
  document.querySelector("#modal-title").textContent = task ? "Редактировать задачу" : "Новая задача";
  document.querySelector("#save-task").textContent = task ? "Сохранить изменения" : "Сохранить задачу";
  document.querySelector("#task-id").value = task ? task.id : "";
  document.querySelector("#task-title").value = task ? task.title : "";
  document.querySelector("#task-description").value = task ? task.description || "" : "";
  document.querySelector("#task-due-date").value = task ? task.dueDate : today;
  document.querySelector("#task-priority").value = task ? task.priority : "medium";
  document.querySelector("#task-subject").innerHTML = `<option value="">Выберите предмет</option>${subjects.map((subject) => `<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>`).join("")}`;
  document.querySelector("#task-subject").value = task && subjects.some((subject) => subject.id === task.subjectId) ? task.subjectId : "";
  document.querySelector("#form-error").hidden = true;
  modalBackdrop.hidden = false;
  document.querySelector("#task-title").focus();
}

function showTaskDetails(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  taskForm.hidden = true;
  taskDetails.hidden = false;
  document.querySelector("#modal-title").textContent = "Подробности задачи";
  const subject = subjects.find((item) => item.id === task.subjectId);
  taskDetails.innerHTML = `
    <p class="eyebrow">ЗАДАЧА</p><h3>${escapeHtml(task.title)}</h3>
    <p class="detail-description">${escapeHtml(task.description || "Описание не добавлено.")}</p>
    <div class="detail-grid">
      <div><small>Предмет</small><strong>${escapeHtml(subject ? subject.name : "Без предмета")}</strong></div>
      <div><small>Срок выполнения</small><strong>${escapeHtml(formatDueDate(task.dueDate))}</strong></div>
      <div><small>Приоритет</small><strong>${PRIORITIES[task.priority]?.label || "Средний"}</strong></div>
      <div><small>Статус</small><strong>${task.completed ? "Выполнена" : "Активна"}</strong></div>
    </div>
    <div class="details-actions">
      <button class="button button-danger button-small" type="button" data-action="delete" data-id="${escapeHtml(task.id)}">Удалить</button>
      <button class="button button-quiet button-small" type="button" data-action="edit" data-id="${escapeHtml(task.id)}">Редактировать</button>
      <button class="button button-primary button-small" type="button" data-action="toggle-detail" data-id="${escapeHtml(task.id)}">${task.completed ? "Вернуть в активные" : "Отметить выполненной"}</button>
    </div>`;
  modalBackdrop.hidden = false;
}

function closeModal() {
  modalBackdrop.hidden = true;
}

function deleteTask(id) {
  const taskIndex = tasks.findIndex((task) => task.id === id);
  if (taskIndex < 0) return;
  const title = tasks[taskIndex].title;
  if (!window.confirm(`Удалить задачу «${title}»?`)) return;
  tasks.splice(taskIndex, 1);
  persistCollections();
  closeModal();
  render();
  showToast("Задача удалена");
}

function deleteSubject(id) {
  const subject = subjects.find((item) => item.id === id);
  if (!subject) return;
  if (subjects.length === 1) {
    showToast("Нельзя удалить последний предмет.");
    return;
  }
  const replacement = subjects.find((item) => item.id !== id);
  const affected = tasks.filter((task) => task.subjectId === id).length;
  const message = affected
    ? `Удалить предмет «${subject.name}»? ${affected} ${pluralize(affected, "задача будет перенесена", "задачи будут перенесены", "задач будут перенесены")} в «${replacement.name}».`
    : `Удалить предмет «${subject.name}»?`;
  if (!window.confirm(message)) return;
  tasks.forEach((task) => {
    if (task.subjectId === id) task.subjectId = replacement.id;
  });
  subjects.splice(subjects.indexOf(subject), 1);
  persistCollections();
  render();
  showToast("Предмет удалён");
}

function priorityOptions() {
  return Object.entries(PRIORITIES).map(([key, priority]) =>
    `<option value="${key}" ${filterState.priority === key ? "selected" : ""}>${priority.label}</option>`
  ).join("");
}

function emptyState(title, message) {
  return `<div class="empty-state"><span class="empty-symbol">✓</span><strong>${title}</strong><p>${message}</p></div>`;
}

function compareByDate(a, b) {
  return a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, "ru");
}

function formatDueDate(value) {
  if (!isValidInputDate(value)) return "Дата не указана";
  const parsed = new Date(`${value}T12:00:00`);
  const difference = daysFromToday(value);
  if (difference === 0) return "Сегодня";
  if (difference === 1) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(parsed);
}

function daysFromToday(value) {
  const selected = new Date(`${value}T00:00:00`);
  const current = new Date(`${today}T00:00:00`);
  return Math.round((selected - current) / 86400000);
}

function dateToInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidInputDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateToInputValue(date) === value;
}

function pluralize(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function createId() {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneList(items) {
  return items.map((item) => ({ ...item }));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("show");
  toastTimer = window.setTimeout(() => toastElement.classList.remove("show"), 2800);
}

function updateTopbarDate() {
  document.querySelector("#topbar-date").textContent = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short", day: "numeric", month: "short"
  }).format(new Date());
}

function closeMobileMenu() {
  document.querySelector("#sidebar").classList.remove("mobile-open");
  document.body.classList.remove("menu-open");
  document.querySelector("#mobile-menu").setAttribute("aria-expanded", "false");
}