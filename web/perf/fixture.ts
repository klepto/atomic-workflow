import type {
  ChangedFile,
  Repository,
  TaskDetail,
  TaskSummary,
  Ticket,
  TicketChanges,
  UsageLimits,
} from '@/api/types.ts';

/**
 * Data that the stub RPC server answers with: a repository with one task, whose one ticket needs review and holds a
 * large diff.
 */
export interface PerfFixture {
  /**
   * Answer of `repositoryGet`.
   */
  readonly repository: Repository;

  /**
   * The one task of the repository, the answer of `taskList`.
   */
  readonly task: TaskSummary;

  /**
   * Answer of `taskGet` for the task.
   */
  readonly detail: TaskDetail;

  /**
   * Ticket whose review the check opens.
   */
  readonly ticket: Ticket;

  /**
   * Answer of `usageGet`.
   */
  readonly usage: UsageLimits;

  /**
   * Answer of `ticketDiff` for the ticket.
   */
  readonly changes: TicketChanges;

  /**
   * Section of the patch of each big file, whose `patch` is `null` in `changes`, by its path: the answer of
   * `ticketFileDiff`.
   */
  readonly bigPatches: ReadonlyMap<string, string>;
}

/**
 * Shape of a changed file of the fixture, before its patch is written.
 */
interface FileSpec {
  /**
   * Path of the file.
   */
  readonly path: string;

  /**
   * Language of the generated lines.
   */
  readonly language: Language;

  /**
   * Whether the file is new, so its patch has one hunk of added lines.
   */
  readonly added: boolean;

  /**
   * Number of the changed lines: for an added file, its lines; else the lines of its hunks, each with context.
   */
  readonly lines: number;

  /**
   * Whether the file is build output.
   */
  readonly generated: boolean;

  /**
   * Whether one line of the file is longer than 1,000 characters.
   */
  readonly longLine: boolean;
}

/**
 * Language of the lines of a file of the fixture.
 */
type Language = 'ts' | 'tsx' | 'js' | 'py' | 'rs' | 'go' | 'css' | 'json' | 'md' | 'yaml' | 'sh' | 'java';

/**
 * Most changed lines of a file whose patch `ticketDiff` holds, as `BIG_FILE_LINES` of
 * `mcp/src/worktree/changed-files.ts`. A file with more has the patch `null`.
 */
const BIG_FILE_LINES = 1000;

/**
 * Languages of the small files of the fixture, in turn.
 */
const LANGUAGES: readonly Language[] = [
  'ts',
  'tsx',
  'ts',
  'js',
  'py',
  'rs',
  'go',
  'css',
  'json',
  'md',
  'yaml',
  'sh',
  'java',
];

/**
 * Directory of the files of each language.
 */
const DIRECTORIES: Readonly<Record<Language, string>> = {
  ts: 'src/core',
  tsx: 'src/ui',
  js: 'scripts',
  py: 'tools/py',
  rs: 'native/src',
  go: 'service/internal',
  css: 'src/styles',
  json: 'config',
  md: 'docs',
  yaml: '.github/workflows',
  sh: 'bin',
  java: 'android/app/src',
};

/**
 * Identifier of the ticket whose review the check opens.
 */
const TICKET_ID = 1;

/**
 * Identifier of the task of the ticket.
 */
const TASK_ID = 1;

/**
 * Returns a generator of numbers in [0, 1) that gives the same sequence for the same `seed` (mulberry32).
 */
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Words that the generated lines are made of.
 */
const WORDS = [
  'value',
  'count',
  'items',
  'result',
  'options',
  'context',
  'request',
  'response',
  'buffer',
  'index',
  'state',
  'config',
  'handler',
  'record',
  'payload',
  'cache',
];

/**
 * Returns a generator of lines of code in `language`, which spans block comments over several lines now and then.
 */
const lineWriter = (language: Language, random: () => number): ((index: number) => string) => {
  const word = (): string => WORDS[Math.floor(random() * WORDS.length)] ?? 'value';
  const number = (): number => Math.floor(random() * 1000);
  let commentLeft = 0;
  return (index) => {
    const indent = '  '.repeat(1 + Math.floor(random() * 3));
    if (commentLeft > 0) {
      commentLeft -= 1;
      return commentLeft === 0 ? `${indent} */` : `${indent} * Keeps the ${word()} of the ${word()} for later.`;
    }
    if (index % 37 === 0 && ['ts', 'tsx', 'js', 'rs', 'go', 'css', 'java'].includes(language)) {
      commentLeft = 3;
      return `${indent}/**`;
    }
    switch (language) {
      case 'ts':
        return `${indent}const ${word()}${index} = ${word()}.map((item: number) => item * ${number()}); // ${word()}`;
      case 'tsx':
        return `${indent}<Row key={${word()}.id} label="${word()} ${number()}" onClick={() => select(${index})} />`;
      case 'js':
        return `${indent}export const ${word()}${index} = async (${word()}) => fetch(\`/api/${word()}/\${${number()}}\`);`;
      case 'py':
        return `${indent}${word()}_${index} = [x * ${number()} for x in ${word()} if x > ${number()}]  # ${word()}`;
      case 'rs':
        return `${indent}let ${word()}_${index}: Vec<u32> = ${word()}.iter().map(|x| x + ${number()}).collect();`;
      case 'go':
        return `${indent}${word()}${index} := make(map[string]int, ${number()}) // ${word()}`;
      case 'css':
        return `${indent}.${word()}-${index} { margin: ${number()}px; color: #${number().toString(16).padStart(3, '0')}; }`;
      case 'json':
        return `${indent}"${word()}${index}": { "${word()}": ${number()}, "enabled": ${random() > 0.5} },`;
      case 'md':
        return `- The **${word()}** keeps the \`${word()}\` of line ${index}, as [the ${word()}](./${word()}.md) says.`;
      case 'yaml':
        return `${indent}${word()}-${index}: { run: "npm run ${word()}", timeout: ${number()} }`;
      case 'sh':
        return `${indent}if [ -n "$${word().toUpperCase()}" ]; then echo "${word()} ${index}" >&2; fi`;
      case 'java':
        return `${indent}final List<Integer> ${word()}${index} = ${word()}.stream().map(x -> x + ${number()}).toList();`;
    }
  };
};

/**
 * Returns the specs of the files of the fixture: 120 files with more than 20,000 changed lines in total, in several
 * languages, with one added file of 12,000 lines, a few more files over `BIG_FILE_LINES` lines, one generated file and
 * one file with a long line.
 */
const fileSpecs = (): readonly FileSpec[] => {
  const specs: FileSpec[] = [
    {
      path: 'src/core/schema-registry.ts',
      language: 'ts',
      added: true,
      lines: 12_000,
      generated: false,
      longLine: false,
    },
    { path: 'dist/bundle.min.js', language: 'js', added: false, lines: 1500, generated: true, longLine: false },
    {
      path: 'tools/py/migrate_records.py',
      language: 'py',
      added: false,
      lines: 1300,
      generated: false,
      longLine: false,
    },
    { path: 'native/src/codec.rs', language: 'rs', added: true, lines: 1200, generated: false, longLine: false },
    { path: 'src/styles/theme.css', language: 'css', added: false, lines: 1100, generated: false, longLine: false },
    { path: 'config/fixtures.json', language: 'json', added: false, lines: 60, generated: false, longLine: true },
  ];
  for (let index = specs.length; index < 120; index += 1) {
    const language = LANGUAGES[index % LANGUAGES.length] ?? 'ts';
    specs.push({
      path: `${DIRECTORIES[language]}/module-${String(index).padStart(3, '0')}.${language}`,
      language,
      added: index % 9 === 0,
      lines: 40 + ((index * 37) % 120),
      generated: false,
      longLine: false,
    });
  }
  return specs;
};

/**
 * Returns the section of the patch of the file `spec`, as `git show -M` writes it, with its line counts. A modified
 * file has hunks of 30 lines or so, each with 3 lines of context around a run of deleted and added lines.
 */
const patchOf = (spec: FileSpec, seed: number): { patch: string; additions: number; deletions: number } => {
  const random = seededRandom(seed);
  const write = lineWriter(spec.language, random);
  const header = [`diff --git a/${spec.path} b/${spec.path}`];
  if (spec.added) {
    header.push('new file mode 100644', 'index 0000000..1a2b3c4', '--- /dev/null', `+++ b/${spec.path}`);
    const lines = Array.from({ length: spec.lines }, (_, index) => `+${write(index)}`);
    return {
      patch: [...header, `@@ -0,0 +1,${spec.lines} @@`, ...lines, ''].join('\n'),
      additions: spec.lines,
      deletions: 0,
    };
  }
  header.push('index 5d6e7f8..9a0b1c2 100644', `--- a/${spec.path}`, `+++ b/${spec.path}`);
  const body: string[] = [];
  let additions = 0;
  let deletions = 0;
  let oldStart = 1;
  let newStart = 1;
  let written = 0;
  let lineIndex = 0;
  while (written < spec.lines) {
    oldStart += 10 + Math.floor(random() * 40);
    newStart = oldStart + additions - deletions;
    const deleted = 2 + Math.floor(random() * 8);
    const added = 2 + Math.floor(random() * 16);
    const hunk: string[] = [];
    for (let index = 0; index < 3; index += 1) hunk.push(` ${write(lineIndex++)}`);
    for (let index = 0; index < deleted; index += 1) hunk.push(`-${write(lineIndex++)}`);
    for (let index = 0; index < added; index += 1) {
      const long = spec.longLine && body.length === 0 && index === 0;
      hunk.push(long ? `+  "blob": "${'A0b1C2d3'.repeat(800)}",` : `+${write(lineIndex++)}`);
    }
    for (let index = 0; index < 3; index += 1) hunk.push(` ${write(lineIndex++)}`);
    body.push(`@@ -${oldStart},${deleted + 6} +${newStart},${added + 6} @@ ${write(lineIndex).trim().slice(0, 40)}`);
    body.push(...hunk);
    additions += added;
    deletions += deleted;
    oldStart += deleted + 6;
    written += deleted + added;
  }
  return { patch: [...header, ...body, ''].join('\n'), additions, deletions };
};

/**
 * Returns the fixture of the performance check. The same call gives the same data each time.
 */
export const createFixture = (): PerfFixture => {
  const files: ChangedFile[] = [];
  const bigPatches = new Map<string, string>();
  for (const [index, spec] of fileSpecs().entries()) {
    const { patch, additions, deletions } = patchOf(spec, index + 1);
    const big = additions + deletions > BIG_FILE_LINES;
    if (big) bigPatches.set(spec.path, patch);
    files.push({
      path: spec.path,
      oldPath: null,
      status: spec.added ? 'added' : 'modified',
      additions,
      deletions,
      binary: false,
      generated: spec.generated,
      patch: big ? null : patch,
    });
  }
  const ticket: Ticket = {
    id: TICKET_ID,
    slug: 'large-diff',
    summary: 'Change many files at once, as the fixture of the performance check of the review.',
    status: 'needs-review',
    mode: 'unattended',
    type: 'code',
    complexity: 'complex',
    description: 'Fixture of the performance check.',
    dependsOn: [],
    fixes: null,
    stage: null,
    blockedReason: null,
  };
  const createdAt = Date.UTC(2026, 0, 1);
  return {
    repository: { name: 'perf-fixture', directory: '/perf-fixture' },
    task: {
      id: TASK_ID,
      slug: 'perf-fixture',
      status: 'complete',
      createdAt,
      completedTickets: 1,
      totalTickets: 1,
      runStartedAt: null,
      runEndedAt: null,
    },
    detail: { id: TASK_ID, goals: [], tickets: [ticket] },
    ticket,
    usage: { fiveHour: null, sevenDay: null, fetchedAt: null },
    changes: { commit: '0123456789abcdef0123456789abcdef01234567', files },
    bigPatches,
  };
};
