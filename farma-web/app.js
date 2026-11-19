"use strict";

const main = document.querySelector("#main");
const bank = window.FARMA_BANK;
const kinds = { lesson: "Занятие", module: "Модуль", exam: "Экзамен" };
const filters = { all: "Все тесты", lesson: "Занятия", module: "Модули", exam: "Экзамены" };
const courseTitles = new Map([
  ["24", "Общая фармакология"],
  ["1", "Эфферентная нервная система"],
  ["2", "Афферентная нервная система"],
  ["3", "Центральная нервная система"],
  ["4", "Сердечно-сосудистая система"],
  ["5", "Дыхание и пищеварение"],
  ["6", "Система крови"],
  ["7", "Диуретики и маточные средства"],
  ["9", "Противомикробные и противовирусные средства"],
  ["12", "Периферическая нервная система"],
  ["13", "Исполнительные органы"],
]);

const moduleEntries = modulesByCourse(bank?.tests ?? []);
const catalogEntries = [
  ...moduleEntries,
  ...(bank?.tests ?? []).filter(test => test.kind !== "module").map(test => ({ test, title: test.title })),
];
let activeFilter = "all";
let searchQuery = "";
const passMark = 70;

function courseId(test) {
  return test.id.match(/^(?:exam55-(\d+)-|course-(\d+)$)/)?.slice(1).find(Boolean) ??
    (test.id.startsWith("topic-") ? "24" : undefined);
}

function modulesByCourse(tests) {
  const groups = new Map();
  const entries = [];
  for (const test of tests) {
    const course = courseId(test);
    if (!course) {
      if (test.kind === "module") entries.push({ test, title: test.title });
      continue;
    }
    if (!groups.has(course)) groups.set(course, []);
    groups.get(course).push(test);
  }
  for (const course of new Set([...courseTitles.keys(), ...groups.keys()])) {
    const group = groups.get(course) ?? [];
    const original = group.filter(test => test.kind === "module");
    if (original.length) {
      for (const test of original) {
        entries.push({ test, title: courseTitles.get(course) ?? test.title });
      }
      continue;
    }
    if (!courseTitles.has(course)) continue;
    const questions = [...new Set(group.filter(test => test.kind === "lesson").flatMap(test => test.questions))];
    if (!questions.length) continue;
    const title = courseTitles.get(course);
    const test = { id: "course-" + course, title, kind: "module", sample: 30, questions };
    entries.push({ test, title });
  }
  return entries;
}

function node(tag, content, attributes = {}) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (content) element.append(content);
  return element;
}

function add(parent, ...children) {
  parent.append(...children);
  return parent;
}

function button(label, action, secondary = false) {
  const control = node("button", label, { type: "button", class: secondary ? "btn secondary" : "btn" });
  control.addEventListener("click", action);
  return control;
}

function link(label, hash, css) {
  return node("a", label, { href: hash, class: css });
}

function plural(count, forms) {
  const last = count % 10;
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  return forms[last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
}

function questions(count) {
  return count + " " + plural(count, ["вопрос", "вопроса", "вопросов"]);
}

function score(result) {
  // Truncate for display so a mark below the cutoff never reads as 70%.
  const percent = Math.floor(result.correct * 1000 / result.order.length) / 10;
  return percent.toLocaleString("ru") + "%";
}

function matchesSearch(test, title) {
  const normalize = value => value.toLocaleLowerCase("ru").replaceAll("ё", "е");
  const text = normalize([title, test.title, courseTitles.get(courseId(test))].join(" "));
  return normalize(searchQuery.trim()).split(/\s+/).every(word => text.includes(word));
}

function selectFilter(value) {
  activeFilter = value;
  const hash = value === "all" ? "#catalog" : "#catalog/" + value;
  for (const item of document.querySelectorAll(".top-nav a")) {
    if (item.hash === hash) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  return hash;
}

const sessions = new Map();
const storagePrefix = "farma-practice." + (bank?.version ?? "") + ".";

function read(test, type) {
  const key = storagePrefix + test.id + "." + type;
  if (sessions.has(key)) return sessions.get(key);
  try {
    const value = JSON.parse(localStorage.getItem(key));
    sessions.set(key, value);
    return value;
  } catch {
    return null;
  }
}

function write(test, type, value) {
  const key = storagePrefix + test.id + "." + type;
  sessions.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current page still works when browser storage is unavailable.
  }
}

function show(content, focus = true) {
  content.classList.add("view");
  main.replaceChildren(content);
  if (focus) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

function panel() {
  const page = node("div", "", { class: "narrow" });
  const card = node("section", "", { class: "surface" });
  const catalogHash = activeFilter === "all" ? "#catalog" : "#catalog/" + activeFilter;
  return { page: add(page, link("К каталогу тестов", catalogHash, "back"), card), card };
}

function catalog(focus = true) {
  const page = node("div");
  const hero = node("section", "", { class: "intro" });
  const detail = add(node("div"), node("h1", "Практикум по фармакологии"),
    node("p", "Тренируйтесь по занятиям и модулям. Проверяйте ответы в процессе и возвращайтесь к ошибкам после попытки."));
  const summary = add(node("div", "", { class: "intro-summary" }),
    add(node("p"), node("strong", Object.keys(bank.questions).length.toLocaleString("ru")), "вопросов в банке"),
    add(node("p"), node("strong", passMark + "%"), "проходной балл"));
  add(hero, detail, summary);

  const controls = node("div", "", { class: "filters", role: "group", "aria-label": "Тип теста" });
  const catalogTitle = node("h2", "Каталог тестов", { id: "catalog-title", tabindex: "-1" });
  const search = node("input", "", { type: "search", placeholder: "Поиск по названию или теме", "aria-label": "Поиск тестов" });
  search.value = searchQuery;
  const searchField = add(node("div", "", { class: "search-field" }), search);
  const found = node("p", "", { class: "catalog-status", "aria-live": "polite" });
  const list = node("div", "", { class: "catalog-list" });
  function populate() {
    list.replaceChildren();
    for (const { test, title } of catalogEntries) {
      if (activeFilter !== "all" && test.kind !== activeFilter) continue;
      if (!matchesSearch(test, title)) continue;
      const draft = read(test, "draft");
      const result = read(test, "result");
      const info = [questions(test.questions.length)];
      if (test.title !== title) info.unshift(test.title);
      if (draft) info.push(`Отвечено ${Object.keys(draft.answers).length} из ${draft.order.length}`);
      else if (result) info.push(`Последняя попытка — ${score(result)}`);
      const titleBlock = add(node("div", "", { class: "title-block" }),
        node("h3", title), node("p", info.join(" · "), { class: "meta" }));
      const open = link(draft ? "Продолжить" : "Открыть", "#test/" + test.id, "btn");
      open.setAttribute("aria-label", open.textContent + " — " + title);
      add(list, add(node("article", "", { class: "test-row" }),
        node("span", kinds[test.kind], { class: "kind" }), titleBlock, open));
    }
    const count = list.childElementCount;
    found.textContent = searchQuery.trim() ? "Найдено: " + count : "";
    if (!count) add(list, node("p", searchQuery.trim()
      ? "По этому запросу тестов нет. Попробуйте другое название или выберите «Все тесты»."
      : "В этой категории пока нет тестов.", { class: "empty" }));
  }

  search.addEventListener("input", () => {
    searchQuery = search.value;
    populate();
  });
  for (const [value, label] of Object.entries(filters)) {
    if (value !== "all" && !catalogEntries.some(({ test }) => test.kind === value)) continue;
    const control = node("button", label, { type: "button", class: "filter", "aria-pressed": String(value === activeFilter) });
    control.addEventListener("click", () => {
      const hash = selectFilter(value);
      try {
        history.replaceState(null, "", hash);
      } catch {
        // Some local-file viewers disallow History API writes.
      }
      for (const item of controls.children) item.setAttribute("aria-pressed", String(item === control));
      populate();
    });
    add(controls, control);
  }
  populate();
  add(page, hero, add(node("section", "", { "aria-labelledby": "catalog-title" }),
    add(node("div", "", { class: "catalog-head" }), catalogTitle, searchField),
    controls, found, list));
  show(page, focus);
  if (focus && activeFilter !== "all") {
    catalogTitle.focus({ preventScroll: true });
    catalogTitle.scrollIntoView({ block: "start" });
  }
}

function shuffled(items) {
  const order = [...items];
  for (let index = order.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  return order;
}

function start(test, order) {
  const draft = { order, answers: {}, checked: {}, index: 0 };
  write(test, "draft", draft);
  quiz(test, draft);
}

function overview(test) {
  const { page, card } = panel();
  add(card, node("h1", test.title), node("p", kinds[test.kind] + " · " + questions(test.questions.length)));
  const hasMultiple = test.questions.some(id => bank.questions[id].correct.length > 1);
  add(card, node("p", hasMultiple
    ? "Если можно выбрать несколько ответов, отметьте подходящие и нажмите «Проверить ответ». Балл даётся за точный набор."
    : "Проверка появится сразу после выбора ответа."));
  add(card, node("p", "Проходной балл — " + passMark + "%.", { class: "tint-note" }));
  const draft = read(test, "draft");
  const result = read(test, "result");
  if (draft) {
    add(card, node("p", `Отвечено ${Object.keys(draft.answers).length} из ${draft.order.length}.`),
      add(node("div", "", { class: "actions" }),
        button("Продолжить попытку", () => quiz(test, draft)),
        button("Начать заново", () => {
          if (window.confirm("Удалить ответы текущей попытки и настроить новый тест?")) {
            write(test, "draft", null);
            overview(test);
          }
        }, true)));
  } else {
    const length = node("select");
    if (test.sample > 0 && test.sample < test.questions.length) add(length, node("option", questions(test.sample), { value: test.sample }));
    add(length, node("option", `Все вопросы (${test.questions.length})`, { value: test.questions.length }));
    const mix = node("input", "", { type: "checkbox", checked: "" });
    const setup = add(node("div", "", { class: "setup" }),
      add(node("label", "Размер попытки"), length),
      add(node("label"), mix, "Перемешать вопросы"));
    const actions = add(node("div", "", { class: "actions" }), button("Начать тест", () => {
      const order = mix.checked ? shuffled(test.questions) : test.questions;
      start(test, order.slice(0, Number(length.value)));
    }));
    if (result) add(actions, button(`Последний результат — ${score(result)}`, () => results(test, result), true));
    add(card, setup, actions);
  }
  show(page);
}

function quiz(test, draft, jumpOpen = false) {
  const { page, card } = panel();
  const currentId = draft.order[draft.index];
  const question = bank.questions[currentId];
  draft.checked ??= {};
  const total = draft.order.length;
  const count = node("span", `Отвечено ${Object.keys(draft.answers).length} из ${total}`);
  count.setAttribute("aria-live", "polite");
  const progress = node("progress", "", { max: total, value: Object.keys(draft.answers).length, "aria-label": "Отвечено вопросов" });
  const progressCopy = add(node("div", "", { class: "progress-copy" }),
    node("span", `Вопрос ${draft.index + 1} из ${total}`), count);
  add(card, node("p", test.title, { class: "quiz-title" }), progressCopy, progress);

  const fieldset = node("fieldset");
  const multi = question.correct.length > 1;
  add(fieldset, node("legend", multi ? "Отметьте все подходящие варианты" : "Выберите один вариант"));
  const options = question.options.map((option, index) => {
    const input = node("input", "", { type: multi ? "checkbox" : "radio", name: "answer", value: index });
    input.checked = (draft.answers[currentId] ?? []).includes(index);
    const state = node("span", "", { class: "option-state" });
    const label = add(node("label", "", { class: "option" }), input,
      add(node("span", "", { class: "option-copy" }), node("span", option), state));
    add(fieldset, label);
    return { input, label, state };
  });
  add(card, add(node("div", "", { class: "question" }), node("h1", question.text), fieldset));
  const feedback = node("div", "", { class: "feedback", role: "status", "aria-atomic": "true" });
  add(card, feedback);

  function move(index, keepJump = false) {
    draft.index = index;
    write(test, "draft", draft);
    quiz(test, draft, keepJump);
  }

  function finish() {
    if (draft.answers[currentId]?.length && !draft.checked[currentId]) {
      checkAnswer();
      return;
    }
    const unanswered = total - Object.keys(draft.answers).length;
    if (unanswered && !window.confirm(`Остались вопросы без ответа: ${unanswered}. Завершить тест?`)) return;
    const correct = draft.order.filter(id => isCorrect(bank.questions[id], draft.answers[id])).length;
    const result = { ...draft, correct };
    write(test, "result", result);
    write(test, "draft", null);
    results(test, result);
  }

  const previous = button("Назад", () => move(draft.index - 1), true);
  previous.disabled = draft.index === 0;
  const last = draft.index === total - 1;
  const forward = button("Далее", () => {
    if (draft.answers[currentId]?.length && !draft.checked[currentId]) checkAnswer();
    else if (last) finish();
    else move(draft.index + 1);
  });
  const actions = add(node("div", "", { class: "actions quiz-actions" }), previous, forward);
  if (!last) add(actions, button("Завершить тест", finish, true));
  add(card, actions);

  const jump = node("details", "", { class: "jump" });
  jump.open = jumpOpen;
  const jumpList = node("div", "", { class: "jump-list" });
  const jumpButtons = draft.order.map((id, index) => {
    const target = node("button", String(index + 1), { type: "button" });
    target.addEventListener("click", () => move(index, true));
    if (id === currentId) target.setAttribute("aria-current", "step");
    add(jumpList, target);
    return target;
  });
  add(card, add(jump, node("summary", "Перейти к вопросу"), jumpList));
  function updateJump() {
    jumpButtons.forEach((target, index) => {
      const id = draft.order[index];
      const answered = Boolean(draft.answers[id]);
      const checked = draft.checked[id];
      const status = checked ? (isCorrect(bank.questions[id], draft.answers[id]) ? "верно" : "ошибка")
        : answered ? "есть ответ" : "без ответа";
      target.classList.toggle("answered", answered);
      target.dataset.status = checked ? (status === "верно" ? "correct" : "incorrect") : "";
      target.setAttribute("aria-label", `Вопрос ${index + 1}, ${status}`);
    });
  }

  function renderAnswerState() {
    const selected = draft.answers[currentId] ?? [];
    const checked = draft.checked[currentId];
    forward.textContent = !checked && selected.length ? "Проверить ответ"
      : last ? "Завершить тест" : checked ? "Далее" : "Пропустить";
    if (!checked) return;
    for (const [index, { input, label, state }] of options.entries()) {
      input.disabled = true;
      const key = question.correct.includes(index);
      const chosen = selected.includes(index);
      label.dataset.answer = key ? "correct" : chosen ? "incorrect" : "neutral";
      state.textContent = key ? (chosen ? "Верно выбрано" : "Верный вариант · пропущен")
        : chosen ? "Неверный выбор" : "Неверный вариант";
    }
    const correct = isCorrect(question, selected);
    feedback.dataset.result = correct ? "correct" : "incorrect";
    feedback.replaceChildren(node("strong", correct ? "Ответ верный" : "Ответ неверный"));
    if (!correct && multi) add(feedback, node("span", "Засчитывается только точный набор верных вариантов."));
    if (question.note) add(feedback, node("span", question.note));
  }

  function checkAnswer() {
    draft.checked[currentId] = true;
    write(test, "draft", draft);
    renderAnswerState();
    updateJump();
    forward.focus({ preventScroll: true });
  }

  fieldset.addEventListener("change", () => {
    const values = options.flatMap(({ input }, index) => input.checked ? [index] : []);
    if (values.length) draft.answers[currentId] = values;
    else delete draft.answers[currentId];
    count.textContent = `Отвечено ${Object.keys(draft.answers).length} из ${total}`;
    progress.value = Object.keys(draft.answers).length;
    if (!multi && values.length) checkAnswer();
    else {
      write(test, "draft", draft);
      renderAnswerState();
      updateJump();
    }
  });
  show(page);
  renderAnswerState();
  updateJump();
}

function isCorrect(question, values = []) {
  return values.length === question.correct.length && question.correct.every(index => values.includes(index));
}

function results(test, result) {
  const { page, card } = panel();
  const wrong = result.order.filter(id => !isCorrect(bank.questions[id], result.answers[id]));
  const total = result.order.length;
  const skipped = result.order.filter(id => !result.answers[id]?.length).length;
  const passed = result.correct * 100 >= total * passMark;
  const summary = node("div", "", { class: "result-summary", "data-result": passed ? "correct" : "incorrect" });
  const meter = add(node("div", "", { class: "result-meter" }),
    node("progress", "", { max: total, value: result.correct, "aria-label": "Доля верных ответов" }));
  meter.style.setProperty("--threshold", passMark + "%");
  add(summary, add(node("div", "", { class: "result-score" }),
    node("strong", score(result)), node("span", passed ? "Тест пройден" : "Тест не пройден")),
    meter, node("p", `Правильных ответов: ${result.correct} из ${total} · Проходной балл: ${passMark}%`));
  if (skipped) add(summary, node("p", `Без ответа: ${skipped}`));
  add(card, node("h1", "Результат теста"), node("p", test.title), summary);
  const actions = node("div", "", { class: "actions" });
  if (wrong.length && !read(test, "draft")) add(actions, button("Повторить ошибки", () => start(test, wrong)));
  add(actions, button("К настройкам теста", () => overview(test), true));
  const review = add(node("section", "", { class: "review", "aria-label": "Разбор ответов" }), node("h2", "Разбор ответов"));
  const answers = node("div");
  let errorsOnly = false;
  const reviewFilters = node("div", "", { class: "filters", role: "group", "aria-label": "Какие ответы показать" });
  for (const [label, value] of [["Все ответы", false], [`Ошибки и пропуски (${wrong.length})`, true]]) {
    if (value && !wrong.length) continue;
    const control = node("button", label, { type: "button", class: "filter", "aria-pressed": String(!value) });
    control.addEventListener("click", () => {
      errorsOnly = value;
      for (const item of reviewFilters.children) item.setAttribute("aria-pressed", String(item === control));
      populate();
    });
    add(reviewFilters, control);
  }
  const expand = button("Развернуть все", () => {
    const entries = Array.from(answers.children);
    const open = !entries.every(entry => entry.open);
    for (const entry of entries) entry.open = open;
    updateExpand();
  }, true);
  function updateExpand() {
    expand.textContent = Array.from(answers.children).every(entry => entry.open) ? "Свернуть все" : "Развернуть все";
  }
  add(review, add(node("div", "", { class: "review-controls" }), reviewFilters, expand), answers);

  function populate() {
    answers.replaceChildren();
    result.order.forEach((id, index) => {
      const question = bank.questions[id];
      const selected = result.answers[id] ?? [];
      const correct = isCorrect(question, selected);
      if (correct && errorsOnly) return;
      const status = node("span", correct ? "Верно" : selected.length ? "Ошибка" : "Без ответа",
        { class: "review-status " + (correct ? "correct" : selected.length ? "incorrect" : "muted") });
      const entry = add(node("details"), add(node("summary"), node("span", `${index + 1}. ${question.text}`), status));
      entry.addEventListener("toggle", updateExpand);
      const options = node("ul");
      question.options.forEach((option, optionIndex) => {
        const key = question.correct.includes(optionIndex);
        const chosen = selected.includes(optionIndex);
        const description = [key && "правильный ответ", chosen && "вы выбрали"].filter(Boolean).join(", ");
        add(options, node("li", option + (description ? ` — ${description}` : ""),
          { class: key ? "correct" : chosen ? "incorrect" : "" }));
      });
      add(entry, options);
      if (question.note) add(entry, node("p", question.note));
      add(answers, entry);
    });
    updateExpand();
  }
  populate();
  add(card, actions, review);
  show(page);
}

function route() {
  const hash = window.location.hash;
  if (!bank?.tests.length) {
    show(node("p", "Банк вопросов не загрузился. Проверьте, что файл bank.js лежит рядом с index.html."), false);
    return;
  }
  if (!hash || hash === "#catalog" || hash.startsWith("#catalog/")) {
    const filter = hash.split("/")[1];
    selectFilter(Object.hasOwn(filters, filter) ? filter : "all");
    catalog(Boolean(hash));
    return;
  }
  for (const item of document.querySelectorAll(".top-nav a")) item.removeAttribute("aria-current");
  const test = catalogEntries.find(({ test }) => hash === "#test/" + test.id)?.test;
  if (test) overview(test);
  else show(add(node("div"), node("h1", "Тест не найден"), link("К каталогу тестов", "#catalog", "back")));
}

window.addEventListener("hashchange", route);
route();
