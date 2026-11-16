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

Close other heavy programs first: the measures are times on the machine that runs them.

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
