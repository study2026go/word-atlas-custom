import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Ear, Eye, EyeOff, Headphones, Languages, RotateCcw, Sparkles, SquarePen, Trash2, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "../atlas/context";
import { go, openWord, useLocation } from "../lib/router";
import { loadBook, loadPassages, normalizeDictation, scoreTFNG, setReadPrefs, splitSentences, updateRead, useReadProgress, type BookChapter, type BookFile, type Passage, type PassageFile, type ReadPrefs } from "../lib/read";
import { speakSentence, stopReading } from "../lib/read-audio";
import { store, useStore } from "../store/store";
import { shuffle } from "../lib/text";

type Tab = "passages" | "book";

export function Read() {
  const { route } = useLocation();
  const tab: Tab = route.page === "read" && route.tab === "book" ? "book" : "passages";
  const [passages, setPassages] = useState<PassageFile | null>(null);
  const [book, setBook] = useState<BookFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPassages().then(
      (f) => alive && setPassages(f),
      (e: Error) => alive && setError(e.message),
    );
    loadBook().then(
      (f) => alive && setBook(f),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
      stopReading();
    };
  }, []);

  if (error)
    return (
      <div className="page read">
        <header className="page-head">
          <p className="eyebrow">书房</p>
          <h1 className="display">书房</h1>
        </header>
        <p className="warn-text">{error}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    );
  if (!passages || !book)
    return (
      <div className="page read">
        <header className="page-head">
          <p className="eyebrow">书房</p>
          <h1 className="display">书房</h1>
        </header>
        <p className="muted">正在打开书页……</p>
      </div>
    );

  const id = route.page === "read" ? route.id : undefined;
  const ch = route.page === "read" ? route.ch : undefined;
  return (
    <div className="page read">
      <header className="page-head">
        <p className="eyebrow">书房</p>
        <h1 className="display">书房</h1>
        <p className="muted">读短文、读小王子，先听再看。进度只存在这台设备的浏览器里。</p>
      </header>

      <div className="segmented read-tabs" role="tablist" aria-label="书房分类">
        <button className={tab === "passages" ? "is-on" : ""} onClick={() => go({ page: "read", tab: "passages" })}>
          短文
        </button>
        <button className={tab === "book" ? "is-on" : ""} onClick={() => go({ page: "read", tab: "book" })}>
          原版书
        </button>
      </div>

      {tab === "passages" ? (
        id ? (
          <PassageReader passage={passages.passages.find((p) => p.id === id)} />
        ) : (
          <PassageList passages={passages.passages} />
        )
      ) : ch ? (
        <ChapterReader book={book} ch={ch} />
      ) : (
        <BookHome book={book} />
      )}
    </div>
  );
}

/* ---------- shared bits ---------- */

function RatePicker({ prefs }: { prefs: ReadPrefs }) {
  return (
    <div className="segmented segmented-sm" aria-label="朗读速度">
      {([0.8, 1, 1.2] as const).map((r) => (
        <button key={r} className={prefs.rate === r ? "is-on" : ""} onClick={() => setReadPrefs({ rate: r })}>
          {r}×
        </button>
      ))}
    </div>
  );
}

function KeywordChips({ keywords }: { keywords: string[] }) {
  const atlas = useAtlas();
  const known = keywords.filter((k) => atlas.byId.has(k));
  if (!known.length) return null;
  return (
    <div className="read-kws" aria-label="重点词">
      <span className="eyebrow">重点词 · 点一下看词卡</span>
      <div>
        {known.map((k) => {
          const ref = atlas.byId.get(k)!;
          return (
            <button key={k} className="read-kw" onClick={() => openWord(k)}>
              <b lang="en">{ref.word}</b>
              <small>{ref.zh}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One sentence row: listen-first hides the text until it has been played
 *  (or the reader taps 显示）. Playback is always the device voice. */
function SentenceRow({
  i,
  en,
  zh,
  bilingual,
  font,
  revealed,
  playing,
  onReveal,
  onPlay,
  onSlow,
}: {
  i: number;
  en: string;
  zh: string;
  bilingual: boolean;
  font: number;
  revealed: boolean;
  playing: boolean;
  onReveal: () => void;
  onPlay: () => void;
  onSlow: () => void;
}) {
  return (
    <li className={`read-sent ${revealed ? "is-open" : ""} ${playing ? "is-playing" : ""}`}>
      <span className="read-sent-no">{i + 1}</span>
      <div className="read-sent-body" style={{ fontSize: ["15px", "17px", "20px"][font] }}>
        {revealed ? (
          <>
            <p lang="en">{en}</p>
            {bilingual && zh && <p className="read-zh" lang="zh-CN">{zh}</p>}
          </>
        ) : (
          <p className="read-hidden">
            <Ear size={16} /> 先听发音，猜一猜这句是什么意思。
          </p>
        )}
      </div>
      <div className="read-sent-actions">
        <button className="icon-btn" onClick={onPlay} aria-label={playing ? "正在朗读" : `朗读第 ${i + 1} 句（设备朗读）`} title="朗读（设备朗读）">
          <Volume2 size={18} className={playing ? "is-on" : ""} />
        </button>
        <button className="icon-btn" onClick={onSlow} aria-label={`慢速朗读第 ${i + 1} 句`} title="慢速朗读 0.7×（设备朗读）">
          <span className="read-slow">0.7×</span>
        </button>
        {!revealed && (
          <button className="btn btn-ghost btn-sm" onClick={onReveal}>
            <Eye size={15} /> 显示
          </button>
        )}
      </div>
    </li>
  );
}

/** Sequential listen-first playback over a list of sentences. */
function useSentencePlayer(
  sentences: { en: string; zh: string }[],
  opts: { rate: number; narration: "en" | "zh"; accent: "uk" | "us"; onHeard: (i: number) => void },
) {
  const [playing, setPlaying] = useState(-1);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const stopRef = useRef(false);

  useEffect(() => () => stopReading(), []);
  const reveal = (i: number) => setRevealed((s) => new Set(s).add(i));

  const playOne = async (i: number, slow = false) => {
    stopRef.current = true;
    stopReading();
    stopRef.current = false;
    setPlaying(i);
    const s = sentences[i];
    const text = opts.narration === "zh" && s.zh ? s.zh : s.en;
    await speakSentence(text, { lang: opts.narration, accent: opts.accent, rate: slow ? 0.7 : opts.rate });
    if (!stopRef.current) {
      reveal(i);
      opts.onHeard(i);
    }
    setPlaying((p) => (p === i ? -1 : p));
  };

  const playAll = async (from = 0) => {
    stopRef.current = false;
    for (let i = from; i < sentences.length; i++) {
      if (stopRef.current) break;
      setPlaying(i);
      const s = sentences[i];
      const text = opts.narration === "zh" && s.zh ? s.zh : s.en;
      await speakSentence(text, { lang: opts.narration, accent: opts.accent, rate: opts.rate });
      if (stopRef.current) break;
      reveal(i);
      opts.onHeard(i);
    }
    setPlaying(-1);
  };

  const stop = () => {
    stopRef.current = true;
    stopReading();
    setPlaying(-1);
  };

  const revealAll = () => setRevealed(new Set(sentences.map((_, i) => i)));

  return { playing, revealed, reveal, revealAll, playOne, playAll, stop };
}

/* ---------- 短文 ---------- */

function PassageList({ passages }: { passages: Passage[] }) {
  const [level, setLevel] = useState("全部");
  const done = useReadProgress((s) => s.passages);
  const levels = ["全部", ...Array.from(new Set(passages.map((p) => p.level)))];
  const list = level === "全部" ? passages : passages.filter((p) => p.level === level);
  const doneCount = passages.filter((p) => done[p.id]?.done).length;
  return (
    <section>
      <p className="read-note">
        首批 <b>{passages.length} 篇原创短文</b>，A1–B1，每篇约 2 分钟、10 个重点词、3 道理解题。
        全部由本站原创，不是线上站那 732 篇的复制 —— 那些短文不在开源仓库里，无法搬过来。
      </p>
      <div className="segmented" aria-label="按级别筛选">
        {levels.map((l) => (
          <button key={l} className={level === l ? "is-on" : ""} onClick={() => setLevel(l)}>
            {l === "全部" ? "全部" : `${l}`}
          </button>
        ))}
      </div>
      <p className="muted">
        已读完 {doneCount} / {passages.length} 篇
      </p>
      <ul className="read-list">
        {list.map((p) => (
          <li key={p.id}>
            <button className="read-card" onClick={() => go({ page: "read", tab: "passages", id: p.id })}>
              <span className="read-card-level">{p.level}</span>
              <span className="read-card-body">
                <b lang="en">{p.title}</b>
                <small>{p.titleZh}</small>
              </span>
              <span className="read-card-meta">
                约 {p.minutes} 分钟 · {done[p.id]?.done ? "✓ 已读完" : "未读"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PassageReader({ passage }: { passage: Passage | undefined }) {
  const prefs = useReadProgress((s) => s.prefs);
  const state = useReadProgress((s) => (passage ? s.passages[passage.id] : undefined));
  const accent = useStore((s) => s.settings.accent);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);

  const player = useSentencePlayer(passage?.sentences ?? [], {
    rate: prefs.rate,
    narration: prefs.narration,
    accent,
    onHeard: () => {},
  });

  useEffect(() => {
    setAnswers(state?.answers ?? {});
    setChecked(!!state && Object.keys(state.answers).length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage?.id]);

  if (!passage)
    return (
      <section>
        <p className="warn-text">找不到这篇短文。</p>
        <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "passages" })}>
          回短文列表
        </button>
      </section>
    );

  const score = checked ? scoreTFNG(passage.questions, answers) : null;
  const check = () => {
    const s = scoreTFNG(passage.questions, answers);
    setChecked(true);
    updateRead((p) => ({
      ...p,
      passages: { ...p.passages, [passage.id]: { done: true, answers, score: s } },
    }));
  };

  return (
    <article>
      <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "passages" })}>
        <ArrowLeft size={17} /> 回短文列表
      </button>
      <header className="read-head">
        <p className="eyebrow">
          {passage.level} · {passage.topic} · 约 {passage.minutes} 分钟
        </p>
        <h2 lang="en">{passage.title}</h2>
        <p className="read-title-zh">{passage.titleZh}</p>
        {state?.done && (
          <p className="read-done">
            <Check size={16} /> 已读完{score !== null ? ` · 理解题 ${score} / ${passage.questions.length}` : ""}
          </p>
        )}
      </header>

      <div className="read-toolbar">
        <button className="btn btn-primary" onClick={() => void player.playAll(0)} disabled={player.playing >= 0}>
          <Headphones size={17} /> 听全文
        </button>
        {player.playing >= 0 && (
          <button className="btn btn-ghost" onClick={player.stop}>
            <X size={17} /> 停
          </button>
        )}
        <RatePicker prefs={prefs} />
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ bilingual: !prefs.bilingual })} aria-pressed={prefs.bilingual}>
          <Languages size={17} /> {prefs.bilingual ? "中英对照：开" : "中英对照：关"}
        </button>
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ listenFirst: !prefs.listenFirst })} aria-pressed={prefs.listenFirst}>
          {prefs.listenFirst ? <EyeOff size={17} /> : <Eye size={17} />} {prefs.listenFirst ? "先听模式：开" : "先听模式：关"}
        </button>
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ font: ((prefs.font + 1) % 3) as 0 | 1 | 2 })}>
          字号 {["小", "中", "大"][prefs.font]}
        </button>
      </div>
      <p className="read-audio-note">朗读是设备自带的声音（设备朗读），不是真人录音。先听一句，猜意思，再点显示。</p>

      <ol className="read-sentences">
        {passage.sentences.map((s, i) => (
          <SentenceRow
            key={i}
            i={i}
            en={s.en}
            zh={s.zh}
            bilingual={prefs.bilingual}
            font={prefs.font}
            revealed={!prefs.listenFirst || player.revealed.has(i)}
            playing={player.playing === i}
            onReveal={() => player.reveal(i)}
            onPlay={() => void player.playOne(i)}
            onSlow={() => void player.playOne(i, true)}
          />
        ))}
      </ol>
      <button className="btn btn-ghost" onClick={player.revealAll}>
        全部显示
      </button>

      <KeywordChips keywords={passage.keywords} />

      <section className="panel read-quiz">
        <h3 className="eyebrow">检查理解 · 判断题 · {passage.questions.length} 道</h3>
        <p className="muted">TRUE 正确 / FALSE 错误 / NOT GIVEN 未提及</p>
        {passage.questions.map((q, i) => (
          <div key={i} className="read-q">
            <p>
              <b>
                {i + 1}.{" "}
                <span lang="en">{q.q}</span>
              </b>
              <br />
              <small>{q.qZh}</small>
            </p>
            <div className="segmented" role="group" aria-label={`第 ${i + 1} 题`}>
              {(["true", "false", "not given"] as const).map((a) => (
                <button key={a} className={answers[i] === a ? "is-on" : ""} onClick={() => setAnswers((o) => ({ ...o, [i]: a }))}>
                  {a === "true" ? "TRUE" : a === "false" ? "FALSE" : "NOT GIVEN"}
                </button>
              ))}
            </div>
            {checked && (
              <p className={answers[i] === q.answer ? "read-correct" : "read-wrong"}>
                {answers[i] === q.answer ? "✓ 答对了。" : `✗ 正确答案是 ${q.answer === "true" ? "TRUE" : q.answer === "false" ? "FALSE" : "NOT GIVEN"}。`}
                {q.why}
              </p>
            )}
          </div>
        ))}
        <button className="btn btn-primary" onClick={check} disabled={Object.keys(answers).length < passage.questions.length}>
          检查答案
        </button>
        {score !== null && (
          <p className="read-score">
            得分 {score} / {passage.questions.length}
          </p>
        )}
      </section>
    </article>
  );
}

/* ---------- 原版书 ---------- */

function BookHome({ book }: { book: BookFile }) {
  const done = useReadProgress((s) => s.bookDone);
  const ownBook = useReadProgress((s) => s.ownBook);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const totalSentences = book.chapters.reduce((n, c) => n + c.sentences.length, 0);

  const saveOwn = () => {
    const t = text.trim();
    if (t.length < 20) return;
    updateRead((p) => ({ ...p, ownBook: { title: title.trim() || "我的书", text: t.slice(0, 200000) } }));
    setText("");
    setTitle("");
  };

  return (
    <section>
      <div className="panel read-book-intro">
        <h3 lang="en">The Little Prince</h3>
        <p className="read-title-zh">《小王子》简写版 · {book.chapters.length} 章 · {totalSentences} 句 · A2</p>
        <p className="muted">
          这是本站用自己的话写的简写版（A2 英语），不是原著全文，也不是任何已出版的译文。
          原著在美国仍受版权保护（1943 年首次出版，版权到 2039 年 1 月 1 日），所以本站不放原著全文。
          想读原著，请去图书馆借一本，或从下面链接借阅。
        </p>
        <p className="read-links">
          原著借阅：
          <a href="https://openlibrary.org/works/OL10263W/The_Little_Prince" target="_blank" rel="noreferrer">
            Open Library 借阅
          </a>{" "}
          ·{" "}
          <a href="http://gutenberg.net.au/ebooks03/0300771h.html" target="_blank" rel="noreferrer">
            法语原文（Project Gutenberg Australia，仅限公版地区）
          </a>
        </p>
      </div>

      <ul className="read-list">
        {book.chapters.map((c) => (
          <li key={c.n}>
            <button className="read-card" onClick={() => go({ page: "read", tab: "book", ch: String(c.n) })}>
              <span className="read-card-level">{done.includes(c.n) ? "✓" : `第 ${c.n} 章`}</span>
              <span className="read-card-body">
                <b lang="en">{c.title}</b>
                <small>{c.titleZh}</small>
              </span>
              <span className="read-card-meta">{c.sentences.length} 句</span>
            </button>
          </li>
        ))}
      </ul>

      <section className="panel read-own">
        <h3 className="eyebrow">读自己的书</h3>
        {ownBook ? (
          <>
            <p>
              <b>{ownBook.title}</b> · {splitSentences(ownBook.text).length} 句 · 已保存在这台设备上
            </p>
            <div className="read-actions">
              <button className="btn btn-primary" onClick={() => go({ page: "read", tab: "book", ch: "own" })}>
                继续读 <ArrowRight size={17} />
              </button>
              <button
                className="btn btn-ghost btn-danger"
                onClick={() => {
                  if (confirm("确定删除这本自己粘贴的书？")) updateRead((p) => ({ ...p, ownBook: null }));
                }}
              >
                <Trash2 size={17} /> 删除
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              把你自己合法得到的书的文字粘贴进来（比如你买的《小王子》），本站只在你的浏览器里断句、朗读和练听写，
              不会把文字传到任何服务器，也不会放进代码仓库。
            </p>
            <label className="field">
              <b>书名</b>
              <input className="read-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="比如：小王子（我的书）" />
            </label>
            <label className="field">
              <b>正文（英文）</b>
              <textarea className="read-input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="粘贴英文正文……" />
            </label>
            <button className="btn btn-primary" onClick={saveOwn} disabled={text.trim().length < 20}>
              <SquarePen size={17} /> 保存并开始读
            </button>
          </>
        )}
      </section>
    </section>
  );
}

function ChapterReader({ book, ch }: { book: BookFile; ch: string }) {
  const ownBook = useReadProgress((s) => s.ownBook);
  if (ch === "own" && ownBook) return <OwnBookReader title={ownBook.title} text={ownBook.text} />;
  const n = Number(ch);
  const chObj = book.chapters.find((c) => c.n === n);
  if (!chObj)
    return (
      <section>
        <p className="warn-text">找不到这一章。</p>
        <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "book" })}>
          回书架
        </button>
      </section>
    );
  return <ChapterBody book={book} ch={chObj} />;
}

function ChapterBody({ book, ch }: { book: BookFile; ch: BookChapter }) {
  const prefs = useReadProgress((s) => s.prefs);
  const done = useReadProgress((s) => s.bookDone);
  const accent = useStore((s) => s.settings.accent);
  const ambience = useStore((s) => s.settings.ambience);
  const isDone = done.includes(ch.n);
  const [mode, setMode] = useState<"choose" | "dictation" | null>(null);

  const player = useSentencePlayer(ch.sentences, {
    rate: prefs.rate,
    narration: prefs.narration,
    accent,
    onHeard: (i) => updateRead((p) => ({ ...p, bookListened: { ...p.bookListened, [`ch:${ch.n}`]: Math.max(p.bookListened[`ch:${ch.n}`] ?? -1, i) } })),
  });

  const toggleDone = () =>
    updateRead((p) => ({ ...p, bookDone: isDone ? p.bookDone.filter((x) => x !== ch.n) : [...p.bookDone, ch.n] }));

  const prev = book.chapters.find((c) => c.n === ch.n - 1);
  const next = book.chapters.find((c) => c.n === ch.n + 1);

  return (
    <article>
      <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "book" })}>
        <ArrowLeft size={17} /> 回书架
      </button>
      <header className="read-head">
        <p className="eyebrow">
          第 {ch.n} 章 / 共 {book.chapters.length} 章 · {ch.sentences.length} 句 · 简写版
        </p>
        <h2 lang="en">{ch.title}</h2>
        <p className="read-title-zh">{ch.titleZh}</p>
      </header>

      <div className="read-toolbar">
        <button className="btn btn-primary" onClick={() => void player.playAll(0)} disabled={player.playing >= 0}>
          <Headphones size={17} /> 听这一章
        </button>
        {player.playing >= 0 && (
          <button className="btn btn-ghost" onClick={player.stop}>
            <X size={17} /> 停
          </button>
        )}
        <RatePicker prefs={prefs} />
        <div className="segmented segmented-sm" aria-label="朗读语言">
          <button className={prefs.narration === "en" ? "is-on" : ""} onClick={() => setReadPrefs({ narration: "en" })}>
            英文朗读
          </button>
          <button className={prefs.narration === "zh" ? "is-on" : ""} onClick={() => setReadPrefs({ narration: "zh" })}>
            中文朗读
          </button>
        </div>
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ bilingual: !prefs.bilingual })} aria-pressed={prefs.bilingual}>
          <Languages size={17} /> {prefs.bilingual ? "中英对照：开" : "中英对照：关"}
        </button>
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ listenFirst: !prefs.listenFirst })} aria-pressed={prefs.listenFirst}>
          {prefs.listenFirst ? <EyeOff size={17} /> : <Eye size={17} />} {prefs.listenFirst ? "先听模式：开" : "先听模式：关"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => store.settings({ ambience: ambience === "stars" ? "off" : "stars" })}
          aria-pressed={ambience === "stars"}
          title="星空环境声（用本站已有的氛围音效）"
        >
          <Sparkles size={17} /> 星空氛围：{ambience === "stars" ? "开" : "关"}
        </button>
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ font: ((prefs.font + 1) % 3) as 0 | 1 | 2 })}>
          字号 {["小", "中", "大"][prefs.font]}
        </button>
      </div>
      <p className="read-audio-note">朗读是设备自带的声音（设备朗读），不是真人录音。先听一句，猜意思，再点显示；也可以点「听这一章」连续听。</p>

      <ol className="read-sentences">
        {ch.sentences.map((s, i) => (
          <SentenceRow
            key={i}
            i={i}
            en={s.en}
            zh={s.zh}
            bilingual={prefs.bilingual}
            font={prefs.font}
            revealed={!prefs.listenFirst || player.revealed.has(i)}
            playing={player.playing === i}
            onReveal={() => player.reveal(i)}
            onPlay={() => void player.playOne(i)}
            onSlow={() => void player.playOne(i, true)}
          />
        ))}
      </ol>
      <div className="read-actions">
        <button className="btn btn-ghost" onClick={player.revealAll}>
          全部显示
        </button>
        <button className={`btn ${isDone ? "btn-ghost" : "btn-primary"}`} onClick={toggleDone}>
          <Check size={17} /> {isDone ? "已读完，再读一遍" : "读完了"}
        </button>
      </div>

      <KeywordChips keywords={ch.keywords} />

      <section className="panel read-practice">
        <h3 className="eyebrow">听力练习 · 本章句子</h3>
        <div className="segmented" role="group" aria-label="练习方式">
          <button className={mode === "choose" ? "is-on" : ""} onClick={() => setMode(mode === "choose" ? null : "choose")}>
            听句选意
          </button>
          <button className={mode === "dictation" ? "is-on" : ""} onClick={() => setMode(mode === "dictation" ? null : "dictation")}>
            听写
          </button>
        </div>
        {mode === "choose" && <ListenChoose sentences={ch.sentences} prefs={prefs} accent={accent} />}
        {mode === "dictation" && <Dictation sentences={ch.sentences} prefs={prefs} accent={accent} />}
      </section>

      <nav className="read-nav">
        {prev ? (
          <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "book", ch: String(prev.n) })}>
            <ChevronLeft size={17} /> 上一章：{prev.titleZh}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "book", ch: String(next.n) })}>
            下一章：{next.titleZh} <ChevronRight size={17} />
          </button>
        )}
      </nav>
    </article>
  );
}

/** 听句选意：播一句英文，从 4 个中文意思里选。 */
function ListenChoose({
  sentences,
  prefs,
  accent,
}: {
  sentences: { en: string; zh: string }[];
  prefs: ReadPrefs;
  accent: "uk" | "us";
}) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * sentences.length));
  const [picked, setPicked] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const options = useMemo(() => {
    const others = shuffle(
      sentences.map((_, i) => i).filter((i) => i !== idx),
      idx + 7,
    ).slice(0, 3);
    return shuffle([idx, ...others], idx + 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  const nextQ = () => {
    stopReading();
    setPlaying(false);
    setPicked(null);
    setIdx(Math.floor(Math.random() * sentences.length));
  };
  const playQ = async () => {
    setPlaying(true);
    await speakSentence(sentences[idx].en, { lang: "en", accent, rate: prefs.rate });
    setPlaying(false);
  };
  return (
    <div className="read-listen">
      <p className="muted">先听，再选这句的中文意思。句子本身先不显示。</p>
      <div className="read-actions">
        <button className="btn btn-primary" onClick={() => void playQ()} disabled={playing}>
          <Volume2 size={17} /> {playing ? "正在朗读……" : "播这句（设备朗读）"}
        </button>
        <button className="btn btn-ghost" onClick={() => void playQ()} disabled={playing}>
          慢速 0.7×
        </button>
      </div>
      <div className="read-opts">
        {options.map((oi) => (
          <button
            key={oi}
            className={`read-opt ${picked === oi ? (oi === idx ? "is-right" : "is-wrong") : ""}`}
            onClick={() => setPicked(oi)}
            disabled={picked !== null}
          >
            {sentences[oi].zh}
          </button>
        ))}
      </div>
      {picked !== null && (
        <p className={picked === idx ? "read-correct" : "read-wrong"}>
          {picked === idx ? "✓ 选对了。" : "✗ 不对，再听一遍。"}
          <span lang="en"> {sentences[idx].en}</span>
        </p>
      )}
      {picked !== null && (
        <button className="btn btn-ghost" onClick={nextQ}>
          <RotateCcw size={16} /> 下一句
        </button>
      )}
    </div>
  );
}

/** 听写：播一句，凭听到的写下来，再对照。 */
function Dictation({
  sentences,
  prefs,
  accent,
}: {
  sentences: { en: string; zh: string }[];
  prefs: ReadPrefs;
  accent: "uk" | "us";
}) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * sentences.length));
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const target = sentences[idx];
  const ok = checked && normalizeDictation(value) === normalizeDictation(target.en);
  const nextQ = () => {
    stopReading();
    setPlaying(false);
    setValue("");
    setChecked(false);
    setIdx(Math.floor(Math.random() * sentences.length));
  };
  const playQ = async (slow = false) => {
    setPlaying(true);
    await speakSentence(target.en, { lang: "en", accent, rate: slow ? 0.7 : prefs.rate });
    setPlaying(false);
  };
  return (
    <div className="read-listen">
      <p className="muted">听一句，写下来。大小写和标点不算错，词对了就行。</p>
      <p className="read-hint">中文提示：{target.zh}</p>
      <div className="read-actions">
        <button className="btn btn-primary" onClick={() => void playQ()} disabled={playing}>
          <Volume2 size={17} /> {playing ? "正在朗读……" : "播这句（设备朗读）"}
        </button>
        <button className="btn btn-ghost" onClick={() => void playQ(true)} disabled={playing}>
          慢速 0.7×
        </button>
      </div>
      <textarea className="read-input" rows={3} value={value} onChange={(e) => setValue(e.target.value)} placeholder="听到什么，就写什么……" lang="en" />
      <div className="read-actions">
        <button className="btn btn-primary" onClick={() => setChecked(true)} disabled={!value.trim()}>
          对照
        </button>
        {checked && (
          <button className="btn btn-ghost" onClick={nextQ}>
            <RotateCcw size={16} /> 下一句
          </button>
        )}
      </div>
      {checked && (
        <div className={ok ? "read-correct" : "read-wrong"}>
          <p>{ok ? "✓ 全对，很好。" : "✗ 有出入，对照一下："}</p>
          <p lang="en">原句：{target.en}</p>
          {!ok && <p lang="en">你写的：{value}</p>}
        </div>
      )}
    </div>
  );
}

/** 读自己的书：粘贴的文字断句后，用同样的先听方式读。 */
function OwnBookReader({ title, text }: { title: string; text: string }) {
  const prefs = useReadProgress((s) => s.prefs);
  const accent = useStore((s) => s.settings.accent);
  const sentences = useMemo(() => splitSentences(text).map((en) => ({ en, zh: "" })), [text]);
  const player = useSentencePlayer(sentences, {
    rate: prefs.rate,
    narration: "en",
    accent,
    onHeard: () => {},
  });
  return (
    <article>
      <button className="btn btn-ghost" onClick={() => go({ page: "read", tab: "book" })}>
        <ArrowLeft size={17} /> 回书架
      </button>
      <header className="read-head">
        <p className="eyebrow">我自己的书 · {sentences.length} 句</p>
        <h2>{title}</h2>
        <p className="muted">这是你粘贴的文字，只存在这台设备上，没有传到任何地方。</p>
      </header>
      <div className="read-toolbar">
        <button className="btn btn-primary" onClick={() => void player.playAll(0)} disabled={player.playing >= 0}>
          <Headphones size={17} /> 听全文
        </button>
        {player.playing >= 0 && (
          <button className="btn btn-ghost" onClick={player.stop}>
            <X size={17} /> 停
          </button>
        )}
        <RatePicker prefs={prefs} />
        <button className="btn btn-ghost" onClick={() => setReadPrefs({ listenFirst: !prefs.listenFirst })} aria-pressed={prefs.listenFirst}>
          {prefs.listenFirst ? <EyeOff size={17} /> : <Eye size={17} />} {prefs.listenFirst ? "先听模式：开" : "先听模式：关"}
        </button>
      </div>
      <p className="read-audio-note">朗读是设备自带的声音（设备朗读），不是真人录音。</p>
      <ol className="read-sentences">
        {sentences.map((s, i) => (
          <SentenceRow
            key={i}
            i={i}
            en={s.en}
            zh=""
            bilingual={false}
            font={prefs.font}
            revealed={!prefs.listenFirst || player.revealed.has(i)}
            playing={player.playing === i}
            onReveal={() => player.reveal(i)}
            onPlay={() => void player.playOne(i)}
            onSlow={() => void player.playOne(i, true)}
          />
        ))}
      </ol>
      <button className="btn btn-ghost" onClick={player.revealAll}>
        全部显示
      </button>
    </article>
  );
}
