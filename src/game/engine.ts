export type GemKind = "heart" | "moon" | "flower" | "butterfly" | "sapphire" | "star";
export type Special = "none" | "row" | "column" | "nova";
export type Cell = { kind: GemKind; special: Special } | null;
export type Board = Cell[];
export type MatchRun = { indices: number[]; orientation: "row" | "column" };

export const ROWS = 7;
export const COLS = 7;
export const GEM_KINDS: GemKind[] = ["heart", "moon", "flower", "butterfly", "sapphire", "star"];
const indexOf = (row: number, col: number) => row * COLS + col;
const random = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)];
const clone = (board: Board) => board.map((cell) => (cell ? { ...cell } : null));

export function swap(board: Board, a: number, b: number) { const next = clone(board); [next[a], next[b]] = [next[b], next[a]]; return next; }
export function adjacent(a: number, b: number) { const ar = Math.floor(a / COLS), ac = a % COLS, br = Math.floor(b / COLS), bc = b % COLS; return Math.abs(ar - br) + Math.abs(ac - bc) === 1; }
export function matchRuns(board: Board): MatchRun[] {
  const runs: MatchRun[] = [];
  for (let r = 0; r < ROWS; r++) { let start = 0; for (let c = 1; c <= COLS; c++) { const current = c < COLS ? board[indexOf(r, c)] : null; const previous = board[indexOf(r, c - 1)]; if (current && previous && current.kind === previous.kind) continue; if (c - start >= 3 && previous) runs.push({ indices: Array.from({ length: c - start }, (_, n) => indexOf(r, start + n)), orientation: "row" }); start = c; } }
  for (let c = 0; c < COLS; c++) { let start = 0; for (let r = 1; r <= ROWS; r++) { const current = r < ROWS ? board[indexOf(r, c)] : null; const previous = board[indexOf(r - 1, c)]; if (current && previous && current.kind === previous.kind) continue; if (r - start >= 3 && previous) runs.push({ indices: Array.from({ length: r - start }, (_, n) => indexOf(start + n, c)), orientation: "column" }); start = r; } }
  return runs;
}
export function matches(board: Board) { return [...new Set(matchRuns(board).flatMap((run) => run.indices))]; }
export function hasPlayableMove(board: Board) { for (let i = 0; i < board.length; i++) { if (i % COLS < COLS - 1 && (matches(swap(board, i, i + 1)).length || board[i]?.special !== "none" || board[i + 1]?.special !== "none")) return true; if (i < board.length - COLS && (matches(swap(board, i, i + COLS)).length || board[i]?.special !== "none" || board[i + COLS]?.special !== "none")) return true; } return false; }
export function makeBoard(): Board { for (let attempt = 0; attempt < 600; attempt++) { const board = Array.from({ length: ROWS * COLS }, (): Cell => ({ kind: random(GEM_KINDS), special: "none" })); if (!matches(board).length && hasPlayableMove(board)) return board; } return Array.from({ length: ROWS * COLS }, (_, i): Cell => ({ kind: GEM_KINDS[(i * 2 + Math.floor(i / COLS)) % GEM_KINDS.length], special: "none" })); }
export function remove(board: Board, indices: Iterable<number>) { const set = new Set(indices); return board.map((cell, i) => set.has(i) ? null : cell); }
export function fall(board: Board): Board { const next = clone(board); for (let c = 0; c < COLS; c++) { const column: Cell[] = []; for (let r = ROWS - 1; r >= 0; r--) { const cell = next[indexOf(r, c)]; if (cell) column.push(cell); } for (let r = ROWS - 1; r >= 0; r--) next[indexOf(r, c)] = column[ROWS - 1 - r] ?? { kind: random(GEM_KINDS), special: "none" }; } return next; }
function effectTargets(index: number, special: Special) { const row = Math.floor(index / COLS), col = index % COLS; if (special === "row") return Array.from({ length: COLS }, (_, c) => indexOf(row, c)); if (special === "column") return Array.from({ length: ROWS }, (_, r) => indexOf(r, col)); if (special === "nova") return Array.from({ length: ROWS * COLS }, (_, i) => i).filter((i) => Math.abs(Math.floor(i / COLS) - row) <= 1 && Math.abs(i % COLS - col) <= 1); return []; }
export function expandSpecials(board: Board, initial: Iterable<number>) { const clear = new Set(initial); const queue = [...clear]; while (queue.length) { const index = queue.pop()!; const cell = board[index]; if (!cell || cell.special === "none") continue; for (const target of effectTargets(index, cell.special)) if (!clear.has(target)) { clear.add(target); queue.push(target); } } return clear; }
export function refill(board: Board, blocked: Set<number> = new Set()) { let next = fall(board); let guard = 0; while (matches(next).length && guard++ < 8) next = fall(remove(next, matches(next))); for (const index of blocked) next[index] = board[index]; return next; }
export function shufflePlayable(board: Board) { for (let attempt = 0; attempt < 300; attempt++) { const kinds = board.map((cell) => cell?.kind ?? random(GEM_KINDS)).sort(() => Math.random() - .5); const next = kinds.map((kind) => ({ kind, special: "none" as Special })); if (!matches(next).length && hasPlayableMove(next)) return next; } return makeBoard(); }
