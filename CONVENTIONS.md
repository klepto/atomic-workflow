# Code conventions

These rules hold for the TypeScript code of `mcp/` and `web/` alike. They follow the style that most of the code has
already. Where the two packages differ, `## Differences between the packages` names the difference and its reason.
Biome checks the format, the lint rules and the order of the imports. The rules that Biome cannot check are written
here.

## Naming

- Name files in kebab case: `task-store.ts`, `run-timer.tsx`.
- Name types, interfaces, classes and React components in PascalCase: `TaskStore`, `WorktreeError`, `RunTimer`.
- Name functions, function values, variables, parameters, properties and module-level state in camelCase:
  `sqliteTaskStore`, `formatClock`, `lastId`. This holds for an exported function value too: `socketAttach`, not
  `Attach`.
- Name a module-level constant that holds fixed data in UPPER_SNAKE_CASE: a literal, a schema, a regular expression,
  or an array or object of literals. `COALESCE_DELAY`, `PARAMS`, `SESSION_ROLES`, `METHODS`.
- Name a function type `<Name>Function`, and the function type of a factory `Create<Name>Function`:
  `AttachFunction`, `CreateChangeFeedFunction`.
- Name an object of the adapters that a function needs `dependencies`, of the type `<Name>Dependencies`. Name an
  object of settings `options`, of the type `<Name>Options`.
- Name each caught value `error`, and each React hook `use<Name>`.
- Give one name one meaning in a package, and one thing one name. A tool result builder named `text` beside the
  stream consumer `text` of Node.js breaks this rule: name the builder `textResult`.

## File layout

- Put one concept in one module: a seam, a store, a component, a method. Split a module that grows a second purpose.
- Declare the constants and the types of a module at its top, after the imports, so that each one comes before its
  first use.
- Name a file after its main export: `run-timer.tsx` holds `RunTimer`, `use-chat-log.ts` holds `useChatLog`.
- Give a file with JSX the extension `.tsx`, and every other file `.ts`.
- Name an entry point of `mcp/` `<name>.main.ts`. Only an entry point runs code when it is loaded. Every other
  module only declares.
- In `mcp/src/rpc/`, name the module of a method `method.<method-name>.ts` and the module of a session method
  `session-method.<method-name>.ts`.
- In `web/src/`, put a React hook in a file `use-<name>.ts`, and data that more than one module uses in a module of
  its own, not in a component module. `STATUS_WORDS`, which `ticket-list.tsx` and `ticket-page.tsx` both use, does
  not belong in `ticket-list.tsx`.

## Imports and exports

- Use named exports only. The one exception is `web/vite.config.ts`, since Vite reads its default export.
- Export each member at its declaration: `export const call = ...`. Do not end a module with an `export { ... }`
  list. This holds for the components of `web/src/components/ui/` too.
- Export only what another module imports. A props interface is exported only when another module uses it.
- Import with the extension of the file: `./task-store.ts`, `@/tasks/run-timer.tsx`.
- Import a type with `import type`, or with `type` before its name in a mixed import:
  `import { type MethodContext, METHODS } from './rpc/method.ts';`.
- Leave the order of the imports to Biome, which sorts them.

## Functions and types

- Declare a function as an arrow function in a `const`: `const formatClock = (span: number): string => ...`. Do not
  use the `function` keyword. Use a class only for an error.
- Give an arrow function an expression body when its body is one expression:
  `const isEmpty = (text: string): boolean => text.length === 0;`, not a block with one `return`.
- Declare the return type of each exported function, either on the function or through the function type of its
  constant. A React component needs none, since it always returns JSX.
- Mark a function that returns a promise `async`.
- Put the data of a function first, then its `options`, then its `dependencies` or its `context` last:
  `orchestratorOf(sessionId, context)`.
- Declare the props of a React component as an interface `<Component>Props` before the component, not as an inline
  type: `interface RunTimerProps { ... }`.
- Mark each property of an interface `readonly`, unless code assigns it after its creation. Return `readonly` arrays:
  `list(): Promise<readonly TaskSummary[]>`.
- Declare a named result interface for each result with more than one field: `TaskStopResult`, not an inline
  object type.
- Pass a time as a number of ms since the epoch, and a duration as a number of ms. Convert it to a string or a `Date`
  only where it is shown.
- Write a string in single quotes. Use a template literal only for a string with `${...}` or one that spans lines,
  such as a multi-line SQL statement. Write a line break inside a message as `\n`, never as a raw line break.
- Brace the body of an `if`, `else`, `for` or `while` when it spans more than one line. A body that fits on the line
  of its statement may go without braces: `if (task === undefined) return undefined;`.
- Narrow an unknown value with a type guard, never with a cast: `error instanceof Error`, not
  `(error as { stderr?: string })`.

## Error handling

- Throw an `Error` or a subclass of it, never a string or a plain object.
- Write the message of an error as one sentence that starts with a capital and has no final period:
  `The argument --address <address> is missing`. Show each path in a message with forward slashes.
- When you catch an error and throw a new one, pass the caught error as its cause:
  `throw new Error('The server is not reachable', { cause: error })`.
- Declare a subclass of `Error` only when the caller acts on a code or a kind of the failure, as `RpcError` and
  `WorktreeError` do. Give it a `readonly` field for each detail, and set its `name`.
- Return `undefined` for a value that is not found, and `false` for a change that changed nothing. Throw only for a
  failure.
- A helper that catches an error to return it returns its result or the caught error as one union, such as
  `Promise<Socket | Error>`, and the caller checks it with `instanceof Error`.
- Read the code and the message of a caught error through a helper, not with an inline check in each place.
- Drop an error only on purpose, with a comment above it that says why, such as above `.catch(() => undefined)`.
- Never use `console`. In `mcp/`, write a diagnostic to the standard error with `process.stderr.write`. In `web/`,
  show a failure that the user can act on, and drop any other failure with a comment.

## Comments and documentation

- Give every exported function, class, type, interface, constant and React component a `/** */` comment. Give each
  member of an interface or a class one too, and each declaration at the top level of a module that is not exported.
- Write the comment in prose sentences, in the present tense:
  - A function or a method starts with a verb in the third person: `Returns ...`, `Marks ...`, `Starts ...`.
  - A type, an interface, a property or a constant starts with a noun phrase, without a leading article:
    `Store of the sessions.`, not `The store of the sessions.`.
  - Name each parameter in backticks: ``Returns the session with the identifier `id`.``
  - Say what the function returns, and each error that it throws or each reason that it rejects:
    ``If no such session is registered, returns `undefined` instead.``,
    `Rejects for a session that another session runs inside.`
  - Give each unit: `Time in ms since the epoch.`.
- Do not use TSDoc tags such as `@param`, `@returns` or `@throws`.
- Write a `//` comment inside a function only to say why the code does what it does, not what it does.
- Keep every line of a comment within the line width of 120. Biome does not wrap comments.

## Seams

A seam keeps a side effect behind an interface, so that a test can replace it.

- A side effect is a call to the file system, to git or another child process, to the network or a socket, to the
  storage of the browser, to the environment or the process of Node.js, or to the clock. The clock is the current
  time and every timer that drives data, such as a polling loop.
- A module that calls a side effect directly is an adapter. Name it `<name>.<technology>.ts`, such as
  `task-store.sqlite.ts`, `clock.system.ts` or `theme-store.local-storage.ts`. It implements an interface or a
  function type that `<name>.ts` declares beside it.
- Name the export of an adapter `<technology><Name>` in camelCase: `sqliteTaskStore`, `systemClock`, `socketAttach`.
  An adapter that keeps its state in memory has the technology `map`: `inboxes.map.ts`, `mapCreateInboxes`.
- `<name>.ts` declares the seam, and may hold the logic that needs no side effect. It never imports one of its
  adapters, so it exports no default implementation, such as `export const Attach = socketAttach`.
- In `mcp/`, every module other than an adapter receives an adapter through its interface: as a parameter, or through
  `MethodContext` for a method. An adapter that needs another adapter receives it the same way. Only the entry
  points, `*.main.ts`, import adapters, create them and wire them.
- An entry point stays thin: it reads its arguments, creates the adapters, wires them and starts. It may read the
  arguments, the environment and the standard streams of its process directly.
- In `mcp/`, a module that reads the time receives a `Clock` of `mcp/src/clock/clock.ts`: as a parameter, or as
  `clock` of `MethodContext` for a method. The entry points pass `systemClock` of `mcp/src/clock/clock.system.ts`.
- In `web/`, components and hooks import the functions of an adapter module directly, and never call a side effect
  themselves. A timer that only schedules a change of the UI inside one component, such as the delay of a hint or a
  focus, stays in the component.
- In `web/`, keep the key of an entry of the local storage as it is, since a new key loses what users stored. Name a
  new key `atomic-workflow:<name>`.
- Build configuration, such as `web/vite.config.ts` and `mcp/scripts/`, is outside the seams.

## Tests

Each package runs its unit tests with `npm test`: the test runner of Node.js, `node --test`, runs every file
`src/**/*.test.ts` of the package, with no build step and no other test library. The command exits with 0 only when
every test passes. In `web/`, `npm test` loads `web/resolve-alias.ts` with `--import`, which resolves `@/<path>` to
`web/src/<path>` as the alias of Vite does. `npm run typecheck` and `npx biome ci` check the test files too, and no
build bundles them.

- Put a test file beside the module that it tests, with the name of the module and the extension `.test.ts`:
  `patch.test.ts` beside `patch.ts`, `task-store.sqlite.test.ts` beside `task-store.sqlite.ts`.
- Import `describe` and `it` from `node:test`, and `assert` from `node:assert/strict`. Use no other assertion or mock
  library.
- Write one `describe` per exported function, method or store, named for it: `describe('ticketsSave', ...)`. Write
  one `it` per behavior. Name it as a sentence in the present tense without a final period, which says what happens
  under which condition: `it('rejects a ticket that depends on a later ticket', ...)`.
- Test behavior through the public API of the module, its exports and the contracts of the design, never its
  internals, so that a refactor keeps the test green.
- Check a value with `assert.deepEqual` or `assert.equal`. Check a failure with `assert.rejects` or `assert.throws`,
  with the class and the code or the message that the contract names. Write no snapshot tests.
- Replace a side effect through its seam, with a plain object or function that implements the interface of the seam.
  Put a fake that more than one test file uses in the test helpers of its package.
- Take the time from a fake `Clock` in `mcp/`, and from a fixed time passed as a number in `web/`. Where code
  schedules a timer itself, use `mock.timers` of `node:test`, never a real wait.
- Keep each whole suite under 10 s on a developer machine, real git included. A test never sleeps, never waits on a
  real timer, never tests a timeout, and never runs a long concurrency scenario.
- Build the test data in the test, or with a small builder in the test file, such as `ticket({ status: 'done' })`,
  and state only the fields that matter to the test.
- Follow the code rules of this file in test files too, with two exceptions: a test file runs code when it is loaded,
  like an entry point, and a test file or a test helper may import adapters, such as `sqliteTaskStore`.
- Leave nothing behind: no file outside a temporary directory that the test removes, and no open handle.

The test helpers of `mcp/` live in `mcp/src/testing/`:

- `testStorage()`: a `Storage` on an in-memory SQLite database.
- `testClock(start?)`: a `Clock` that moves only with `advance` or `set`.
- `testMethodContext(overrides?)`: a whole `MethodContext` with fakes and map adapters.
- `testConnection()`: an `RpcConnection` that records what it sends.
- `testCall(method, params, context)`: parses the params like `dispatch` does, and runs the method.
- `testGitRepository(context)`: a temporary git repository, which `context.after` of the test removes.

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration } from '@/time/duration-format.ts';

describe('formatDuration', () => {
  it('shows the minutes and the seconds under an hour', () => {
    assert.equal(formatDuration(116_000), '1m 56s');
  });
});
```

## Biome

- `biome.json` at the root of the repository holds the shared rules, with `"root": true`. `mcp/biome.json` and
  `web/biome.json` extend it with `"extends": "//"` and hold only what is specific to their package, such as the
  Tailwind directives of the CSS parser in `web/`.
- The formatter uses spaces, an indent of 2, a line width of 120, single quotes, trailing commas, semicolons and
  parentheses around every arrow parameter.
- The linter runs every recommended rule. No rule is turned off or changed. To turn off or change a rule, add it to
  the root `biome.json`, and add a line here that names the rule and says why.
- The assist sorts the imports.
- Run `npm run format` to format a package, `npm run lint` to lint it, and `npx biome ci` to check the format, the
  lint rules and the order of the imports at once.
- Suppress a diagnostic only on its line, with `// biome-ignore lint/<group>/<rule>: <reason>`, and only when the
  code is right and the rule is wrong for it.

## Build output

`plugin/dist/` is build output. Commit it only in a ticket that rebuilds the plugin. After `npm run build` in `web/`,
restore it with `git restore plugin/dist` and `git clean -fd plugin/dist` before the commit.

## Differences between the packages

- Imports: `web/` imports every module of `web/src/` by the alias `@/`, its siblings too: `@/tasks/run-timer.tsx`.
  `mcp/` imports by relative paths: `../storage/task-store.ts`. Node.js runs the sources of `mcp/` directly and does
  not resolve the paths of `tsconfig.json`, while Vite resolves the alias of `web/`, and `web/resolve-alias.ts`
  resolves it for `npm test`.
- Seams: `mcp/` passes each adapter through its interface, and `web/` imports the adapter module. A React context per
  side effect would add code and risk to every component, and a test can still replace a module.
- Diagnostics: `mcp/` writes to the standard error, since the standard output of a session server carries the MCP
  protocol. `web/` shows a failure in the page or drops it.
- React: the rules on components, props and hooks hold only in `web/`, since `mcp/` has no UI.
- Entry points and methods: the names `*.main.ts`, `method.<name>.ts` and `session-method.<name>.ts` hold only in
  `mcp/`. The entry point of `web/` is `web/src/main.tsx`, which Vite names in `index.html`.
