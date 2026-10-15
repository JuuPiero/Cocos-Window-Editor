/**
 * Stand-ins for the editor's ui-* elements: same value properties and
 * change / confirm events, drawn with native inputs.
 */
const BASE = ':host{display:inline-flex;min-width:0;font:12px sans-serif;color:#ccc}';
const INPUT = 'background:#1f1f1f;color:#ddd;border:1px solid #111;border-radius:2px;height:20px;box-sizing:border-box;min-width:0;width:100%';

class UIBase extends HTMLElement {
    protected fire(name: string) {
        this.dispatchEvent(new CustomEvent(name, { bubbles: true }));
    }
}

class UILabel extends UIBase {
    static get observedAttributes() {
        return ['value'];
    }
    connectedCallback() {
        this.textContent = this.getAttribute('value') || '';
    }
    attributeChangedCallback() {
        this.textContent = this.getAttribute('value') || '';
    }
}

class UIProp extends UIBase {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>:host{display:flex;align-items:center;min-height:22px;min-width:0}
            .l{width:38%;flex:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#bbb}
            :host([no-label]) .l{display:none}.c{flex:1;display:flex;min-width:0}</style>
            <div class="l"><slot name="label"></slot></div><div class="c"><slot name="content"></slot></div>`;
    }
}

/** A native <input>/<select>/<textarea> in a shadow root. */
class UIField extends UIBase {
    static get observedAttributes() {
        return ['disabled', 'placeholder', 'min', 'max', 'step'];
    }
    protected el: HTMLInputElement;
    constructor(html: string) {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${BASE}input,select,textarea{${INPUT}}input[type=checkbox]{width:auto;height:14px}textarea{height:100%}input[type=range]{height:16px}</style>${html}`;
        this.el = root.querySelector('input,select,textarea') as HTMLInputElement;
        this.el.addEventListener('input', () => this.fire('change'));
        this.el.addEventListener('change', () => {
            if (this.el.type === 'checkbox' || this.el.tagName === 'SELECT') this.fire('change');
            this.fire('confirm');
        });
    }
    attributeChangedCallback(name: string) {
        const v = this.getAttribute(name);
        if (name === 'disabled') this.el.disabled = v !== null;
        else if (v !== null) this.el.setAttribute(name, v);
    }
    get value(): any {
        return this.el.value;
    }
    set value(v: any) {
        this.el.value = v ?? '';
    }
}

class UIInput extends UIField {
    constructor() {
        super('<input type="text">');
    }
}

class UITextarea extends UIField {
    constructor() {
        super('<textarea></textarea>');
    }
}

class UINumInput extends UIField {
    constructor() {
        super('<input type="number">');
    }
    get value(): any {
        return Number(this.el.value);
    }
    set value(v: any) {
        this.el.value = String(v);
    }
}

class UISlider extends UIField {
    constructor() {
        super('<input type="range">');
    }
    get value(): any {
        return Number(this.el.value);
    }
    set value(v: any) {
        this.el.value = String(v);
    }
}

class UICheckbox extends UIField {
    constructor() {
        super('<input type="checkbox">');
    }
    get value(): any {
        return this.el.checked;
    }
    set value(v: any) {
        this.el.checked = !!v;
    }
}

class UISelect extends UIField {
    private v = '';
    constructor() {
        super('<select></select>');
        new MutationObserver(() => this.sync()).observe(this, { childList: true, subtree: true });
    }
    private sync() {
        (this.el as unknown as HTMLSelectElement).innerHTML = this.innerHTML;
        this.el.value = this.v;
    }
    get value(): any {
        return this.el.value || this.v;
    }
    set value(v: any) {
        this.v = String(v);
        this.sync();
    }
    get options() {
        return Array.from((this.el as unknown as HTMLSelectElement).options).map((o) => o.textContent);
    }
}

/** ui-color: value [r, g, b, a]. */
class UIColor extends UIField {
    private a = 255;
    constructor() {
        super('<input type="color">');
    }
    get value(): any {
        const hex = this.el.value.replace('#', '');
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), this.a];
    }
    set value(v: any) {
        const [r, g, b, a] = v || [255, 255, 255, 255];
        this.a = a;
        this.el.value = `#${[r, g, b].map((x: number) => `0${x.toString(16)}`.slice(-2)).join('')}`;
    }
}

/** ui-asset / ui-node / ui-component: shows the uuid (the real ones show name + picker, and accept drops). */
class UIObject extends UIField {
    constructor() {
        super('<input type="text" placeholder="None">');
    }
}

class UIButton extends UIBase {
    connectedCallback() {
        this.style.display = 'inline-flex';
        this.style.alignItems = 'center';
        this.style.justifyContent = 'center';
        this.style.boxSizing = 'border-box';
        this.style.minHeight = '22px';
        this.style.padding = '0 8px';
        this.style.borderRadius = '3px';
        this.style.cursor = 'pointer';
        this.style.border = '1px solid #1e1e1e';
        const color = this.classList.contains('blue') ? '#2c66bd' : this.classList.contains('red') ? '#b5433b' : this.classList.contains('green') ? '#3d8a47' : '#3c3c3c';
        this.style.background = color;
        this.style.color = '#eee';
        if (!(this as any).__wired) {
            (this as any).__wired = true;
            this.addEventListener('click', () => {
                if (!this.hasAttribute('disabled')) this.fire('confirm');
            });
        }
    }
}

export function defineStubs() {
    const defs: [string, CustomElementConstructor][] = [
        ['ui-label', UILabel], ['ui-prop', UIProp], ['ui-input', UIInput], ['ui-textarea', UITextarea],
        ['ui-num-input', UINumInput], ['ui-slider', UISlider], ['ui-checkbox', UICheckbox], ['ui-select', UISelect],
        ['ui-color', UIColor], ['ui-button', UIButton],
        ['ui-asset', class extends UIObject {}], ['ui-node', class extends UIObject {}], ['ui-component', class extends UIObject {}],
    ];
    for (const [name, ctor] of defs) customElements.define(name, ctor);
}
