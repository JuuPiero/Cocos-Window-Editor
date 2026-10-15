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

// source/main.ts
var main_exports = {};
__export(main_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(main_exports);
var import_fs = require("fs"), import_path = require("path");

// source/menus.ts
var TOP_MENUS = {
  window: "i18n:menu.panel",
  panel: "i18n:menu.panel",
  extension: "i18n:menu.extension",
  extensions: "i18n:menu.extension",
  developer: "i18n:menu.develop",
  help: "i18n:menu.help"
}, DEFAULT_MENU = "i18n:menu.extension/Editor Windows";
function menuSpot(menu, title) {
  let parts = (menu || "").split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { path: DEFAULT_MENU, label: parts[0] || title };
  let label = parts.pop(), top = TOP_MENUS[parts[0].toLowerCase()];
  return top && (parts[0] = top), { path: parts.join("/"), label };
}

// source/shared.ts
var SLOTS = ["default", "window-2", "window-3", "window-4"];
function panelName(slot) {
  return slot === "default" ? "editor-window" : `editor-window.${slot}`;
}
function slotKey(slot) {
  return slot.replace(/-/g, "_");
}

// source/main.ts
var PKG = "editor-window", I18N = {
  en: { description: "Unity-style editor windows written in your project (EditorWindow + immediate-mode GUI).", open_panel: "Editor Windows" },
  zh: { description: "\u5728\u9879\u76EE\u4E2D\u7F16\u5199 Unity \u98CE\u683C\u7684\u7F16\u8F91\u5668\u7A97\u53E3\uFF08EditorWindow + \u5373\u65F6\u6A21\u5F0F GUI\uFF09\u3002", open_panel: "\u7F16\u8F91\u5668\u7A97\u53E3" }
}, windows = [], saved = { slots: {}, states: {} }, menus = [], titles = {}, saveTimer = null, stateFile = () => (0, import_path.join)(Editor.Project.path, "temp", "editor-window", "state.json");
function load_() {
  try {
    (0, import_fs.existsSync)(stateFile()) && (saved = { slots: {}, states: {}, ...JSON.parse((0, import_fs.readFileSync)(stateFile(), "utf8")) });
  } catch {
    saved = { slots: {}, states: {} };
  }
}
function save() {
  saveTimer && clearTimeout(saveTimer), saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      (0, import_fs.mkdirSync)((0, import_path.dirname)(stateFile()), { recursive: !0 }), (0, import_fs.writeFileSync)(stateFile(), JSON.stringify(saved, null, 2));
    } catch (e) {
      console.warn("[Editor Window] Could not save window state:", e);
    }
  }, 500);
}
function titleOf(id) {
  var _a;
  return ((_a = windows.find((w) => w.id === id)) == null ? void 0 : _a.title) || id.split("/").pop() || id;
}
function applyTitles() {
  let i18n = Editor.I18n.__protected__;
  if (i18n != null && i18n.register)
    for (let lang of Object.keys(I18N)) {
      let map = { ...I18N[lang] };
      SLOTS.forEach((slot, i) => {
        map[`slot_${slotKey(slot)}`] = titles[slot] || (i ? `Editor Window ${i + 1}` : "Editor Window");
      });
      try {
        i18n.register(lang, PKG, map);
      } catch {
      }
    }
}
function applyMenus() {
  let menu = Editor.Menu.__protected__;
  if (menu != null && menu.add)
    try {
      for (let m of menus) menu.remove(m.path, { label: m.label });
      menus = [];
      for (let w of windows) {
        let spot = menuSpot(w.menu, w.title);
        menu.add(spot.path, { label: spot.label, message: "open-window", target: PKG, params: [w.id] }), menus.push(spot);
      }
      menu.apply();
    } catch (e) {
      console.warn("[Editor Window] Could not add window menus:", e);
    }
}
async function isOpen(slot) {
  try {
    return await Editor.Panel.has(panelName(slot));
  } catch {
    return !1;
  }
}
async function show(slot, windowId) {
  windowId ? (saved.slots[slot] = windowId, titles[slot] = titleOf(windowId)) : (delete saved.slots[slot], delete titles[slot]), save(), applyTitles(), await Editor.Panel.open(panelName(slot)), Editor.Message.send(PKG, "slot-changed", slot);
}
var methods = {
  /** Panel menu: the window list (or the open windows). */
  async openPanel() {
    for (let slot of SLOTS)
      if (!saved.slots[slot] && await isOpen(slot)) return Editor.Panel.focus(panelName(slot));
    for (let slot of SLOTS) if (!await isOpen(slot)) return show(slot, null);
    return Editor.Panel.focus(panelName(SLOTS[0]));
  },
  /** A window's menu item: focus it, or show it in a free slot. */
  async openWindow(windowId) {
    for (let slot of SLOTS)
      if (saved.slots[slot] === windowId && await isOpen(slot)) {
        await Editor.Panel.focus(panelName(slot));
        return;
      }
    let target;
    for (let slot of SLOTS) !saved.slots[slot] && await isOpen(slot) && (target = target || slot);
    for (let slot of SLOTS) !target && !await isOpen(slot) && (target = slot);
    await show(target || SLOTS[0], windowId);
  },
  /** From the scene script: the registered windows. */
  windowsChanged(list) {
    windows = Array.isArray(list) ? list : [];
    for (let slot of Object.keys(saved.slots)) titles[slot] = titleOf(saved.slots[slot]);
    applyTitles(), applyMenus(), Editor.Message.send(PKG, "windows-updated", windows);
  },
  queryWindows() {
    return windows;
  },
  slotInfo(slot) {
    let windowId = saved.slots[slot] || null;
    return { windowId, state: windowId ? saved.states[windowId] ?? null : null, windows };
  },
  /** A panel picked a window (or null for the list). */
  assignSlot(slot, windowId) {
    return show(slot, windowId);
  },
  saveState(windowId, state) {
    windowId && (saved.states[windowId] = state, save());
  },
  /** The panel was closed: the slot is free (the window's state is kept). */
  releaseSlot(slot) {
    delete saved.slots[slot], delete titles[slot], save();
  },
  /** EditorWindow.close() */
  closeSlot(slot) {
    Editor.Panel.close(panelName(slot));
  }
};
function load() {
  load_(), applyTitles();
}
function unload() {
  var _a, _b;
  let menu = Editor.Menu.__protected__;
  try {
    for (let m of menus) (_a = menu == null ? void 0 : menu.remove) == null || _a.call(menu, m.path, { label: m.label });
    (_b = menu == null ? void 0 : menu.apply) == null || _b.call(menu);
  } catch {
  }
  menus = [];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=main.js.map
