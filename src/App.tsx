import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import dayjs from "dayjs";
// @ts-ignore
import confetti from "canvas-confetti";
import { Heart, Sparkles, Mail, Gamepad2, ChevronLeft, Stars } from "lucide-react";
import "./styles.css";

type View = "home" | "compliment" | "letter" | "game";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        disableVerticalSwipes?: () => void;
        HapticFeedback?: {
          impactOccurred?: (
            style: "light" | "medium" | "heavy" | "rigid" | "soft"
          ) => void;
          notificationOccurred?: (
            type: "error" | "success" | "warning"
          ) => void;
        };
      };
    };
  }
}

// Дата начала отсчёта. Если меняешь её, поменяй и START_LABEL ниже.
const START_DATE = "2025-09-30";
const START_LABEL = "30 сентября 2025";

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

const GEMS = ["💖", "✨", "🌸", "🦋", "💎", "⭐️"];
const ROWS = 6;
const COLS = 6;
const DEFAULT_HINT =
  "Нажимай на две соседние клетки, чтобы менять их местами и собирать 3 в ряд ✨";

// ---------- Утилиты ----------

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Случайный элемент, не равный текущему (чтобы «Еще один» не повторял одно и то же)
function randomDifferent<T>(arr: T[], current: T): T {
  if (arr.length < 2) return arr[0];
  let next = randomItem(arr);
  while (next === current) next = randomItem(arr);
  return next;
}

// Склонение: 1 день, 2 дня, 5 дней
function plural(n: number, forms: [string, string, string]) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

// Вибро-отклик в Telegram (вне Telegram просто ничего не делает)
function haptic(kind: "light" | "success" | "error") {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  try {
    if (kind === "light") h?.impactOccurred?.("light");
    else h?.notificationOccurred?.(kind);
  } catch {
    // вибро не критично
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------- Логика игры ----------

function createBoard() {
  const board: string[] = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    board.push(randomItem(GEMS));
  }
  return board;
}

function getIndex(row: number, col: number) {
  return row * COLS + col;
}

function areAdjacent(a: number, b: number) {
  const ar = Math.floor(a / COLS);
  const ac = a % COLS;
  const br = Math.floor(b / COLS);
  const bc = b % COLS;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

function swapped(board: string[], a: number, b: number) {
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function findMatches(board: string[]) {
  const matches = new Set<number>();

  for (let r = 0; r < ROWS; r++) {
    let streak = 1;
    for (let c = 1; c < COLS; c++) {
      const curr = board[getIndex(r, c)];
      const prev = board[getIndex(r, c - 1)];
      if (curr && prev && curr === prev) {
        streak++;
      } else {
        if (streak >= 3) {
          for (let k = 0; k < streak; k++) {
            matches.add(getIndex(r, c - 1 - k));
          }
        }
        streak = 1;
      }
    }
    if (streak >= 3) {
      for (let k = 0; k < streak; k++) {
        matches.add(getIndex(r, COLS - 1 - k));
      }
    }
  }

  for (let c = 0; c < COLS; c++) {
    let streak = 1;
    for (let r = 1; r < ROWS; r++) {
      const curr = board[getIndex(r, c)];
      const prev = board[getIndex(r - 1, c)];
      if (curr && prev && curr === prev) {
        streak++;
      } else {
        if (streak >= 3) {
          for (let k = 0; k < streak; k++) {
            matches.add(getIndex(r - 1 - k, c));
          }
        }
        streak = 1;
      }
    }
    if (streak >= 3) {
      for (let k = 0; k < streak; k++) {
        matches.add(getIndex(ROWS - 1 - k, c));
      }
    }
  }

  return [...matches];
}

function collapseBoard(board: string[]) {
  const newBoard = [...board];

  for (let c = 0; c < COLS; c++) {
    const values: string[] = [];

    for (let r = ROWS - 1; r >= 0; r--) {
      const value = newBoard[getIndex(r, c)];
      if (value) values.push(value);
    }

    for (let r = ROWS - 1; r >= 0; r--) {
      newBoard[getIndex(r, c)] = values[ROWS - 1 - r] || "";
    }

    for (let r = 0; r < ROWS; r++) {
      const idx = getIndex(r, c);
      if (!newBoard[idx]) {
        newBoard[idx] = randomItem(GEMS);
      }
    }
  }

  return newBoard;
}

function removeMatches(board: string[], matches: number[]) {
  const newBoard = [...board];
  matches.forEach((i) => {
    newBoard[i] = "";
  });
  return newBoard;
}

// Есть ли на поле хотя бы один ход, который даёт 3 в ряд
function hasPossibleMove(board: string[]) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = getIndex(r, c);
      if (c < COLS - 1 && findMatches(swapped(board, idx, idx + 1)).length > 0) {
        return true;
      }
      if (r < ROWS - 1 && findMatches(swapped(board, idx, idx + COLS)).length > 0) {
        return true;
      }
    }
  }
  return false;
}

// Поле без готовых троек, но с хотя бы одним возможным ходом
function createPlayableBoard() {
  let fresh = createBoard();
  while (findMatches(fresh).length > 0 || !hasPossibleMove(fresh)) {
    fresh = createBoard();
  }
  return fresh;
}

// ---------- Компоненты ----------

function Match3Game() {
  const [board, setBoard] = useState<string[]>(() => createPlayableBoard());
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [hint, setHint] = useState(DEFAULT_HINT);

  // busy нужен, чтобы быстрые клики не проскакивали до обновления state
  const busy = useRef(false);
  // alive: если вышли из игры посреди анимации, цикл останавливается
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const processBoard = async (start: string[]) => {
    let current = start;
    let totalRemoved = 0;

    while (true) {
      const matches = findMatches(current);
      if (matches.length === 0) break;

      totalRemoved += matches.length;
      current = removeMatches(current, matches);
      setBoard(current);

      await wait(180);
      if (!alive.current) return null;

      current = collapseBoard(current);
      setBoard(current);

      await wait(180);
      if (!alive.current) return null;
    }

    return { board: current, removed: totalRemoved };
  };

  const handleTileClick = async (index: number) => {
    if (busy.current) return;

    if (selected === null) {
      haptic("light");
      setSelected(index);
      return;
    }

    if (selected === index) {
      setSelected(null);
      return;
    }

    if (!areAdjacent(selected, index)) {
      haptic("light");
      setSelected(index);
      return;
    }

    busy.current = true;
    setProcessing(true);

    const swappedBoard = swapped(board, selected, index);
    setBoard(swappedBoard);
    setSelected(null);

    try {
      if (findMatches(swappedBoard).length === 0) {
        // Ход без совпадений: показываем обмен и возвращаем назад
        haptic("error");
        await wait(180);
        if (!alive.current) return;
        setBoard(board);
        return;
      }

      setMoves((prev) => prev + 1);

      const result = await processBoard(swappedBoard);
      if (!result || !alive.current) return;

      haptic("success");
      setScore((prev) => prev + result.removed * 10);

      if (result.removed >= 6) {
        confetti({
          particleCount: 80,
          spread: 90,
          origin: { y: 0.6 },
        });
      }

      if (hasPossibleMove(result.board)) {
        setHint(DEFAULT_HINT);
      } else {
        // Тупик: ходов больше нет, перемешиваем поле
        setHint("Ходов больше не осталось, поле перемешано ✨");
        setBoard(createPlayableBoard());
      }
    } finally {
      busy.current = false;
      if (alive.current) setProcessing(false);
    }
  };

  return (
    <div className="game-wrap">
      <div className="game-top">
        <div className="stat-card">
          <span>Очки</span>
          <strong>{score}</strong>
        </div>
        <div className="stat-card">
          <span>Ходы</span>
          <strong>{moves}</strong>
        </div>
      </div>

      <div className="game-board">
        {board.map((gem, index) => (
          <button
            key={index}
            className={`tile ${selected === index ? "selected" : ""}`}
            onClick={() => handleTileClick(index)}
            disabled={processing}
          >
            {gem}
          </button>
        ))}
      </div>

      <p className="game-hint">{hint}</p>
    </div>
  );
}

// Таймер вынесен в отдельный компонент: раз в секунду перерисовывается только он,
// а не всё приложение (вместе с игрой).
function TogetherTimer() {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  return (
    <div className="timer-grid">
      {items.map((item) => (
        <div className="timer-box" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// Общая обёртка страницы: фон, кнопка «Назад», звёзды на главной
function Page({
  onBack,
  stars,
  children,
}: {
  onBack?: () => void;
  stars?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <div className="magic-bg magic-1" />
      <div className="magic-bg magic-2" />
      {stars && (
        <div className="stars-layer">
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
          <span>✧</span>
          <span>✦</span>
        </div>
      )}

      <div className="page">
        {onBack && (
          <button className="back-btn" onClick={onBack}>
            <ChevronLeft size={16} />
            Назад
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [compliment, setCompliment] = useState("");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        tg.disableVerticalSwipes?.();
      } catch (e) {
        console.log(e);
      }
    }
  }, []);

  const goHome = () => setView("home");

  const showCompliment = (particleCount: number, spread: number) => {
    setCompliment((prev) => randomDifferent(COMPLIMENTS, prev));
    confetti({
      particleCount,
      spread,
      origin: { y: 0.65 },
    });
  };

  const openCompliment = () => {
    showCompliment(60, 70);
    setView("compliment");
  };

  if (view === "compliment") {
    return (
      <Page onBack={goHome}>
        <div className="glass-card center-card">
          <div className="icon-badge pink">
            <Sparkles size={20} />
          </div>
          <h1>Комплимент ✨</h1>
          <p className="big-text">{compliment}</p>

          <button className="primary-btn" onClick={() => showCompliment(70, 80)}>
            Еще один
          </button>
        </div>
      </Page>
    );
  }

  if (view === "letter") {
    return (
      <Page onBack={goHome}>
        <div className="glass-card left-card">
          <div className="icon-badge violet">
            <Mail size={20} />
          </div>
          <h1>Письмо 💌</h1>
          <p className="letter-text">{LETTER_TEXT}</p>
        </div>
      </Page>
    );
  }

  if (view === "game") {
    return (
      <Page onBack={goHome}>
        <div className="glass-card">
          <div className="icon-badge gold">
            <Gamepad2 size={20} />
          </div>
          <h1>Волшебная игра ✨</h1>
          <Match3Game />
        </div>
      </Page>
    );
  }

  return (
    <Page stars>
      <div className="hero-card glass-card">
        <div className="hero-heart">
          <Heart size={34} />
        </div>

        <div className="premium-label">
          <Stars size={14} />
          premium magic app
        </div>

        <h1>Dasha ❤️</h1>
        <p className="subtitle">Мини-приложение, сделанное с любовью и волшебством</p>

        <TogetherTimer />

        <p className="date-note">Отсчет от {START_LABEL} ✨</p>
      </div>

      <div className="menu-grid">
        <button className="menu-card glass-card" onClick={openCompliment}>
          <div className="icon-badge pink">
            <Sparkles size={20} />
          </div>
          <div>
            <h3>Комплимент</h3>
            <p>Случайные теплые слова для тебя</p>
          </div>
        </button>

        <button className="menu-card glass-card" onClick={() => setView("letter")}>
          <div className="icon-badge violet">
            <Mail size={20} />
          </div>
          <div>
            <h3>Письмо</h3>
            <p>Небольшое послание от сердца</p>
          </div>
        </button>

        <button className="menu-card glass-card" onClick={() => setView("game")}>
          <div className="icon-badge gold">
            <Gamepad2 size={20} />
          </div>
          <div>
            <h3>Игра 3 в ряд</h3>
            <p>Магическая мини-игра в fairy стиле</p>
          </div>
        </button>
      </div>
    </Page>
  );
}
