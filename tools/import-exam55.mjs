import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [, , ...inputs] = process.argv;
if (!inputs.length) throw new Error("Usage: node tools/import-exam55.mjs export.txt [more-exports.txt]");

const tests = [];
const questions = {};
const registered = new Set();
const originalModule = "exam55-24-1";
const parsedLessons = new Set();
const joinedOptions = new Map([
  [originalModule + "-98", 4],
  [originalModule + "-104", 4],
  ["exam55-3-7-31", 5],
  ["exam55-3-12-102", 2],
  ["exam55-9-2-10", 2],
  ["exam55-9-2-18", 2],
]);
const visibleOptionCounts = new Map([
  [originalModule + "-58", 4],
  ["exam55-2-1-13", 5],
  ["exam55-4-4-4", 5],
  ["exam55-4-4-11", 5],
  ["exam55-6-1-9", 4],
  ["exam55-13-1-138", 5],
]);
// These exports include one additional complete, keyed question beyond the header count.
const confirmedQuestionCounts = new Map([
  ["exam55-5-2", { declared: 23, actual: 24 }],
  ["exam55-6-1", { declared: 28, actual: 29 }],
]);

function fields(text) {
  return Object.fromEntries(Array.from(text.matchAll(/^([A-Za-z]\w*)=(.*)$/gm), ([, key, value]) => [key, value.trim()]));
}

function clean(text) {
  return text.split("||").map(line => line.trim()).filter(Boolean).join("\n").trim();
}

function parseQuestion(data, id) {
  if (data.QueryPic || data.DescrPic) throw new Error(id + ": image needs to be included");
  if (data.Answer || Number(data.RightMode)) throw new Error(id + ": unsupported answer format");
  const joinedOption = joinedOptions.get(id);
  let source = data.QueryText;
  if (joinedOption) source = source.replace(new RegExp(" +(" + joinedOption + "\\. )"), "||$1");

  const count = visibleOptionCounts.get(id) ?? Number(data.NumAnswers);
  const segments = source.split("||").map(part => part.replace(/^\|+|\|+$/g, "").trim()).filter(Boolean);
  if (id === "exam55-12-1-86") {
    const continuation = segments.indexOf("(фасцикуляции)");
    if (continuation > 0) segments.splice(continuation - 1, 2, segments.slice(continuation - 1, continuation + 1).join(" "));
  }
  const text = segments.slice(0, -count).join("\n");
  const options = segments.slice(-count).map((option, index) =>
    option.replace(new RegExp("^(?:" + (index + 1) + "|[А-ЯA-Z])\\s*[.)]\\s+"), ""));
  const correct = options.flatMap((_, index) => Number(data["Right" + (index + 1)]) ? [index] : []);
  if (!text || !Number.isInteger(count) || count < 2 || count > 8 || options.length !== count || options.some(option => !option) || !correct.length) {
    throw new Error(id + ": check question, option separators and answer key");
  }
  const extraKeys = Array.from({ length: 8 - count }, (_, index) => count + index + 1)
    .filter(number => Number(data["Right" + number]));
  const keyNotes = [];
  if (extraKeys.length) keyNotes.push("В исходном ключе отмечены отсутствующие в тексте варианты № " + extraKeys.join(", ") + ".");
  if (id === "exam55-9-2-18") keyNotes.push("В формулировке есть «КРОМЕ», но исходный ключ отмечает четыре варианта.");
  const note = clean([data.QueryNote, data.Description, ...keyNotes].filter(Boolean).join("||"));
  return { text, options, correct, ...(note ? { note } : {}) };
}

for (const input of inputs) {
  const bytes = readFileSync(input);
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    source = new TextDecoder("windows-1251").decode(bytes);
  }
  const blocks = [...source.matchAll(/\[Test\]([\s\S]*?)\[EndTest\]([\s\S]*?)(?=\[Test\]|$)/gi)];
  if (!blocks.length) throw new Error("No Exam55 tests in " + input);
  for (const [, header, body] of blocks) {
    const meta = fields(header);
    const id = "exam55-" + meta.TestKurs + "-" + meta.TestNum;
    if (!meta.TestName || !/^\d+$/.test(meta.TestKurs) || !/^\d+$/.test(meta.TestNum)) throw new Error("Invalid test header in " + input);
    if (registered.has(id)) throw new Error("Duplicate test " + id);
    registered.add(id);
    const fullTitle = meta.TestNote?.startsWith(meta.TestName) ? meta.TestNote : meta.TestName;
    const title = fullTitle.replace(/\s+/g, " ");
    let kind = "lesson";
    if (/итогов|экзамен/i.test(title)) kind = "exam";
    else if (/модул|контроль/i.test(title)) kind = "module";
    const ids = [];
    for (const [, raw] of body.matchAll(/\[Query\]([\s\S]*?)\[EndQuery\]/gi)) {
      const data = fields(raw);
      const key = id + "-" + data.QueryID;
      if (!/^\d+$/.test(data.QueryID) || Object.hasOwn(questions, key)) throw new Error("Invalid or duplicate question " + key);
      questions[key] = parseQuestion(data, key);
      ids.push(key);
    }
    const declaredQuestions = Number(meta.QuestAll);
    const confirmed = confirmedQuestionCounts.get(id);
    const countConfirmed = confirmed?.declared === declaredQuestions && confirmed.actual === ids.length;
    if (!ids.length || (declaredQuestions !== ids.length && !countConfirmed)) {
      throw new Error(id + ": question count differs from export header");
    }
    const sample = Number(meta.QuestCount);
    tests.push({ id, title, kind, sample, questions: ids });
    if (/фармакокинетик/i.test(title)) parsedLessons.add("kinetics");
    if (/фармакодинамик/i.test(title)) parsedLessons.add("dynamics");
  }
}

const module = tests.find(test => test.id === originalModule);
if (module) {
  const kinetics = module.questions.filter(id => {
    const number = Number(id.split("-").at(-1));
    return number <= 46 && ![2, 6, 25, 26, 27].includes(number);
  });
  const themes = [
    { name: "kinetics", title: "Фармакокинетика", ids: kinetics },
    { name: "dynamics", title: "Фармакодинамика", ids: module.questions.filter(id => !kinetics.includes(id)) },
  ];
  for (const { name, title, ids } of themes) {
    if (!parsedLessons.has(name)) {
      tests.push({ id: "topic-" + name, title, kind: "lesson", sample: 10, questions: ids });
    }
  }
}

const kindOrder = { module: 0, lesson: 1, exam: 2 };
tests.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
const content = { tests, questions };
const version = createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 12);
const output = new URL("../farma-web/bank.js", import.meta.url);
writeFileSync(output, "window.FARMA_BANK = " + JSON.stringify({ version, ...content }, null, 2) + ";\n", "utf8");
console.log(tests.map(test => test.title + " — " + test.questions.length).join("\n"));

