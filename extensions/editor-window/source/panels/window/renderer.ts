/**
 * Draws a window's control tree (from GUI in the scene process) with the
 * editor's ui-* elements. Inputs keep what the user is typing: a value from
 * the scene only replaces a focused field's content after it loses focus.
 */
import { defineComponent, h, onMounted, onUpdated, ref, type PropType, type VNode } from 'vue';
import type { GuiControl, HostEvent } from './types';

export type Emit = (e: HostEvent) => void;

function isFocused(el: HTMLElement): boolean {
    return el.matches(':focus, :focus-within');
}

function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return String(a) === String(b);
}

/** A ui-* input bound to a value. */
const Input = defineComponent({
    name: 'EwInput',
    props: {
        tag: { type: String, required: true },
        value: { type: null as unknown as PropType<unknown>, default: undefined },
        attrs: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
        /** Events that carry a new value. */
        listen: { type: Array as PropType<string[]>, default: () => ['change'] },
        options: { type: Array as PropType<{ name: string; value: unknown }[]>, default: undefined },
        onValue: { type: Function as PropType<(v: unknown) => void>, required: true },
    },
    setup(props) {
        const el = ref<any>(null);
        let applied: { value: unknown } | null = null;
        const sync = () => {
            const e = el.value;
            if (!e || isFocused(e)) return;
            // Compare with what was set last too: an empty number field reads as 0.
            if (applied && same(applied.value, props.value) && same(e.value, props.value)) return;
            e.value = Array.isArray(props.value) ? [...props.value] : props.value;
            applied = { value: props.value };
        };
        onMounted(sync);
        onUpdated(sync);
        return () => {
            const handlers: Record<string, unknown> = {
                onFocusout: () => setTimeout(sync, 0),
            };
            for (const name of props.listen) {
                handlers[`on${name[0].toUpperCase()}${name.slice(1)}`] = (ev: Event) => {
                    ev.stopPropagation();
                    const v = (ev.target as any)?.value ?? el.value?.value;
                    if (!same(v, props.value)) props.onValue(Array.isArray(v) ? [...v] : v);
                };
            }
            const children = props.options?.map((o) => h('option', { value: String(o.value), key: String(o.value) }, o.name));
            return h(props.tag, { ref: el, ...props.attrs, ...handlers }, children);
        };
    },
});

function disabledAttr(c: GuiControl) {
    return c.disabled ? { disabled: '' } : {};
}

/** A labelled row like the Inspector's. */
function row(c: GuiControl, content: VNode | (VNode | null)[]): VNode {
    const label = c.label ? h('ui-label', { slot: 'label', value: c.label, tooltip: c.tooltip }) : null;
    return h('ui-prop', { key: c.id, class: ['ew-row', { 'ew-disabled': c.disabled }], ...(c.label ? {} : { 'no-label': '' }) }, [
        label,
        h('div', { slot: 'content', class: 'ew-content' }, Array.isArray(content) ? content : [content]),
    ]);
}

function input(c: GuiControl, emit: Emit, tag: string, attrs: Record<string, unknown> = {}, listen = ['change'], options?: { name: string; value: unknown }[]) {
    return h(Input, {
        key: `${c.id}:${tag}`,
        tag,
        value: c.value,
        attrs: { class: 'ew-input', ...attrs, ...disabledAttr(c) },
        listen,
        options,
        onValue: (v: unknown) => emit({ id: c.id, type: 'change', value: v }),
    });
}

export function renderControls(list: GuiControl[] | undefined, emit: Emit): VNode[] {
    return (list || []).map((c) => renderControl(c, emit));
}

function renderControl(c: GuiControl, emit: Emit): VNode {
    const key = c.id;
    switch (c.k) {
        case 'label':
            return h('div', {
                key,
                class: ['ew-label', { bold: c.bold, italic: c.italic, wrap: c.wrap, 'ew-disabled': c.disabled }],
                style: { fontSize: c.size ? `${c.size}px` : undefined, color: c.color, textAlign: c.align },
                title: c.tooltip,
            }, c.text);
        case 'title':
            return h('div', { key, class: 'ew-title' }, [
                h('div', { class: 'ew-title-text' }, c.text),
                c.subtitle ? h('div', { class: 'ew-subtitle' }, c.subtitle) : null,
            ]);
        case 'labelField':
            return row(c, h('span', { class: 'ew-value' }, c.text));
        case 'help':
            return h('div', { key, class: ['ew-help', `ew-help-${c.type}`] }, [c.type === 'none' ? null : h('span', { class: 'ew-help-icon' }), h('span', c.text)]);
        case 'space':
            return h('div', { key, class: 'ew-space', style: { height: `${c.size}px`, width: `${c.size}px` } });
        case 'separator':
            return h('div', { key, class: 'ew-separator' });
        case 'flex':
            return h('div', { key, class: 'ew-flex' });
        case 'horizontal':
            return h('div', { key, class: ['ew-horizontal', { 'ew-disabled': c.disabled }] }, renderControls(c.children, emit));
        case 'vertical':
            return h('div', { key, class: 'ew-vertical' }, renderControls(c.children, emit));
        case 'indent':
            return h('div', { key, class: 'ew-indent' }, renderControls(c.children, emit));
        case 'box':
            return h('div', { key, class: 'ew-box' }, [
                c.title ? h('div', { class: 'ew-box-header' }, c.title) : null,
                h('div', { class: 'ew-box-body' }, renderControls(c.children, emit)),
            ]);
        case 'foldout':
            return h('div', { key, class: ['ew-foldout', { open: c.open }] }, [
                h('div', { class: 'ew-foldout-header', onClick: () => emit({ id: c.id, type: 'toggle' }) }, [h('span', { class: 'ew-arrow' }), h('span', c.label)]),
                c.open ? h('div', { class: 'ew-foldout-body' }, renderControls(c.children, emit)) : null,
            ]);
        case 'scroll':
            return h('div', { key, class: ['ew-scroll', { fill: !c.height }], style: c.height ? { height: `${c.height}px` } : undefined }, renderControls(c.children, emit));
        case 'tabs':
            return h('div', { key, class: 'ew-tabs' }, [
                h('div', { class: 'ew-tabbar' }, (c.labels as string[]).map((label, i) =>
                    h('div', { key: i, class: ['ew-tab', { active: i === c.index }], onClick: () => i !== c.index && emit({ id: c.id, type: 'change', value: i }) }, label))),
                h('div', { class: 'ew-tab-body' }, renderControls(c.children, emit)),
            ]);
        case 'button':
            return h('ui-button', {
                key,
                class: ['ew-button', c.color],
                style: { height: c.height ? `${c.height}px` : undefined, width: c.width ? `${c.width}px` : undefined },
                title: c.tooltip,
                ...disabledAttr(c),
                onConfirm: (ev: Event) => {
                    ev.stopPropagation();
                    if (!c.disabled) emit({ id: c.id, type: 'click' });
                },
            }, c.label);
        case 'toolbar':
            return h('div', { key, class: ['ew-toolbar', { 'ew-disabled': c.disabled }] }, (c.labels as string[]).map((label, i) =>
                h('div', { key: i, class: ['ew-toolbar-item', { active: i === c.value }], onClick: () => !c.disabled && i !== c.value && emit({ id: c.id, type: 'change', value: i }) }, label)));
        case 'toggle':
            return row(c, input(c, emit, 'ui-checkbox'));
        case 'text':
            return row(c, input(c, emit, 'ui-input', { placeholder: c.placeholder }));
        case 'textarea':
            return row(c, input(c, emit, 'ui-textarea', { style: { height: `${(c.rows || 3) * 18 + 6}px` } }));
        case 'number':
            return row(c, input(c, emit, 'ui-num-input', { min: c.min, max: c.max, step: c.step, preci: c.int ? 0 : undefined }));
        case 'slider':
            return row(c, input(c, emit, 'ui-slider', { min: c.min, max: c.max, step: c.step, preci: c.int ? 0 : undefined }));
        case 'popup':
            return row(c, input(c, emit, 'ui-select', {}, ['change'], c.items));
        case 'color':
            return row(c, input(c, emit, 'ui-color'));
        case 'vector':
            return row(c, h('div', { class: 'ew-vector' }, (c.axes as string[]).flatMap((axis) => [
                h('span', { key: `l${axis}`, class: 'ew-axis' }, axis.toUpperCase()),
                h(Input, {
                    key: axis,
                    tag: 'ui-num-input',
                    value: c.value?.[axis],
                    attrs: { class: 'ew-input', ...disabledAttr(c) },
                    onValue: (v: unknown) => emit({ id: c.id, type: 'change', value: { [axis]: Number(v) } }),
                }),
            ])));
        case 'object': {
            const tag = c.kind === 'node' ? 'ui-node' : c.kind === 'component' ? 'ui-component' : 'ui-asset';
            return row(c, h(Input, {
                key: `${c.id}:${tag}`,
                tag,
                value: c.value,
                attrs: { class: 'ew-input', droppable: c.type, placeholder: c.type, ...disabledAttr(c) },
                listen: ['change', 'confirm'],
                onValue: (v: unknown) => emit({ id: c.id, type: 'change', value: v || '', object: c.kind }),
            }));
        }
        case 'progress':
            return h('div', { key, class: 'ew-progress' }, [
                h('div', { class: 'ew-progress-fill', style: { width: `${(c.value || 0) * 100}%` } }),
                h('div', { class: 'ew-progress-text' }, c.text ?? `${Math.round((c.value || 0) * 100)}%`),
            ]);
        default:
            return h('div', { key, class: 'ew-unknown' }, `Unknown control "${c.k}"`);
    }
}
