// Sanity-checks the card data: unique ids, known topics, valid answers.
// Usage: node scripts/check-cards.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataDir = path.join(__dirname, "..", "docs", "data");
const ctx = { window: {} };
for (const f of ["topics.js", "exam-cards.js", "concept-cards.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(dataDir, f), "utf8"), ctx, { filename: f });
}
const { TOPICS, EXAM_CARDS, CONCEPT_CARDS } = ctx.window;
const topicIds = new Set(TOPICS.map((t) => t.id));
const errors = [];
const seen = new Set();

function checkCommon(c, fields) {
  if (seen.has(c.id)) errors.push(`duplicate id ${c.id}`);
  seen.add(c.id);
  for (const f of fields) if (!c[f]) errors.push(`${c.id}: missing ${f}`);
  if (!Array.isArray(c.topics) || !c.topics.length) errors.push(`${c.id}: no topics`);
  else for (const t of c.topics) if (!topicIds.has(t)) errors.push(`${c.id}: unknown topic ${t}`);
}

for (const c of EXAM_CARDS) {
  checkCommon(c, ["id", "exam", "q", "statement", "answer", "why"]);
  if (!["true", "false", "depends"].includes(c.answer)) errors.push(`${c.id}: bad answer ${c.answer}`);
  if (c.id !== `x${c.exam}${c.q}`) errors.push(`${c.id}: id does not match exam/q`);
}
for (const c of CONCEPT_CARDS) checkCommon(c, ["id", "q", "a", "src"]);

const perExam = {};
for (const c of EXAM_CARDS) perExam[c.exam] = (perExam[c.exam] || 0) + 1;
const perAnswer = {};
for (const c of EXAM_CARDS) perAnswer[c.answer] = (perAnswer[c.answer] || 0) + 1;
const perTopic = {};
for (const c of [...EXAM_CARDS, ...CONCEPT_CARDS]) for (const t of c.topics) perTopic[t] = (perTopic[t] || 0) + 1;

console.log(`exam statements: ${EXAM_CARDS.length}`, perExam);
console.log("answers:", perAnswer);
console.log(`concept cards: ${CONCEPT_CARDS.length}`);
console.log("cards per topic:", perTopic);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK");
