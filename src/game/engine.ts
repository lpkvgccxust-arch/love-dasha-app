export type GemKind = "heart" | "moon" | "flower" | "butterfly" | "sapphire" | "star";
export type Special = "none" | "row" | "column" | "nova";
export type Cell = { kind: GemKind; special: Special } | null;
export type Board = Cell[];
export type MatchRun = { indices: number[]; orientation: "row" | "column" };
export type ResolveResult = { board: Board; removed: number; chain: number; created: number };

export const ROWS = 7;
export const COLS = 7;
export const GEM_KINDS: GemKind[] = ["heart", "moon", "flower", "butterfly", "sapphire", "star"];
const SIZE = ROWS * COLS;
const indexOf = (row: number, col: number) => row * COLS + col;
const random = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)]!;
const clone = (board: Board): Board => board.map((cell) => (cell ? { ...cell } : null));

export function swap(board: Board, a: number, b: number): Board {
  const next = clone(board);
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function adjacent(a: number, b: number) {
  const ar = Math.floor(a / COLS), ac = a % COLS;
  const br = Math.floor(b / COLS), bc = b % COLS;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function matchRuns(board: Board): MatchRun[] {
  const runs: MatchRun[] = [];
  for (let row = 0; row < ROWS; row++) {
    let start = 0;
    for (let col = 1; col <= COLS; col++) {
      const current = col < COLS ? board[indexOf(row, col)] : null;
      const previous = board[indexOf(row, col - 1)];
      if (current && previous && current.kind === previous.kind) continue;
      if (col - start >= 3 && previous) runs.push({ indices: Array.from({ length: col - start }, (_, n) => indexOf(row, start + n)), orientation: "row" });
      start = col;
    }
  }
  for (let col = 0; col < COLS; col++) {
    let start = 0;
    for (let row = 1; row <= ROWS; row++) {
      const current = row < ROWS ? board[indexOf(row, col)] : null;
      const previous = board[indexOf(row - 1, col)];
      if (current && previous && current.kind === previous.kind) continue;
      if (row - start >= 3 && previous) runs.push({ indices: Array.from({ length: row - start }, (_, n) => indexOf(start + n, col)), orientation: "column" });
      start = row;
    }
  }
  return runs;
}

export function matches(board: Board) { return [...new Set(matchRuns(board).flatMap((run) => run.indices))]; }

export function hasPlayableMove(board: Board) {
  for (let index = 0; index < SIZE; index++) {
    if (index % COLS < COLS - 1 && matches(swap(board, index, index + 1)).length) return true;
    if (index < SIZE - COLS && matches(swap(board, index, index + COLS)).length) return true;
  }
  return false;
}

function createGuaranteedBoard(): Board {
  const board: Board = Array.from({ length: SIZE }, (_, index) => ({ kind: GEM_KINDS[(Math.floor(index / COLS) + index) % GEM_KINDS.length]!, special: "none" as Special }));
  board[0] = { kind: "heart", special: "none" };
  board[1] = { kind: "heart", special: "none" };
  board[2] = { kind: "moon", special: "none" };
  board[3] = { kind: "heart", special: "none" };
  return board;
}

export function makeBoard(): Board {
  for (let attempt = 0; attempt < 1200; attempt++) {
    const board = Array.from({ length: SIZE }, (): Cell => ({ kind: random(GEM_KINDS), special: "none" }));
    if (!matches(board).length && hasPlayableMove(board)) return board;
  }
  return createGuaranteedBoard();
}

export function remove(board: Board, indices: Iterable<number>) {
  const set = new Set(indices);
  return board.map((cell, index) => set.has(index) ? null : cell);
}

export function fall(board: Board): Board {
  const next = clone(board);
  for (let col = 0; col < COLS; col++) {
    const column: Cell[] = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const cell = next[indexOf(row, col)];
      if (cell) column.push(cell);
    }
    for (let row = ROWS - 1; row >= 0; row--) next[indexOf(row, col)] = column[ROWS - 1 - row] ?? { kind: random(GEM_KINDS), special: "none" };
  }
  return next;
}

function effectTargets(index: number, special: Special) {
  const row = Math.floor(index / COLS), col = index % COLS;
  if (special === "row") return Array.from({ length: COLS }, (_, targetCol) => indexOf(row, targetCol));
  if (special === "column") return Array.from({ length: ROWS }, (_, targetRow) => indexOf(targetRow, col));
  if (special === "nova") return Array.from({ length: SIZE }, (_, target) => Math.abs(Math.floor(target / COLS) - row) <= 1 && Math.abs(target % COLS - col) <= 1 ? target : -1).filter((target) => target >= 0);
  return [];
}

export function expandSpecials(board: Board, initial: Iterable<number>) {
  const clear = new Set(initial);
  const queue = [...clear];
  while (queue.length) {
    const index = queue.pop()!;
    const cell = board[index];
    if (!cell || cell.special === "none") continue;
    for (const target of effectTargets(index, cell.special)) if (!clear.has(target)) { clear.add(target); queue.push(target); }
  }
  return clear;
}

function specialForRuns(runs: MatchRun[], matched: Set<number>, preferred?: number) {
  const longest = [...runs].sort((a, b) => b.indices.length - a.indices.length)[0];
  if (!longest) return null;
  const intersection = runs.find((run) => run.orientation !== longest.orientation && run.indices.some((index) => matched.has(index)));
  const index = preferred !== undefined && matched.has(preferred) ? preferred : intersection?.indices.find((value) => matched.has(value)) ?? longest.indices[Math.floor(longest.indices.length / 2)]!;
  if (intersection || longest.indices.length >= 5) return { index, special: "nova" as Special };
  if (longest.indices.length >= 4) return { index, special: longest.orientation === "row" ? "row" as Special : "column" as Special };
  return null;
}

export function resolveBoard(start: Board, preferred?: number): ResolveResult {
  let current = clone(start);
  let removed = 0;
  let chain = 0;
  let created = 0;
  for (let guard = 0; guard < 64; guard++) {
    const runs = matchRuns(current);
    const found = new Set(runs.flatMap((run) => run.indices));
    if (!found.size) return { board: current, removed, chain, created };
    chain++;
    const special = specialForRuns(runs, found, preferred);
    const expanded = expandSpecials(current, found);
    const marked = clone(current);
    if (special && marked[special.index]) {
      marked[special.index] = { ...marked[special.index]!, special: special.special };
      expanded.delete(special.index);
      created++;
    }
    removed += expanded.size;
    current = fall(remove(marked, expanded));
    preferred = undefined;
  }
  return { board: current, removed, chain, created };
}

export function resolveSwap(board: Board, from: number, to: number): ResolveResult | null {
  if (!adjacent(from, to)) return null;
  const moved = swap(board, from, to);
  if (!matches(moved).length) return null;
  return resolveBoard(moved, to);
}

export function resolveSpecial(board: Board, index: number): ResolveResult | null {
  const cell = board[index];
  if (!cell || cell.special === "none") return null;
  const expanded = expandSpecials(board, [index]);
  const result = resolveBoard(fall(remove(board, expanded)));
  return { ...result, removed: result.removed + expanded.size };
}

export function clearWithBooster(board: Board, indices: Iterable<number>): ResolveResult {
  const affected = new Set(indices);
  const result = resolveBoard(fall(remove(board, affected)));
  return { ...result, removed: result.removed + affected.size };
}

export function shufflePlayable(board: Board): Board {
  const cells = board.map((cell) => cell ? { ...cell } : null);
  for (let attempt = 0; attempt < 500; attempt++) {
    const shuffled = [...cells].sort(() => Math.random() - 0.5);
    if (!matches(shuffled).length && hasPlayableMove(shuffled)) return shuffled;
  }
  return makeBoard();
}
