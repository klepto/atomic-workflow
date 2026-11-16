import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from 'playwright';
import { build } from 'vite';
import { createFixture, type PerfFixture } from './fixture.ts';
import { exitCodeOf, formatMeasure, longestTaskOf, measuresOf, type RawMeasures } from './measures.ts';
import { armClick, installProbe, quietSpan, readClickDelay, scrollWhole } from './page-probes.ts';
import { startStubServer } from './stub-server.ts';

// Entry point of `npm run perf`: builds the web app into a temporary directory, serves it with the stub server, opens
// the review of the fixture ticket in headless Chromium, prints each measure with its budget, and exits with 0 only
// when every measure meets its budget. See `README.md`.

/**
 * Absolute path of the directory of the web app.
 */
const WEB_DIRECTORY = fileURLToPath(new URL('..', import.meta.url));

/**
 * Size of the window of the browser, in CSS px.
 */
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Categories of the Chrome trace of the load, which hold the `RunTask` event of each task of the main thread.
 */
const TRACE_CATEGORIES = ['toplevel', 'disabled-by-default-devtools.timeline'];

/**
 * Time that the page stays quiet before its load and its coloring count as ended, in ms.
 */
const LOAD_QUIET_SPAN = 3000;

/**
 * Time that the page stays quiet before a click or the scroll starts, in ms.
 */
const STEP_QUIET_SPAN = 500;

/**
 * Longest wait for the load and the coloring to end, in ms.
 */
const LOAD_TIMEOUT = 180_000;

/**
 * Longest wait for the page to be quiet before a click or the scroll, in ms.
 */
const STEP_TIMEOUT = 10_000;

/**
 * Time between two checks whether the page is quiet, in ms.
 */
const POLL_INTERVAL = 200;

/**
 * Indexes of the line-number buttons of the first file that the check clicks, one click each. The longest delay counts.
 */
const CLICKED_LINES: readonly number[] = [5, 12, 19];

/**
 * Speed of the scroll from the top of the review to its bottom, in px/s.
 */
const SCROLL_SPEED = 6000;

/**
 * Returns the path of the review of the fixture ticket, such as `/task/1-perf-fixture/1-large-diff/review`.
 */
const reviewPathOf = (fixture: PerfFixture): string =>
  `/task/${fixture.task.id}-${fixture.task.slug}/${fixture.ticket.id}-${fixture.ticket.slug}/review`;

/**
 * Resolves after `span` ms.
 */
const delay = async (span: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, span));

/**
 * Resolves once `page` has been quiet for `span` ms, as `quietSpan` says. Rejects when it is not after `timeout` ms.
 */
const waitQuiet = async (page: Page, span: number, timeout: number): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await page.evaluate(quietSpan)) >= span) return;
    await delay(POLL_INTERVAL);
  }
  throw new Error(`The page was not quiet for ${span} ms within ${timeout} ms`);
};

/**
 * Opens the review at `url` in `page` of `browser`, waits until every file loaded and colored and the page stayed
 * quiet, and returns the longest task of the main thread meanwhile, in ms, from a Chrome trace.
 */
const measureLoad = async (browser: Browser, page: Page, url: string, fileCount: number): Promise<number> => {
  await browser.startTracing(page, { categories: TRACE_CATEGORIES });
  await page.goto(url);
  await page.locator(`#review-file-${fileCount - 1}`).waitFor({ timeout: LOAD_TIMEOUT });
  await waitQuiet(page, LOAD_QUIET_SPAN, LOAD_TIMEOUT);
  const trace = await browser.stopTracing();
  return longestTaskOf(trace.toString('utf8'));
};

/**
 * Clicks each line number of `CLICKED_LINES` of the first file of the review in `page`, closes the composer that the
 * click opens, and returns the longest delay from a click to the paint of its selection, in ms.
 */
const measureClicks = async (page: Page): Promise<number> => {
  const buttons = page.locator('#review-file-0 button[aria-label^="Comment on line"]');
  let longest = 0;
  for (const line of CLICKED_LINES) {
    const button = buttons.nth(line);
    await button.scrollIntoViewIfNeeded();
    await waitQuiet(page, STEP_QUIET_SPAN, STEP_TIMEOUT);
    await page.evaluate(armClick);
    await button.click();
    longest = Math.max(longest, await page.evaluate(readClickDelay));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  return longest;
};

/**
 * Scrolls the review in `page` from its top to its bottom at `SCROLL_SPEED`, and returns the length of each frame
 * meanwhile, in ms.
 */
const measureScroll = async (page: Page): Promise<readonly number[]> => {
  await waitQuiet(page, STEP_QUIET_SPAN, STEP_TIMEOUT);
  return page.evaluate(scrollWhole, SCROLL_SPEED);
};

/**
 * Runs every measure of the review of `fixture`, served at `url`, in a new headless Chromium.
 */
const measureReview = async (url: string, fixture: PerfFixture): Promise<RawMeasures> => {
  // The full Chromium in the new headless mode, which renders as the browser that users run, not the headless shell.
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.addInitScript(installProbe);
    const longestTask = await measureLoad(browser, page, url, fixture.changes.files.length);
    const clickDelay = await measureClicks(page);
    const frames = await measureScroll(page);
    return { longestTask, clickDelay, frames };
  } finally {
    await browser.close();
  }
};

/**
 * Builds the web app into a temporary directory, measures its review of the fixture, prints each measure with its
 * budget, and returns the exit code: 0 when every measure meets its budget, else 1.
 */
const runPerf = async (): Promise<number> => {
  const outDirectory = await mkdtemp(join(tmpdir(), 'atomic-workflow-perf-'));
  try {
    await build({ root: WEB_DIRECTORY, logLevel: 'warn', build: { outDir: outDirectory, emptyOutDir: true } });
    const fixture = createFixture();
    const server = await startStubServer(outDirectory, fixture);
    try {
      const measures = measuresOf(await measureReview(new URL(reviewPathOf(fixture), server.url).href, fixture));
      for (const measure of measures) process.stdout.write(`${formatMeasure(measure)}\n`);
      return exitCodeOf(measures);
    } finally {
      await server.close();
    }
  } finally {
    await rm(outDirectory, { recursive: true, force: true });
  }
};

runPerf().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  },
);
