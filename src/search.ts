import { App, TFile, TFolder, getAllTags } from "obsidian";

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchMatch {
  /** 1 起始的行号；0 表示文件级别的匹配（无具体行） */
  line: number;
  content: string;
  ranges: Array<{ start: number; end: number }>;
}

export interface SearchResult {
  file: TFile | null;
  folder: TFolder | null;
  matches: SearchMatch[];
}

interface ParsedQuery {
  content: string;
  fileFilter: string | null;
  pathFilter: string | null;
  tagFilter: string | null;
  lineFilter: string | null;
  sectionFilter: string | null;
  blockFilter: string | null;
  folderFilter: string | null;
  otherFilter: string | null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(query: string, options: SearchOptions, globalFlag: boolean): RegExp | null {
  try {
    let source = options.regex ? query : escapeRegex(query);
    if (options.wholeWord) {
      source = `\\b(?:${source})\\b`;
    }
    const flags = options.caseSensitive
      ? (globalFlag ? "g" : "")
      : (globalFlag ? "gi" : "i");
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** 将查询按空格分词，但保留双引号内的短语为单个 token */
function tokenizeQuery(query: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    tokens.push(m[1] ?? m[2]);
  }
  return tokens;
}

/** 操作符中英文别名 → 规范操作符 */
const OPERATOR_ALIASES: Record<string, string> = {
  file: "file",
  name: "file",
  文件: "file",
  名称: "file",
  文件名: "file",
  path: "path",
  路径: "path",
  tag: "tag",
  标签: "tag",
  line: "line",
  行: "line",
  section: "section",
  章节: "section",
  小节: "section",
  标题: "section",
  block: "block",
  块: "block",
  段落: "block",
  folder: "folder",
  文件夹: "folder",
  other: "other",
  其他: "other",
};

function parseQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = {
    content: "",
    fileFilter: null,
    pathFilter: null,
    tagFilter: null,
    lineFilter: null,
    sectionFilter: null,
    blockFilter: null,
    folderFilter: null,
    otherFilter: null,
  };

  let content = query;
  const opRe = /([A-Za-z\u4e00-\u9fa5]+):(?:"([^"]*)"|(\S+))/g;
  const ops: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = opRe.exec(query))) {
    const canonical = OPERATOR_ALIASES[m[1]];
    if (!canonical) continue;
    const val = m[2] ?? m[3];
    ops[canonical] = val;
    content = content.replace(m[0], " ");
  }

  parsed.content = content.trim();
  parsed.fileFilter = ops["file"] ?? null;
  parsed.pathFilter = ops["path"] ?? null;
  parsed.tagFilter = ops["tag"] ?? null;
  parsed.lineFilter = ops["line"] ?? null;
  parsed.sectionFilter = ops["section"] ?? null;
  parsed.blockFilter = ops["block"] ?? null;
  parsed.folderFilter = ops["folder"] ?? null;
  parsed.otherFilter = ops["other"] ?? null;
  return parsed;
}

function collectRanges(line: string, patterns: RegExp[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const p of patterns) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(line))) {
      if (m[0].length === 0) {
        p.lastIndex++;
        continue;
      }
      ranges.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === p.lastIndex) p.lastIndex++;
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
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

function computeSectionEligible(lines: string[], pattern: RegExp): boolean[] {
  const eligible = new Array<boolean>(lines.length).fill(false);
  const headings: Array<{ level: number; start: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m) headings.push({ level: m[1].length, start: i });
  }

  for (let h = 0; h < headings.length; h++) {
    const { level, start } = headings[h];
    const text = lines[start].replace(/^#{1,6}\s+/, "");
    if (pattern.test(text)) {
      const next = headings.find((hh, idx) => idx > h && hh.level <= level);
      const end = next ? next.start : lines.length;
      for (let i = start; i < end; i++) eligible[i] = true;
    }
  }
  return eligible;
}

function computeBlockEligible(lines: string[], pattern: RegExp): boolean[] {
  const eligible = new Array<boolean>(lines.length).fill(false);
  let start = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || lines[i].trim() === "") {
      if (i > start) {
        const blockText = lines.slice(start, i).join("\n");
        if (pattern.test(blockText)) {
          for (let j = start; j < i; j++) eligible[j] = true;
        }
      }
      start = i + 1;
    }
  }
  return eligible;
}

async function searchFile(
  app: App,
  file: TFile,
  parsed: ParsedQuery,
  options: SearchOptions
): Promise<SearchMatch[]> {
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");
  const matches: SearchMatch[] = [];

  const contentTokens = tokenizeQuery(parsed.content);
  const contentPatterns = contentTokens
    .map((t) => compilePattern(t, options, true))
    .filter((p): p is RegExp => p !== null);

  let linePattern: RegExp | null = null;
  if (parsed.lineFilter) {
    linePattern = compilePattern(parsed.lineFilter, options, false);
    if (!linePattern) return [];
  }
  let sectionPattern: RegExp | null = null;
  if (parsed.sectionFilter) {
    sectionPattern = compilePattern(parsed.sectionFilter, options, false);
    if (!sectionPattern) return [];
  }
  let blockPattern: RegExp | null = null;
  if (parsed.blockFilter) {
    blockPattern = compilePattern(parsed.blockFilter, options, false);
    if (!blockPattern) return [];
  }

  const sectionEligible = sectionPattern ? computeSectionEligible(lines, sectionPattern) : null;
  const blockEligible = blockPattern ? computeBlockEligible(lines, blockPattern) : null;

  const hasLineSearch = contentPatterns.length > 0 || linePattern !== null;

  for (let i = 0; i < lines.length; i++) {
    if (sectionEligible && !sectionEligible[i]) continue;
    if (blockEligible && !blockEligible[i]) continue;
    const line = lines[i];

    if (!hasLineSearch) continue;

    if (linePattern && !linePattern.test(line)) continue;

    if (contentPatterns.length > 0) {
      const allMatch = contentPatterns.every((p) => {
        p.lastIndex = 0;
        return p.test(line);
      });
      if (!allMatch) continue;
      matches.push({ line: i + 1, content: line, ranges: collectRanges(line, contentPatterns) });
    } else {
      // 只有 line: 过滤，无关键词
      matches.push({ line: i + 1, content: line, ranges: [] });
    }
  }

  if (!hasLineSearch) {
    // 仅 section:/block: 过滤时，存在满足范围的行即视为文件级命中
    const anyEligible = lines.some(
      (_, i) =>
        (sectionEligible ? sectionEligible[i] : true) &&
        (blockEligible ? blockEligible[i] : true)
    );
    if (anyEligible) return [{ line: 0, content: "", ranges: [] }];
    return [];
  }

  return matches;
}

function isHiddenPath(path: string): boolean {
  const segments = path.split("/");
  return segments.some((s) => s === ".obsidian" || s === ".trash" || s === ".git");
}

/** 其他格式（PDF/图片等非 Markdown）文件按文件名搜索 */
function searchOtherFiles(app: App, otherQuery: string, options: SearchOptions): SearchResult[] {
  const files = app.vault
    .getFiles()
    .filter((f) => !isHiddenPath(f.path) && f.extension.toLowerCase() !== "md");
  const q = options.caseSensitive ? otherQuery : otherQuery.toLowerCase();
  const results: SearchResult[] = [];
  for (const file of files) {
    const fullName = options.caseSensitive ? file.name : file.name.toLowerCase();
    const base = options.caseSensitive ? file.basename : file.basename.toLowerCase();
    if (fullName.includes(q) || base.includes(q)) {
      results.push({ file, folder: null, matches: [] });
    }
  }
  return results;
}

/** 文件夹搜索：按文件夹名称/路径匹配 */
function searchFolders(app: App, folderQuery: string, options: SearchOptions): SearchResult[] {
  const folders = app.vault
    .getAllLoadedFiles()
    .filter((f): f is TFolder => f instanceof TFolder)
    .filter((f) => !isHiddenPath(f.path));
  const q = options.caseSensitive ? folderQuery : folderQuery.toLowerCase();
  const results: SearchResult[] = [];
  for (const folder of folders) {
    const name = options.caseSensitive ? folder.name : folder.name.toLowerCase();
    const path = options.caseSensitive ? folder.path : folder.path.toLowerCase();
    if (name.includes(q) || path.includes(q)) {
      results.push({ file: null, folder, matches: [] });
    }
  }
  results.sort((a, b) => a.folder!.path.length - b.folder!.path.length);
  return results;
}

export async function searchVault(
  app: App,
  query: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const parsed = parseQuery(query);

  // 文件夹搜索：folder:/文件夹: 命中后直接在聚焦页打开
  if (parsed.folderFilter) {
    return searchFolders(app, parsed.folderFilter, options);
  }

  // 其他格式搜索：其他:/other: 搜索 PDF 等非 Markdown 文件
  if (parsed.otherFilter) {
    return searchOtherFiles(app, parsed.otherFilter, options);
  }

  // 搜索所有 Obsidian 能识别的文件（含 PDF、图片等非 Markdown 文件）
  const files = app.vault.getFiles().filter((f) => !isHiddenPath(f.path));
  const results: SearchResult[] = [];
  const maxFiles = 500;

  const hasLineSearch = parsed.content !== "" || parsed.lineFilter !== null;
  const hasScopeFilter = parsed.sectionFilter !== null || parsed.blockFilter !== null;

  for (const file of files) {
    const isMarkdown = file.extension.toLowerCase() === "md";

    // file:/path: 过滤（对所有文件生效）
    if (parsed.fileFilter && !file.basename.toLowerCase().includes(parsed.fileFilter.toLowerCase())) {
      continue;
    }
    if (parsed.pathFilter && !file.path.toLowerCase().includes(parsed.pathFilter.toLowerCase())) {
      continue;
    }

    // tag: 过滤（仅 Markdown 有标签）
    if (parsed.tagFilter) {
      if (!isMarkdown) continue;
      const cache = app.metadataCache.getFileCache(file);
      const tags = cache ? getAllTags(cache) ?? [] : [];
      const tag = parsed.tagFilter.startsWith("#") ? parsed.tagFilter : "#" + parsed.tagFilter;
      if (!tags.some((t) => t === tag || t.startsWith(tag + "/"))) continue;
    }

    if (hasLineSearch || hasScopeFilter) {
      // 普通搜索只搜 Markdown 正文；非 Markdown 走 其他:/other: 专用搜索
      if (!isMarkdown) continue;
      const matches = await searchFile(app, file, parsed, options);
      if (matches.length) results.push({ file, folder: null, matches });
    } else {
      // 仅 file:/path: 过滤，无内容搜索 → 所有文件命中
      results.push({ file, folder: null, matches: [] });
    }

    if (results.length >= maxFiles) break;
  }

  return results;
}
