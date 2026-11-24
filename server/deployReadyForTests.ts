// What the deploy tests share: a workflow's list of the code a Worker is built from, whether a path lies under it, and
// what `.github/deploy-ready.sh` decides for a commit, run against a scratch repository and a stand-in GitHub CLI.

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const REPO = new URL('../', import.meta.url);

/** A workflow's text, by its file name under `.github/workflows/`. */
export const workflowText = (name: string): string => readFileSync(new URL(`.github/workflows/${name}`, REPO), 'utf8');

/** The paths a workflow's `CODE: >-` lists, a `:!path` among them leaving that one out. */
export const codeOf = (workflow: string): string[] =>
  (/CODE: >-\n((?: {12}\S.*\n)+)/.exec(workflow)?.[1] ?? '').trim().split(/\s+/);

/** Whether a path from the repository's root lies under the code, and under none it leaves out. */
export function underCode(code: readonly string[], path: string): boolean {
  const under = (paths: readonly string[]) => paths.some((one) => path === one || path.startsWith(`${one}/`));
  const left = code.filter((one) => one.startsWith(':!')).map((one) => one.slice(2));
  return under(code.filter((one) => !one.startsWith(':!'))) && !under(left);
}

/** Every file under a folder of the repository, by its path from the root. */
export const filesUnder = (folder: string): string[] =>
  readdirSync(new URL(folder, REPO), { recursive: true, encoding: 'utf8' }).map((name) => join(folder, name));

export interface Asked {
  /** Run by hand rather than from a merge. */
  readonly byHand?: boolean;
  /** main's head is another commit. */
  readonly moved?: boolean;
  /** A deploy to the environment is found. */
  readonly found?: boolean;
  /** The repository has the Cloudflare token. */
  readonly token?: boolean;
  /** The commit passed its CI check. */
  readonly checked?: boolean;
  /** What the code's paths are joined by, as the workflow's YAML hands them over; a space when not given. */
  readonly joined?: string;
}

/** What the ready script decides for a commit that changes `changed` over the one last deployed to `environment`,
 *  with `code` the paths deployed: from a merge (or by hand), while the commit is main's head (or after main moved
 *  on), with that deploy found, the token there, and the commit's CI check passed, unless `asked` says otherwise. */
export function decided(environment: string, code: readonly string[], changed: string, asked: Asked = {}): string {
  const root = mkdtempSync(join(tmpdir(), `${environment}-deploy-`));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', ...args], { cwd: root })
      .toString()
      .trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    git('init', '-q');
    for (const path of ['server/worker.ts', 'server/bot/worker.ts', 'crates/room/src/lib.rs', 'bible/Home.md', changed])
      write(path, 'one');
    git('add', '.');
    git('commit', '-qm', 'deployed');
    const deployed = git('rev-parse', 'HEAD');
    write(changed, 'two');
    git('add', '.');
    git('commit', '-qm', 'merged');
    const head = git('rev-parse', 'HEAD');
    // The GitHub CLI as the script asks it: main's head, the deployments to the environment, each one's last word,
    // and whether the commit passed its check.
    write(
      'bin/gh',
      [
        '#!/bin/bash',
        `case "$2" in`,
        `  *check-runs?check_name=check) echo ${asked.checked === false ? 'false' : 'true'} ;;`,
        `  *commits/main) echo ${asked.moved ? 'f'.repeat(40) : head} ;;`,
        `  *environment=${environment}\\&*) ${asked.found === false ? 'true' : `echo "${deployed} 7"`} ;;`,
        `  */deployments/7/statuses) echo success ;;`,
        'esac',
      ].join('\n'),
    );
    chmodSync(join(root, 'bin/gh'), 0o755);
    write('output', '');
    const env = {
      PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`,
      HAS_TOKEN: asked.token === false ? 'false' : 'true',
      BY_HAND: asked.byHand ? 'true' : 'false',
      CODE: code.join(asked.joined ?? ' '),
      GITHUB_REPOSITORY: 'owner/no-shores',
      GITHUB_SHA: head,
      GITHUB_OUTPUT: join(root, 'output'),
    };
    const script = new URL('.github/deploy-ready.sh', REPO).pathname;
    execFileSync('bash', ['--noprofile', '--norc', script, environment, `the ${environment}`], { cwd: root, env });
    return readFileSync(join(root, 'output'), 'utf8').trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Whether a thrown run printed an error for the workflow's log. */
export const refused = (thrown: unknown): boolean =>
  String((thrown as { stdout?: Buffer }).stdout).includes('::error::');
