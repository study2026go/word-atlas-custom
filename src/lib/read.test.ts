import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDictation, sanitizeReadProgress, scoreTFNG, splitSentences, validateBible, validateBook, validatePassages } from "./read";

test("splits pasted text into sentences", () => {
  assert.deepEqual(splitSentences("Hello world. How are you?\nI am fine!"), ["Hello world.", "How are you?", "I am fine!"]);
  assert.deepEqual(splitSentences("  \n\n  "), []);
  assert.deepEqual(splitSentences("No punctuation here"), ["No punctuation here"]);
});

test("dictation comparison ignores case and punctuation", () => {
  assert.equal(normalizeDictation("Hello, World!"), "hello world");
  assert.equal(normalizeDictation("  hello   world  "), "hello world");
  assert.notEqual(normalizeDictation("Hello world"), normalizeDictation("Hello there"));
});

test("scores TRUE/FALSE/NOT GIVEN answers", () => {
  const qs = [
    { q: "a", qZh: "甲", answer: "true" as const, why: "" },
    { q: "b", qZh: "乙", answer: "false" as const, why: "" },
    { q: "c", qZh: "丙", answer: "not given" as const, why: "" },
  ];
  assert.equal(scoreTFNG(qs, { 0: "true", 1: "true", 2: "not given" }), 2);
  assert.equal(scoreTFNG(qs, {}), 0);
});

test("sanitizes 书房 progress and drops malformed records", () => {
  const p = sanitizeReadProgress({
    version: 1,
    passages: {
      "p-a1-01": { done: true, answers: { 0: "true", x: "true", 1: 5 }, score: 2 },
      "bad id!": { done: true, answers: {}, score: 1 },
      "p-a1-02": "junk",
    },
    bookDone: [1, 2, "x", 500],
    bookListened: { "ch:3": 5, nope: 1, "ch:9": -1 },
    ownBook: { title: "My Book", text: "Hello world. ".repeat(100) },
    prefs: { rate: 2, bilingual: "yes", listenFirst: true, narration: "fr", font: 9 },
  });
  assert.deepEqual(Object.keys(p.passages), ["p-a1-01"]);
  assert.deepEqual(p.passages["p-a1-01"].answers, { 0: "true" });
  assert.deepEqual(p.bookDone, [1, 2]);
  assert.deepEqual(p.bookListened, { "ch:3": 5 });
  assert.equal(p.ownBook?.title, "My Book");
  assert.equal(p.prefs.rate, 1);
  assert.equal(p.prefs.bilingual, true);
  assert.equal(p.prefs.listenFirst, true);
  assert.equal(p.prefs.narration, "en");
  assert.equal(p.prefs.font, 1);
});

test("sanitizes Bible story progress (Step 2b)", () => {
  const p = sanitizeReadProgress({
    version: 1,
    bibleDone: ["noah", "jonah", "bad id!", 7],
    bibleListened: { "bible:noah": 12, "bible:jonah": 3, nope: 1, "bible:x": -2, "ch:3": 5 },
    bookDone: [1],
  });
  assert.deepEqual(p.bibleDone, ["noah", "jonah"]);
  assert.deepEqual(p.bibleListened, { "bible:noah": 12, "bible:jonah": 3 });
  assert.deepEqual(p.bookDone, [1]);
});

test("rejects other versions and caps a huge pasted book", () => {
  assert.deepEqual(sanitizeReadProgress({ version: 2 }).passages, {});
  const p = sanitizeReadProgress({ version: 1, ownBook: { title: "x".repeat(500), text: "a".repeat(300000) } });
  assert.equal(p.ownBook?.title.length, 100);
  assert.equal(p.ownBook?.text.length, 200000);
});

// F5 (audit fix): data-file loaders reject bad shapes and non-allow-listed audio URLs.
test("F5 rejects bad 书房 data and non-archive.org audio URLs", () => {
  assert.throws(() => validatePassages({ passages: "nope" }), /短文数据格式不对/);
  assert.throws(
    () =>
      validatePassages({
        passages: [{ id: "p1", level: "A1", title: "T", titleZh: "", topic: "x", minutes: 2, sentences: [{ en: "Hi.", zh: "" }], keywords: ["a"], questions: [{ q: "x", qZh: "", answer: "maybe", why: "" }] }],
      }),
    /短文数据格式不对/,
  );
  const goodBible = {
    stories: [
      {
        id: "noah", title: "Noah", titleZh: "", ref: "Genesis 6:5", refNoteZh: "", source: "WEB", sourceNote: "",
        audio: { reader: "R", source: "LibriVox", section: "S", title: "T", duration: "1:00", url: "https://www.archive.org/download/x/y.mp3", verified: true, note: "" },
        minutes: 1, words: 10, verses: [{ ref: "6:5", en: "God saw.", zh: "" }], keywords: ["a"],
      },
    ],
  };
  assert.equal(validateBible(goodBible).stories.length, 1);
  const badUrl = JSON.parse(JSON.stringify(goodBible));
  badUrl.stories[0].audio.url = "https://evil.example.com/x.mp3";
  assert.throws(() => validateBible(badUrl), /圣经故事数据格式不对/);
  const badVerse = JSON.parse(JSON.stringify(goodBible));
  badVerse.stories[0].verses = [{ ref: "6:5", en: 42, zh: "" }];
  assert.throws(() => validateBible(badVerse), /圣经故事数据格式不对/);
  assert.throws(() => validateBook({ chapters: [{ n: 0, title: "T", titleZh: "", keywords: [], sentences: [] }] }), /小王子数据格式不对/);
});
