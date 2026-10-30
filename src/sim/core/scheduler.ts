/**
 * The scheduler: a priority queue of jobs keyed by when they are due
 * (ARCHITECTURE.md §4.2). Actors are only processed when they are due, so a
 * character walking for six hours costs nothing for those six hours.
 *
 * Jobs due at the same second run in the order they were scheduled, which
 * keeps the simulation deterministic. The state is plain data so it can be
 * saved and sent across the worker boundary.
 */

export interface ScheduledEntry<J> {
  readonly at: number;
  /** Insertion order, used to break ties between jobs due at the same second. */
  readonly seq: number;
  readonly job: J;
}

export interface SchedulerState<J> {
  /** Binary min-heap ordered by (at, seq). */
  readonly heap: ScheduledEntry<J>[];
  nextSeq: number;
}

export function createScheduler<J>(): SchedulerState<J> {
  return { heap: [], nextSeq: 0 };
}

export function schedule<J>(state: SchedulerState<J>, at: number, job: J): void {
  if (!Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(`Jobs must be scheduled at a non-negative integer time, got ${at}`);
  }
  const heap = state.heap;
  heap.push({ at, seq: state.nextSeq++, job });
  siftUp(heap, heap.length - 1);
}

export function peekNext<J>(state: SchedulerState<J>): ScheduledEntry<J> | undefined {
  return state.heap[0];
}

export function popNext<J>(state: SchedulerState<J>): ScheduledEntry<J> | undefined {
  const heap = state.heap;
  const top = heap[0];
  const last = heap.pop();
  if (top === undefined || last === undefined) return undefined;
  if (heap.length > 0) {
    heap[0] = last;
    siftDown(heap, 0);
  }
  return top;
}

export function pendingCount<J>(state: SchedulerState<J>): number {
  return state.heap.length;
}

function before<J>(a: ScheduledEntry<J>, b: ScheduledEntry<J>): boolean {
  return a.at < b.at || (a.at === b.at && a.seq < b.seq);
}

function siftUp<J>(heap: ScheduledEntry<J>[], index: number): void {
  const entry = heap[index]!;
  while (index > 0) {
    const parentIndex = (index - 1) >> 1;
    const parent = heap[parentIndex]!;
    if (!before(entry, parent)) break;
    heap[index] = parent;
    index = parentIndex;
  }
  heap[index] = entry;
}

function siftDown<J>(heap: ScheduledEntry<J>[], index: number): void {
  const length = heap.length;
  const entry = heap[index]!;
  for (;;) {
    const left = 2 * index + 1;
    if (left >= length) break;
    const right = left + 1;
    const child = right < length && before(heap[right]!, heap[left]!) ? right : left;
    if (!before(heap[child]!, entry)) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = entry;
}
