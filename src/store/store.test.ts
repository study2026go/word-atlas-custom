import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeProgress, sanitizeSettings, defaultSettings } from "./store";
import { nextNew } from "./session";

const card = { due: 1, s: 2, d: 5, el: 0, sd: 1, ls: 0, reps: 1, lapses: 0, st: 2, seen: 1 };

test("keeps valid progress and drops malformed records", () => {
  const p = sanitizeProgress(
    {
      version: 2,
      cards: { ok: card, bad: { ...card, d: 99 }, worse: "x" },
      bookmarks: ["ok", 3],
      days: { "2026-10-25": { n: 1, r: 2, c: 1, t: 30 }, nope: { n: 1, r: 1, c: 1, t: 1 } },
      typing: [{ at: 1, mode: "word", items: 10, wpm: 40, accuracy: 98 }, { at: 1, mode: "hack", items: 1, wpm: 1, accuracy: 1 }],
    },
    "word-atlas-open",
  );
  assert.deepEqual(Object.keys(p.cards), ["ok"]);
  assert.deepEqual(p.bookmarks, ["ok"]);
  assert.deepEqual(Object.keys(p.days), ["2026-10-25"]);
  assert.equal(p.typing.length, 1);
});

test("rejects other versions and unknown settings", () => {
  assert.deepEqual(sanitizeProgress({ version: 1, cards: { ok: card } }, "x").cards, {});
  const s = sanitizeSettings({ accent: "fr", dailyNew: 1e9, theme: "dark", retention: 0.5 });
  assert.equal(s.accent, "uk");
  assert.equal(s.dailyNew, 10);
  assert.equal(s.theme, "dark");
  assert.equal(s.retention, 0.9);
});

test("by-topic route: keeps valid route settings, drops invalid ones", () => {
  const s = sanitizeSettings({ routeMode: "topic", routeTopic: "education", listenFirst: false });
  assert.equal(s.routeMode, "topic");
  assert.equal(s.routeTopic, "education");
  assert.equal(s.listenFirst, false);
  const bad = sanitizeSettings({ routeMode: "by-topic", routeTopic: "Education!", listenFirst: "yes" });
  assert.equal(bad.routeMode, "level");
  assert.equal(bad.routeTopic, "education");
  assert.equal(bad.listenFirst, true);
});

test("by-topic route: new words come only from the chosen topic", () => {
  const atlas = {
    topics: [
      ["education", "教育"],
      ["daily", "生活"],
    ],
    words: [
      { id: "a", cefr: 0, topic: 0 },
      { id: "b", cefr: 2, topic: 1 },
      { id: "c", cefr: 0, topic: 0 },
      { id: "d", cefr: 0, topic: 1 },
    ],
  } as never;
  const p = { cards: { a: {} } } as never;
  const topic = nextNew(atlas, p, { ...defaultSettings, routeMode: "topic", routeTopic: "education" }, 10);
  assert.deepEqual(topic, ["c"]);
  const level = nextNew(atlas, p, { ...defaultSettings, routeMode: "level", startLevel: 0 }, 10);
  assert.deepEqual(level, ["b", "c", "d"]);
  const bad = nextNew(atlas, p, { ...defaultSettings, routeMode: "topic", routeTopic: "nope" }, 10);
  assert.deepEqual(bad, level);
});
