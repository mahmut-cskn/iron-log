const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync(
  require("node:path").join(__dirname, "../index.html"),
  "utf8",
);
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
function boot(initial) {
  const storage = new Map(
    initial ? [["iron-log-state", JSON.stringify(initial)]] : [],
  );
  const elements = new Map();
  const sandbox = {
    console: { error() {}, table() {} },
    setTimeout() {},
    clearTimeout() {},
    document: {
      getElementById(id) {
        if (!elements.has(id))
          elements.set(id, { textContent: "", innerHTML: "", remove() {} });
        return elements.get(id);
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    },
  };
  sandbox.window = sandbox;
  const end = script.lastIndexOf("        render();");
  const exposed =
    "globalThis.api = {state, seedData, validateData, migrateData, seedAdditionalPrograms, createSession, getWorkoutRecommendation, buildRecommendationContext, calculateTemplateScore, getDaysSince, getSessionCompletionRatio, previousResult, sessionMetadata};";
  vm.runInNewContext(
    script.slice(0, end) +
      exposed +
      script.slice(end + "        render();".length),
    sandbox,
  );
  return { api: sandbox.api, storage, elements };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const { api } = boot();
const base = plain(api.state);
assert.equal(base.version, 2);
assert.equal(base.templates.length, 8);
assert.equal(base.sessions.length, 0);
const fixed = "2026-09-20"; // Sunday
const template = (id) => base.templates.find((t) => t.id === id);
function session(id, date, ratio = 1) {
  const s = plain(api.createSession(template(id), date, true, base));
  s.status = "completed";
  s.startedAt = date + "T10:00:00+03:00";
  s.completedAt = date + "T11:00:00+03:00";
  const sets = s.results.flatMap((r) => r.sets);
  sets.forEach((set, i) => {
    set.done = i < Math.floor(sets.length * ratio);
    set.reps = 8;
    set.assistance = 65;
    set.weight = 30;
    set.duration = 60;
    set.distance = 500;
  });
  return s;
}
function score(sessions, id) {
  return api.calculateTemplateScore(
    template(id),
    api.buildRecommendationContext({ ...base, sessions }, fixed),
  );
}
function rec(sessions) {
  return api.getWorkoutRecommendation({ ...base, sessions }, fixed);
}
const backYesterday = session("split-back-biceps", "2026-09-19");
// TEST 1: yesterday's back workout loses to legs.
assert(
  score([backYesterday], "split-back-biceps").score <
    score([backYesterday], "split-legs").score,
);
assert.notEqual(rec([backYesterday]).templateId, "split-back-biceps");
// TEST 2: near consecutive back + hard mode penalizes repetition.
const close = [
  session("split-back-biceps", "2026-09-18"),
  session("hard-mode", "2026-09-19"),
];
assert(score(close, "split-back-biceps").parts.streak < 0);
assert(
  score(close, "split-back-biceps").score < score(close, "split-legs").score,
);
// TEST 3: seven-day-old back + hard mode do not impose recovery/load/streak penalties.
const old = [
  session("split-back-biceps", "2026-09-13"),
  session("hard-mode", "2026-09-12"),
];
const oldScore = score(old, "split-back-biceps");
for (const key of ["recovery", "load", "streak", "overall"])
  assert.equal(Math.abs(oldScore.parts[key]), 0);
assert(oldScore.score > score(close, "split-back-biceps").score);
assert.equal(
  api.getWorkoutRecommendation(
    { ...base, templates: [template("split-back-biceps")], sessions: old },
    fixed,
  ).templateId,
  "split-back-biceps",
);
// TEST 4: neglected legs rank highly against yesterday's back.
const neglected = [session("split-legs", "2026-09-10"), backYesterday];
assert.equal(rec(neglected).templateId, "split-legs");
assert(rec(neglected).reasons.some((r) => r.includes("10 gündür")));
// TEST 5: Sunday cannot override yesterday's hard training.
const yesterdayHard = [session("hard-mode", "2026-09-19")];
assert.notEqual(rec(yesterdayHard).templateId, "hard-mode");
assert.equal(score(yesterdayHard, "hard-mode").parts.sunday, 0);
assert(score(yesterdayHard, "full-body").score < score([], "full-body").score);
// TEST 6: empty history => balanced Full Body, not Hard Mode.
assert.equal(rec([]).templateId, "full-body");
assert(rec([]).reasons[0].includes("Henüz yeterli"));
// TEST 7 is covered in browser integration: alternate template stays startable.
// TEST 8: same exercise ID across hard/back programs resolves previous performance.
const historic = plain(session("hard-mode", "2026-09-19"));
api.state.sessions = [historic];
const active = api.createSession(
  template("split-back-biceps"),
  fixed,
  false,
  base,
);
assert.equal(api.previousResult("pull", active).session.id, historic.id);
assert.equal(api.previousResult("pull", active).result.sets[0].assistance, 65);
// Only completed records count, future dates and blank completed sessions are ignored.
const blank = session("hard-mode", "2026-09-19", 0),
  draft = { ...backYesterday, status: "draft" },
  future = session("hard-mode", "2026-09-21");
assert.equal(rec([blank, draft, future]).templateId, "full-body");
const sparse = session("hard-mode", "2026-09-19", 0.1);
assert(
  score([sparse], "split-legs").parts.load >
    score(yesterdayHard, "split-legs").parts.load,
);
assert.equal(rec([session("hard-mode", "2026-09-06")]).templateId, "full-body");
assert.equal(api.getDaysSince("2026-03-28", "2026-03-30"), 2); // DST independent
assert.equal(api.getDaysSince("2026-12-31", "2027-01-01"), 1);
// Renaming affects neither scores nor captured session metadata.
const renamed = plain(template("hard-mode"));
renamed.name = "Pazar keyfi";
assert.equal(
  api.calculateTemplateScore(
    renamed,
    api.buildRecommendationContext({ ...base, sessions: yesterdayHard }, fixed),
  ).score,
  score(yesterdayHard, "hard-mode").score,
);
renamed.muscleGroups.primary = [];
assert.equal(historic.muscleGroups.primary.length, 4);
// v1 migration preserves exact histories and user definitions, including an active session.
const legacy = plain(base);
legacy.version = 1;
legacy.templates = legacy.templates.slice(0, 2);
legacy.exercises = legacy.exercises.filter((e) =>
  [
    "row",
    "pull",
    "leg",
    "cable",
    "shoulder",
    "lateral",
    "plank",
    "hang",
    "walk",
    "bike",
    "rdl",
    "lat",
    "incline",
    "face",
    "push",
    "knee",
  ].includes(e.id),
);
legacy.templates.forEach((t) => {
  delete t.muscleGroups;
  delete t.intensity;
});
legacy.settings = { activeSessionId: null, customPreference: "keep" };
legacy.exercises.push({
  id: "custom-preacher",
  name: "Preacher Curl",
  icon: "💪",
  type: "weight_reps",
  defaultSets: 4,
  minReps: 5,
  maxReps: 9,
  notes: "User entry",
});
legacy.templates.push({
  id: "custom-template",
  name: "Kendi programım",
  exercises: [
    {
      id: "custom-entry",
      exerciseId: "custom-preacher",
      sets: 4,
      target: "4 × 5–9",
    },
  ],
});
const oldSession = plain(
  api.createSession(legacy.templates[0], "2026-09-10", true, legacy),
);
delete oldSession.muscleGroups;
delete oldSession.intensity;
oldSession.status = "completed";
oldSession.completedAt = "2026-09-10T11:00:00+03:00";
oldSession.notes = "Do not rewrite me";
oldSession.results[1].sets[0].done = true;
const oldActive = plain(oldSession);
oldActive.id = "old-active";
oldActive.status = "active";
oldActive.completedAt = null;
legacy.sessions = [oldSession, oldActive];
legacy.settings.activeSessionId = oldActive.id;
const before = JSON.stringify(legacy);
const migrated = plain(api.validateData(legacy));
assert.equal(JSON.stringify(legacy), before);
assert.deepEqual(migrated.sessions, legacy.sessions);
assert.equal(migrated.settings.activeSessionId, "old-active");
assert.equal(migrated.settings.customPreference, "keep");
for (const original of legacy.exercises)
  assert.deepEqual(
    migrated.exercises.find((e) => e.id === original.id),
    original,
  );
for (const original of legacy.templates) {
  const t = migrated.templates.find((t) => t.id === original.id);
  assert.equal(t.name, original.name);
  assert.deepEqual(t.exercises, original.exercises);
}
assert.equal(
  migrated.exercises.filter((e) => e.name === "Preacher Curl").length,
  1,
);
assert.equal(
  migrated.templates
    .find((t) => t.id === "split-back-biceps")
    .exercises.find((e) => e.exerciseId === "custom-preacher").sets,
  3,
);
assert.equal(migrated.templates.length, 9);
// Twenty reloads do not reseed, rewrite history, or duplicate definitions.
let reloaded = migrated;
for (let i = 0; i < 20; i++) {
  reloaded = plain(boot(reloaded).api.state);
  assert.deepEqual(reloaded, migrated);
}
const once = plain(migrated);
api.seedAdditionalPrograms(once);
assert.deepEqual(plain(once), migrated);
const deleted = plain(migrated);
deleted.templates = deleted.templates.filter((t) => t.id !== "split-legs");
deleted.exercises = deleted.exercises.filter((e) => e.id !== "elliptical");
api.seedAdditionalPrograms(deleted);
assert(!deleted.templates.some((t) => t.id === "split-legs"));
assert(!deleted.exercises.some((e) => e.id === "elliptical"));
const invalid = plain(base);
invalid.templates[0].muscleGroups.primary = ["not-a-muscle"];
assert.throws(() => api.validateData(invalid));
assert.throws(() => api.validateData({ ...base, version: 99 }));
// Legacy classification never reads current template mutations.
const beforeMeta = plain(api.sessionMetadata(oldSession));
legacy.templates[0].name = "Different";
legacy.templates[0].muscleGroups = { primary: ["chest"], secondary: [] };
assert.deepEqual(plain(api.sessionMetadata(oldSession)), beforeMeta);
assert.equal(
  api.getWorkoutRecommendation({ ...base, templates: [] }, fixed),
  null,
);
console.log(
  "Recommendation: requested scoring scenarios, v1 migration, 20 reloads, snapshot preservation and edge cases passed.",
);
