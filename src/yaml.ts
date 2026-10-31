/**
 * A strict subset of YAML, enough for a field spec and nothing more: nested maps,
 * lists of maps or scalars, `[a, b]` flow lists, quoted strings, numbers, booleans,
 * null and `#` comments. Anchors, multi-line strings and flow maps are rejected
 * rather than misread.
 */
export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

interface Line {
  indent: number;
  text: string;
  no: number;
}

export class YamlError extends Error {
  constructor(message: string, line?: number) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = "YamlError";
  }
}

export function parseYaml(source: string): YamlValue {
  const lines: Line[] = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*\t/.test(raw)) throw new YamlError("tabs are not allowed for indentation", i + 1);
    const text = stripComment(raw).trimEnd();
    if (text.trim()) lines.push({ indent: text.length - text.trimStart().length, text: text.trim(), no: i + 1 });
  });
  if (!lines.length) return null;
  const [value, next] = parseBlock(lines, 0, lines[0]!.indent);
  if (next < lines.length) throw new YamlError("unexpected content", lines[next]!.no);
  return value;
}

function parseBlock(lines: Line[], i: number, indent: number): [YamlValue, number] {
  return isListItem(lines[i]!.text) ? parseList(lines, i, indent) : parseMap(lines, i, indent);
}

function parseList(lines: Line[], i: number, indent: number): [YamlValue[], number] {
  const items: YamlValue[] = [];
  while (i < lines.length && lines[i]!.indent === indent && isListItem(lines[i]!.text)) {
    const line = lines[i]!;
    const rest = line.text.slice(1).trimStart();
    if (UNSUPPORTED.test(rest)) throw new YamlError(`unsupported YAML syntax: ${rest}`, line.no);
    if (!rest) {
      const child = lines[i + 1];
      if (!child || child.indent <= indent) throw new YamlError("empty list item", line.no);
      const [value, next] = parseBlock(lines, i + 1, child.indent);
      items.push(value);
      i = next;
    } else if (MAP_ENTRY.test(rest)) {
      // "- key: value" opens a map whose keys sit where "key" starts.
      const inner = indent + (line.text.length - rest.length);
      const copy = [...lines];
      copy[i] = { indent: inner, text: rest, no: line.no };
      const [value, next] = parseMap(copy, i, inner);
      items.push(value);
      i = next;
    } else {
      items.push(scalar(rest, line.no));
      i++;
    }
  }
  return [items, i];
}

const MAP_ENTRY = /^("[^"]*"|'[^']*'|[^\s"'#][^:]*?):(\s|$)/;
/** Flow maps, anchors, aliases, block scalars, tags and directives: refused wherever they start. */
const UNSUPPORTED = /^[{&*|>!%@`]/;

function parseMap(lines: Line[], i: number, indent: number): [{ [key: string]: YamlValue }, number] {
  const map: { [key: string]: YamlValue } = {};
  while (i < lines.length && lines[i]!.indent >= indent) {
    const line = lines[i]!;
    if (line.indent > indent) throw new YamlError("unexpected indentation", line.no);
    if (isListItem(line.text)) break;
    if (UNSUPPORTED.test(line.text)) throw new YamlError(`unsupported YAML syntax: ${line.text}`, line.no);
    const match = MAP_ENTRY.exec(line.text);
    if (!match) throw new YamlError(`expected "key: value", got "${line.text}"`, line.no);
    const key = unquote(match[1]!.trim());
    if (key in map) throw new YamlError(`duplicate key "${key}"`, line.no);
    const raw = line.text.slice(match[0].length).trim();
    const child = lines[i + 1];
    if (raw) {
      map[key] = scalar(raw, line.no);
      i++;
    } else if (child && (child.indent > indent || (child.indent === indent && isListItem(child.text)))) {
      const [value, next] = parseBlock(lines, i + 1, child.indent);
      map[key] = value;
      i = next;
    } else {
      map[key] = null;
      i++;
    }
  }
  return [map, i];
}

function scalar(raw: string, no: number): YamlValue {
  if (raw.startsWith("[")) {
    if (!raw.endsWith("]")) throw new YamlError("unterminated flow list", no);
    const body = raw.slice(1, -1).trim();
    return body ? splitFlow(body, no).map((item) => scalar(item, no)) : [];
  }
  if (/^["']/.test(raw)) {
    if (raw.length < 2 || raw.at(-1) !== raw[0]) throw new YamlError("unterminated string", no);
    // "a" "b" starts and ends with a quote but is two strings, not one.
    const body = raw.slice(1, -1);
    const stray = raw[0] === '"' ? /(^|[^\\])"/.test(body) : /'/.test(body.replace(/''/g, ""));
    if (stray) throw new YamlError(`text after a closing quote: ${raw}`, no);
    return unquote(raw);
  }
  if (UNSUPPORTED.test(raw)) throw new YamlError(`unsupported YAML syntax: ${raw}`, no);
  if (raw === "true" || raw === "false") return raw === "true";
  if (raw === "null" || raw === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function splitFlow(body: string, no: number): string[] {
  const items: string[] = [];
  let current = "";
  let quote = "";
  let closed = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quote) {
      current += ch;
      if (quote === '"' && ch === "\\" && i + 1 < body.length) current += body[++i];
      else if (ch === quote) [quote, closed] = ["", true];
    } else if ((ch === '"' || ch === "'") && current.trim() === "") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current.trim());
      [current, closed] = ["", false];
    } else if (closed && !/\s/.test(ch)) {
      // ["No Answer" "Gatekeeper"]: a missing comma would merge two options into one.
      throw new YamlError("expected a comma after a quoted item in flow list", no);
    } else {
      current += ch;
    }
  }
  if (quote) throw new YamlError("unterminated string in flow list", no);
  items.push(current.trim());
  // "[a, , b]" or "[a, b,]": an empty item would become an empty option downstream.
  if (items.some((item) => item === "")) throw new YamlError("empty item in flow list", no);
  return items;
}

function unquote(text: string): string {
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1).replace(/\\"/g, '"');
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

function isListItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

/**
 * Removes a trailing `# comment`. A quote only opens a quoted string when it starts a
 * scalar (at the start of the line, or after `:`, `-`, `[` or `,`); in the middle of
 * a plain value, as in `Owner's Name` or `5" pipe`, it is just a character.
 */
function stripComment(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (quote === '"' && ch === "\\") i++; // an escaped quote does not close the string
      else if (ch === quote) quote = "";
    } else if ((ch === '"' || ch === "'") && startsScalar(line, i)) {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function startsScalar(line: string, index: number): boolean {
  const before = line.slice(0, index).trimEnd();
  return before === "" || /[:\-[,]$/.test(before);
}
