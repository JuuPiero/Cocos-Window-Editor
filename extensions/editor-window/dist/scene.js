"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/scene.ts
var scene_exports = {};
__export(scene_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(scene_exports);
var import_path = require("path");

// source/host.ts
var NO_RUNTIME = 'No script imports the EditorWindow runtime yet. Create a window with @editorWindow (import from "db://editor-window/EditorWindow").';
function registry() {
  let r = globalThis.__editorWindowRegistry;
  return r && r.api ? r : void 0;
}
function titleOf(id, options) {
  if (options.title) return options.title;
  let parts = (options.menu || id).split("/");
  return parts[parts.length - 1];
}
var WindowHost = class {
  constructor(env) {
    this.env = env;
    this.instances = /* @__PURE__ */ new Map();
  }
  list() {
    let r = registry();
    return r ? [...r.windows.values()].map((e) => ({ id: e.id, menu: e.options.menu || "", title: titleOf(e.id, e.options) })).sort((a, b) => a.id.localeCompare(b.id)) : [];
  }
  has(slot) {
    return this.instances.has(slot);
  }
  /** Shows window `windowId` in `slot`, restoring `saved` state. */
  async open(slot, windowId, saved) {
    let r = registry();
    if (!r) return { ok: !1, error: NO_RUNTIME };
    let entry = r.windows.get(windowId);
    if (!entry) return { ok: !1, error: `There is no window "${windowId}".` };
    let cur = this.instances.get(slot);
    return cur && cur.windowId === windowId && cur.ctor === entry.ctor ? { ok: !0 } : (cur && this.close(slot), await this.create(slot, r, windowId, saved), { ok: !0 });
  }
  async create(slot, r, windowId, saved) {
    let entry = r.windows.get(windowId), win = new entry.ctor();
    win.__host = { repaint: () => this.env.repaint(slot), close: () => this.env.close(slot) };
    let gui = {};
    if (saved)
      try {
        gui = await r.api.restore(win, saved, this.env.resolver);
      } catch (e) {
        this.env.log(`[Editor Window] Could not restore ${windowId}:`, e);
      }
    let inst = { windowId, ctor: entry.ctor, win, gui, json: "" };
    return this.instances.set(slot, inst), this.call(inst, "onEnable"), inst;
  }
  call(inst, method) {
    let fn = inst.win[method];
    if (typeof fn == "function")
      try {
        fn.call(inst.win);
      } catch (e) {
        return this.env.log(`[Editor Window] ${inst.windowId}.${method}():`, e), `${method}: ${(e == null ? void 0 : e.message) || e}`;
      }
  }
  async resolveObject(e) {
    let uuid = typeof e.value == "string" ? e.value : "";
    if (!uuid) return null;
    let r = this.env.resolver;
    return e.object === "node" ? r.node(uuid) : e.object === "component" ? r.component(uuid) : r.asset(uuid);
  }
  /** Applies input and draws the window. */
  async frame(slot, events = [], context = {}) {
    let r = registry();
    if (!r) return { error: NO_RUNTIME, tree: [] };
    let inst = this.instances.get(slot);
    if (!inst) return { missing: !0 };
    let entry = r.windows.get(inst.windowId);
    if (!entry)
      return { title: titleOf(inst.windowId, {}), tree: [], error: `The window "${inst.windowId}" is no longer registered. Was its @editorWindow removed?` };
    if (entry.ctor !== inst.ctor) {
      let saved = r.api.snapshot(inst.win, inst.gui);
      this.call(inst, "onDisable"), this.instances.delete(slot), inst = await this.create(slot, r, inst.windowId, saved);
    }
    let sel = r.api.Selection;
    sel.nodes = (context.nodes || []).map((u) => this.env.resolver.node(u)).filter((n) => !!n), sel.assetUuids = [...context.assets || []];
    let input = [], errors = [];
    for (let e of events) {
      if (e.type === "selection" || e.type === "hierarchy" || e.type === "project") {
        let method = e.type === "selection" ? "onSelectionChange" : e.type === "hierarchy" ? "onHierarchyChange" : "onProjectChange", err = this.call(inst, method);
        err && errors.push(err);
        continue;
      }
      let ev = { ...e };
      ev.type === "change" && ev.object && (ev.resolved = await this.resolveObject(ev)), input.push(ev);
    }
    let gui = new r.api.GUI(input, inst.gui), error = this.draw(inst, gui);
    gui.used && (gui = new r.api.GUI([], inst.gui), error = this.draw(inst, gui)), error && errors.push(error);
    let state;
    try {
      let snap = r.api.snapshot(inst.win, inst.gui), json = JSON.stringify(snap);
      json !== inst.json && (inst.json = json, state = snap);
    } catch (e) {
      this.env.log("[Editor Window] Could not save the window state:", e);
    }
    return {
      title: inst.win.title || titleOf(entry.id, entry.options),
      tree: gui.root,
      error: errors.length ? errors.join(`
`) : void 0,
      state,
      autoRepaint: entry.options.autoRepaint
    };
  }
  draw(inst, gui) {
    try {
      inst.win.onGUI(gui);
    } catch (e) {
      return this.env.log(`[Editor Window] ${inst.windowId}.onGUI():`, e), `onGUI: ${(e == null ? void 0 : e.message) || e}`;
    }
  }
  /** Closes the window in `slot`; returns its state to keep. */
  close(slot) {
    var _a;
    let inst = this.instances.get(slot);
    if (!inst) return null;
    let saved = null;
    try {
      saved = ((_a = registry()) == null ? void 0 : _a.api.snapshot(inst.win, inst.gui)) ?? null;
    } catch {
      saved = null;
    }
    return this.call(inst, "onDisable"), this.instances.delete(slot), saved;
  }
};

// source/scene.ts
module.paths.push((0, import_path.join)(Editor.App.path, "node_modules"));
function cc() {
  return require("cc");
}
function findNode(root, uuid) {
  if (!root) return null;
  if (root.uuid === uuid) return root;
  for (let child of root.children) {
    let found = findNode(child, uuid);
    if (found) return found;
  }
  return null;
}
function findComponent(root, uuid) {
  if (!root) return null;
  for (let comp of root.components || []) if (comp.uuid === uuid) return comp;
  for (let child of root.children) {
    let found = findComponent(child, uuid);
    if (found) return found;
  }
  return null;
}
var host = new WindowHost({
  resolver: {
    node: (uuid) => findNode(cc().director.getScene(), uuid),
    component: (uuid) => findComponent(cc().director.getScene(), uuid),
    asset: (uuid) => new Promise((resolve) => {
      cc().assetManager.loadAny(uuid, (err, asset) => resolve(err ? null : asset));
    })
  },
  repaint: (slot) => Editor.Message.broadcast("editor-window:repaint", slot),
  close: (slot) => Editor.Message.send("editor-window", "close-slot", slot),
  log: (...args) => console.error(...args)
}), watchTimer = null, lastVersion = -1;
function watchWindows() {
  let r = globalThis.__editorWindowRegistry, version = (r == null ? void 0 : r.version) ?? 0;
  version !== lastVersion && (lastVersion = version, Editor.Message.send("editor-window", "windows-changed", host.list()));
}
var methods = {
  ewList() {
    return host.list();
  },
  ewOpen(slot, windowId, saved) {
    return host.open(slot, windowId, saved);
  },
  ewFrame(slot, events, context) {
    return host.frame(slot, events, context);
  },
  ewClose(slot) {
    return host.close(slot);
  },
  ewHas(slot) {
    return host.has(slot);
  },
  ewRuntime() {
    return !!registry();
  }
};
function load() {
  globalThis.isPreviewProcess || (watchTimer = setInterval(watchWindows, 1e3));
}
function unload() {
  watchTimer && clearInterval(watchTimer), watchTimer = null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=scene.js.map
