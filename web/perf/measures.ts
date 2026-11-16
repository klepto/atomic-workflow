/**
 * Measure of the performance check, with its budget.
 */
export interface Measure {
  /**
   * Name of the measure, such as `longest task`.
   */
  readonly name: string;

  /**
   * Value of the measure, in `unit`.
   */
  readonly value: number;

  /**
   * Unit of the value and the budget: `ms` or `%`.
   */
  readonly unit: 'ms' | '%';

  /**
   * Budget of the measure, in `unit`.
   */
  readonly budget: number;

  /**
   * Whether the value meets the budget.
   */
  readonly passes: boolean;
}

/**
 * Values that the check takes in the page, before they become measures.
 */
export interface RawMeasures {
  /**
   * Longest task of the main thread from the navigation to the end of the load and the coloring, in ms.
   */
  readonly longestTask: number;

  /**
   * Longest delay from a click on a line number to the paint of its selection, in ms.
   */
  readonly clickDelay: number;

  /**
   * Length of each frame while the review scrolled from its top to its bottom, in ms.
   */
  readonly frames: readonly number[];
}

/**
 * Event of a Chrome trace, with the fields that the check reads.
 */
interface TraceEvent {
  /**
   * Name of the event, such as `RunTask`, or `thread_name` for the metadata that names a thread.
   */
  readonly name: string;

  /**
   * Phase of the event: `X` for a complete event with a duration, `M` for metadata.
   */
  readonly ph: string;

  /**
   * Identifier of the process of the event.
   */
  readonly pid: number;

  /**
   * Identifier of the thread of the event.
   */
  readonly tid: number;

  /**
   * Duration of a complete event, in µs.
   */
  readonly dur?: number;

  /**
   * Arguments of the event, such as the name of the thread of a `thread_name` event.
   */
  readonly args?: { readonly name?: string };
}

/**
 * Name of the main thread of a renderer process in a Chrome trace.
 */
const RENDERER_MAIN = 'CrRendererMain';

/**
 * Budget of the longest task of the main thread, in ms.
 */
const LONGEST_TASK_BUDGET = 50;

/**
 * Budget of the delay from a click to the paint of its selection, in ms.
 */
const CLICK_DELAY_BUDGET = 100;

/**
 * Length over which a frame counts as slow, in ms.
 */
const SLOW_FRAME = 20;

/**
 * Budget of the share of the slow frames, in %. The share must stay under it.
 */
const SLOW_SHARE_BUDGET = 5;

/**
 * Budget of the longest frame, in ms.
 */
const LONGEST_FRAME_BUDGET = 50;

/**
 * Returns the events of the Chrome trace `trace`, the JSON of an object with `traceEvents` or of a bare array.
 */
const eventsOf = (trace: string): readonly TraceEvent[] => {
  const parsed: unknown = JSON.parse(trace);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object' && parsed !== null && 'traceEvents' in parsed && Array.isArray(parsed.traceEvents))
    return parsed.traceEvents;
  return [];
};

/**
 * Returns the longest task of a renderer main thread in the Chrome trace `trace`, in ms: the longest `RunTask` event
 * on a thread named `CrRendererMain`, so that the tasks of workers and of the browser do not count. Returns 0 for a
 * trace without such a task. Throws a `SyntaxError` when `trace` is not JSON.
 */
export const longestTaskOf = (trace: string): number => {
  const events = eventsOf(trace);
  const mainThreads = new Set(
    events
      .filter((event) => event.ph === 'M' && event.name === 'thread_name' && event.args?.name === RENDERER_MAIN)
      .map((event) => `${event.pid}:${event.tid}`),
  );
  return events
    .filter((event) => event.name === 'RunTask' && event.ph === 'X' && mainThreads.has(`${event.pid}:${event.tid}`))
    .reduce((longest, event) => Math.max(longest, (event.dur ?? 0) / 1000), 0);
};

/**
 * Returns the measures of `raw` with their budgets, in the order that the check prints them: the longest task, the
 * click to selection, the share of the frames over 20 ms, and the longest frame. A scroll without frames has no slow
 * frame.
 */
export const measuresOf = ({ longestTask, clickDelay, frames }: RawMeasures): readonly Measure[] => {
  const slowShare =
    frames.length === 0 ? 0 : (frames.filter((frame) => frame > SLOW_FRAME).length / frames.length) * 100;
  const longestFrame = frames.reduce((longest, frame) => Math.max(longest, frame), 0);
  return [
    {
      name: 'longest task',
      value: longestTask,
      unit: 'ms',
      budget: LONGEST_TASK_BUDGET,
      passes: longestTask <= LONGEST_TASK_BUDGET,
    },
    {
      name: 'click to selection',
      value: clickDelay,
      unit: 'ms',
      budget: CLICK_DELAY_BUDGET,
      passes: clickDelay <= CLICK_DELAY_BUDGET,
    },
    {
      name: `frames over ${SLOW_FRAME} ms`,
      value: slowShare,
      unit: '%',
      budget: SLOW_SHARE_BUDGET,
      passes: slowShare < SLOW_SHARE_BUDGET,
    },
    {
      name: 'longest frame',
      value: longestFrame,
      unit: 'ms',
      budget: LONGEST_FRAME_BUDGET,
      passes: longestFrame <= LONGEST_FRAME_BUDGET,
    },
  ];
};

/**
 * Returns the line that the check prints for `measure`, such as `longest task: 38 ms (budget 50 ms)`: a time in whole
 * ms, a share in % with one decimal.
 */
export const formatMeasure = (measure: Measure): string => {
  const value = measure.value.toFixed(measure.unit === '%' ? 1 : 0);
  return `${measure.name}: ${value} ${measure.unit} (budget ${measure.budget} ${measure.unit})`;
};

/**
 * Returns the exit code of the check for `measures`: 0 when every measure meets its budget, else 1.
 */
export const exitCodeOf = (measures: readonly Measure[]): number =>
  measures.every((measure) => measure.passes) ? 0 : 1;
