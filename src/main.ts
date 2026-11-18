import {
  App,
  ButtonComponent,
  Menu,
  OpenViewState,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  Platform,
  setIcon,
} from "obsidian";
import { searchVault, SearchOptions, SearchResult, SearchMatch } from "./search";
import { FileBrowser } from "./fileBrowser";

interface NanSpotlightSettings {
  hotkey: string;
  favoritesHotkey: string;
  defaultViewMode: "list" | "grid";
  blurAmount: number;
  favorites: string[];
  openInNewTab: boolean;
}

const DEFAULT_SETTINGS: NanSpotlightSettings = {
  hotkey: "Ctrl+Space",
  favoritesHotkey: "Ctrl+Shift+Space",
  defaultViewMode: "list",
  blurAmount: 24,
  favorites: [],
  openInNewTab: true,
};

/* ---------------- 快捷键匹配 ---------------- */

function eventMatchesHotkey(evt: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return false;
  const key = parts.pop()!;
  const mods = new Set(parts);

  const ctrl = mods.has("ctrl") || mods.has("control");
  const meta =
    mods.has("meta") ||
    mods.has("cmd") ||
    mods.has("command") ||
    mods.has("win") ||
    mods.has("super");
  const alt = mods.has("alt") || mods.has("option");
  const shift = mods.has("shift");
  const mod = mods.has("mod");

  const needCtrl = ctrl || (mod && !Platform.isMacOS);
  const needMeta = meta || (mod && Platform.isMacOS);

  if (evt.ctrlKey !== needCtrl) return false;
  if (evt.metaKey !== needMeta) return false;
  if (evt.altKey !== alt) return false;
  if (evt.shiftKey !== shift) return false;

  return keyMatches(evt, key);
}

function keyMatches(evt: KeyboardEvent, key: string): boolean {
  const k = key.toLowerCase();
  const map: Record<string, string[]> = {
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
    pagedown: ["pagedown"],
  };
  if (map[k]) return map[k].includes(evt.key.toLowerCase());
  if (/^f([1-9]|1[0-2])$/.test(k)) {
    return evt.key.toLowerCase() === k;
  }
  if (k.length === 1) {
    return evt.key.toLowerCase() === k || evt.code.toLowerCase() === `key${k}`;
  }
  return false;
}

function buildHotkeyString(evt: KeyboardEvent): string {
  const parts: string[] = [];
  if (evt.ctrlKey) parts.push("Ctrl");
  if (evt.metaKey) parts.push(Platform.isMacOS ? "Cmd" : "Meta");
  if (evt.altKey) parts.push("Alt");
  if (evt.shiftKey) parts.push("Shift");

  let key = evt.key;
  if (key === " ") key = "Space";
  else if (key === "Escape") key = "Escape";
  else if (key === "Enter") key = "Enter";
  else if (key === "ArrowUp") key = "Up";
  else if (key === "ArrowDown") key = "Down";
  else if (key === "ArrowLeft") key = "Left";
  else if (key === "ArrowRight") key = "Right";
  else if (key === "Backspace") key = "Backspace";
  else if (key === "Tab") key = "Tab";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

/* ---------------- 聚焦搜索界面 ---------------- */

class SpotlightView {
  private app: App;
  private plugin: NanSpotlightPlugin;
  private overlayEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private optionsRowEl!: HTMLElement;
  private helpEl!: HTMLElement;
  private searchResultsEl!: HTMLElement;
  private fileHeaderEl!: HTMLElement;
  private fileSectionEl!: HTMLElement;
  private fileBrowser!: FileBrowser;

  private searchOptions: SearchOptions = {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  };
  private debounceTimer: number | null = null;
  private lastQuery = "";
  private closed = false;
  private documentKeydownHandler: ((evt: KeyboardEvent) => void) | null = null;

  constructor(app: App, plugin: NanSpotlightPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  open(initialPath?: string): void {
    this.buildDom();
    document.body.appendChild(this.overlayEl);
    requestAnimationFrame(() => {
      this.overlayEl.classList.add("is-open");
      this.panelEl.classList.add("is-open");
    });
    if (initialPath) this.fileBrowser.setPath(initialPath);
    else void this.fileBrowser.refresh();
    this.updateViewState();
  }

  /** 已在打开状态时，跳转到指定目录并清空搜索 */
  navigateTo(path: string): void {
    this.fileBrowser.setPath(path);
    this.inputEl.value = "";
    this.lastQuery = "";
    this.searchResultsEl.empty();
    this.updateViewState();
  }

  close(): void {
    if (this.closed) return;
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
      if (overlay.parentElement) overlay.remove();
    }, 420);
    this.plugin.onSpotlightClosed();
  }

  private buildDom(): void {
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
      if (evt.target === this.overlayEl) this.close();
    });

    // Delete 键：删除当前高亮选中的文件/文件夹
    this.documentKeydownHandler = (evt) => this.onDocumentKeydown(evt);
    document.addEventListener("keydown", this.documentKeydownHandler);

    this.updateViewState();
  }

  private buildSearchSection(): void {
    const searchSection = this.panelEl.createDiv({ cls: "nan-spotlight-search" });

    const inputRow = searchSection.createDiv({ cls: "nan-spotlight-input-row" });
    const searchIcon = inputRow.createDiv({ cls: "nan-spotlight-search-icon" });
    setIcon(searchIcon, "search");

    this.inputEl = inputRow.createEl("input", {
      cls: "nan-spotlight-input",
      type: "text",
      attr: { spellcheck: "false", autocomplete: "off", autocapitalize: "off" },
    });
    this.inputEl.placeholder = "搜索你的笔记…";

    const closeBtn = inputRow.createDiv({ cls: "nan-spotlight-btn" });
    setIcon(closeBtn, "x");
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.close();
    });

    this.optionsRowEl = searchSection.createDiv({ cls: "nan-spotlight-options" });
    this.buildOptionToggle(this.optionsRowEl, "Aa", "匹配大小写", "caseSensitive");
    this.buildOptionToggle(this.optionsRowEl, "ab", "全词匹配", "wholeWord");
    this.buildOptionToggle(this.optionsRowEl, ".*", "正则表达式", "regex");

    this.helpEl = searchSection.createDiv({ cls: "nan-spotlight-help" });
    this.renderHelp();

    this.searchResultsEl = searchSection.createDiv({ cls: "nan-spotlight-results" });
  }

  private buildFileSection(): void {
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

  private buildOptionToggle(
    parent: HTMLElement,
    label: string,
    title: string,
    key: keyof SearchOptions
  ): void {
    const btn = parent.createEl("button", {
      cls: "nan-spotlight-opt",
      attr: { title },
      type: "button",
    });
    btn.setText(label);
    const active = this.searchOptions[key] as boolean;
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("is-active", active);
    // 点击选项时不抢走输入框焦点，保持搜索帮助可见
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const next = !this.searchOptions[key];
      this.searchOptions[key] = next;
      btn.setAttribute("aria-pressed", String(next));
      btn.classList.toggle("is-active", next);
      this.rerun();
    });
  }

  private renderHelp(): void {
    this.helpEl.empty();
    const title = this.helpEl.createDiv({ cls: "nan-spotlight-help-title" });
    title.setText("搜索帮助");
    const items = [
      "直接输入关键词进行全文搜索",
      '文件夹:名称（folder:）—— 搜索文件夹',
      '其他:文件名（other:）—— 搜索 PDF 等格式文件',
      '名称:文件名（file:）—— 按文件名搜索',
      '路径:路径（path:）—— 按路径过滤',
      '标签:#标签（tag:）—— 按标签过滤',
      '行:内容（line:）—— 匹配整行内容',
      '章节:标题（section:）—— 匹配某个小节',
      '块:内容（block:）—— 匹配某个段落块',
      '"多个 词" —— 短语精确匹配',
    ];
    const ul = this.helpEl.createEl("ul", { cls: "nan-spotlight-help-list" });
    for (const it of items) {
      ul.createEl("li", { text: it });
    }
  }

  private onInput(): void {
    this.updateViewState();
    const query = this.inputEl.value;
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => void this.runSearch(query), 150);
  }

  private onInputKeydown(evt: KeyboardEvent): void {
    if (evt.key === "Escape") {
      evt.preventDefault();
      this.close();
    }
  }

  private onDocumentKeydown(evt: KeyboardEvent): void {
    if (evt.key !== "Delete") return;
    // 焦点在输入框/文本域时，Delete 用于编辑文本，不删除文件
    const ae = document.activeElement;
    if (
      ae &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || (ae as HTMLElement).isContentEditable)
    ) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    this.fileBrowser.deleteSelected();
  }

  private rerun(): void {
    void this.runSearch(this.inputEl.value);
  }

  /**
   * 统一管理搜索区与文件区的显隐：
   * - 未聚焦：隐藏选项与帮助，给文件区留出更多空间
   * - 聚焦且无输入：显示选项与搜索帮助
   * - 有输入：隐藏文件区，仅显示搜索结果
   */
  private updateViewState(): void {
    const hasQuery = this.inputEl.value.trim() !== "";
    const focused = document.activeElement === this.inputEl;
    this.optionsRowEl.style.display = focused ? "flex" : "none";
    this.helpEl.style.display = focused && !hasQuery ? "block" : "none";
    this.fileSectionEl.style.display = hasQuery ? "none" : "";
  }

  private async runSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    this.lastQuery = trimmed;

    if (trimmed === "") {
      this.searchResultsEl.empty();
      return;
    }

    this.searchResultsEl.empty();
    const loading = this.searchResultsEl.createDiv({ cls: "nan-spotlight-loading" });
    loading.setText("搜索中…");

    const results = await searchVault(this.app, trimmed, this.searchOptions);
    if (this.lastQuery !== trimmed) return;

    this.searchResultsEl.empty();
    if (results.length === 0) {
      const none = this.searchResultsEl.createDiv({ cls: "nan-spotlight-empty" });
      none.setText("未找到匹配结果");
      return;
    }
    this.renderResults(results);
  }

  private openFile(file: TFile, openState?: OpenViewState): void {
    this.plugin.openFileInLeaf(file, openState);
  }

  private renderResults(results: SearchResult[]): void {
    for (const r of results) {
      if (r.folder) {
        this.renderFolderResult(r.folder);
        continue;
      }
      const file = r.file;
      if (!file) continue;
      this.renderFileResult(file, r.matches);
    }
  }

  /** 渲染文件夹搜索结果：点击后直接在聚焦页打开该文件夹 */
  private renderFolderResult(folder: TFolder): void {
    const block = this.searchResultsEl.createDiv({ cls: "nan-spotlight-result-file" });
    const head = block.createDiv({ cls: "nan-spotlight-result-file-head" });
    const icon = head.createDiv({ cls: "nan-spotlight-file-icon" });
    setIcon(icon, "folder");
    const nameEl = head.createDiv({ cls: "nan-spotlight-result-file-name" });
    nameEl.setText(folder.name);
    const pathEl = head.createDiv({ cls: "nan-spotlight-result-file-path" });
    pathEl.setText(folder.path);
    head.addEventListener("click", () => {
      this.navigateTo(folder.path);
    });
  }

  private renderFileResult(file: TFile, matches: SearchMatch[]): void {
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
      hint.setText("匹配该文件（无正文预览）");
      return;
    }

    for (const m of matches.slice(0, 20)) {
      const lineEl = fileBlock.createDiv({ cls: "nan-spotlight-result-line" });
      lineEl.addEventListener("click", () => {
        this.openFile(file, m.line > 0 ? { eState: { line: m.line } } : undefined);
        this.close();
      });
      const num = lineEl.createSpan({ cls: "nan-spotlight-result-linenum" });
      num.setText(String(m.line));
      const text = lineEl.createSpan({ cls: "nan-spotlight-result-text" });
      this.appendHighlighted(text, m.content, m.ranges);
    }
  }

  private appendHighlighted(
    container: HTMLElement,
    text: string,
    ranges: Array<{ start: number; end: number }>
  ): void {
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > text.length) break;
      const start = Math.max(r.start, cursor);
      const end = Math.min(r.end, text.length);
      if (start > cursor) container.createSpan({ text: text.slice(cursor, start) });
      if (end > start) {
        container.createSpan({ cls: "nan-spotlight-highlight", text: text.slice(start, end) });
      }
      cursor = end;
    }
    if (cursor < text.length) container.createSpan({ text: text.slice(cursor) });
  }

  private renderFileHeader(): void {
    this.fileHeaderEl.empty();

    const crumb = this.fileHeaderEl.createDiv({ cls: "nan-spotlight-crumb" });
    const homeBtn = crumb.createDiv({ cls: "nan-spotlight-crumb-item" });
    setIcon(homeBtn, "home");
    homeBtn.setAttribute("aria-label", "根目录");
    homeBtn.addEventListener("click", () => this.fileBrowser.goHome());

    const path = this.fileBrowser.getPath();
    if (path !== "") {
      const parts = path.split("/");
      let acc = "";
      parts.forEach((part, i) => {
        if (i > 0) crumb.createSpan({ cls: "nan-spotlight-crumb-sep", text: "/" });
        acc = i === 0 ? part : `${acc}/${part}`;
        const seg = crumb.createDiv({ cls: "nan-spotlight-crumb-item", text: part });
        const target = acc;
        seg.addEventListener("click", () => this.fileBrowser.setPath(target));
      });
    } else {
      const root = crumb.createSpan({ cls: "nan-spotlight-crumb-root" });
      root.setText("全部文件夹");
    }

    const actions = this.fileHeaderEl.createDiv({ cls: "nan-spotlight-files-actions" });

    // 新建按钮
    const newBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    setIcon(newBtn, "create-new");
    newBtn.setAttribute("aria-label", "新建");
    newBtn.addEventListener("click", (evt) => {
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("新建笔记")
          .setIcon("create-new")
          .onClick(() => void this.createNoteAt(this.fileBrowser.getPath()))
      );
      menu.addItem((item) =>
        item
          .setTitle("新建文件夹")
          .setIcon("folder")
          .onClick(() => void this.createFolderAt(this.fileBrowser.getPath()))
      );
      menu.showAtMouseEvent(evt);
    });

    const upBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    setIcon(upBtn, "chevron-up");
    upBtn.setAttribute("aria-label", "上一级");
    upBtn.addEventListener("click", () => this.fileBrowser.goUp());

    const listBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    setIcon(listBtn, "list");
    listBtn.setAttribute("aria-label", "列表视图");
    const gridBtn = actions.createDiv({ cls: "nan-spotlight-btn" });
    setIcon(gridBtn, "layout-grid");
    gridBtn.setAttribute("aria-label", "小图标视图");

    listBtn.addEventListener("click", () => this.fileBrowser.setViewMode("list"));
    gridBtn.addEventListener("click", () => this.fileBrowser.setViewMode("grid"));
    this.syncViewButtons(listBtn, gridBtn);
  }

  private syncViewButtons(listBtn: HTMLElement, gridBtn: HTMLElement): void {
    const mode = this.fileBrowser.getViewMode();
    listBtn.classList.toggle("is-active", mode === "list");
    gridBtn.classList.toggle("is-active", mode === "grid");
  }

  private async createNoteAt(dirPath: string): Promise<void> {
    const p = await this.uniquePath(dirPath, "未命名", ".md");
    const file = await this.app.vault.create(p, "");
    this.close();
    this.plugin.openFileInLeaf(file);
  }

  private async createFolderAt(dirPath: string): Promise<void> {
    const p = await this.uniquePath(dirPath, "新建文件夹", "");
    await this.app.vault.createFolder(p);
    await this.fileBrowser.refresh();
  }

  private async uniquePath(dir: string, name: string, ext: string): Promise<string> {
    const base = dir ? `${dir}/` : "";
    let candidate = `${base}${name}${ext}`;
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${base}${name} ${i}${ext}`;
      i++;
    }
    return candidate;
  }
}

/* ---------------- 收藏夹界面 ---------------- */

class FavoritesView {
  private app: App;
  private plugin: NanSpotlightPlugin;
  private overlayEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private listEl!: HTMLElement;
  private closed = false;

  constructor(app: App, plugin: NanSpotlightPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  open(): void {
    this.buildDom();
    document.body.appendChild(this.overlayEl);
    requestAnimationFrame(() => {
      this.overlayEl.classList.add("is-open");
      this.panelEl.classList.add("is-open");
    });
    this.refresh();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.overlayEl.classList.remove("is-open");
    this.panelEl.classList.remove("is-open");
    const overlay = this.overlayEl;
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    window.setTimeout(() => {
      if (overlay.parentElement) overlay.remove();
    }, 420);
    this.plugin.onFavoritesClosed();
  }

  refresh(): void {
    if (!this.listEl) return;
    this.listEl.empty();

    const favs = this.plugin.settings.favorites;
    if (favs.length === 0) {
      const empty = this.listEl.createDiv({ cls: "nan-spotlight-empty" });
      empty.setText("暂无收藏，可在文件管理中右键「收藏到收藏夹」");
      return;
    }
    for (const path of favs) {
      this.renderFavorite(path);
    }
  }

  private buildDom(): void {
    this.overlayEl = document.createElement("div");
    this.overlayEl.className = "nan-spotlight-overlay nan-spotlight-fav";
    this.overlayEl.style.setProperty("--nan-blur", `${this.plugin.settings.blurAmount}px`);

    this.panelEl = document.createElement("div");
    this.panelEl.className = "nan-spotlight-panel";
    this.overlayEl.appendChild(this.panelEl);

    const header = this.panelEl.createDiv({ cls: "nan-spotlight-fav-header" });
    const title = header.createDiv({ cls: "nan-spotlight-fav-title" });
    const star = title.createDiv({ cls: "nan-spotlight-fav-star" });
    setIcon(star, "star");
    title.createSpan({ text: "收藏夹" });
    const closeBtn = header.createDiv({ cls: "nan-spotlight-btn" });
    setIcon(closeBtn, "x");
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.close();
    });

    this.listEl = this.panelEl.createDiv({ cls: "nan-spotlight-fav-list" });

    this.overlayEl.addEventListener("mousedown", (evt) => {
      if (evt.target === this.overlayEl) this.close();
    });
  }

  private renderFavorite(path: string): void {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    const isFolder = abstract instanceof TFolder;
    const isFile = abstract instanceof TFile;

    const el = this.listEl.createDiv({ cls: "nan-spotlight-fav-item" });

    const icon = el.createDiv({ cls: "nan-spotlight-file-icon" });
    if (isFolder) setIcon(icon, "folder");
    else if (isFile) setIcon(icon, "file-text");
    else setIcon(icon, "file");

    const info = el.createDiv({ cls: "nan-spotlight-fav-info" });
    const name = info.createDiv({ cls: "nan-spotlight-fav-name" });
    name.setText(
      abstract
        ? isFile
          ? (abstract as TFile).basename
          : (abstract as TFolder).name
        : path.split("/").pop() ?? path
    );
    const p = info.createDiv({ cls: "nan-spotlight-fav-path" });
    p.setText(abstract ? path : `${path}（已删除）`);

    const star = el.createDiv({ cls: "nan-spotlight-fav-toggle" });
    setIcon(star, "star");
    star.setAttribute("aria-label", "取消收藏");
    star.addEventListener("click", (evt) => {
      evt.stopPropagation();
      this.plugin.toggleFavorite(path);
      this.refresh();
    });

    el.addEventListener("dblclick", () => {
      if (isFile) {
        this.plugin.openFileInLeaf(abstract as TFile);
        this.close();
      } else if (isFolder) {
        this.close();
        this.plugin.openSpotlight(path);
      }
    });

    el.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const menu = new Menu();
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
      menu.addItem((item) =>
        item.setTitle("取消收藏").setIcon("star").onClick(() => {
          this.plugin.toggleFavorite(path);
          this.refresh();
        })
      );
      menu.showAtMouseEvent(evt);
    });
  }
}

/* ---------------- 设置页 ---------------- */

class NanSpotlightSettingTab extends PluginSettingTab {
  plugin: NanSpotlightPlugin;

  constructor(app: App, plugin: NanSpotlightPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "楠·聚焦搜索" });

    new Setting(containerEl)
      .setName("呼出快捷键")
      .setDesc(
        "呼出/关闭聚焦搜索界面的快捷键，默认 Ctrl+Space。Windows 下 Ctrl+Space 可能与输入法切换冲突，可点按钮后按下新组合键来修改。"
      )
      .addButton((btn) => {
        btn
          .setButtonText(
            this.plugin.recordingTarget === "hotkey"
              ? "请按下快捷键…"
              : this.plugin.settings.hotkey
          )
          .onClick(() => this.startRecording(btn, "hotkey"));
      });

    new Setting(containerEl)
      .setName("收藏夹快捷键")
      .setDesc("快速打开/关闭收藏夹的快捷键，默认 Ctrl+Shift+Space。")
      .addButton((btn) => {
        btn
          .setButtonText(
            this.plugin.recordingTarget === "favoritesHotkey"
              ? "请按下快捷键…"
              : this.plugin.settings.favoritesHotkey
          )
          .onClick(() => this.startRecording(btn, "favoritesHotkey"));
      });

    new Setting(containerEl)
      .setName("默认文件显示模式")
      .setDesc("文件管理区域默认使用列表视图还是小图标视图。")
      .addDropdown((dd) => {
        dd.addOption("list", "列表视图");
        dd.addOption("grid", "小图标视图");
        dd.setValue(this.plugin.settings.defaultViewMode);
        dd.onChange(async (v) => {
          this.plugin.settings.defaultViewMode = v as "list" | "grid";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("搜索结果在新标签页打开")
      .setDesc("开启后，点击搜索结果会在新标签页中打开笔记；关闭则在当前标签页打开。")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.openInNewTab);
        toggle.onChange(async (v) => {
          this.plugin.settings.openInNewTab = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("背景模糊程度")
      .setDesc("亚克力背景的模糊像素值，数值越大越朦胧。")
      .addSlider((sl) => {
        sl.setLimits(0, 40, 1);
        sl.setValue(this.plugin.settings.blurAmount);
        sl.setDynamicTooltip();
        sl.onChange(async (v) => {
          this.plugin.settings.blurAmount = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("收藏夹")
      .setDesc(`当前已收藏 ${this.plugin.settings.favorites.length} 项。`)
      .addButton((btn) =>
        btn.setButtonText("清空收藏夹").onClick(async () => {
          this.plugin.settings.favorites = [];
          await this.plugin.saveSettings();
          this.display();
        })
      );

    containerEl.createEl("h3", { text: "关于" });
    const about = containerEl.createDiv({ cls: "nan-spotlight-about" });
    about.createEl("p", { text: "作者：@楠" });
    about.createEl("p", { text: "版权：是小楠呐" });
    about.createEl("p", { text: "版本：v1.0" });
    about.createEl("p", { text: "开源协议：GNU General Public License v3" });
  }

  private startRecording(btn: ButtonComponent, target: "hotkey" | "favoritesHotkey"): void {
    this.plugin.recordingHotkey = true;
    this.plugin.recordingTarget = target;
    btn.setButtonText("请按下快捷键…（Esc 取消）");

    const handler = (evt: KeyboardEvent) => {
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

  private stopRecording(
    btn: ButtonComponent,
    handler: (evt: KeyboardEvent) => void,
    combo: string | null
  ): void {
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
}

/* ---------------- 插件主体 ---------------- */

export default class NanSpotlightPlugin extends Plugin {
  settings: NanSpotlightSettings;
  recordingHotkey = false;
  recordingTarget: "hotkey" | "favoritesHotkey" | null = null;
  _recordingHandler: ((evt: KeyboardEvent) => void) | null = null;
  private spotlight: SpotlightView | null = null;
  private favorites: FavoritesView | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new NanSpotlightSettingTab(this.app, this));

    this.addCommand({
      id: "open-spotlight",
      name: "打开/关闭 聚焦搜索",
      callback: () => this.toggleSpotlight(),
    });
    this.addCommand({
      id: "open-favorites",
      name: "打开/关闭 收藏夹",
      callback: () => this.toggleFavorites(),
    });

    this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
      if (this.recordingHotkey) return;
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

  onunload(): void {
    if (this._recordingHandler) {
      document.removeEventListener("keydown", this._recordingHandler, true);
      this._recordingHandler = null;
    }
    this.closeSpotlight();
    this.closeFavorites();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* ---- 聚焦搜索 ---- */
  toggleSpotlight(): void {
    if (this.spotlight) this.closeSpotlight();
    else this.openSpotlight();
  }

  openSpotlight(path?: string): void {
    this.closeFavorites();
    if (this.spotlight) {
      if (path) this.spotlight.navigateTo(path);
      return;
    }
    this.spotlight = new SpotlightView(this.app, this);
    this.spotlight.open(path);
  }

  closeSpotlight(): void {
    if (this.spotlight) this.spotlight.close();
  }

  onSpotlightClosed(): void {
    this.spotlight = null;
  }

  /* ---- 收藏夹 ---- */
  toggleFavorites(): void {
    if (this.favorites) this.closeFavorites();
    else this.openFavorites();
  }

  openFavorites(): void {
    this.closeSpotlight();
    if (this.favorites) return;
    this.favorites = new FavoritesView(this.app, this);
    this.favorites.open();
  }

  closeFavorites(): void {
    if (this.favorites) this.favorites.close();
  }

  onFavoritesClosed(): void {
    this.favorites = null;
  }

  /** 打开文件：非 Markdown（PDF/图片等需标签页查看的）始终新标签页，Markdown 按设置 */
  openFileInLeaf(file: TFile, openState?: OpenViewState): void {
    const newTab = file.extension.toLowerCase() !== "md" || this.settings.openInNewTab;
    const leaf = newTab ? this.app.workspace.getLeaf("tab") : this.app.workspace.getLeaf(false);
    void leaf.openFile(file, openState);
  }

  toggleFavorite(path: string): void {
    const idx = this.settings.favorites.indexOf(path);
    if (idx === -1) this.settings.favorites.push(path);
    else this.settings.favorites.splice(idx, 1);
    void this.saveSettings();
    this.favorites?.refresh();
  }
}
