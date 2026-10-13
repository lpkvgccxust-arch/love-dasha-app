import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { CSSProperties, ReactNode } from "react";
import dayjs from "dayjs";
// @ts-ignore canvas-confetti may not ship declarations in every Vite setup
import confetti from "canvas-confetti";
import { ChevronLeft, Gamepad2, Heart, Mail, Sparkles, Stars, WandSparkles, Zap } from "lucide-react";
import "./styles.css";

type View = "home" | "compliment" | "letter" | "game";
type GemKind = "heart" | "moon" | "flower" | "butterfly" | "sapphire" | "star";
type Special = "none" | "row" | "column" | "nova";
type Cell = { kind: GemKind; special: Special } | null;
type GamePhase = "playing" | "won" | "lost";

const START_DATE = "2025-09-30";
const START_LABEL = "30 сентября 2025";
const ROWS = 7;
const COLS = 7;
const MAX_LEVEL = 6;
const DEFAULT_HINT = "Собери три кристалла рядом и разбуди магию";
const GEM_KINDS: GemKind[] = ["heart", "moon", "flower", "butterfly", "sapphire", "star"];
const GEM_LABELS: Record<GemKind, string> = { heart: "сердечко", moon: "лунный камень", flower: "цветок", butterfly: "бабочка", sapphire: "сапфир", star: "звезда" };
const LEVELS = [
  { goal: 900, moves: 20, title: "Искра рассвета" },
  { goal: 1500, moves: 22, title: "Сад бабочек" },
  { goal: 2300, moves: 24, title: "Лунный бал" },
  { goal: 3200, moves: 25, title: "Крылья мечты" },
  { goal: 4300, moves: 27, title: "Корона феи" },
  { goal: 5600, moves: 30, title: "Звёздное сердце" },
];
const COMPLIMENTS = ["Даша, у тебя невероятная улыбка ✨", "Ты самая милая и нежная ❤️", "Ты делаешь мой мир ярче", "Ты особенная для меня", "Рядом с тобой всё становится теплее", "Мне очень повезло встретить тебя ❤️", "Ты настоящая магия в моей жизни"];
const LETTER_TEXT = `Дорогая Даша ❤️

Я сделал это маленькое приложение для тебя,
чтобы даже в обычный день ты могла открыть его
и почувствовать, как сильно ты мне дорога.

Ты очень красивая, добрая и особенная.
С тобой всё ощущается по-настоящему теплее.

Спасибо тебе за эмоции, за улыбку,
за моменты, которые делают жизнь ярче.

Пусть это приложение каждый раз напоминает тебе,
какая ты чудесная.

Люблю тебя.`;

declare global { interface Window { Telegram?: { WebApp?: { ready: () => void; expand: () => void; requestFullscreen?: () => void; disableVerticalSwipes?: () => void; HapticFeedback?: { impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void; notificationOccurred?: (type: "error" | "success" | "warning") => void } } } } }

const indexOf = (row: number, col: number) => row * COLS + col;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const random = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)];
const cloneCell = (cell: Cell): Cell => (cell ? { ...cell } : null);
const cloneBoard = (board: Cell[]) => board.map(cloneCell);

function haptic(type: "light" | "medium" | "success" | "error") { try { const api = window.Telegram?.WebApp?.HapticFeedback; if (type === "light" || type === "medium") api?.impactOccurred?.(type); else api?.notificationOccurred?.(type); } catch { /* optional */ } }

let audioContext: AudioContext | null = null;
function chime(type: "tap" | "match" | "win" | "error") {
  try {
    const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audioContext ||= new Context();
    const context = audioContext;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = type === "win" ? 660 : type === "match" ? 480 : type === "error" ? 160 : 300;
    const duration = type === "win" ? .55 : .16;
    gain.gain.setValueAtTime(.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(type === "tap" ? .025 : .06, context.currentTime + .015); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  } catch { /* sound is optional */ }
}

function SvgGem({ kind, special }: { kind: GemKind; special: Special }) {
  const colors: Record<GemKind, [string, string]> = { heart: ["#ff83bf", "#c83f92"], moon: ["#a9a1ff", "#655bd0"], flower: ["#ffb5de", "#d95baf"], butterfly: ["#7fe4ee", "#448bd5"], sapphire: ["#8ed5ff", "#476cc9"], star: ["#ffe79b", "#e88e55"] };
  const [light, dark] = colors[kind];
  const id = `g-${kind}-${special}`;
  const body = kind === "heart" ? <path d="M18 31S5 23 5 13a7 7 0 0 1 13-4 7 7 0 0 1 13 4c0 10-13 18-13 18Z" /> : kind === "moon" ? <path d="M28 5a13 13 0 1 0 2 21A14 14 0 0 1 28 5Z" /> : kind === "flower" ? <path d="M18 17c-7-12 7-16 7-5 8-8 15 4 5 8 10 5-1 15-7 6-5 10-16 0-7-6-10-5-5-16 2-3Z" /> : kind === "butterfly" ? <path d="M18 18c-2-11-10-13-12-7-2 5 3 8 9 9-7 1-9 7-5 9 5 2 8-4 8-10 0 6 3 12 8 10 4-2 2-8-5-9 6-1 11-4 9-9-2-6-10-4-12 7Z" /> : kind === "sapphire" ? <path d="m18 3 12 9-5 16H11L6 12l12-9Z" /> : <path d="m18 3 3.6 9.2L31 14l-7.2 6.2L26 29l-8-5-8 5 2.2-8.8L5 14l9.4-1.8L18 3Z" />;
  return <svg className={`svg-gem gem-${kind} special-${special}`} viewBox="0 0 36 36" aria-hidden="true"><defs><linearGradient id={id} x1="5" y1="4" x2="30" y2="33"><stop stopColor={light} /><stop offset="1" stopColor={dark} /></linearGradient></defs><g fill={`url(#${id})`} stroke="rgba(255,255,255,.8)" strokeWidth=".8">{body}</g><path d="M11 9c3-3 6-4 9-4" fill="none" stroke="rgba(255,255,255,.8)" strokeLinecap="round" strokeWidth="2" opacity=".72" />{special !== "none" && <path d={special === "row" ? "M5 18h26M25 13l6 5-6 5" : special === "column" ? "M18 5v26M13 11l5-6 5 6" : "M18 7v22M7 18h22"} fill="none" stroke="#fff7c8" strokeLinecap="round" strokeWidth="1.8" />}</svg>;
}

function matches(board: Cell[]) {
  const found = new Set<number>();
  for (let r = 0; r < ROWS; r++) { let start = 0; for (let c = 1; c <= COLS; c++) { const a = c < COLS ? board[indexOf(r, c)] : null; const b = board[indexOf(r, c - 1)]; if (a && b && a.kind === b.kind) continue; if (c - start >= 3 && b) for (let x = start; x < c; x++) found.add(indexOf(r, x)); start = c; } }
  for (let c = 0; c < COLS; c++) { let start = 0; for (let r = 1; r <= ROWS; r++) { const a = r < ROWS ? board[indexOf(r, c)] : null; const b = board[indexOf(r - 1, c)]; if (a && b && a.kind === b.kind) continue; if (r - start >= 3 && b) for (let x = start; x < r; x++) found.add(indexOf(x, c)); start = r; } }
  return [...found];
}

function swap(board: Cell[], a: number, b: number) { const next = cloneBoard(board); [next[a], next[b]] = [next[b], next[a]]; return next; }
function adjacent(a: number, b: number) { const ar = Math.floor(a / COLS), ac = a % COLS, br = Math.floor(b / COLS), bc = b % COLS; return Math.abs(ar - br) + Math.abs(ac - bc) === 1; }
function playable(board: Cell[]) { for (let i = 0; i < board.length; i++) { if (i % COLS < COLS - 1 && matches(swap(board, i, i + 1)).length) return true; if (i < board.length - COLS && matches(swap(board, i, i + COLS)).length) return true; } return false; }
function makeBoard(): Cell[] { for (let attempt = 0; attempt < 500; attempt++) { const board: Cell[] = Array.from({ length: ROWS * COLS }, (): Cell => ({ kind: random(GEM_KINDS), special: "none" })); if (!matches(board).length && playable(board)) return board; } return Array.from({ length: ROWS * COLS }, (_, i): Cell => ({ kind: GEM_KINDS[(i + Math.floor(i / COLS)) % GEM_KINDS.length], special: "none" })); }
function remove(board: Cell[], list: number[]) { const set = new Set(list); return board.map((cell, i) => set.has(i) ? null : cell); }
function fall(board: Cell[]): Cell[] { const next = cloneBoard(board); for (let c = 0; c < COLS; c++) { const column: Cell[] = []; for (let r = ROWS - 1; r >= 0; r--) { const cell = next[indexOf(r, c)]; if (cell !== null) column.push(cell); } for (let r = ROWS - 1; r >= 0; r--) next[indexOf(r, c)] = column[ROWS - 1 - r] ?? { kind: random(GEM_KINDS), special: "none" }; } return next; }
function plural(n: number, forms: [string, string, string]) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2]; }

function Match3Game() {
  const [level, setLevel] = useState(1); const config = LEVELS[level - 1];
  const [board, setBoard] = useState<Cell[]>(makeBoard); const [selected, setSelected] = useState<number | null>(null); const [score, setScore] = useState(0); const [moves, setMoves] = useState(config.moves); const [combo, setCombo] = useState(0); const [phase, setPhase] = useState<GamePhase>("playing"); const [hint, setHint] = useState(DEFAULT_HINT); const [effects, setEffects] = useState(0); const [toast, setToast] = useState(""); const [boosters, setBoosters] = useState({ wand: 2, rainbow: 1, lightning: 1 });
  const busy = useRef(false); const alive = useRef(true); const toastTimer = useRef<number | undefined>(undefined); const swipe = useRef<{ index: number; x: number; y: number } | null>(null);
  useEffect(() => () => { alive.current = false; if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);
  const announce = useCallback((message: string) => { setToast(message); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 1500); }, []);
  const magic = useCallback((message?: string) => { setEffects((value) => value + 1); if (message) announce(message); }, [announce]);
  const reset = useCallback((nextLevel = level) => { setLevel(nextLevel); setBoard(makeBoard()); setScore(0); setMoves(LEVELS[nextLevel - 1].moves); setCombo(0); setPhase("playing"); setSelected(null); setHint(DEFAULT_HINT); setBoosters({ wand: 2, rainbow: 1, lightning: 1 }); }, [level]);
  const process = async (start: Cell[]) => { let current = start; let total = 0; let chain = 0; while (true) { const found = matches(current); if (!found.length) break; total += found.length; chain++; const marked = cloneBoard(current); found.forEach((i) => { const cell = marked[i]; if (!cell) return; marked[i] = { ...cell, special: found.length >= 5 ? "nova" : found.length === 4 ? (i % COLS === Math.floor(i / COLS) ? "row" : "column") : "none" }; }); current = remove(marked, found); if (!alive.current) return null; setBoard(current); magic(chain > 1 ? `Каскад ×${chain}` : "Магия! ✦"); await wait(150); if (!alive.current) return null; current = fall(current); setBoard(current); await wait(170); if (!alive.current) return null; } return { board: current, total, chain }; };
  const completeTurn = (removedCount: number, chain: number) => { const gained = removedCount * 20 * Math.max(1, chain); const nextScore = score + gained; const nextMoves = moves - 1; setScore(nextScore); setMoves(nextMoves); setCombo(chain > 1 ? combo + 1 : Math.max(0, combo - 1)); if (nextScore >= config.goal) { if (level < MAX_LEVEL) { setPhase("won"); announce(`Уровень ${level} пройден!`); chime("win"); haptic("success"); confetti({ particleCount: 100, spread: 95, origin: { y: .6 }, colors: ["#ff7fbd", "#a695ff", "#ffe29a", "#8de9ff"] }); } else { setPhase("won"); announce("Ты покорила созвездие!"); chime("win"); haptic("success"); confetti({ particleCount: 160, spread: 110, origin: { y: .6 } }); } } else if (nextMoves <= 0) { setPhase("lost"); chime("error"); announce("Попробуй ещё раз"); } };
  const makeMove = async (from: number, to: number) => { if (busy.current || phase !== "playing" || !adjacent(from, to)) return; busy.current = true; const previous = board; const moved = swap(previous, from, to); setSelected(null); setBoard(moved); try { if (!matches(moved).length) { haptic("error"); await wait(120); if (alive.current) setBoard(previous); return; } chime("match"); const result = await process(moved); if (!result || !alive.current) return; haptic("success"); completeTurn(result.total, result.chain); setHint(result.chain > 1 ? `Каскад ×${result.chain}! Кристаллы танцуют ✨` : DEFAULT_HINT); } finally { busy.current = false; } };
  const onBoardClick = (event: MouseEvent<HTMLDivElement>) => { const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-index]"); if (!target || busy.current || phase !== "playing") return; const index = Number(target.dataset.index); if (selected === null) { setSelected(index); haptic("light"); } else if (selected === index) { setSelected(null); } else if (!adjacent(selected, index)) { setSelected(index); } else { void makeMove(selected, index); } };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-index]"); if (!target || busy.current || phase !== "playing") return; const index = Number(target.dataset.index); swipe.current = { index, x: event.clientX, y: event.clientY }; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => { const start = swipe.current; swipe.current = null; if (!start || busy.current || phase !== "playing") return; const dx = event.clientX - start.x; const dy = event.clientY - start.y; const distance = Math.max(Math.abs(dx), Math.abs(dy)); if (distance < 18) return; const row = Math.floor(start.index / COLS), col = start.index % COLS; let target = start.index; if (Math.abs(dx) > Math.abs(dy)) target = dx > 0 && col < COLS - 1 ? start.index + 1 : dx < 0 && col > 0 ? start.index - 1 : start.index; else target = dy > 0 && row < ROWS - 1 ? start.index + COLS : dy < 0 && row > 0 ? start.index - COLS : start.index; if (target !== start.index) void makeMove(start.index, target); };
  const useBooster = async (name: "wand" | "rainbow" | "lightning") => { if (busy.current || phase !== "playing" || boosters[name] <= 0) return; busy.current = true; setBoosters((value) => ({ ...value, [name]: value[name] - 1 })); try { if (name === "wand") { setBoard(makeBoard()); setHint("Поле перемешано — магия нашла новый путь"); magic("Новая раскладка"); haptic("medium"); return; } if (selected === null || board[selected] === null) { announce("Сначала выбери кристалл"); setBoosters((value) => ({ ...value, [name]: value[name] + 1 })); return; } const selectedCell = board[selected]; if (!selectedCell) return; const row = Math.floor(selected / COLS), col = selected % COLS; const affected = name === "rainbow" ? board.map((cell, i) => cell && cell.kind === selectedCell.kind ? i : -1).filter((i) => i >= 0) : Array.from({ length: ROWS * COLS }, (_, i) => (Math.floor(i / COLS) === row || i % COLS === col ? i : -1)).filter((i) => i >= 0); const result = await process(fall(remove(board, affected))); if (result) completeTurn(affected.length + result.total, result.chain + 1); setSelected(null); magic(name === "rainbow" ? "Радужный взрыв!" : "Молния очистила крест!"); } finally { busy.current = false; } };
  const progress = Math.min(100, score / config.goal * 100); const style = { "--progress": `${progress}%` } as CSSProperties; const effectKey = effects;
  return <div className="game-wrap" style={style}>
    <div className="game-intro"><div><span className="game-kicker"><Sparkles size={13} /> Академия магии</span><h2>{config.title}</h2></div><div className="level-orb"><span>уровень</span><strong>{String(level).padStart(2, "0")}</strong></div></div>
    <div className="quest-card"><div className="quest-copy"><span>Собери сияние</span><strong>{score.toLocaleString("ru-RU")} <small>/ {config.goal.toLocaleString("ru-RU")}</small></strong></div><div className="quest-track"><i /></div><span className="quest-gem"><SvgGem kind="sapphire" special="none" /></span></div>
    <div className="game-top"><div className="stat-card stat-score"><span>свечение</span><strong>{score.toLocaleString("ru-RU")}</strong></div><div className="stat-card"><span>ходы</span><strong>{moves}</strong></div><div className="stat-card stat-combo"><span>комбо</span><strong>×{Math.max(1, combo)}</strong></div></div>
    <div className={`board-shell ${phase !== "playing" ? "board-paused" : ""}`}><div className="board-glow" /><div key={effectKey} className="magic-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><div className="game-board" onClick={onBoardClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }} aria-label="Игровое поле 3 в ряд">{board.map((cell, index) => cell === null ? <button type="button" data-index={index} key={index} className="tile empty" disabled aria-label={`Пустая клетка ${index + 1}`} /> : <button type="button" data-index={index} key={index} className={`tile gem-${cell.kind} ${cell.special !== "none" ? `has-${cell.special}` : ""} ${selected === index ? "selected" : ""}`} disabled={phase !== "playing"} aria-label={`${GEM_LABELS[cell.kind]}, клетка ${index + 1}`} aria-pressed={selected === index}><SvgGem kind={cell.kind} special={cell.special} /></button>)}</div>{phase !== "playing" && <div className="game-result"><span className="result-spark">{level === MAX_LEVEL && phase === "won" ? "✦" : phase === "won" ? "✧" : "☾"}</span><h3>{phase === "won" ? (level === MAX_LEVEL ? "Звёздное сердце!" : `Уровень ${level} пройден!`) : "До новых чудес"}</h3><p>{phase === "won" ? (level === MAX_LEVEL ? "Ты покорила всю академию магии." : "Следующее испытание уже ждёт тебя.") : "Кристаллы ещё верят в тебя."}</p><button type="button" className="primary-btn" onClick={() => reset(phase === "won" && level < MAX_LEVEL ? level + 1 : level)}>{phase === "won" && level < MAX_LEVEL ? "Следующий уровень" : "Играть снова"}</button></div>}</div>
    <div className="booster-row"><button type="button" className="booster" onClick={() => void useBooster("wand")} disabled={phase !== "playing" || boosters.wand <= 0}><span className="booster-icon wand"><WandSparkles size={17} /></span><b>Палочка</b><em>{boosters.wand}</em></button><button type="button" className="booster" onClick={() => void useBooster("rainbow")} disabled={phase !== "playing" || boosters.rainbow <= 0}><span className="booster-icon rainbow"><Sparkles size={17} /></span><b>Радуга</b><em>{boosters.rainbow}</em></button><button type="button" className="booster" onClick={() => void useBooster("lightning")} disabled={phase !== "playing" || boosters.lightning <= 0}><span className="booster-icon lightning"><Zap size={17} /></span><b>Молния</b><em>{boosters.lightning}</em></button></div>
    <p className="game-hint"><span className="hint-dot" />{hint}</p>{toast && <div className="game-toast"><Sparkles size={14} />{toast}</div>}
  </div>;
}

function TogetherTimer() { const [now, setNow] = useState(() => dayjs()); useEffect(() => { const timer = window.setInterval(() => setNow(dayjs()), 1000); return () => window.clearInterval(timer); }, []); const total = Math.max(0, now.diff(dayjs(START_DATE), "second")); const values = [Math.floor(total / 86400), Math.floor(total % 86400 / 3600), Math.floor(total % 3600 / 60), total % 60]; const labels = [plural(values[0], ["день", "дня", "дней"]), plural(values[1], ["час", "часа", "часов"]), plural(values[2], ["минута", "минуты", "минут"]), plural(values[3], ["секунда", "секунды", "секунд"])]; return <div className="timer-grid">{values.map((value, i) => <div className="timer-box" key={labels[i]}><strong>{value}</strong><span>{labels[i]}</span></div>)}</div>; }
function Page({ onBack, stars, children }: { onBack?: () => void; stars?: boolean; children: ReactNode }) { return <div className="app"><div className="magic-bg magic-1" /><div className="magic-bg magic-2" />{stars && <div className="stars-layer"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span></div>}<div className="page">{onBack && <button type="button" className="back-btn" onClick={onBack}><ChevronLeft size={16} />Назад</button>}{children}</div></div>; }
export default function App() { const [view, setView] = useState<View>("home"); const [compliment, setCompliment] = useState(""); useEffect(() => { const tg = window.Telegram?.WebApp; if (tg) { try { tg.ready(); tg.expand(); tg.requestFullscreen?.(); tg.disableVerticalSwipes?.(); } catch { /* optional */ } } }, []); const showCompliment = () => { setCompliment((old) => { const options = COMPLIMENTS.filter((item) => item !== old); return random(options); }); confetti({ particleCount: 48, spread: 70, origin: { y: .65 }, colors: ["#ff7dbd", "#a88cff", "#ffe2a2"] }); }; const openCompliment = () => { showCompliment(); setView("compliment"); }; if (view === "compliment") return <Page onBack={() => setView("home")}><div className="glass-card center-card"><div className="icon-badge pink"><Sparkles size={20} /></div><h1>Комплимент ✨</h1><p className="big-text">{compliment}</p><button type="button" className="primary-btn" onClick={showCompliment}>Ещё один</button></div></Page>; if (view === "letter") return <Page onBack={() => setView("home")}><div className="glass-card left-card"><div className="icon-badge violet"><Mail size={20} /></div><h1>Письмо 💌</h1><p className="letter-text">{LETTER_TEXT}</p></div></Page>; if (view === "game") return <Page onBack={() => setView("home")}><div className="glass-card game-card"><div className="game-title-row"><div><div className="icon-badge gold"><Gamepad2 size={20} /></div><h1>Волшебная игра</h1><p>Поймай свет созвездия — три кристалла за раз</p></div><div className="fairy-mark">✧</div></div><Match3Game /></div></Page>; return <Page stars><div className="hero-card glass-card"><div className="hero-heart"><Heart size={34} /></div><div className="premium-label"><Stars size={14} />premium magic app</div><h1>Dasha ❤️</h1><p className="subtitle">Мини-приложение, сделанное с любовью и волшебством</p><TogetherTimer /><p className="date-note">Отсчёт от {START_LABEL} ✨</p></div><div className="menu-grid"><button type="button" className="menu-card glass-card" onClick={openCompliment}><div className="icon-badge pink"><Sparkles size={20} /></div><div><h3>Комплимент</h3><p>Случайные тёплые слова для тебя</p></div></button><button type="button" className="menu-card glass-card" onClick={() => setView("letter")}><div className="icon-badge violet"><Mail size={20} /></div><div><h3>Письмо</h3><p>Небольшое послание от сердца</p></div></button><button type="button" className="menu-card glass-card" onClick={() => setView("game")}><div className="icon-badge gold"><Gamepad2 size={20} /></div><div><h3>Игра 3 в ряд</h3><p>Магическая мини-игра в fairy стиле</p></div></button></div></Page>; }