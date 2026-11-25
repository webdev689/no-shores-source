import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandsOf } from './commands.ts';

// Discord's limits on a global slash command. A deploy writes the whole list at once, and Discord refuses the whole
// list for one command that breaks any of them, so the deploy fails.
const NAME = /^[-_\p{L}\p{N}]{1,32}$/u;
const MOST_COMMANDS = 100;
const MOST_OPTIONS = 25;
const MOST_CHOICES = 25;
const MOST_DESCRIBED = 100;
const MOST_CHOICE_WORDS = 100;
const MOST_CHARACTERS = 4000;
const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;

type Part = Readonly<Record<string, unknown>>;
const partsIn = (held: unknown): Part[] => (Array.isArray(held) ? (held as Part[]) : []);
const textOf = (held: unknown): string => (typeof held === 'string' ? held : '');

/** Every name, description and choice a command holds, counted as Discord counts toward its total. */
function charactersIn(part: Part): number {
  const choices = partsIn(part.choices).reduce(
    (sum, choice) => sum + textOf(choice.name).length + String(choice.value ?? '').length,
    0,
  );
  const options = partsIn(part.options).reduce((sum, option) => sum + charactersIn(option), 0);
  return textOf(part.name).length + textOf(part.description).length + choices + options;
}

/** What a command, or an option within it at `where`, breaks of Discord's limits, one line each. */
function problemsOf(part: Part, where = textOf(part.name)): string[] {
  const problems: string[] = [];
  const name = textOf(part.name);
  if (!NAME.test(name) || name !== name.toLowerCase())
    problems.push(`${where}: the name "${name}" is not 1 to 32 lower-case letters, digits, - or _`);
  const described = textOf(part.description).length;
  if (described < 1 || described > MOST_DESCRIBED)
    problems.push(`${where}: a description of ${described} characters, not 1 to ${MOST_DESCRIBED}`);
  const options = partsIn(part.options);
  if (options.length > MOST_OPTIONS) problems.push(`${where}: ${options.length} options, more than ${MOST_OPTIONS}`);
  const names = options.map((option) => textOf(option.name));
  if (new Set(names).size !== names.length) problems.push(`${where}: two options of one name`);
  // a value a person must give comes before any they may leave out; a sub-command is neither
  const given = options.filter((option) => option.type !== SUB_COMMAND && option.type !== SUB_COMMAND_GROUP);
  const firstLeft = given.findIndex((option) => option.required !== true);
  if (firstLeft >= 0 && given.slice(firstLeft).some((option) => option.required === true))
    problems.push(`${where}: a required option after one that is not`);
  const choices = partsIn(part.choices);
  if (choices.length > MOST_CHOICES) problems.push(`${where}: ${choices.length} choices, more than ${MOST_CHOICES}`);
  for (const choice of choices) {
    const words = textOf(choice.name).length;
    const value = typeof choice.value === 'string' ? choice.value.length : 1;
    if (words < 1 || words > MOST_CHOICE_WORDS || value < 1 || value > MOST_CHOICE_WORDS)
      problems.push(`${where}: the choice "${textOf(choice.name)}" is not 1 to ${MOST_CHOICE_WORDS} characters`);
  }
  for (const option of options) problems.push(...problemsOf(option, `${where} ${textOf(option.name)}`));
  return problems;
}

/** What the whole list breaks: each command's own limits and its total, and how many there are. */
function listProblems(commands: readonly Part[]): string[] {
  const problems = commands.flatMap((command) => {
    const own = problemsOf(command);
    const total = charactersIn(command);
    return total > MOST_CHARACTERS ? [...own, `${textOf(command.name)}: ${total} characters in all`] : own;
  });
  if (commands.length > MOST_COMMANDS) problems.push(`${commands.length} commands, more than ${MOST_COMMANDS}`);
  return problems;
}

test("commands: every command the deploy writes keeps Discord's limits", () => {
  const commands = commandsOf() as readonly Part[];
  assert.ok(commands.length > 1);
  for (const command of commands)
    assert.ok(command.type === undefined || command.type === 1, `${String(command.name)} is a slash command`);
  assert.deepEqual(listProblems(commands), []);
});

test('commands: the check finds each limit a command can break', () => {
  const fine = { name: 'fine', description: 'Fine' };
  const option = (name: string, extra: Part = {}): Part => ({ type: 3, name, description: 'An option', ...extra });
  const many = (count: number, make: (index: number) => Part): Part[] =>
    Array.from({ length: count }, (_part, index) => make(index));
  const broken = (command: Part): string => listProblems([command]).join('\n');
  assert.deepEqual(listProblems([fine]), []);
  assert.match(broken({ ...fine, name: 'Fine' }), /the name "Fine"/, 'upper case');
  assert.match(broken({ ...fine, name: 'two words' }), /the name/);
  assert.match(broken({ ...fine, name: 'x'.repeat(33) }), /the name/);
  assert.match(broken({ ...fine, description: '' }), /a description of 0 characters/);
  assert.match(broken({ ...fine, description: 'x'.repeat(101) }), /a description of 101 characters/);
  assert.match(broken({ ...fine, options: many(26, (index) => option(`o${index}`)) }), /26 options/);
  assert.match(broken({ ...fine, options: [option('same'), option('same')] }), /two options of one name/);
  const late = [option('maybe'), option('must', { required: true })];
  assert.match(broken({ ...fine, options: late }), /a required option after one that is not/);
  const choices = many(26, (index) => ({ name: `c${index}`, value: `v${index}` }));
  assert.match(broken({ ...fine, options: [option('pick', { choices })] }), /fine pick: 26 choices/);
  const longChoice = [{ name: 'x'.repeat(101), value: 'v' }];
  assert.match(broken({ ...fine, options: [option('pick', { choices: longChoice })] }), /the choice/);
  const emptyValue = [{ name: 'Empty', value: '' }];
  assert.match(broken({ ...fine, options: [option('pick', { choices: emptyValue })] }), /the choice "Empty"/);
  const deep = { type: SUB_COMMAND, name: 'start', description: 'Start', options: [option('Bad')] };
  assert.match(broken({ ...fine, options: [deep] }), /fine start Bad: the name "Bad"/, 'within a sub-command');
  // each part within its own limits, but 25 sub-commands of two long descriptions each pass 4000 in all
  const words = 'x'.repeat(100);
  const wordy = (index: number): Part => ({
    type: SUB_COMMAND,
    name: `s${index}`,
    description: words,
    options: [option('what', { description: words })],
  });
  assert.equal(problemsOf({ ...fine, options: many(25, wordy) }).length, 0);
  assert.match(broken({ ...fine, options: many(25, wordy) }), /^fine: \d+ characters in all$/);
  assert.match(listProblems(many(101, (index) => ({ ...fine, name: `c${index}` }))).join('\n'), /101 commands/);
});
