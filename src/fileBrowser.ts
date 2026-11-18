import { App, Menu, Notice, TAbstractFile, TFile, TFolder, setIcon, normalizePath } from "obsidian";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "folder";
}

export class FileBrowser {
  private app: App;
  private listEl: HTMLElement;
  private currentPath: string;
  private viewMode: "list" | "grid";
  private onOpenFile: (file: TFile) => void;
  private selectedEl: HTMLElement | null = null;
  private selectedEntry: FileEntry | null = null;
  /** 刷新令牌：并发 refresh 时只渲染最后一次结果，避免不同层级条目混在一起 */
  private refreshToken = 0;

  /** 路径或视图模式变化后触发，用于刷新面包屑等头部 */
  onNavigate: (() => void) | null = null;
  /** 视图模式变化后触发，用于持久化到设置 */
  onViewModeChange: ((mode: "list" | "grid") => void) | null = null;
  /** 在指定目录新建笔记 */
  onNewNote: ((dirPath: string) => void) | null = null;
  /** 在指定目录新建文件夹 */
  onNewFolder: ((dirPath: string) => void) | null = null;
  /** 判断某路径是否已收藏 */
  isFavorite: ((path: string) => boolean) | null = null;
  /** 切换某路径的收藏状态 */
  toggleFavorite: ((path: string) => void) | null = null;

  constructor(app: App, containerEl: HTMLElement, onOpenFile: (file: TFile) => void) {
    this.app = app;
    this.onOpenFile = onOpenFile;
    this.currentPath = "";
    this.viewMode = "list";
    this.listEl = containerEl.createDiv({ cls: "nan-spotlight-files-body" });

    // 右键空白处：提供“新建笔记/新建文件夹”
    this.listEl.addEventListener("contextmenu", (evt) => {
      const target = evt.target as HTMLElement;
      if (target.closest(".nan-spotlight-file-item")) return;
      this.onBackgroundContextMenu(evt);
    });
  }

  getPath(): string {
    return this.currentPath;
  }

  getViewMode(): "list" | "grid" {
    return this.viewMode;
  }

  setViewMode(mode: "list" | "grid"): void {
    this.viewMode = mode;
    this.refresh();
    this.onNavigate?.();
    this.onViewModeChange?.(mode);
  }

  /** 仅设置初始视图模式，不触发刷新与回调（用于首次构建） */
  setInitialViewMode(mode: "list" | "grid"): void {
    this.viewMode = mode;
  }

  goHome(): void {
    this.setPath("");
  }

  goUp(): void {
    if (!this.currentPath) return;
    const parts = this.currentPath.split("/");
    parts.pop();
    this.setPath(parts.join("/"));
  }

  setPath(path: string): void {
    this.currentPath = normalizePath(path);
    this.refresh();
    this.onNavigate?.();
  }

  async refresh(): Promise<void> {
    const token = ++this.refreshToken;
    this.selectedEl = null;
    this.selectedEntry = null;
    this.listEl.empty();
    this.listEl.toggleClass("nan-spotlight-grid", this.viewMode === "grid");
    this.listEl.toggleClass("nan-spotlight-list", this.viewMode === "list");

    const entries = await this.loadEntries(this.currentPath);
    if (token !== this.refreshToken) return;

    if (entries.length === 0) {
      const empty = this.listEl.createDiv({ cls: "nan-spotlight-empty" });
      empty.setText("此文件夹为空");
      return;
    }
    for (const entry of entries) {
      this.renderEntry(entry);
    }
  }

  private async loadEntries(path: string): Promise<FileEntry[]> {
    const listPath = path === "" ? "/" : path;
    let list: { files: string[]; folders: string[] };
    try {
      list = await this.app.vault.adapter.list(listPath);
    } catch {
      return [];
    }

    // 注意：adapter.list() 返回的文件夹名带尾部 “/”（如 “Folder/”），
    // 必须去掉，否则拼接出的路径会导致 getAbstractFileByPath 找不到、导航失败。
    const prefix = path === "" ? "" : `${path}/`;
    const baseName = (s: string) => s.replace(/\/+$/, "").split("/").pop() ?? s;

    const folders: FileEntry[] = list.folders
      .filter((f) => !this.isHidden(f))
      .map((f) => {
        const name = baseName(f);
        return { name, path: `${prefix}${name}`, type: "folder" as const };
      });

    const files: FileEntry[] = list.files
      .filter((f) => !this.isHidden(f))
      .map((f) => {
        const name = baseName(f);
        return { name, path: `${prefix}${name}`, type: "file" as const };
      });

    const byName = (a: FileEntry, b: FileEntry) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    folders.sort(byName);
    files.sort(byName);
    return [...folders, ...files];
  }

  private isHidden(name: string): boolean {
    const base = name.replace(/\/$/, "").split("/").pop() ?? "";
    if (base === ".obsidian" || base === ".trash" || base === ".git") return true;
    return false;
  }

  private renderEntry(entry: FileEntry): void {
    const el = this.listEl.createDiv({ cls: "nan-spotlight-file-item" });

    const icon = el.createDiv({ cls: "nan-spotlight-file-icon" });
    if (entry.type === "folder") {
      setIcon(icon, "folder");
    } else {
      setIcon(icon, this.iconForFile(entry.name));
    }

    const nameEl = el.createDiv({ cls: "nan-spotlight-file-name" });
    nameEl.setText(entry.name);
    nameEl.setAttribute("title", entry.path);

    // 单击：高亮选中；快速双击：打开/进入；右键：同样高亮并弹出菜单
    el.addEventListener("click", () => this.selectEntry(el, entry));
    el.addEventListener("dblclick", () => this.onDoubleClick(entry));
    el.addEventListener("contextmenu", (evt) => this.onContextMenu(entry, evt));
  }

  private iconForFile(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "md" || ext === "markdown") return "file-text";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
    if (["pdf", "txt", "doc", "docx", "mp3", "wav", "ogg", "flac", "m4a", "mp4", "mov", "mkv", "webm", "avi"].includes(ext)) return "file-text";
    return "file";
  }

  private selectEntry(el: HTMLElement, entry: FileEntry): void {
    if (this.selectedEl === el) return;
    if (this.selectedEl) this.selectedEl.classList.remove("is-selected");
    this.selectedEl = el;
    this.selectedEntry = entry;
    el.classList.add("is-selected");
  }

  private onDoubleClick(entry: FileEntry): void {
    if (entry.type === "folder") {
      this.setPath(entry.path);
      return;
    }
    const abstract = this.app.vault.getAbstractFileByPath(entry.path);
    if (abstract instanceof TFile) {
      this.onOpenFile(abstract);
    }
  }

  /** 移动到回收站（与原生“删除”一致） */
  private async trashFile(abstract: TAbstractFile): Promise<void> {
    if (typeof this.app.fileManager.trashFile === "function") {
      await this.app.fileManager.trashFile(abstract);
    } else {
      await this.app.vault.trash(abstract, true);
    }
  }

  /** 删除当前选中的文件/文件夹（Delete 键） */
  deleteSelected(): void {
    const entry = this.selectedEntry;
    if (!entry) return;
    const abstract = this.app.vault.getAbstractFileByPath(entry.path);
    if (!abstract) return;
    void this.trashFile(abstract)
      .then(() => void this.refresh())
      .catch((e) => new Notice(`删除失败：${(e as Error).message}`));
  }

  private deleteEntry(abstract: TAbstractFile): void {
    void this.trashFile(abstract)
      .then(() => void this.refresh())
      .catch((e) => new Notice(`删除失败：${(e as Error).message}`));
  }

  /** 行内重命名：直接把文件名变为输入框，无需额外界面 */
  private startRename(el: HTMLElement, abstract: TAbstractFile): void {
    const nameEl = el.querySelector(".nan-spotlight-file-name");
    if (!nameEl) return;

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
    const finish = (commit: boolean) => {
      if (finished) return;
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
      if (!input.isConnected) return;
      input.focus();
      input.setSelectionRange(0, baseName.length);
    }, 0);
  }

  private async applyRename(abstract: TAbstractFile, newName: string, oldName: string): Promise<void> {
    if (newName && newName !== oldName) {
      const parent = abstract.parent ? abstract.parent.path : "";
      const newPath = parent ? `${parent}/${newName}` : newName;
      try {
        await this.app.fileManager.renameFile(abstract, newPath);
      } catch (e) {
        new Notice(`重命名失败：${(e as Error).message}`);
      }
    }
    await this.refresh();
  }

  private onContextMenu(entry: FileEntry, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    // 右键同样高亮选中
    const targetEl = evt.currentTarget as HTMLElement;
    if (targetEl) this.selectEntry(targetEl, entry);

    const abstract = this.app.vault.getAbstractFileByPath(entry.path);
    if (!abstract) return;

    const menu = new Menu();

    // 文件夹：顶部提供“新建笔记/新建文件夹”，与原生文件管理器一致
    if (abstract instanceof TFolder) {
      menu.addItem((item) =>
        item
          .setTitle("新建笔记")
          .setIcon("create-new")
          .onClick(() => this.onNewNote?.(entry.path))
      );
      menu.addItem((item) =>
        item
          .setTitle("新建文件夹")
          .setIcon("folder")
          .onClick(() => this.onNewFolder?.(entry.path))
      );
      menu.addSeparator();
    }

    // 触发原生“文件菜单”事件，得到与原生文件管理器一致的菜单项
    this.app.workspace.trigger(
      "file-menu",
      menu,
      abstract,
      "file-explorer-context-menu",
      this.app.workspace.getLeaf(false)
    );

    // 确保“重命名/删除”始终存在；删除用红色标注
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("重命名").setIcon("pencil").onClick(() => this.startRename(targetEl, abstract))
    );
    menu.addItem((item) =>
      item
        .setTitle("删除")
        .setIcon("trash")
        .setWarning(true)
        .onClick(() => this.deleteEntry(abstract))
    );

    // 追加自定义“收藏”功能
    menu.addSeparator();
    const fav = this.isFavorite?.(entry.path) ?? false;
    menu.addItem((item) =>
      item
        .setTitle(fav ? "从收藏夹移除" : "收藏到收藏夹")
        .setIcon("star")
        .onClick(() => this.toggleFavorite?.(entry.path))
    );

    menu.showAtMouseEvent(evt);
  }

  private onBackgroundContextMenu(evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle("新建笔记")
        .setIcon("create-new")
        .onClick(() => this.onNewNote?.(this.currentPath))
    );
    menu.addItem((item) =>
      item
        .setTitle("新建文件夹")
        .setIcon("folder")
        .onClick(() => this.onNewFolder?.(this.currentPath))
    );
    menu.showAtMouseEvent(evt);
  }
}
