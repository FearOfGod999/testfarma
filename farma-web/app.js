"use strict";

const main = document.querySelector("#main");
const bank = window.FARMA_BANK;
const kinds = { lesson: "Занятие", module: "Модуль", exam: "Экзамен" };
const filters = { all: "Все тесты", lesson: "Занятия", module: "Модули", exam: "Экзамены" };
let activeFilter = "all";

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
  main.replaceChildren(content);
  if (focus) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

function panel() {
  const page = node("div", "", { class: "narrow" });
  const card = node("section", "", { class: "surface" });
  return { page: add(page, link("К каталогу тестов", "#catalog", "back"), card), card };
}

function catalog(focus = true) {
  const page = node("div");
  const hero = node("section", "", { class: "intro" });
  const detail = add(node("div"), node("h1", "Практикум по фармакологии"),
    node("p", "Выберите занятие или проверьте знания по всему модулю. После теста можно разобрать ошибки."));
  const summary = add(node("div", "", { class: "intro-summary" }),
    node("strong", questions(Object.keys(bank.questions).length)), node("span", "в банке заданий"));
  add(hero, detail, summary);

  const controls = node("div", "", { class: "filters", role: "group", "aria-label": "Тип теста" });
  const list = node("div", "", { class: "catalog-list" });
  function populate() {
    list.replaceChildren();
    for (const test of bank.tests.filter(test => activeFilter === "all" || test.kind === activeFilter)) {
      const draft = read(test, "draft");
      const result = read(test, "result");
      const info = [questions(test.questions.length)];
      if (draft) info.push(`Отвечено ${Object.keys(draft.answers).length} из ${draft.order.length}`);
      else if (result) info.push(`Последняя попытка — ${result.percent}%`);
      const title = add(node("div", "", { class: "title-block" }),
        node("h3", test.title), node("p", info.join(" · "), { class: "meta" }));
      const open = link(draft ? "Продолжить" : "Открыть", "#test/" + test.id, "btn");
      open.setAttribute("aria-label", open.textContent + " — " + test.title);
      add(list, add(node("article", "", { class: "test-row" }),
        node("span", kinds[test.kind], { class: "kind" }), title, open));
    }
    if (!list.childElementCount) add(list, node("p", "В этой категории пока нет тестов.", { class: "empty" }));
  }

  for (const [value, label] of Object.entries(filters)) {
    if (value !== "all" && !bank.tests.some(test => test.kind === value)) continue;
    const control = node("button", label, { type: "button", class: "filter", "aria-pressed": String(value === activeFilter) });
    control.addEventListener("click", () => {
      activeFilter = value;
      for (const item of controls.children) item.setAttribute("aria-pressed", String(item === control));
      populate();
    });
    add(controls, control);
  }
  populate();
  add(page, hero, add(node("section", "", { "aria-labelledby": "catalog-title" }),
    add(node("div", "", { class: "catalog-head" }), node("h2", "Каталог тестов", { id: "catalog-title" }), controls), list));
  show(page, focus);
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
  const draft = { order, answers: {}, index: 0 };
  write(test, "draft", draft);
  quiz(test, draft);
}

function overview(test) {
  const { page, card } = panel();
  add(card, node("h1", test.title), node("p", kinds[test.kind] + " · " + questions(test.questions.length)));
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
    if (result) add(actions, button(`Последний результат — ${result.percent}%`, () => results(test, result), true));
    add(card, setup, actions);
  }
  show(page);
}

function quiz(test, draft, jumpOpen = false) {
  const { page, card } = panel();
  const currentId = draft.order[draft.index];
  const question = bank.questions[currentId];
  const selected = draft.answers[currentId] ?? [];
  const total = draft.order.length;
  const count = node("span", `Отвечено ${Object.keys(draft.answers).length} из ${total}`);
  count.setAttribute("aria-live", "polite");
  const progress = node("progress", "", { max: total, value: Object.keys(draft.answers).length, "aria-label": "Отвечено вопросов" });
  const progressCopy = add(node("div", "", { class: "progress-copy" }),
    node("span", `Вопрос ${draft.index + 1} из ${total}`), count);
  add(card, progressCopy, progress);

  const fieldset = node("fieldset");
  const multi = question.correct.length > 1;
  add(fieldset, node("legend", multi ? "Выберите все подходящие варианты" : "Выберите один вариант"));
  const inputs = question.options.map((option, index) => {
    const input = node("input", "", { type: multi ? "checkbox" : "radio", name: "answer", value: index });
    input.checked = selected.includes(index);
    add(fieldset, add(node("label", "", { class: "option" }), input, node("span", option)));
    return input;
  });
  add(card, add(node("div", "", { class: "question" }), node("h1", question.text), fieldset));

  function move(index, keepJump = false) {
    draft.index = index;
    write(test, "draft", draft);
    quiz(test, draft, keepJump);
  }

  function finish() {
    const unanswered = total - Object.keys(draft.answers).length;
    if (unanswered && !window.confirm(`Остались вопросы без ответа: ${unanswered}. Завершить тест?`)) return;
    const correct = draft.order.filter(id => isCorrect(bank.questions[id], draft.answers[id])).length;
    const result = { ...draft, correct, percent: Math.round(correct * 100 / total) };
    write(test, "result", result);
    write(test, "draft", null);
    results(test, result);
  }

  const previous = button("Назад", () => move(draft.index - 1), true);
  previous.disabled = draft.index === 0;
  const last = draft.index === total - 1;
  const actions = add(node("div", "", { class: "actions" }), previous,
    last ? button("Завершить тест", finish) : button("Далее", () => move(draft.index + 1)));
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
      const answered = Boolean(draft.answers[draft.order[index]]);
      target.classList.toggle("answered", answered);
      target.setAttribute("aria-label", `Вопрос ${index + 1}, ${answered ? "есть ответ" : "без ответа"}`);
    });
  }
  fieldset.addEventListener("change", () => {
    const values = inputs.filter(input => input.checked).map(input => Number(input.value));
    if (values.length) draft.answers[currentId] = values;
    else delete draft.answers[currentId];
    write(test, "draft", draft);
    count.textContent = `Отвечено ${Object.keys(draft.answers).length} из ${total}`;
    progress.value = Object.keys(draft.answers).length;
    updateJump();
  });
  updateJump();
  show(page);
}

function isCorrect(question, values = []) {
  return values.length === question.correct.length && question.correct.every(index => values.includes(index));
}

function results(test, result) {
  const { page, card } = panel();
  const wrong = result.order.filter(id => !isCorrect(bank.questions[id], result.answers[id]));
  add(card, node("h1", "Результат — " + result.percent + "%"),
    node("p", `${test.title} · Правильных ответов: ${result.correct} из ${result.order.length}`));
  const actions = add(node("div", "", { class: "actions" }), button("К настройкам теста", () => overview(test), true));
  if (wrong.length && !read(test, "draft")) add(actions, button("Повторить ошибки", () => start(test, wrong)));
  const review = add(node("section", "", { class: "review", "aria-label": "Разбор ответов" }), node("h2", "Разбор ответов"));
  const showAll = node("input", "", { type: "checkbox" });
  const label = add(node("label", "", { class: "option" }), showAll, "Показать все ответы");
  if (wrong.length) add(review, label);
  const answers = node("div");
  add(review, answers);

  function populate() {
    answers.replaceChildren();
    result.order.forEach((id, index) => {
      const question = bank.questions[id];
      const selected = result.answers[id] ?? [];
      const correct = isCorrect(question, selected);
      if (correct && wrong.length && !showAll.checked) return;
      const entry = add(node("details"), node("summary", `${index + 1}. ${question.text}`),
        node("p", correct ? "Верно" : selected.length ? "Ошибка" : "Без ответа",
          { class: correct ? "correct" : "incorrect" }));
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
  }
  showAll.addEventListener("change", populate);
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
  if (!hash || hash === "#catalog") {
    catalog(Boolean(hash));
    return;
  }
  const test = bank.tests.find(item => hash === "#test/" + item.id);
  if (test) overview(test);
  else show(add(node("div"), node("h1", "Тест не найден"), link("К каталогу тестов", "#catalog", "back")));
}

window.addEventListener("hashchange", route);
route();
