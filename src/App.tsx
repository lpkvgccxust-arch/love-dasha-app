import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import dayjs from "dayjs";
// @ts-ignore canvas-confetti may not ship declarations in every Vite setup
import confetti from "canvas-confetti";
import { ChevronLeft, Gamepad2, Heart, Mail, Sparkles, Stars, WandSparkles, Zap } from "lucide-react";
import "./styles.css";
 
type View = "home" | "compliment" | "letter" | "game";
type Gem = "💖" | "✨" | "🌸" | "🦋" | "💎" | "⭐️";
type Cell = Gem | "";
type GamePhase = "playing" | "won" | "lost";
 
const START_DATE = "2025-09-30";
const START_LABEL = "30 сентября 2025";
const GEMS: Gem[] = ["💖", "✨", "🌸", "🦋", "💎", "⭐️"];
const ROWS = 7;
const COLS = 7;
const GOAL = 2400;
const MAX_MOVES = 24;
const DEFAULT_HINT = "Собери три одинаковых кристалла рядом — и запусти каскад магии";
 
const COMPLIMENTS = [
  "Даша, у тебя невероятная улыбка ✨",
  "Ты самая милая и нежная ❤️",
  "Ты делаешь мой мир ярче",
  "Ты особенная для меня",
  "Рядом с тобой всё становится теплее",
  "Мне очень повезло встретить тебя ❤️",
  "Ты настоящая магия в моей жизни",
];
 
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
 
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        disableVerticalSwipes?: () => void;
        HapticFeedback?: {
          impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
          notificationOccurred?: (type: "error" | "success" | "warning") => void;
        };
      };
    };
  }
}
 
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
 
function randomDifferent<T>(arr: T[], current: T): T {
  const alternatives = arr.filter((item) => item !== current);
  return alternatives.length ? randomItem(alternatives) : arr[0];
}
 
function plural(n: number, forms: [string, string, string]) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}
 
function haptic(kind: "light" | "success" | "error" | "medium") {
  try {
    const feedback = window.Telegram?.WebApp?.HapticFeedback;
    if (kind === "light" || kind === "medium") feedback?.impactOccurred?.(kind);
    else feedback?.notificationOccurred?.(kind);
  } catch {
    // Haptic feedback is optional outside Telegram.
  }
}
 
function playChime(type: "match" | "win" | "error") {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const notes = type === "win" ? [523, 659, 784] : type === "match" ? [392, 523] : [180];
    oscillator.frequency.value = notes[0];
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (type === "win" ? 0.7 : 0.24));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (type === "win" ? 0.7 : 0.24));
    window.setTimeout(() => void context.close(), 900);
  } catch {
    // Sound is optional and may be blocked until the first user gesture.
  }
}
 
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const indexOf = (row: number, col: number) => row * COLS + col;
 
function areAdjacent(a: number, b: number) {
  const ar = Math.floor(a / COLS);
  const ac = a % COLS;
  const br = Math.floor(b / COLS);
  const bc = b % COLS;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}
 
function swap(board: Cell[], a: number, b: number) {
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
 
function findMatches(board: Cell[]) {
  const matches = new Set<number>();
  for (let row = 0; row < ROWS; row += 1) {
    let start = 0;
    for (let col = 1; col <= COLS; col += 1) {
      const current = col < COLS ? board[indexOf(row, col)] : "";
      const previous = board[indexOf(row, col - 1)];
      if (current && previous && current === previous) continue;
      if (col - start >= 3 && previous) {
        for (let matchCol = start; matchCol < col; matchCol += 1) matches.add(indexOf(row, matchCol));
      }
      start = col;
    }
  }
  for (let col = 0; col < COLS; col += 1) {
    let start = 0;
    for (let row = 1; row <= ROWS; row += 1) {
      const current = row < ROWS ? board[indexOf(row, col)] : "";
      const previous = board[indexOf(row - 1, col)];
      if (current && previous && current === previous) continue;
      if (row - start >= 3 && previous) {
        for (let matchRow = start; matchRow < row; matchRow += 1) matches.add(indexOf(matchRow, col));
      }
      start = row;
    }
  }
  return [...matches];
}
 
function removeMatches(board: Cell[], matches: number[]) {
  const next = [...board];
  matches.forEach((match) => (next[match] = ""));
  return next;
}
 
function collapseBoard(board: Cell[]) {
  const next = [...board];
  for (let col = 0; col < COLS; col += 1) {
    const filled: Gem[] = [];
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const value = next[indexOf(row, col)];
      if (value) filled.push(value);
    }
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      next[indexOf(row, col)] = filled[ROWS - 1 - row] || randomItem(GEMS);
    }
  }
  return next;
}
 
function hasPossibleMove(board: Cell[]) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const current = indexOf(row, col);
      if (col < COLS - 1 && findMatches(swap(board, current, current + 1)).length) return true;
      if (row < ROWS - 1 && findMatches(swap(board, current, current + COLS)).length) return true;
    }
  }
  return false;
}
 
function createBoard(): Cell[] {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const board = Array.from({ length: ROWS * COLS }, () => randomItem(GEMS));
    if (!findMatches(board).length && hasPossibleMove(board)) return board;
  }
  return Array.from({ length: ROWS * COLS }, (_, cell) => GEMS[(cell + Math.floor(cell / COLS)) % GEMS.length]);
}
 
function burstParticles(count = 16) {
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: 12 + Math.random() * 76,
    y: 28 + Math.random() * 45,
    delay: Math.random() * 0.18,
    glyph: randomItem(["✦", "✧", "·", "❋"]),
  }));
}
 
function Match3Game() {
  const [board, setBoard] = useState<Cell[]>(() => createBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MAX_MOVES);
  const [combo, setCombo] = useState(0);
  const [hint, setHint] = useState(DEFAULT_HINT);
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [particles, setParticles] = useState(burstParticles(10));
  const [toast, setToast] = useState("");
  const [boosters, setBoosters] = useState({ wand: 2, rainbow: 1, lightning: 1 });
  const busy = useRef(false);
  const alive = useRef(true);
 
  useEffect(() => () => { alive.current = false; }, []);
 
  const announce = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 1900);
  };
 
  const animateMagic = (message?: string) => {
    setParticles(burstParticles(20));
    if (message) announce(message);
  };
 
  const processBoard = async (start: Cell[]) => {
    let current = start;
    let removedTotal = 0;
    let cascades = 0;
    while (true) {
      const matches = findMatches(current);
      if (!matches.length) break;
      removedTotal += matches.length;
      cascades += 1;
      current = removeMatches(current, matches);
      if (!alive.current) return null;
      setBoard(current);
      animateMagic(cascades > 1 ? `Каскад ×${cascades}` : "Комбинация!");
      await wait(240);
      if (!alive.current) return null;
      current = collapseBoard(current);
      setBoard(current);
      await wait(260);
      if (!alive.current) return null;
    }
    return { board: current, removed: removedTotal, cascades };
  };
 
  const finishTurn = (removed: number, cascades: number) => {
    const multiplier = Math.max(1, cascades);
    const gained = removed * 20 * multiplier;
    const nextScore = score + gained;
    const nextMoves = moves - 1;
    setScore((value) => value + gained);
    setMoves(nextMoves);
    setCombo((value) => (cascades > 1 ? value + 1 : Math.max(0, value - 1)));
    if (nextScore >= GOAL) {
      setPhase("won");
      playChime("win");
      haptic("success");
      confetti({ particleCount: 150, spread: 110, origin: { y: 0.58 }, colors: ["#ff77bf", "#a98cff", "#ffe29a", "#8de9ff"] });
      animateMagic("Уровень пройден — ты сияешь!");
    } else if (nextMoves <= 0) {
      setPhase("lost");
      playChime("error");
      animateMagic("Звёзды устали. Попробуй ещё раз!");
    }
  };
 
  const handleTileClick = async (index: number) => {
    if (busy.current || phase !== "playing") return;
    if (selected === null) {
      setSelected(index);
      haptic("light");
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    if (!areAdjacent(selected, index)) {
      setSelected(index);
      haptic("light");
      return;
    }
    busy.current = true;
    const previous = board;
    const moved = swap(previous, selected, index);
    setSelected(null);
    setBoard(moved);
    try {
      if (!findMatches(moved).length) {
        playChime("error");
        haptic("error");
        await wait(190);
        if (alive.current) setBoard(previous);
        return;
      }
      playChime("match");
      const result = await processBoard(moved);
      if (!result || !alive.current) return;
      haptic("success");
      finishTurn(result.removed, result.cascades);
      if (!hasPossibleMove(result.board)) {
        setHint("Все ходы спрятались — волшебная палочка перемешала поле");
        setBoard(createBoard());
      } else {
        setHint(result.cascades > 1 ? `Каскад ×${result.cascades}! Ещё немного магии ✨` : DEFAULT_HINT);
      }
    } finally {
      busy.current = false;
    }
  };
 
  const useBooster = async (booster: "wand" | "rainbow" | "lightning") => {
    if (busy.current || phase !== "playing" || boosters[booster] <= 0) return;
    busy.current = true;
    setBoosters((current) => ({ ...current, [booster]: current[booster] - 1 }));
    try {
      if (booster === "wand") {
        setBoard(createBoard());
        setHint("Поле засияло заново — ищи новую комбинацию");
        animateMagic("Поле перемешано");
        haptic("medium");
        return;
      }
      const target = selected !== null ? board[selected] : randomItem(GEMS);
      const affected = booster === "rainbow"
        ? board.map((gem, index) => (gem === target ? index : -1)).filter((index) => index >= 0)
        : selected === null
          ? []
          : Array.from({ length: ROWS * COLS }, (_, index) => {
              const row = Math.floor(index / COLS);
              const col = index % COLS;
              const selectedRow = Math.floor(selected / COLS);
              const selectedCol = selected % COLS;
              return row === selectedRow || col === selectedCol ? index : -1;
            }).filter((index) => index >= 0);
      if (!affected.length) {
        announce("Сначала выбери кристалл на поле");
        setBoosters((current) => ({ ...current, [booster]: current[booster] + 1 }));
        return;
      }
      const result = await processBoard(collapseBoard(removeMatches(board, affected)));
      if (result) {
        finishTurn(affected.length + result.removed, result.cascades + 1);
        animateMagic(booster === "rainbow" ? "Радужный взрыв!" : "Молния очистила линию!");
      }
      setSelected(null);
    } finally {
      busy.current = false;
    }
  };
 
  const progress = Math.min(100, (score / GOAL) * 100);
  const gameStyles = { "--progress": `${progress}%` } as CSSProperties;
 
  return (
    <div className="game-wrap" style={gameStyles}>
      <div className="game-intro">
        <div>
          <span className="game-kicker"><Sparkles size={13} /> Задание феи</span>
          <h2>Собери сияние</h2>
        </div>
        <div className="level-orb"><span>уровень</span><strong>01</strong></div>
      </div>
 
      <div className="quest-card">
        <div className="quest-copy"><span>Цель уровня</span><strong>{score.toLocaleString("ru-RU")} <small>/ {GOAL.toLocaleString("ru-RU")}</small></strong></div>
        <div className="quest-track"><i /></div>
        <span className="quest-gem">💎</span>
      </div>
 
      <div className="game-top">
        <div className="stat-card stat-score"><span>свечение</span><strong>{score.toLocaleString("ru-RU")}</strong></div>
        <div className="stat-card"><span>ходы</span><strong>{moves}</strong></div>
        <div className="stat-card stat-combo"><span>комбо</span><strong>×{Math.max(1, combo)}</strong></div>
      </div>
 
      <div className={`board-shell ${phase !== "playing" ? "board-paused" : ""}`}>
        <div className="board-glow" />
        <div className="game-board" aria-label="Игровое поле 3 в ряд">
          {board.map((gem, index) => (
            <button
              type="button"
              key={index}
              className={`tile gem-${GEMS.indexOf(gem as Gem)} ${selected === index ? "selected" : ""}`}
              onClick={() => void handleTileClick(index)}
              disabled={busy.current || phase !== "playing"}
              aria-label={`Клетка ${index + 1}, ${gem || "пустая"}`}
              aria-pressed={selected === index}
            >
              <span>{gem}</span>
            </button>
          ))}
        </div>
        {particles.map((particle) => (
          <span key={particle.id} className="magic-particle" style={{ left: `${particle.x}%`, top: `${particle.y}%`, animationDelay: `${particle.delay}s` }}>{particle.glyph}</span>
        ))}
        {phase !== "playing" && (
          <div className="game-result">
            <span className="result-spark">{phase === "won" ? "✦" : "☾"}</span>
            <h3>{phase === "won" ? "Сияние собрано!" : "До новых чудес"}</h3>
            <p>{phase === "won" ? "Ты выполнила задание феи." : "Ещё одна попытка — и кристаллы покорятся."}</p>
            <button type="button" className="primary-btn" onClick={() => { setBoard(createBoard()); setScore(0); setMoves(MAX_MOVES); setCombo(0); setPhase("playing"); setHint(DEFAULT_HINT); animateMagic(); }}>Играть снова</button>
          </div>
        )}
      </div>
 
      <div className="booster-row">
        <button type="button" className="booster" onClick={() => void useBooster("wand")} disabled={busy.current || phase !== "playing" || boosters.wand <= 0}><span className="booster-icon wand"><WandSparkles size={18} /></span><b>Палочка</b><em>{boosters.wand}</em></button>
        <button type="button" className="booster" onClick={() => void useBooster("rainbow")} disabled={busy.current || phase !== "playing" || boosters.rainbow <= 0}><span className="booster-icon rainbow"><Sparkles size={18} /></span><b>Радуга</b><em>{boosters.rainbow}</em></button>
        <button type="button" className="booster" onClick={() => void useBooster("lightning")} disabled={busy.current || phase !== "playing" || boosters.lightning <= 0}><span className="booster-icon lightning"><Zap size={18} /></span><b>Молния</b><em>{boosters.lightning}</em></button>
      </div>
      <p className="game-hint"><span className="hint-dot" />{hint}</p>
      {toast && <div className="game-toast"><Sparkles size={14} />{toast}</div>}
    </div>
  );
}
 
function TogetherTimer() {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => { const timer = window.setInterval(() => setNow(dayjs()), 1000); return () => window.clearInterval(timer); }, []);
  const totalSeconds = Math.max(0, now.diff(dayjs(START_DATE), "second"));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const items = [
    { value: days, label: plural(days, ["день", "дня", "дней"]) },
    { value: hours, label: plural(hours, ["час", "часа", "часов"]) },
    { value: minutes, label: plural(minutes, ["минута", "минуты", "минут"]) },
    { value: seconds, label: plural(seconds, ["секунда", "секунды", "секунд"]) },
  ];
  return <div className="timer-grid">{items.map((item) => <div className="timer-box" key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>;
}
 
function Page({ onBack, stars, children }: { onBack?: () => void; stars?: boolean; children: ReactNode }) {
  return <div className="app"><div className="magic-bg magic-1" /><div className="magic-bg magic-2" />{stars && <div className="stars-layer"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span></div>}<div className="page">{onBack && <button type="button" className="back-btn" onClick={onBack}><ChevronLeft size={16} />Назад</button>}{children}</div></div>;
}
 
export default function App() {
  const [view, setView] = useState<View>("home");
  const [compliment, setCompliment] = useState("");
  useEffect(() => { const tg = window.Telegram?.WebApp; if (tg) { try { tg.ready(); tg.expand(); tg.disableVerticalSwipes?.(); } catch { /* Telegram API is optional */ } } }, []);
  const goHome = () => setView("home");
  const showCompliment = (particleCount: number, spread: number) => { setCompliment((previous) => randomDifferent(COMPLIMENTS, previous)); confetti({ particleCount, spread, origin: { y: 0.65 }, colors: ["#ff7dbd", "#a88cff", "#ffe2a2"] }); };
  const openCompliment = () => { showCompliment(60, 70); setView("compliment"); };
 
  if (view === "compliment") return <Page onBack={goHome}><div className="glass-card center-card"><div className="icon-badge pink"><Sparkles size={20} /></div><h1>Комплимент ✨</h1><p className="big-text">{compliment}</p><button type="button" className="primary-btn" onClick={() => showCompliment(70, 80)}>Ещё один</button></div></Page>;
  if (view === "letter") return <Page onBack={goHome}><div className="glass-card left-card"><div className="icon-badge violet"><Mail size={20} /></div><h1>Письмо 💌</h1><p className="letter-text">{LETTER_TEXT}</p></div></Page>;
  if (view === "game") return <Page onBack={goHome}><div className="glass-card game-card"><div className="game-title-row"><div><div className="icon-badge gold"><Gamepad2 size={20} /></div><h1>Волшебная игра</h1><p>Поймай свет созвездия — три кристалла за раз</p></div><div className="fairy-mark">✧</div></div><Match3Game /></div></Page>;
 
  return <Page stars><div className="hero-card glass-card"><div className="hero-heart"><Heart size={34} /></div><div className="premium-label"><Stars size={14} />premium magic app</div><h1>Dasha ❤️</h1><p className="subtitle">Мини-приложение, сделанное с любовью и волшебством</p><TogetherTimer /><p className="date-note">Отсчёт от {START_LABEL} ✨</p></div><div className="menu-grid"><button type="button" className="menu-card glass-card" onClick={openCompliment}><div className="icon-badge pink"><Sparkles size={20} /></div><div><h3>Комплимент</h3><p>Случайные тёплые слова для тебя</p></div></button><button type="button" className="menu-card glass-card" onClick={() => setView("letter")}><div className="icon-badge violet"><Mail size={20} /></div><div><h3>Письмо</h3><p>Небольшое послание от сердца</p></div></button><button type="button" className="menu-card glass-card" onClick={() => setView("game")}><div className="icon-badge gold"><Gamepad2 size={20} /></div><div><h3>Игра 3 в ряд</h3><p>Магическая мини-игра в fairy стиле</p></div></button></div></Page>;
}