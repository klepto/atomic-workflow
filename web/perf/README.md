# Performance check of the review

`npm run perf` in `web/` checks that the review tab of a ticket stays responsive and smooth on a large diff. It
builds the web app into a temporary directory, serves it with a stub of the RPC server that answers from a generated
fixture, opens the review tab of the fixture ticket in headless Chromium, and prints one line per measure with its
budget:

```
longest task: 38 ms (budget 50 ms)
click to selection: 12 ms (budget 100 ms)
frames over 20 ms: 1.2 % (budget 5 %)
longest frame: 31 ms (budget 50 ms)
```

It exits with 0 when every measure meets its budget, and with 1 when any measure misses it or the check fails.
`npm test` does not run it, since it needs a browser and takes a few minutes.

## Run it

Once per machine, download the Chromium build of Playwright:

```
cd web
npx playwright install chromium
```

Then run the check:

```
cd web
npm run perf
```

Close other heavy programs first: the measures are times on the machine that runs them. Run one check at a time,
since each run uses the same browser profile.

## Browser profile

The browser of the check keeps its profile in `atomic-workflow-perf-browser` in the temporary directory of the system,
from one run to the next. The first run on a machine runs the whole check twice, and counts only the second run: the
first one warms the profile. It says so on the standard error, and takes about twice as long.

The reason is the cache of GPU pipelines of the profile. Chromium draws the page on the GPU, and builds a pipeline
for each new kind of drawing the first time it needs it. In a fresh profile, each such build stalls a frame for 60 ms
to 300 ms, while the main thread of the page stays idle. A first scroll, and each jump to a part of the review that
was not drawn yet, then shows frames over 50 ms at random places from run to run. The browser of a user keeps these
pipelines in its profile, so they do not stall its frames. Delete the directory to start from a fresh profile.

## Fixture

`fixture.ts` generates the diff each time, so no large file is stored. It holds 120 changed files with about 29,000
changed lines in TypeScript, TSX, JavaScript, Python, Rust, Go, CSS, JSON, Markdown, YAML, Shell and Java:

- one added file of 12,000 lines,
- five files over 1,000 changed lines, whose patch is `null` in `ticketDiff`, so they load through `ticketFileDiff`,
- one generated file, which shows folded,
- one file with a line of over 6,400 characters, which shows folded.

## Measures

- **longest task**: longest task of the main thread of the page, from the navigation to the end of the load and the
  coloring of every file. A Chrome trace records every task, so tasks under 50 ms count too. The load ends once the
  page has made no change to its DOM and the main thread has been idle for 3 s. Budget 50 ms.
- **click to selection**: time from a click on a line number of the first file to the next paint after the comment
  composer opened below the selected line, the longest of 3 clicks. Each click waits until the page has been quiet
  for 500 ms. Budget 100 ms.
- **frames over 20 ms**: share of the frames over 20 ms while a script scrolls the scroll area of the review from top
  to bottom at 6,000 px/s. Budget under 5 %.
- **longest frame**: longest frame of that scroll. Budget 50 ms.

## Baseline

Numbers on the code before task 4 changed the review, on a developer machine with Windows 11, two runs:

| Measure | Run 1 | Run 2 | Budget |
|:--|--:|--:|--:|
| longest task | 1779 ms | 1775 ms | 50 ms |
| click to selection | 851 ms | 878 ms | 100 ms |
| frames over 20 ms | 100.0 % | 100.0 % | 5 % |
| longest frame | 1146 ms | 229 ms | 50 ms |

The longest frame varies most between runs: other runs gave 221 ms to 271 ms. The page of the fixture is about
550,000 px high, so the scroll takes about 90 s, and the whole check about 2.5 minutes.

## After task 4

Numbers once every ticket of task 4 landed, on the same machine, three runs in a row. Run 1 started from a fresh
browser profile, so it warmed the profile first, as `## Browser profile` says. The baseline ran in a fresh profile of
the time, before the check kept its profile.

| Measure | Baseline | Run 1 | Run 2 | Run 3 | Budget |
|:--|--:|--:|--:|--:|--:|
| longest task | 1779 ms | 30 ms | 28 ms | 30 ms | 50 ms |
| click to selection | 851 ms | 50 ms | 52 ms | 46 ms | 100 ms |
| frames over 20 ms | 100.0 % | 0.8 % | 0.6 % | 1.2 % | 5 % |
| longest frame | 1146 ms | 29 ms | 29 ms | 29 ms | 50 ms |

The longest task is the first render of the app, before the review loads its changes. The review renders its files in
transitions, which React splits in slices of a few ms, and mounts the sections of the files and the rows of the list of
the files 20 at a time, each step in a commit of its own, so that no commit lays out the whole page at once.
