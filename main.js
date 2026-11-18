/* nan-spotlight - author: @nan - GPL v3 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NanSpotlightPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/search.ts
var import_obsidian = require("obsidian");
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function compilePattern(query, options, globalFlag) {
  try {
    let source = options.regex ? query : escapeRegex(query);
    if (options.wholeWord) {
      source = `\\b(?:${source})\\b`;
    }
    const flags = options.caseSensitive ? globalFlag ? "g" : "" : globalFlag ? "gi" : "i";
    return new RegExp(source, flags);
  } catch (e) {
    return null;
  }
}
function tokenizeQuery(query) {
  var _a;
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while (m = re.exec(query)) {
    tokens.push((_a = m[1]) != null ? _a : m[2]);
  }
  return tokens;
}
var OPERATOR_ALIASES = {
  file: "file",
  name: "file",
  \u6587\u4EF6: "file",
  \u540D\u79F0: "file",
  \u6587\u4EF6\u540D: "file",
  path: "path",
  \u8DEF\u5F84: "path",
  tag: "tag",
  \u6807\u7B7E: "tag",
  line: "line",
  \u884C: "line",
  section: "section",
  \u7AE0\u8282: "section",
  \u5C0F\u8282: "section",
  \u6807\u9898: "section",
  block: "block",
  \u5757: "block",
  \u6BB5\u843D: "block",
  folder: "folder",
  \u6587\u4EF6\u5939: "folder",
  other: "other",
  \u5176\u4ED6: "other"
};
function parseQuery(query) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const parsed = {
    content: "",
    fileFilter: null,
    pathFilter: null,
    tagFilter: null,
    lineFilter: null,
    sectionFilter: null,
    blockFilter: null,
    folderFilter: null,
    otherFilter: null
  };
  let content = query;
  const opRe = /([A-Za-z\u4e00-\u9fa5]+):(?:"([^"]*)"|(\S+))/g;
  const ops = {};
  let m;
  while (m = opRe.exec(query)) {
    const canonical = OPERATOR_ALIASES[m[1]];
    if (!canonical)
      continue;
    const val = (_a = m[2]) != null ? _a : m[3];
    ops[canonical] = val;
    content = content.replace(m[0], " ");
  }
  parsed.content = content.trim();
  parsed.fileFilter = (_b = ops["file"]) != null ? _b : null;
  parsed.pathFilter = (_c = ops["path"]) != null ? _c : null;
  parsed.tagFilter = (_d = ops["tag"]) != null ? _d : null;
  parsed.lineFilter = (_e = ops["line"]) != null ? _e : null;
  parsed.sectionFilter = (_f = ops["section"]) != null ? _f : null;
  parsed.blockFilter = (_g = ops["block"]) != null ? _g : null;
  parsed.folderFilter = (_h = ops["folder"]) != null ? _h : null;
  parsed.otherFilter = (_i = ops["other"]) != null ? _i : null;
  return parsed;
}
function collectRanges(line, patterns) {
  const ranges = [];
  for (const p of patterns) {
    p.lastIndex = 0;
    let m;
    while (m = p.exec(line)) {
      if (m[0].length === 0) {
        p.lastIndex++;
        continue;
      }
      ranges.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === p.lastIndex)
        p.lastIndex++;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}
function computeSectionEligible(lines, pattern) {
  const eligible = new Array(lines.length).fill(false);
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m)
      headings.push({ level: m[1].length, start: i });
  }
  for (let h = 0; h < headings.length; h++) {
    const { level, start } = headings[h];
    const text = lines[start].replace(/^#{1,6}\s+/, "");
    if (pattern.test(text)) {
      const next = headings.find((hh, idx) => idx > h && hh.level <= level);
      const end = next ? next.start : lines.length;
      for (let i = start; i < end; i++)
        eligible[i] = true;
    }
  }
  return eligible;
}
function computeBlockEligible(lines, pattern) {
  const eligible = new Array(lines.length).fill(false);
  let start = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || lines[i].trim() === "") {
      if (i > start) {
        const blockText = lines.slice(start, i).join("\n");
        if (pattern.test(blockText)) {
          for (let j = start; j < i; j++)
            eligible[j] = true;
        }
      }
      start = i + 1;
    }
  }
  return eligible;
}
async function searchFile(app, file, parsed, options) {
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");
  const matches = [];
  const contentTokens = tokenizeQuery(parsed.content);
  const contentPatterns = contentTokens.map((t) => compilePattern(t, options, true)).filter((p) => p !== null);
  let linePattern = null;
  if (parsed.lineFilter) {
    linePattern = compilePattern(parsed.lineFilter, options, false);
    if (!linePattern)
      return [];
  }
  let sectionPattern = null;
  if (parsed.sectionFilter) {
    sectionPattern = compilePattern(parsed.sectionFilter, options, false);
    if (!sectionPattern)
      return [];
  }
  let blockPattern = null;
  if (parsed.blockFilter) {
    blockPattern = compilePattern(parsed.blockFilter, options, false);
    if (!blockPattern)
      return [];
  }
  const sectionEligible = sectionPattern ? computeSectionEligible(lines, sectionPattern) : null;
  const blockEligible = blockPattern ? computeBlockEligible(lines, blockPattern) : null;
  const hasLineSearch = contentPatterns.length > 0 || linePattern !== null;
  for (let i = 0; i < lines.length; i++) {
    if (sectionEligible && !sectionEligible[i])
      continue;
    if (blockEligible && !blockEligible[i])
      continue;
    const line = lines[i];
    if (!hasLineSearch)
      continue;
    if (linePattern && !linePattern.test(line))
      continue;
    if (contentPatterns.length > 0) {
      const allMatch = contentPatterns.every((p) => {
        p.lastIndex = 0;
        return p.test(line);
      });
      if (!allMatch)
        continue;
      matches.push({ line: i + 1, content: line, ranges: collectRanges(line, contentPatterns) });
    } else {
      matches.push({ line: i + 1, content: line, ranges: [] });
    }
  }
  if (!hasLineSearch) {
    const anyEligible = lines.some(
      (_, i) => (sectionEligible ? sectionEligible[i] : true) && (blockEligible ? blockEligible[i] : true)
    );
    if (anyEligible)
      return [{ line: 0, content: "", ranges: [] }];
    return [];
  }
  return matches;
}
function isHiddenPath(path) {
  const segments = path.split("/");
  return segments.some((s) => s === ".obsidian" || s === ".trash" || s === ".git");
}
function searchOtherFiles(app, otherQuery, options) {
  const files = app.vault.getFiles().filter((f) => !isHiddenPath(f.path) && f.extension.toLowerCase() !== "md");
  const q = options.caseSensitive ? otherQuery : otherQuery.toLowerCase();
  const results = [];
  for (const file of files) {
    const fullName = options.caseSensitive ? file.name : file.name.toLowerCase();
    const base = options.caseSensitive ? file.basename : file.basename.toLowerCase();
    if (fullName.includes(q) || base.includes(q)) {
      results.push({ file, folder: null, matches: [] });
    }
  }
  return results;
}
function searchFolders(app, folderQuery, options) {
  const folders = app.vault.getAllLoadedFiles().filter((f) => f instanceof import_obsidian.TFolder).filter((f) => !isHiddenPath(f.path));
  const q = options.caseSensitive ? folderQuery : folderQuery.toLowerCase();
  const results = [];
  for (const folder of folders) {
    const name = options.caseSensitive ? folder.name : folder.name.toLowerCase();
    const path = options.caseSensitive ? folder.path : folder.path.toLowerCase();
    if (name.includes(q) || path.includes(q)) {
      results.push({ file: null, folder, matches: [] });
    }
  }
  results.sort((a, b) => a.folder.path.length - b.folder.path.length);
  return results;
}
async function searchVault(app, query, options) {
  var _a;
  const parsed = parseQuery(query);
  if (parsed.folderFilter) {
    return searchFolders(app, parsed.folderFilter, options);
  }
  if (parsed.otherFilter) {
    return searchOtherFiles(app, parsed.otherFilter, options);
  }
  const files = app.vault.getFiles().filter((f) => !isHiddenPath(f.path));
  const results = [];
  const maxFiles = 500;
  const hasLineSearch = parsed.content !== "" || parsed.lineFilter !== null;
  const hasScopeFilter = parsed.sectionFilter !== null || parsed.blockFilter !== null;
  for (const file of files) {
    const isMarkdown = file.extension.toLowerCase() === "md";
    if (parsed.fileFilter && !file.basename.toLowerCase().includes(parsed.fileFilter.toLowerCase())) {
      continue;
    }
    if (parsed.pathFilter && !file.path.toLowerCase().includes(parsed.pathFilter.toLowerCase())) {
      continue;
    }
    if (parsed.tagFilter) {
      if (!isMarkdown)
        continue;
      const cache = app.metadataCache.getFileCache(file);
      const tags = cache ? (_a = (0, import_obsidian.getAllTags)(cache)) != null ? _a : [] : [];
      const tag = parsed.tagFilter.startsWith("#") ? parsed.tagFilter : "#" + parsed.tagFilter;
      if (!tags.some((t) => t === tag || t.startsWith(tag + "/")))
        continue;
    }
    if (hasLineSearch || hasScopeFilter) {
      if (!isMarkdown)
        continue;
      const matches = await searchFile(app, file, parsed, options);
      if (matches.length)
        results.push({ file, folder: null, matches });
    } else {
      results.push({ file, folder: null, matches: [] });
    }
    if (results.length >= maxFiles)
      break;
  }
  return results;
}

// src/fileBrowser.ts
var import_obsidian2 = require("obsidian");
var FileBrowser = class {
  constructor(app, containerEl, onOpenFile) {
    this.selectedEl = null;
    this.selectedEntry = null;
    /** 刷新令牌：并发 refresh 时只渲染最后一次结果，避免不同层级条目混在一起 */
    this.refreshToken = 0;
    /** 路径或视图模式变化后触发，用于刷新面包屑等头部 */
    this.onNavigate = null;
    /** 视图模式变化后触发，用于持久化到设置 */
    this.onViewModeChange = null;
    /** 在指定目录新建笔记 */
    this.onNewNote = null;
    /** 在指定目录新建文件夹 */
    this.onNewFolder = null;
    /** 判断某路径是否已收藏 */
    this.isFavorite = null;
    /** 切换某路径的收藏状态 */
    this.toggleFavorite = null;
    this.app = app;
    this.onOpenFile = onOpenFile;
    this.currentPath = "";
    this.viewMode = "list";
    this.listEl = containerEl.createDiv({ cls: "nan-spotlight-files-body" });
    this.listEl.addEventListener("contextmenu", (evt) => {
      const target = evt.target;
      if (target.closest(".nan-spotlight-file-item"))
        return;
      this.onBackgroundContextMenu(evt);
    });
  }
  getPath() {
    return this.currentPath;
  }
  getViewMode() {
    return this.viewMode;
  }
  setViewMode(mode) {
    var _a, _b;
    this.viewMode = mode;
    this.refresh();
    (_a = this.onNavigate) == null ? void 0 : _a.call(this);
    (_b = this.onViewModeChange) == null ? void 0 : _b.call(this, mode);
  }
  /** 仅设置初始视图模式，不触发刷新与回调（用于首次构建） */
  setInitialViewMode(mode) {
    this.viewMode = mode;
  }
  goHome() {
    this.setPath("");
  }
  goUp() {
    if (!this.currentPath)
      return;
    const parts = this.currentPath.split("/");
    parts.pop();
    this.setPath(parts.join("/"));
  }
  setPath(path) {
    var _a;
    this.currentPath = (0, import_obsidian2.normalizePath)(path);
    this.refresh();
    (_a = this.onNavigate) == null ? void 0 : _a.call(this);
  }
  async refresh() {
    const token = ++this.refreshToken;
    this.selectedEl = null;
    this.selectedEntry = null;
    this.listEl.empty();
    this.listEl.toggleClass("nan-spotlight-grid", this.viewMode === "grid");
    this.listEl.toggleClass("nan-spotlight-list", this.viewMode === "list");
    const entries = await this.loadEntries(this.currentPath);
    if (token !== this.refreshToken)
      return;
    if (entries.length === 0) {
      const empty = this.listEl.createDiv({ cls: "nan-spotlight-empty" });
      empty.setText("\u6B64\u6587\u4EF6\u5939\u4E3A\u7A7A");
      return;
    }
    for (const entry of entries) {
      this.renderEntry(entry);
    }
  }
  async loadEntries(path) {
    const listPath = path === "" ? "/" : path;
    let list;
    try {
      list = await this.app.vault.adapter.list(listPath);
    } catch (e) {
      return [];
    }
    const prefix = path === "" ? "" : `${path}/`;
    const baseName = (s) => {
      var _a;
      return (_a = s.replace(/\/+$/, "").split("/").pop()) != null ? _a : s;
    };
    const folders = list.folders.filter((f) => !this.isHidden(f)).map((f) => {
      const name = baseName(f);
      return { name, path: `${prefix}${name}`, type: "folder" };
    });
    const files = list.files.filter((f) => !this.isHidden(f)).map((f) => {
      const name = baseName(f);
      return { name, path: `${prefix}${name}`, type: "file" };
    });
    const byName = (a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base", numeric: true });
    folders.sort(byName);
    files.sort(byName);
    return [...folders, ...files];
  }
  isHidden(name) {
    var _a;
    const base = (_a = name.replace(/\/$/, "").split("/").pop()) != null ? _a : "";
    if (base === ".obsidian" || base === ".trash" || base === ".git")
      return true;
    return false;
  }
  renderEntry(entry) {
    const el = this.listEl.createDiv({ cls: "nan-spotlight-file-item" });
    const icon = el.createDiv({ cls: "nan-spotlight-file-icon" });
    if (entry.type === "folder") {
      (0, import_obsidian2.setIcon)(icon, "folder");
    } else {
      (0, import_obsidian2.setIcon)(icon, this.iconForFile(entry.name));
    }
    const nameEl = el.createDiv({ cls: "nan-spotlight-file-name" });
    nameEl.setText(entry.name);
    nameEl.setAttribute("title", entry.path);
    el.addEventListener("click", () => this.selectEntry(el, entry));
    el.addEventListener("dblclick", () => this.onDoubleClick(entry));
    el.addEventListener("contextmenu", (evt) => this.onContextMenu(entry, evt));
  }
  iconForFile(name) {
    var _a, _b;
    const ext = (_b = (_a = name.split(".").pop()) == null ? void 0 : _a.toLowerCase()) != null ? _b : "";
    if (ext === "md" || ext === "markdown")
      return "file-text";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext))
      return "image";
    if (["pdf", "txt", "doc", "docx", "mp3", "wav", "ogg", "flac", "m4a", "mp4", "mov", "mkv", "webm", "avi"].includes(ext))
      return "file-text";
    return "file";
  }
  selectEntry(el, entry) {
    if (this.selectedEl === el)
      return;
    if (this.selectedEl)
      this.selectedEl.classList.remove("is-selected");
    this.selectedEl = el;
    this.selectedEntry = entry;
    el.classList.add("is-selected");
  }
  onDoubleClick(entry) {
    if (entry.type === "folder") {
      this.setPath(entry.path);
      return;
    }
    const abstract = this.app.vault.getAbstractFileByPath(entry.path);
    if (abstract instanceof import_obsidian2.TFile) {
      this.onOpenFile(abstract);
    }
  }
  /** 移动到回收站（与原生“删除”一致） */
  async trashFile(abstract) {
    if (typeof this.app.fileManager.trashFile === "function") {
      await this.app.fileManager.trashFile(abstract);
    } else {
      await this.app.vault.trash(abstract, true);
    }
  }
  /** 删除当前选中的文件/文件夹（Delete 键） */
  deleteSelected() {
    const entry = this.selectedEntry;
    if (!entry)
      return;
    const abstract = this.app.vault.getAbstractFileByPath(entry.path);
    if (!abstract)
      return;
    void this.trashFile(abstract).then(() => void this.refresh()).catch((e) => new import_obsidian2.Notice(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`));
  }
  deleteEntry(abstract) {
    void this.trashFile(abstract).then(() => void this.refresh()).catch((e) => new import_obsidian2.Notice(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`));
  }
  /** 行内重命名：直接把文件名变为输入框，无需额外界面 */
  startRename(el, abstract) {
    const nameEl = el.querySelector(".nan-spotlight-file-name");
    if (!nameEl)
      return;
    const fullName = abstract.name;
    const dot = fullName.lastIndexOf(".");
    const baseName = dot > 0 ? fullName.slice(0, dot) : fullName;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "nan-spotlight-rename-input";
    input.value = fullName;
    input.setAttribute("spellcheck", "false");
    nameEl.replaceWith(input);
    let finished = false;
    const finish = (commit) => {
      if (finished)
        return;
      finished = true;
      const newName = commit ? input.value.trim() : fullName;
      void this.applyRename(abstract, newName, fullName);
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        evt.stopPropagation();
        finish(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        evt.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    setTimeout(() => {
      if (!input.isConnected)
        return;
      input.focus();
      input.setSelectionRange(0, baseName.length);
    }, 0);
  }
  async applyRename(abstract, newName, oldName) {
    if (newName && newName !== oldName) {
      const parent = abstract.parent ? abstract.parent.path : "";
      const newPath = parent ? `${parent}/${newName}` : newName;
      try {
        await this.app.fileManager.renameFile(abstract, newPath);
      } catch (e) {
        new import_obsidian2.Notice(`\u91CD\u547D\u540D\u5931\u8D25\uFF1A${e.message}`);
      }
    }
    await this.refresh();
  }
  onContextMenu(entry, evt) {
    var _a, _b;
    evt.preventDefault();
    evt.stopPropagation();
    const targetEl = evt.currentTarget;
    if (targetEl)
      this.selectEntry(targetEl, entry);
    const abstract = this.app.vault.getAbstractFileByPath(entry.path);
    if (!abstract)
      return;
    const menu = new import_obsidian2.Menu();
    if (abstract instanceof import_obsidian2.TFolder) {
      menu.addItem(
        (item) => item.setTitle("\u65B0\u5EFA\u7B14\u8BB0").setIcon("create-new").onClick(() => {
          var _a2;
          return (_a2 = this.onNewNote) == null ? void 0 : _a2.call(this, entry.path);
        })
      );
      menu.addItem(
        (item) => item.setTitle("\u65B0\u5EFA\u6587\u4EF6\u5939").setIcon("folder").onClick(() => {
          var _a2;
          return (_a2 = this.onNewFolder) == null ? void 0 : _a2.call(this, entry.path);
        })
      );
      menu.addSeparator();
    }
    this.app.workspace.trigger(
      "file-menu",
      menu,
      abstract,
      "file-explorer-context-menu",
      this.app.workspace.getLeaf(false)
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u91CD\u547D\u540D").setIcon("pencil").onClick(() => this.startRename(targetEl, abstract))
    );
    menu.addItem(
      (item) => item.setTitle("\u5220\u9664").setIcon("trash").setWarning(true).onClick(() => this.deleteEntry(abstract))
    );
    menu.addSeparator();
    const fav = (_b = (_a = this.isFavorite) == null ? void 0 : _a.call(this, entry.path)) != null ? _b : false;
    menu.addItem(
      (item) => item.setTitle(fav ? "\u4ECE\u6536\u85CF\u5939\u79FB\u9664" : "\u6536\u85CF\u5230\u6536\u85CF\u5939").setIcon("star").onClick(() => {
        var _a2;
        return (_a2 = this.toggleFavorite) == null ? void 0 : _a2.call(this, entry.path);
      })
    );
    menu.showAtMouseEvent(evt);
  }
  onBackgroundContextMenu(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new import_obsidian2.Menu();
    menu.addItem(
      (item) => item.setTitle("\u65B0\u5EFA\u7B14\u8BB0").setIcon("create-new").onClick(() => {
        var _a;
        return (_a = this.onNewNote) == null ? void 0 : _a.call(this, this.currentPath);
      })
    );
    menu.addItem(
      (item) => item.setTitle("\u65B0\u5EFA\u6587\u4EF6\u5939").setIcon("folder").onClick(() => {
        var _a;
        return (_a = this.onNewFolder) == null ? void 0 : _a.call(this, this.currentPath);
      })
    );
    menu.showAtMouseEvent(evt);
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  hotkey: "Ctrl+Space",
  favoritesHotkey: "Ctrl+Shift+Space",
  defaultViewMode: "list",
  blurAmount: 24,
  favorites: [],
  openInNewTab: true
};
function eventMatchesHotkey(evt, hotkey) {
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0)
    return false;
  const key = parts.pop();
  const mods = new Set(parts);
  const ctrl = mods.has("ctrl") || mods.has("control");
  const meta = mods.has("meta") || mods.has("cmd") || mods.has("command") || mods.has("win") || mods.has("super");
  const alt = mods.has("alt") || mods.has("option");
  const shift = mods.has("shift");
  const mod = mods.has("mod");
  const needCtrl = ctrl || mod && !import_obsidian3.Platform.isMacOS;
  const needMeta = meta || mod && import_obsidian3.Platform.isMacOS;
  if (evt.ctrlKey !== needCtrl)
    return false;
  if (evt.metaKey !== needMeta)
    return false;
  if (evt.altKey !== alt)
    return false;
  if (evt.shiftKey !== shift)
    return false;
  return keyMatches(evt, key);
}
function keyMatches(evt, key) {
  const k = key.toLowerCase();
  const map = {
    space: [" ", "spacebar"],
    enter: ["enter"],
    return: ["enter"],
    escape: ["escape"],
    esc: ["escape"],
    tab: ["tab"],
    backspace: ["backspace"],
    delete: ["delete"],
    up: ["arrowup"],
    down: ["arrowdown"],
    left: ["arrowleft"],
    right: ["arrowright"],
    home: ["home"],
    end: ["end"],
    pageup: ["pageup"],
    pagedown: ["pagedown"]
  };
  if (map[k])
    return map[k].includes(evt.key.toLowerCase());
  if (/^f([1-9]|1[0-2])$/.test(k)) {
    return evt.key.toLowerCase() === k;
  }
  if (k.length === 1) {
    return evt.key.toLowerCase() === k || evt.code.toLowerCase() === `key${k}`;
  }
  return false;
}
function buildHotkeyString(evt) {
  const parts = [];
  if (evt.ctrlKey)
    parts.push("Ctrl");
  if (evt.metaKey)
    parts.push(import_obsidian3.Platform.isMacOS ? "Cmd" : "Meta");
  if (evt.altKey)
    parts.push("Alt");
  if (evt.shiftKey)
    parts.push("Shift");
  let key = evt.key;
  if (key === " ")
    key = "Space";
  else if (key === "Escape")
    key = "Escape";
  else if (key === "Enter")
    key = "Enter";
  else if (key === "ArrowUp")
    key = "Up";
  else if (key === "ArrowDown")
    key = "Down";
  else if (key === "ArrowLeft")
    key = "Left";
  else if (key === "ArrowRight")
    key = "Right";
  else if (key === "Backspace")
    key = "Backspace";
  else if (key === "Tab")
    key = "Tab";
  else if (key.length === 1)
    key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}
var SpotlightView = class {
  constructor(app, plugin) {
    this.searchOptions = {
      caseSensitive: false,
      wholeWord: false,
      regex: false
    };
    this.debounceTimer = null;
    this.lastQuery = "";
    this.closed = false;
    this.documentKeydownHandler = null;
    this.app = app;
    this.plugin = plugin;
  }
  open(initialPath) {
    this.buildDom();
    document.body.appendChild(this.overlayEl);
    requestAnimationFrame(() => {
      this.overlayEl.classList.add("is-open");
      this.panelEl.classList.add("is-open");
    });
    if (initialPath)
      this.fileBrowser.setPath(initialPath);
    else
      void this.fileBrowser.refresh();
    this.updateViewState();
  }
  /** 已在打开状态时，跳转到指定目录并清空搜索 */
  navigateTo(path) {
    this.fileBrowser.setPath(path);
    this.inputEl.value = "";
    this.lastQuery = "";
    this.searchResultsEl.empty();
    this.updateViewState();
  }
  close() {
    if (this.closed)
      return;
    this.closed = true;
    if (this.documentKeydownHandler) {
      document.removeEventListener("keydown", this.documentKeydownHandler);
      this.documentKeydownHandler = null;
    }
    this.overlayEl.classList.remove("is-open");
    this.panelEl.classList.remove("is-open");
    const overlay = this.overlayEl;
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    window.setTimeout(() => {
      if (overlay.parentElement)
        overlay.remove();
    }, 420);
    this.plugin.onSpotlightClosed();
  }
  buildDom() {
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "nan-spotlight-overlay";
    this.overlayEl.style.setProperty("--nan-blur", `${this.plugin.settings.blurAmount}px`);
    this.panelEl = document.createElement("div");
    this.panelEl.className = "nan-spotlight-panel";
    this.overlayEl.appendChild(this.panelEl);
    this.buildSearchSection();
    this.buildFileSection();
    this.inputEl.addEventListener("input", () => this.onInput());
    this.inputEl.addEventListener("focus", () => this.updateViewState());
    this.inputEl.addEventListener("blur", () => window.setTimeout(() => this.updateViewState(), 0));
    this.inputEl.addEventListener("keydown", (evt) => this.onInputKeydown(evt));
    this.overlayEl.addEventListener("mousedown", (evt) => {
      if (evt.target === this.overlayEl)
        this.close();
    });
    this.documentKeydownHandler = (evt) => this.onDocumentKeydown(evt);
    document.addEventListener("keydown", this.documentKeydownHandler);
    this.updateViewState();
  }
  buildSearchSection() {
    const searchSection = this.panelEl.createDiv({ cls: "nan-spotlight-search" });
    const inputRow = searchSection.createDiv({ cls: "nan-spotlight-input-row" });
    const searchIcon = inputRow.createDiv({ cls: "nan-spotlight-search-icon" });
    (0, import_obsidian3.setIcon)(searchIcon, "search");
    this.inputEl = inputRow.createEl("input", {
      cls: "nan-spotlight-input",
      type: "text",
      attr: { spellcheck: "false", autocomplete: "off", autocapitalize: "off" }
    });
    this.inputEl.placeholder = "\u641C\u7D22\u4F60\u7684\u7B14\u8BB0\u2026";
    const closeBtn = inputRow.createDiv({ cls: "nan-spotlight-btn" });
    (0, import_obsidian3.setIcon)(closeBtn, "x");
    closeBtn.setAttribute("aria-label", "\u5173\u95ED");
    closeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.close();
    });
    this.optionsRowEl = searchSection.createDiv({ cls: "nan-spotlight-options" });
    this.buildOptionToggle(this.optionsRowEl, "Aa", "\u5339\u914D\u5927\u5C0F\u5199", "caseSensitive");
    this.buildOptionToggle(this.optionsRowEl, "ab", "\u5168\u8BCD\u5339\u914D", "wholeWord");
    this.buildOptionToggle(this.optionsRowEl, ".*", "\u6B63\u5219\u8868\u8FBE\u5F0F", "regex");
    this.helpEl = searchSection.createDiv({ cls: "nan-spotlight-help" });
    this.renderHelp();
    this.searchResultsEl = searchSection.createDiv({ cls: "nan-spotlight-results" });
  }
  buildFileSection() {
    this.fileSectionEl = this.panelEl.createDiv({ cls: "nan-spotlight-files" });
    this.fileHeaderEl = this.fileSectionEl.createDiv({ cls: "nan-spotlight-files-header" });
    const fileBody = this.fileSectionEl.createDiv({ cls: "nan-spotlight-files-body-wrap" });
    this.fileBrowser = new FileBrowser(this.app, fileBody, (file) => {
      this.plugin.openFileInLeaf(file);
      this.close();
    });
    this.fileBrowser.onNavigate = () => this.renderFileHeader();
    this.fileBrowser.onViewModeChange = (mode) => {
      this.plugin.settings.defaultViewMode = mode;
      void this.plugin.saveSettings();
    };
    this.fileBrowser.onNewNote = (dir) => void this.createNoteAt(dir);
    this.fileBrowser.onNewFolder = (dir) => void this.createFolderAt(dir);
    this.fileBrowser.isFavorite = (path) => this.plugin.settings.favorites.includes(path);
    this.fileBrowser.toggleFavorite = (path) => this.plugin.toggleFavorite(path);
    this.fileBrowser.setInitialViewMode(this.plugin.settings.defaultViewMode);
    this.renderFileHeader();
  }
  buildOptionToggle(parent, label, title, key) {
    const btn = parent.createEl("button", {
      cls: "nan-spotlight-opt",
      attr: { title },
      type: "button"
    });
    btn.setText(label);
    const active = this.searchOptions[key];
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("is-active", active);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const next = !this.searchOptions[key];
      this.searchOptions[key] = next;
      btn.setAttribute("aria-pressed", String(next));
      btn.classList.toggle("is-active", next);
      this.rerun();
    });
  }
  renderHelp() {
    this.helpEl.empty();
    const title = this.helpEl.createDiv({ cls: "nan-spotlight-help-title" });
    title.setText("\u641C\u7D22\u5E2E\u52A9");
    const items = [
      "\u76F4\u63A5\u8F93\u5165\u5173\u952E\u8BCD\u8FDB\u884C\u5168\u6587\u641C\u7D22",
      "\u6587\u4EF6\u5939:\u540D\u79F0\uFF08folder:\uFF09\u2014\u2014 \u641C\u7D22\u6587\u4EF6\u5939",
      "\u5176\u4ED6:\u6587\u4EF6\u540D\uFF08other:\uFF09\u2014\u2014 \u641C\u7D22 PDF \u7B49\u683C\u5F0F\u6587\u4EF6",
      "\u540D\u79F0:\u6587\u4EF6\u540D\uFF08file:\uFF09\u2014\u2014 \u6309\u6587\u4EF6\u540D\u641C\u7D22",
      "\u8DEF\u5F84:\u8DEF\u5F84\uFF08path:\uFF09\u2014\u2014 \u6309\u8DEF\u5F84\u8FC7\u6EE4",
      "\u6807\u7B7E:#\u6807\u7B7E\uFF08tag:\uFF09\u2014\u2014 \u6309\u6807\u7B7E\u8FC7\u6EE4",
      "\u884C:\u5185\u5BB9\uFF08line:\uFF09\u2014\u2014 \u5339\u914D\u6574\u884C\u5185\u5BB9",
      "\u7AE0\u8282:\u6807\u9898\uFF08section:\uFF09\u2014\u2014 \u5339\u914D\u67D0\u4E2A\u5C0F\u8282",
      "\u5757:\u5185\u5BB9\uFF08block:\uFF09\u2014\u2014 \u5339\u914D\u67D0\u4E2A\u6BB5\u843D\u5757",
      '"\u591A\u4E2A \u8BCD" \u2014\u2014 \u77ED\u8BED\u7CBE\u786E\u5339\u914D'
    ];
    const ul = this.helpEl.createEl("ul", { cls: "nan-spotlight-help-list" });
    for (const it of items) {
      ul.createEl("li", { text: it });
    }
  }
  onInput() {
    this.updateViewState();
    const query = this.inputEl.value;
    if (this.debounceTimer)
      window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => void this.runSearch(query), 150);
  }
  onInputKeydown(evt) {
    if (evt.key === "Escape") {
      evt.preventDefault();
      this.close();
    }
  }
  onDocumentKeydown(evt) {
    if (evt.key !== "Delete")
      return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    this.fileBrowser.deleteSelected();
  }
  rerun() {
    void this.runSearch(this.inputEl.value);
  }
  /**
   * 统一管理搜索区与文件区的显隐：
   * - 未聚焦：隐藏选项与帮助，给文件区留出更多空间
   * - 聚焦且无输入：显示选项与搜索帮助
   * - 有输入：隐藏文件区，仅显示搜索结果
   */
  updateViewState() {
    const hasQuery = this.inputEl.value.trim() !== "";
    const focused = document.activeElement === this.inputEl;
    this.optionsRowEl.style.display = focused ? "flex" : "none";
    this.helpEl.style.display = focused && !hasQuery ? "block" : "none";
    this.fileSectionEl.style.display = hasQuery ? "none" : "";
  }
  async runSearch(query) {
    const trimmed = query.trim();
    this.lastQuery = trimmed;
    if (trimmed === "") {
      this.searchResultsEl.empty();
      return;
    }
    this.searchResultsEl.empty();
    const loading = this.searchResultsEl.createDiv({ cls: "nan-spotlight-loading" });
    loading.setText("\u641C\u7D22\u4E2D\u2026");
    const results = await searchVault(this.app, trimmed, this.searchOptions);
    if (this.lastQuery !== trimmed)
      return;
    this.searchResultsEl.empty();
    if (results.length === 0) {
      const none = this.searchResultsEl.createDiv({ cls: "nan-spotlight-empty" });
      none.setText("\u672A\u627E\u5230\u5339\u914D\u7ED3\u679C");
      return;
    }
    this.renderResults(results);
  }
  openFile(file, openState) {
    this.plugin.openFileInLeaf(file, openState);
  }
  renderResults(results) {
    for (const r of results) {
      if (r.folder) {
        this.renderFolderResult(r.folder);
        continue;
      }
      const file = r.file;
      if (!file)
        continue;
      this.renderFileResult(file, r.matches);
    }
  }
  /** 渲染文件夹搜索结果：点击后直接在聚焦页打开该文件夹 */
  renderFolderResult(folder) {
    const block = this.searchResultsEl.createDiv({ cls: "nan-spotlight-result-file" });
    const head = block.createDiv({ cls: "nan-spotlight-result-file-head" });
    const icon = head.createDiv({ cls: "nan-spotlight-file-icon" });
    (0, import_obsidian3.setIcon)(icon, "folder");
    const nameEl = head.createDiv({ cls: "nan-spotlight-result-file-name" });
    nameEl.setText(folder.name);
    const pathEl = head.createDiv({ cls: "nan-spotlight-result-file-path" });
    pathEl.setText(folder.path);
    head.addEventListener("click", () => {
      this.navigateTo(folder.path);
    });
  }
  renderFileResult(file, matches) {
    const fileBlock = this.searchResultsEl.createDiv({ cls: "nan-spotlight-result-file" });
    const head = fileBlock.createDiv({ cls: "nan-spotlight-result-file-head" });
    const nameEl = head.createDiv({ cls: "nan-spotlight-result-file-name" });
    nameEl.setText(file.basename);
    const pathEl = head.createDiv({ cls: "nan-spotlight-result-file-path" });
    pathEl.setText(file.path);
    head.addEventListener("click", () => {
      this.openFile(file);
      this.close();
    });
    if (matches.length === 0) {
      const hint = fileBlock.createDiv({ cls: "nan-spotlight-result-no-line" });
      hint.setText("\u5339\u914D\u8BE5\u6587\u4EF6\uFF08\u65E0\u6B63\u6587\u9884\u89C8\uFF09");
      return;
    }
    for (const m of matches.slice(0, 20)) {
      const lineEl = fileBlock.createDiv({ cls: "nan-spotlight-result-line" });
      lineEl.addEventListener("click", () => {
        this.openFile(file, m.line > 0 ? { eState: { line: m.line } } : void 0);
        this.close();
      });
      const num = lineEl.createSpan({ cls: "nan-spotlight-result-linenum" });
      num.setText(String(m.line));
      const text = lineEl.createSpan({ cls: "nan-spotlight-result-text" });
      this.appendHighlighted(text, m.content, m.ranges);
    }
  }
  appendHighlighted(container, text, ranges) {
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > text.length)
        break;
      const start = Math.max(r.start, cursor);
      const end = Math.min(r.end, text.length);
      if (start > cursor)
        container.createSpan({ text: text.slice(cursor, start) });
      if (end > start) {
        container.createSpan({ cls: "nan-spotlight-highlight", text: text.slice(start, end) });
      }
      cursor = end;
    }
    if (cursor < text.length)
      container.createSpan({ text: text.slice(cursor) });
  }
  renderFileHeader() {
    this.fileHeaderEl.empty();
    const crumb = this.fileHeaderEl.createDiv({ cls: "nan-spotlight-crumb" });
    const homeBtn = crumb.createDiv({ cls: "nan-spotlight-crumb-item" });
    (0, import_obsidian3.setIcon)(homeBtn, "home");
    homeBtn.setAttribute("aria-label", "\u6839\u76EE\u5F55");
    homeBtn.addEventListener("click", () => this.fileBrowser.goHome());
    const path = this.fileBrowser.getPath();
    if (path !== "") {
      const parts = path.split("/");
      let acc = "";
      parts.forEach((part, i) => {
        if (i > 0)
          crumb.createSpan({ cls: "nan-spotlight-crumb-sep", text: "/" });
        acc = i === 0 ? part : `${acc}/${part}`;
        const seg = crumb.createDiv({ cls: "nan-spotlight-crumb-item", text: part });
        const target = acc;
        seg.addEventListener("click", () => this.fileBrowser.setPath(target));
      });
    } else {
      const root = crumb.createSpan({ cls: "nan-spotlight-crumb-root" });
      root.setText("\u5168\u90E8\u6587\u4EF6\u5939");
    }
    const actions = this.fileHeaderEl.createDiv({ cls: "nan-spotlight-files-actions" });
    const newBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    (0, import_obsidian3.setIcon)(newBtn, "create-new");
    newBtn.setAttribute("aria-label", "\u65B0\u5EFA");
    newBtn.addEventListener("click", (evt) => {
      const menu = new import_obsidian3.Menu();
      menu.addItem(
        (item) => item.setTitle("\u65B0\u5EFA\u7B14\u8BB0").setIcon("create-new").onClick(() => void this.createNoteAt(this.fileBrowser.getPath()))
      );
      menu.addItem(
        (item) => item.setTitle("\u65B0\u5EFA\u6587\u4EF6\u5939").setIcon("folder").onClick(() => void this.createFolderAt(this.fileBrowser.getPath()))
      );
      menu.showAtMouseEvent(evt);
    });
    const upBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    (0, import_obsidian3.setIcon)(upBtn, "chevron-up");
    upBtn.setAttribute("aria-label", "\u4E0A\u4E00\u7EA7");
    upBtn.addEventListener("click", () => this.fileBrowser.goUp());
    const listBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    (0, import_obsidian3.setIcon)(listBtn, "list");
    listBtn.setAttribute("aria-label", "\u5217\u8868\u89C6\u56FE");
    const gridBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    (0, import_obsidian3.setIcon)(gridBtn, "layout-grid");
    gridBtn.setAttribute("aria-label", "\u5C0F\u56FE\u6807\u89C6\u56FE");
    listBtn.addEventListener("click", () => this.fileBrowser.setViewMode("list"));
    gridBtn.addEventListener("click", () => this.fileBrowser.setViewMode("grid"));
    this.syncViewButtons(listBtn, gridBtn);
  }
  syncViewButtons(listBtn, gridBtn) {
    const mode = this.fileBrowser.getViewMode();
    listBtn.classList.toggle("is-active", mode === "list");
    gridBtn.classList.toggle("is-active", mode === "grid");
  }
  async createNoteAt(dirPath) {
    const p = await this.uniquePath(dirPath, "\u672A\u547D\u540D", ".md");
    const file = await this.app.vault.create(p, "");
    this.close();
    this.plugin.openFileInLeaf(file);
  }
  async createFolderAt(dirPath) {
    const p = await this.uniquePath(dirPath, "\u65B0\u5EFA\u6587\u4EF6\u5939", "");
    await this.app.vault.createFolder(p);
    await this.fileBrowser.refresh();
  }
  async uniquePath(dir, name, ext) {
    const base = dir ? `${dir}/` : "";
    let candidate = `${base}${name}${ext}`;
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${base}${name} ${i}${ext}`;
      i++;
    }
    return candidate;
  }
};
var FavoritesView = class {
  constructor(app, plugin) {
    this.closed = false;
    this.app = app;
    this.plugin = plugin;
  }
  open() {
    this.buildDom();
    document.body.appendChild(this.overlayEl);
    requestAnimationFrame(() => {
      this.overlayEl.classList.add("is-open");
      this.panelEl.classList.add("is-open");
    });
    this.refresh();
  }
  close() {
    if (this.closed)
      return;
    this.closed = true;
    this.overlayEl.classList.remove("is-open");
    this.panelEl.classList.remove("is-open");
    const overlay = this.overlayEl;
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    window.setTimeout(() => {
      if (overlay.parentElement)
        overlay.remove();
    }, 420);
    this.plugin.onFavoritesClosed();
  }
  refresh() {
    if (!this.listEl)
      return;
    this.listEl.empty();
    const favs = this.plugin.settings.favorites;
    if (favs.length === 0) {
      const empty = this.listEl.createDiv({ cls: "nan-spotlight-empty" });
      empty.setText("\u6682\u65E0\u6536\u85CF\uFF0C\u53EF\u5728\u6587\u4EF6\u7BA1\u7406\u4E2D\u53F3\u952E\u300C\u6536\u85CF\u5230\u6536\u85CF\u5939\u300D");
      return;
    }
    for (const path of favs) {
      this.renderFavorite(path);
    }
  }
  buildDom() {
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "nan-spotlight-overlay nan-spotlight-fav";
    this.overlayEl.style.setProperty("--nan-blur", `${this.plugin.settings.blurAmount}px`);
    this.panelEl = document.createElement("div");
    this.panelEl.className = "nan-spotlight-panel";
    this.overlayEl.appendChild(this.panelEl);
    const header = this.panelEl.createDiv({ cls: "nan-spotlight-fav-header" });
    const title = header.createDiv({ cls: "nan-spotlight-fav-title" });
    const star = title.createDiv({ cls: "nan-spotlight-fav-star" });
    (0, import_obsidian3.setIcon)(star, "star");
    title.createSpan({ text: "\u6536\u85CF\u5939" });
    const closeBtn = header.createDiv({ cls: "nan-spotlight-btn" });
    (0, import_obsidian3.setIcon)(closeBtn, "x");
    closeBtn.setAttribute("aria-label", "\u5173\u95ED");
    closeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.close();
    });
    this.listEl = this.panelEl.createDiv({ cls: "nan-spotlight-fav-list" });
    this.overlayEl.addEventListener("mousedown", (evt) => {
      if (evt.target === this.overlayEl)
        this.close();
    });
  }
  renderFavorite(path) {
    var _a;
    const abstract = this.app.vault.getAbstractFileByPath(path);
    const isFolder = abstract instanceof import_obsidian3.TFolder;
    const isFile = abstract instanceof import_obsidian3.TFile;
    const el = this.listEl.createDiv({ cls: "nan-spotlight-fav-item" });
    const icon = el.createDiv({ cls: "nan-spotlight-file-icon" });
    if (isFolder)
      (0, import_obsidian3.setIcon)(icon, "folder");
    else if (isFile)
      (0, import_obsidian3.setIcon)(icon, "file-text");
    else
      (0, import_obsidian3.setIcon)(icon, "file");
    const info = el.createDiv({ cls: "nan-spotlight-fav-info" });
    const name = info.createDiv({ cls: "nan-spotlight-fav-name" });
    name.setText(
      abstract ? isFile ? abstract.basename : abstract.name : (_a = path.split("/").pop()) != null ? _a : path
    );
    const p = info.createDiv({ cls: "nan-spotlight-fav-path" });
    p.setText(abstract ? path : `${path}\uFF08\u5DF2\u5220\u9664\uFF09`);
    const star = el.createDiv({ cls: "nan-spotlight-fav-toggle" });
    (0, import_obsidian3.setIcon)(star, "star");
    star.setAttribute("aria-label", "\u53D6\u6D88\u6536\u85CF");
    star.addEventListener("click", (evt) => {
      evt.stopPropagation();
      this.plugin.toggleFavorite(path);
      this.refresh();
    });
    el.addEventListener("dblclick", () => {
      if (isFile) {
        this.plugin.openFileInLeaf(abstract);
        this.close();
      } else if (isFolder) {
        this.close();
        this.plugin.openSpotlight(path);
      }
    });
    el.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const menu = new import_obsidian3.Menu();
      if (abstract) {
        this.app.workspace.trigger(
          "file-menu",
          menu,
          abstract,
          "file-explorer-context-menu",
          this.app.workspace.getLeaf(false)
        );
        menu.addSeparator();
      }
      menu.addItem(
        (item) => item.setTitle("\u53D6\u6D88\u6536\u85CF").setIcon("star").onClick(() => {
          this.plugin.toggleFavorite(path);
          this.refresh();
        })
      );
      menu.showAtMouseEvent(evt);
    });
  }
};
var NanSpotlightSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u6960\xB7\u805A\u7126\u641C\u7D22" });
    new import_obsidian3.Setting(containerEl).setName("\u547C\u51FA\u5FEB\u6377\u952E").setDesc(
      "\u547C\u51FA/\u5173\u95ED\u805A\u7126\u641C\u7D22\u754C\u9762\u7684\u5FEB\u6377\u952E\uFF0C\u9ED8\u8BA4 Ctrl+Space\u3002Windows \u4E0B Ctrl+Space \u53EF\u80FD\u4E0E\u8F93\u5165\u6CD5\u5207\u6362\u51B2\u7A81\uFF0C\u53EF\u70B9\u6309\u94AE\u540E\u6309\u4E0B\u65B0\u7EC4\u5408\u952E\u6765\u4FEE\u6539\u3002"
    ).addButton((btn) => {
      btn.setButtonText(
        this.plugin.recordingTarget === "hotkey" ? "\u8BF7\u6309\u4E0B\u5FEB\u6377\u952E\u2026" : this.plugin.settings.hotkey
      ).onClick(() => this.startRecording(btn, "hotkey"));
    });
    new import_obsidian3.Setting(containerEl).setName("\u6536\u85CF\u5939\u5FEB\u6377\u952E").setDesc("\u5FEB\u901F\u6253\u5F00/\u5173\u95ED\u6536\u85CF\u5939\u7684\u5FEB\u6377\u952E\uFF0C\u9ED8\u8BA4 Ctrl+Shift+Space\u3002").addButton((btn) => {
      btn.setButtonText(
        this.plugin.recordingTarget === "favoritesHotkey" ? "\u8BF7\u6309\u4E0B\u5FEB\u6377\u952E\u2026" : this.plugin.settings.favoritesHotkey
      ).onClick(() => this.startRecording(btn, "favoritesHotkey"));
    });
    new import_obsidian3.Setting(containerEl).setName("\u9ED8\u8BA4\u6587\u4EF6\u663E\u793A\u6A21\u5F0F").setDesc("\u6587\u4EF6\u7BA1\u7406\u533A\u57DF\u9ED8\u8BA4\u4F7F\u7528\u5217\u8868\u89C6\u56FE\u8FD8\u662F\u5C0F\u56FE\u6807\u89C6\u56FE\u3002").addDropdown((dd) => {
      dd.addOption("list", "\u5217\u8868\u89C6\u56FE");
      dd.addOption("grid", "\u5C0F\u56FE\u6807\u89C6\u56FE");
      dd.setValue(this.plugin.settings.defaultViewMode);
      dd.onChange(async (v) => {
        this.plugin.settings.defaultViewMode = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u641C\u7D22\u7ED3\u679C\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00").setDesc("\u5F00\u542F\u540E\uFF0C\u70B9\u51FB\u641C\u7D22\u7ED3\u679C\u4F1A\u5728\u65B0\u6807\u7B7E\u9875\u4E2D\u6253\u5F00\u7B14\u8BB0\uFF1B\u5173\u95ED\u5219\u5728\u5F53\u524D\u6807\u7B7E\u9875\u6253\u5F00\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.openInNewTab);
      toggle.onChange(async (v) => {
        this.plugin.settings.openInNewTab = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u80CC\u666F\u6A21\u7CCA\u7A0B\u5EA6").setDesc("\u4E9A\u514B\u529B\u80CC\u666F\u7684\u6A21\u7CCA\u50CF\u7D20\u503C\uFF0C\u6570\u503C\u8D8A\u5927\u8D8A\u6726\u80E7\u3002").addSlider((sl) => {
      sl.setLimits(0, 40, 1);
      sl.setValue(this.plugin.settings.blurAmount);
      sl.setDynamicTooltip();
      sl.onChange(async (v) => {
        this.plugin.settings.blurAmount = v;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u6536\u85CF\u5939").setDesc(`\u5F53\u524D\u5DF2\u6536\u85CF ${this.plugin.settings.favorites.length} \u9879\u3002`).addButton(
      (btn) => btn.setButtonText("\u6E05\u7A7A\u6536\u85CF\u5939").onClick(async () => {
        this.plugin.settings.favorites = [];
        await this.plugin.saveSettings();
        this.display();
      })
    );
    containerEl.createEl("h3", { text: "\u5173\u4E8E" });
    const about = containerEl.createDiv({ cls: "nan-spotlight-about" });
    about.createEl("p", { text: "\u4F5C\u8005\uFF1A@\u6960" });
    about.createEl("p", { text: "\u7248\u6743\uFF1A\u662F\u5C0F\u6960\u5450" });
    about.createEl("p", { text: "\u7248\u672C\uFF1Av1.0" });
    about.createEl("p", { text: "\u5F00\u6E90\u534F\u8BAE\uFF1AGNU General Public License v3" });
  }
  startRecording(btn, target) {
    this.plugin.recordingHotkey = true;
    this.plugin.recordingTarget = target;
    btn.setButtonText("\u8BF7\u6309\u4E0B\u5FEB\u6377\u952E\u2026\uFF08Esc \u53D6\u6D88\uFF09");
    const handler = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.key === "Escape") {
        this.stopRecording(btn, handler, null);
        return;
      }
      const combo = buildHotkeyString(evt);
      if (combo) {
        this.stopRecording(btn, handler, combo);
      }
    };
    this.plugin._recordingHandler = handler;
    document.addEventListener("keydown", handler, true);
  }
  stopRecording(btn, handler, combo) {
    document.removeEventListener("keydown", handler, true);
    this.plugin.recordingHotkey = false;
    if (combo) {
      if (this.plugin.recordingTarget === "favoritesHotkey") {
        this.plugin.settings.favoritesHotkey = combo;
      } else {
        this.plugin.settings.hotkey = combo;
      }
      void this.plugin.saveSettings();
    }
    const target = this.plugin.recordingTarget;
    this.plugin.recordingTarget = null;
    this.plugin._recordingHandler = null;
    btn.setButtonText(
      target === "favoritesHotkey" ? this.plugin.settings.favoritesHotkey : this.plugin.settings.hotkey
    );
  }
};
var NanSpotlightPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.recordingHotkey = false;
    this.recordingTarget = null;
    this._recordingHandler = null;
    this.spotlight = null;
    this.favorites = null;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new NanSpotlightSettingTab(this.app, this));
    this.addCommand({
      id: "open-spotlight",
      name: "\u6253\u5F00/\u5173\u95ED \u805A\u7126\u641C\u7D22",
      callback: () => this.toggleSpotlight()
    });
    this.addCommand({
      id: "open-favorites",
      name: "\u6253\u5F00/\u5173\u95ED \u6536\u85CF\u5939",
      callback: () => this.toggleFavorites()
    });
    this.registerDomEvent(document, "keydown", (evt) => {
      if (this.recordingHotkey)
        return;
      if (eventMatchesHotkey(evt, this.settings.hotkey)) {
        evt.preventDefault();
        evt.stopPropagation();
        this.toggleSpotlight();
      } else if (eventMatchesHotkey(evt, this.settings.favoritesHotkey)) {
        evt.preventDefault();
        evt.stopPropagation();
        this.toggleFavorites();
      }
    });
  }
  onunload() {
    if (this._recordingHandler) {
      document.removeEventListener("keydown", this._recordingHandler, true);
      this._recordingHandler = null;
    }
    this.closeSpotlight();
    this.closeFavorites();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /* ---- 聚焦搜索 ---- */
  toggleSpotlight() {
    if (this.spotlight)
      this.closeSpotlight();
    else
      this.openSpotlight();
  }
  openSpotlight(path) {
    this.closeFavorites();
    if (this.spotlight) {
      if (path)
        this.spotlight.navigateTo(path);
      return;
    }
    this.spotlight = new SpotlightView(this.app, this);
    this.spotlight.open(path);
  }
  closeSpotlight() {
    if (this.spotlight)
      this.spotlight.close();
  }
  onSpotlightClosed() {
    this.spotlight = null;
  }
  /* ---- 收藏夹 ---- */
  toggleFavorites() {
    if (this.favorites)
      this.closeFavorites();
    else
      this.openFavorites();
  }
  openFavorites() {
    this.closeSpotlight();
    if (this.favorites)
      return;
    this.favorites = new FavoritesView(this.app, this);
    this.favorites.open();
  }
  closeFavorites() {
    if (this.favorites)
      this.favorites.close();
  }
  onFavoritesClosed() {
    this.favorites = null;
  }
  /** 打开文件：非 Markdown（PDF/图片等需标签页查看的）始终新标签页，Markdown 按设置 */
  openFileInLeaf(file, openState) {
    const newTab = file.extension.toLowerCase() !== "md" || this.settings.openInNewTab;
    const leaf = newTab ? this.app.workspace.getLeaf("tab") : this.app.workspace.getLeaf(false);
    void leaf.openFile(file, openState);
  }
  toggleFavorite(path) {
    var _a;
    const idx = this.settings.favorites.indexOf(path);
    if (idx === -1)
      this.settings.favorites.push(path);
    else
      this.settings.favorites.splice(idx, 1);
    void this.saveSettings();
    (_a = this.favorites) == null ? void 0 : _a.refresh();
  }
};
