// A module's settings drawn as a form from its schema, and read back into a value the bot will check against the same
// schema. Every word that came from Discord (a channel's or a role's name) is set as text, never as markup.
import {
  type Field,
  type FieldError,
  type ListField,
  type Schema,
  fieldDefault,
  recordOf,
} from '../../../server/bot/law/settings.ts';
import { bindMessage } from './composer.ts';
import type { Bound, Channel, FormContext } from './context.ts';
import { element } from './dom.ts';

let fieldCount = 0;
const nextId = (): string => `f${++fieldCount}`;

interface Option {
  readonly value: string;
  readonly label: string;
}

/** Channels a picker offers: the kinds the field allows, under their category's name, in Discord's order. */
function channelOptions(channels: readonly Channel[], kinds: readonly number[] | undefined): Option[] {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  return channels
    .filter((channel) => (kinds ? kinds.includes(channel.type) : channel.type !== 4))
    .sort((a, b) => a.position - b.position)
    .map((channel) => {
      const parent = channel.parentId ? byId.get(channel.parentId) : null;
      return { value: channel.id, label: parent ? `${parent.name} / #${channel.name}` : `#${channel.name}` };
    });
}

function select(id: string, options: readonly Option[], current: string, disabled: boolean): HTMLSelectElement {
  const box = element('select', { id });
  box.disabled = disabled;
  for (const option of options) box.append(element('option', { value: option.value }, [option.label]));
  // a saved id that is gone from the server stays visible, so saving does not silently drop it
  if (current && !options.some((option) => option.value === current))
    box.append(element('option', { value: current }, [`Missing (${current})`]));
  box.value = current;
  return box;
}

/** Draw one field. */
export function bindField(field: Field, value: unknown, ctx: FormContext, path: string): Bound {
  const id = nextId();
  const note = element('p', { class: 'field-error', role: 'alert' });
  const wrap = (input: HTMLElement, readValue: () => unknown): Bound => {
    const label = element('label', { for: id }, [field.label]);
    const help = field.help ? [element('p', { class: 'field-help' }, [field.help])] : [];
    return {
      element: element('div', { class: 'field' }, [label, ...help, input, note]),
      read: readValue,
      mark: (spot, message) => {
        if (spot !== path) return false;
        note.textContent = message;
        return true;
      },
    };
  };
  const text = typeof value === 'string' ? value : '';
  switch (field.type) {
    case 'bool': {
      const box = element('input', { id, type: 'checkbox' });
      box.checked = value === true;
      box.disabled = ctx.disabled;
      return wrap(box, () => box.checked);
    }
    case 'int': {
      const box = element('input', { id, type: 'number', min: String(field.min), max: String(field.max), step: '1' });
      box.value = String(value ?? field.default);
      box.disabled = ctx.disabled;
      return wrap(box, () => (box.value === '' ? field.default : Number(box.value)));
    }
    case 'text': {
      const attributes = {
        id,
        maxlength: String(field.max),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      };
      const box = field.multiline ? element('textarea', attributes) : element('input', attributes);
      box.value = text;
      box.disabled = ctx.disabled;
      return wrap(box, () => box.value);
    }
    case 'channel': {
      const options = [{ value: '', label: 'None' }, ...channelOptions(ctx.channels, field.kinds)];
      const box = select(id, options, text, ctx.disabled);
      return wrap(box, () => box.value);
    }
    case 'role': {
      const roles = [...ctx.roles]
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ value: role.id, label: `@${role.name}` }));
      const box = select(id, [{ value: '', label: 'None' }, ...roles], text, ctx.disabled);
      return wrap(box, () => box.value);
    }
    case 'enum': {
      const box = select(id, field.values, text, ctx.disabled);
      return wrap(box, () => box.value);
    }
    case 'group': {
      const held = recordOf(value);
      const parts = Object.entries(field.fields).map(
        ([key, sub]) => [key, bindField(sub, held[key], ctx, `${path}.${key}`)] as const,
      );
      return {
        element: element('fieldset', { class: 'group' }, [
          element('legend', {}, [field.label]),
          ...parts.map(([, bound]) => bound.element),
        ]),
        read: () => Object.fromEntries(parts.map(([key, bound]) => [key, bound.read()])),
        mark: (spot, message) => parts.some(([, bound]) => bound.mark(spot, message)),
      };
    }
    case 'list':
      return bindList(field, Array.isArray(value) ? value : [], ctx, path, note);
    case 'message':
      return bindMessage(field, value, ctx, path);
  }
}

function bindList(
  field: ListField,
  value: readonly unknown[],
  ctx: FormContext,
  path: string,
  note: HTMLElement,
): Bound {
  let items: Bound[] = [];
  const rows = element('div', { class: 'list-rows' });
  const add = element('button', { type: 'button', class: 'button button-small' }, ['Add']);
  const make = (itemValue: unknown): Bound => bindField(field.of, itemValue, ctx, `${path}[${items.length}]`);
  const draw = (): void => {
    rows.replaceChildren();
    items.forEach((bound, index) => {
      const remove = element('button', { type: 'button', class: 'button button-small' }, ['Remove']);
      remove.disabled = ctx.disabled;
      remove.addEventListener('click', () => {
        // rebuilt from their values, so each row's path names its place again for the bot's error marks
        const kept = items.filter((_row, spot) => spot !== index).map((row) => row.read());
        items = [];
        for (const itemValue of kept) items.push(make(itemValue));
        draw();
      });
      rows.append(element('div', { class: 'list-row' }, [bound.element, remove]));
    });
    add.disabled = ctx.disabled || items.length >= field.max;
  };
  for (const itemValue of value) items.push(make(itemValue));
  add.addEventListener('click', () => {
    // a new row is every one of its settings at its default, as the bot would fill it
    items.push(make(fieldDefault(field.of)));
    draw();
  });
  draw();
  return {
    element: element('div', { class: 'field list' }, [
      element('p', { class: 'field-label' }, [field.label]),
      ...(field.help ? [element('p', { class: 'field-help' }, [field.help])] : []),
      rows,
      add,
      note,
    ]),
    read: () => items.map((bound) => bound.read()),
    mark: (spot, message) => {
      if (spot !== path) return items.some((bound) => bound.mark(spot, message));
      note.textContent = message;
      return true;
    },
  };
}

export interface BoundForm {
  readonly element: HTMLElement;
  readonly read: () => Record<string, unknown>;
  /** Draw the previews again, as after the bot handed new preview values (a welcome card saved). */
  readonly refresh: () => void;
  /** Show the bot's refusals beside their fields. Answers the ones no field took. */
  readonly mark: (errors: readonly FieldError[]) => FieldError[];
}

/** The whole form for a schema. */
export function bindForm(schema: Schema, value: Readonly<Record<string, unknown>>, ctx: FormContext): BoundForm {
  const parts = Object.entries(schema).map(([key, field]) => [key, bindField(field, value[key], ctx, key)] as const);
  const formBox = element(
    'div',
    { class: 'form' },
    parts.map(([, bound]) => bound.element),
  );
  return {
    element: formBox,
    read: () => Object.fromEntries(parts.map(([key, bound]) => [key, bound.read()])),
    refresh() {
      for (const [, bound] of parts) bound.refresh?.();
    },
    mark(errors) {
      formBox.querySelectorAll('.field-error').forEach((node) => {
        node.textContent = '';
      });
      return errors.filter((error) => !parts.some(([, bound]) => bound.mark(error.path, error.message)));
    },
  };
}
