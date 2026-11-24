import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEVELS,
  PERMISSION,
  ROLE_REFUSALS,
  atLeast,
  basePermissions,
  levelOf,
  missing,
  roleRefusal,
} from './access.ts';
import { BOT_MODULES, moduleOf } from './modules.ts';
import { type Schema, channelsWithin, defaults, referencedIds, roleSpots, salvage, validate } from './settings.ts';

const SERVER = '900000000000000001';
const OWNER = '1000000000000000001';
const server = (roles: Array<{ id: string; permissions: string }>) => ({ id: SERVER, owner_id: OWNER, roles });

test('access: the owner holds everything; Administrator holds everything', () => {
  const held = server([
    { id: SERVER, permissions: '0' },
    { id: 'admin', permissions: String(PERMISSION.ADMINISTRATOR) },
  ]);
  assert.equal(basePermissions(held, { user_id: OWNER, roles: [] }), PERMISSION.ALL);
  assert.equal(basePermissions(held, { user_id: '2', roles: ['admin'] }), PERMISSION.ALL);
});

test('access: levels follow Discord permissions, and the bot owners hold the top level', () => {
  const held = server([
    { id: SERVER, permissions: String(PERMISSION.VIEW_CHANNEL) },
    { id: 'mgr', permissions: String(PERMISSION.MANAGE_GUILD) },
    { id: 'mod', permissions: String(PERMISSION.MODERATE_MEMBERS) },
    { id: 'audit', permissions: String(PERMISSION.VIEW_AUDIT_LOG) },
  ]);
  assert.equal(levelOf(held, { user_id: OWNER, roles: [] }), 'owner');
  assert.equal(levelOf(held, { user_id: '2', roles: ['mgr'] }), 'manager');
  assert.equal(levelOf(held, { user_id: '2', roles: ['mod'] }), 'moderator');
  assert.equal(levelOf(held, { user_id: '2', roles: ['audit'] }), 'viewer');
  assert.equal(levelOf(held, { user_id: '2', roles: [] }), 'none');
  assert.equal(levelOf(held, { user_id: '3', roles: [] }, { owners: ['3'] }), 'owner');
});

test('access: a grant raises a member to manager at most, and only with the role', () => {
  const held = server([{ id: SERVER, permissions: '0' }]);
  const grants = [
    { role: 'helpers', level: 'moderator' },
    { role: 'helpers', level: 'owner' },
    { role: 'leads', level: 'manager' },
  ];
  assert.equal(levelOf(held, { user_id: '2', roles: ['helpers'] }, { grants }), 'moderator');
  assert.equal(levelOf(held, { user_id: '2', roles: ['leads'] }, { grants }), 'manager');
  assert.equal(levelOf(held, { user_id: '2', roles: [] }, { grants }), 'none');
});

test('access: levels are ordered and missing bits are named', () => {
  assert.deepEqual(LEVELS, ['none', 'viewer', 'moderator', 'manager', 'owner']);
  assert.ok(atLeast('owner', 'manager'));
  assert.ok(!atLeast('moderator', 'manager'));
  assert.deepEqual(missing(PERMISSION.SEND_MESSAGES, PERMISSION.SEND_MESSAGES | PERMISSION.EMBED_LINKS), [
    'EMBED_LINKS',
  ]);
});

test("access: naming a role is held to Discord's rule; the owner is held only to a givable role", () => {
  const ranked = {
    id: 'g',
    owner_id: 'owner',
    roles: [
      { id: 'g', permissions: '0', position: 0, managed: false },
      { id: 'low', permissions: '0', position: 1, managed: false },
      { id: 'roler', permissions: String(PERMISSION.MANAGE_ROLES), position: 3, managed: false },
      { id: 'admin', permissions: String(PERMISSION.ADMINISTRATOR), position: 5, managed: false },
      { id: 'high', permissions: '0', position: 6, managed: false },
      { id: 'app', permissions: '0', position: 2, managed: true },
    ],
  };
  const roler = { user_id: 'r', roles: ['roler'] };
  assert.equal(roleRefusal(ranked, roler, ['low']), null);
  assert.deepEqual(roleRefusal(ranked, roler, ['low', 'roler']), { role: 'roler', why: 'above' }, 'not their own');
  assert.deepEqual(roleRefusal(ranked, { user_id: 'a', roles: ['admin'] }, ['high']), { role: 'high', why: 'above' });
  assert.deepEqual(roleRefusal(ranked, { user_id: 'm', roles: ['low'] }, ['low']), { role: 'low', why: 'permission' });
  assert.equal(roleRefusal(ranked, { user_id: 'owner', roles: [] }, ['high']), null, "the server's owner");
  assert.equal(roleRefusal(ranked, { user_id: 'x', roles: [] }, ['high'], { owner: true }), null, "the bot's owners");
  assert.deepEqual(roleRefusal(ranked, { user_id: 'owner', roles: [] }, ['app']), { role: 'app', why: 'managed' });
  assert.deepEqual(roleRefusal(ranked, { user_id: 'owner', roles: [] }, ['g']), { role: 'g', why: 'managed' });
  assert.deepEqual(roleRefusal(ranked, roler, ['gone']), { role: 'gone', why: 'missing' });
  assert.equal(roleRefusal(ranked, { user_id: 'm', roles: [] }, []), null, 'naming no role asks nothing');
  for (const why of ['missing', 'managed', 'permission', 'above'] as const) assert.ok(ROLE_REFUSALS[why]);
});

const SCHEMA: Schema = {
  on: { type: 'bool', label: 'On', default: false },
  n: { type: 'int', label: 'N', min: 1, max: 10, default: 5 },
  word: { type: 'text', label: 'Word', max: 5, default: '', pattern: '[a-z]+' },
  ch: { type: 'channel', label: 'Channel', default: '' },
  kind: {
    type: 'enum',
    label: 'Kind',
    default: 'a',
    values: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  },
  list: { type: 'list', label: 'List', max: 2, default: [], of: { type: 'role', label: 'Role', default: '' } },
  group: { type: 'group', label: 'Group', fields: { inner: { type: 'bool', label: 'Inner', default: true } } },
};

test('settings: missing fields take their defaults and unknown keys are dropped', () => {
  const read = validate(SCHEMA, { on: true, stray: 1 });
  assert.deepEqual(read, { ok: true, value: { ...defaults(SCHEMA), on: true } });
});

test('settings: each field type refuses the wrong shape, with the path', () => {
  const read = validate(SCHEMA, {
    on: 'yes',
    n: 11,
    word: 'ABC',
    ch: 'general',
    kind: 'c',
    list: ['900000000000000020', '900000000000000021', '900000000000000022'],
    group: { inner: 1 },
  });
  assert.equal(read.ok, false);
  assert.deepEqual(read.ok ? [] : read.errors.map((error) => error.path).sort(), [
    'ch',
    'group.inner',
    'kind',
    'list',
    'n',
    'on',
    'word',
  ]);
});

test('settings: a list checks each entry; the ids a config names are found', () => {
  const read = validate(SCHEMA, { ch: '900000000000000030', list: ['900000000000000020', 'x'] });
  assert.equal(read.ok ? '' : read.errors[0]?.path, 'list[1]');
  const good = validate(SCHEMA, { ch: '900000000000000030', list: ['900000000000000020'] });
  assert.deepEqual(referencedIds(SCHEMA, good.ok ? good.value : {}), {
    channels: ['900000000000000030'],
    roles: ['900000000000000020'],
    emojis: [],
  });
});

test('settings: a role is placed by the setting that names it, a named entry by its name, a reward by its level', () => {
  const menus = moduleOf('rolemenus')?.schema.menus;
  assert.ok(menus);
  const value = {
    menus: [
      { name: 'staff', options: [{ role: '900000000000000020' }] },
      { name: 'colours', options: [{ role: '900000000000000021' }] },
    ],
  };
  assert.deepEqual(roleSpots({ menus }, value), [
    'menus[name:staff].options[].role=900000000000000020',
    'menus[name:colours].options[].role=900000000000000021',
  ]);
  const levels = moduleOf('levels')?.schema ?? {};
  const rewards = { noXpRoles: ['900000000000000020'], rewards: [{ level: 1, role: '900000000000000020' }] };
  assert.deepEqual(roleSpots(levels, rewards), [
    'noXpRoles[]=900000000000000020',
    'rewards[level:1].role=900000000000000020',
  ]);
});

test('settings: a saved config read under a tighter schema keeps all it can, field by field', () => {
  const tight: Schema = {
    on: { type: 'bool', label: 'On', default: false },
    count: { type: 'int', label: 'Count', min: 1, max: 10, default: 3 },
    words: { type: 'text', label: 'Words', max: 5, default: '' },
    roles: { type: 'list', label: 'Roles', max: 2, default: [], of: { type: 'role', label: 'Role', default: '' } },
    channel: { type: 'channel', label: 'Channel', default: '' },
  };
  const saved = {
    on: true,
    count: 50,
    words: 'too many words',
    roles: ['900000000000000001', '900000000000000002', '900000000000000003'],
    channel: 'not-an-id',
    gone: 1,
  };
  assert.equal(validate(tight, saved).ok, false, 'a save is still refused');
  assert.deepEqual(salvage(tight, saved), {
    on: true,
    count: 10,
    words: 'too m',
    roles: ['900000000000000001', '900000000000000002'],
    channel: '',
  });
  assert.deepEqual(salvage(tight, 'junk'), defaults(tight));
});

test("settings: a config keeps only the server's own channels, in lists and groups too", () => {
  const schema: Schema = {
    log: { type: 'channel', label: 'Log', default: '' },
    quiet: {
      type: 'list',
      label: 'Quiet',
      max: 5,
      default: [],
      of: { type: 'channel', label: 'Channel', default: '' },
    },
    items: {
      type: 'list',
      label: 'Items',
      max: 5,
      default: [],
      of: {
        type: 'group',
        label: 'Item',
        fields: {
          channel: { type: 'channel', label: 'Channel', default: '' },
          name: { type: 'text', label: 'Name', max: 10, default: '' },
        },
      },
    },
    on: { type: 'bool', label: 'On', default: true },
  };
  const own = '900000000000000001';
  const theirs = '800000000000000001';
  const given = {
    log: theirs,
    quiet: [own, theirs],
    items: [
      { channel: theirs, name: 'a' },
      { channel: own, name: 'b' },
    ],
    on: true,
  };
  assert.deepEqual(channelsWithin(schema, given, new Set([own])), {
    log: '',
    quiet: [own],
    items: [
      { channel: '', name: 'a' },
      { channel: own, name: 'b' },
    ],
    on: true,
  });
});

test('modules: each has a unique id, valid defaults, and levels that exist; core has no off switch', () => {
  const ids = BOT_MODULES.map((shape) => shape.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const shape of BOT_MODULES) {
    assert.match(shape.id, /^[a-z0-9-]{1,32}$/);
    assert.ok(LEVELS.includes(shape.view) && LEVELS.includes(shape.edit), shape.id);
    assert.ok(atLeast(shape.edit, shape.view), `${shape.id}: who may edit may also view`);
    assert.equal(validate(shape.schema, defaults(shape.schema)).ok, true, `${shape.id}: its defaults pass`);
    for (const action of shape.actions ?? [])
      assert.equal(validate(action.inputs, defaults(action.inputs)).ok, true, `${shape.id}.${action.id}`);
  }
  assert.equal(moduleOf('core')?.alwaysOn, true);
  assert.equal(moduleOf('nothing'), null);
});

test('modules: every message setting offers only the placeholders the bot can fill', () => {
  const fillable = new Set(['user', 'name', 'server', 'count', 'avatar', 'server_icon', 'welcome_card', 'level']);
  const walk = (schema: Schema, path: string) => {
    for (const [key, field] of Object.entries(schema)) {
      if (field.type === 'message')
        for (const name of field.vars) assert.ok(fillable.has(name), `${path}.${key} offers {${name}}`);
      if (field.type === 'group') walk(field.fields, `${path}.${key}`);
      if (field.type === 'list' && field.of.type === 'group') walk(field.of.fields, `${path}.${key}`);
    }
  };
  for (const shape of BOT_MODULES) walk(shape.schema, shape.id);
});
