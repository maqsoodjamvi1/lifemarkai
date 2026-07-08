export interface MinimalGeneratedFile {
  path: string;
  content: string;
  language?: string;
}

type SupportSpec = {
  canonicalName: string;
  language: string;
  content: (path: string) => string;
};

const UI_SUPPORT: Record<string, SupportSpec> = {
  button: {
    canonicalName: "Button",
    language: "typescriptreact",
    content: buttonFile,
  },
  card: {
    canonicalName: "Card",
    language: "typescriptreact",
    content: cardFile,
  },
  badge: {
    canonicalName: "Badge",
    language: "typescriptreact",
    content: badgeFile,
  },
  input: {
    canonicalName: "Input",
    language: "typescriptreact",
    content: inputFile,
  },
  select: {
    canonicalName: "Select",
    language: "typescriptreact",
    content: selectFile,
  },
  dialog: {
    canonicalName: "Dialog",
    language: "typescriptreact",
    content: dialogFile,
  },
  table: {
    canonicalName: "Table",
    language: "typescriptreact",
    content: tableFile,
  },
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function stripExtension(path: string): string {
  return normalizePath(path).replace(/\.(tsx?|jsx?)$/, "");
}

function resolveImport(fromFile: string, spec: string): string | null {
  const clean = spec.trim().replace(/\.(tsx?|jsx?)$/, "");
  if (!clean) return null;
  if (clean.startsWith("@/")) return normalizePath(`src/${clean.slice(2)}`);
  if (clean.startsWith("src/") || clean.startsWith("components/") || clean.startsWith("lib/")) {
    return normalizePath(clean);
  }
  if (!clean.startsWith(".")) return null;

  const base = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const out: string[] = [];
  for (const part of `${base}/${clean}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function addPathVariants(paths: Set<string>, path: string) {
  const clean = normalizePath(path);
  const noExt = stripExtension(clean);
  paths.add(clean);
  paths.add(noExt);
  paths.add(`${noExt}.ts`);
  paths.add(`${noExt}.tsx`);
  paths.add(`${noExt}.js`);
  paths.add(`${noExt}.jsx`);
}

function hasPath(paths: Set<string>, noExtPath: string): boolean {
  const clean = stripExtension(noExtPath);
  return (
    paths.has(clean) ||
    paths.has(`${clean}.ts`) ||
    paths.has(`${clean}.tsx`) ||
    paths.has(`${clean}.js`) ||
    paths.has(`${clean}.jsx`) ||
    paths.has(`${clean}/index.ts`) ||
    paths.has(`${clean}/index.tsx`)
  );
}

function importRecords(file: MinimalGeneratedFile): Array<{ clause: string; spec: string; resolved: string | null }> {
  const records: Array<{ clause: string; spec: string; resolved: string | null }> = [];
  const content = file.content ?? "";
  const fromRe = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(content)) !== null) {
    records.push({
      clause: match[1].trim(),
      spec: match[2],
      resolved: resolveImport(file.path, match[2]),
    });
  }
  const sideEffectRe = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectRe.exec(content)) !== null) {
    records.push({
      clause: "",
      spec: match[1],
      resolved: resolveImport(file.path, match[1]),
    });
  }
  return records;
}

function parseNamedImports(clause: string): string[] {
  const match = clause.match(/\{([^}]+)\}/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((raw) => raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/i)[0]?.trim())
    .filter((name): name is string => /^[A-Za-z_$][\w$]*$/.test(name ?? ""));
}

function findUiSupport(resolved: string): { path: string; spec: SupportSpec } | null {
  const clean = stripExtension(resolved);
  const match = clean.match(/^(src\/)?components\/ui\/([^/]+)$/);
  if (!match) return null;
  const key = match[2].toLowerCase();
  const spec = UI_SUPPORT[key];
  if (!spec) return null;
  return { path: `${clean}.tsx`, spec };
}

function addSupportFile<T extends MinimalGeneratedFile>(
  out: T[],
  paths: Set<string>,
  path: string,
  language: string,
  content: string,
) {
  if (hasPath(paths, path)) return;
  out.push({ path, content, language } as T);
  addPathVariants(paths, path);
}

function collectNeededTypes(files: MinimalGeneratedFile[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    for (const record of importRecords(file)) {
      if (record.resolved !== "src/lib/types" && record.resolved !== "lib/types") continue;
      for (const name of parseNamedImports(record.clause)) names.add(name);
    }
  }
  return [...names].sort();
}

export function ensureCommonGeneratedSupportFiles<T extends MinimalGeneratedFile>(
  files: T[],
  existingFiles: MinimalGeneratedFile[] = [],
): T[] {
  const out = [...files];
  const paths = new Set<string>();
  for (const file of [...existingFiles, ...files]) addPathVariants(paths, file.path);

  for (const file of files) {
    for (const record of importRecords(file)) {
      if (!record.resolved) continue;
      const ui = findUiSupport(record.resolved);
      if (ui) {
        addSupportFile(out, paths, ui.path, ui.spec.language, ui.spec.content(ui.path));
      }
    }
  }

  const neededTypes = collectNeededTypes(files);
  const importsTypes = neededTypes.length > 0 || files.some((file) =>
    importRecords(file).some((record) => record.resolved === "src/lib/types" || record.resolved === "lib/types"),
  );
  if (importsTypes) {
    const typesPath = files.some((file) =>
      importRecords(file).some((record) => record.resolved === "lib/types"),
    ) ? "lib/types.ts" : "src/lib/types.ts";
    addSupportFile(out, paths, typesPath, "typescript", typesFile(neededTypes));
  }

  return out;
}

function joinHelper(name = "cx") {
  return `function ${name}(...values) {
  return values.filter(Boolean).join(" ");
}`;
}

function buttonFile() {
  return `${joinHelper()}

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}) {
  const variants = {
    primary: "bg-slate-950 text-white hover:bg-slate-800 shadow-sm",
    secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}

export default Button;
`;
}

function cardFile() {
  return `${joinHelper()}

export function Card({ className = "", children, ...props }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm", className)} {...props}>{children}</div>;
}

export function CardHeader({ className = "", children, ...props }) {
  return <div className={cx("space-y-1.5 p-6", className)} {...props}>{children}</div>;
}

export function CardTitle({ className = "", children, ...props }) {
  return <div className={cx("text-lg font-semibold leading-none tracking-tight", className)} {...props}>{children}</div>;
}

export function CardContent({ className = "", children, ...props }) {
  return <div className={cx("p-6 pt-0", className)} {...props}>{children}</div>;
}

export function CardFooter({ className = "", children, ...props }) {
  return <div className={cx("flex items-center p-6 pt-0", className)} {...props}>{children}</div>;
}

export default Card;
`;
}

function badgeFile() {
  return `${joinHelper()}

export function Badge({ className = "", variant = "default", children, ...props }) {
  const variants = {
    default: "bg-slate-900 text-white",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    muted: "bg-slate-100 text-slate-600",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", variants[variant], className)} {...props}>{children}</span>;
}

export default Badge;
`;
}

function inputFile() {
  return `${joinHelper()}

export function Input({ className = "", label, error, id, ...props }) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      <input id={inputId} className={cx("h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-950/10 transition focus:ring-4", className)} {...props} />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default Input;
`;
}

function selectFile() {
  return `${joinHelper()}

export function Select({ className = "", label, error, children, ...props }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      <select className={cx("h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-950/10 transition focus:ring-4", className)} {...props}>
        {children}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default Select;
`;
}

function dialogFile() {
  return `${joinHelper()}

export function Dialog({ open = true, title, footer, onClose, className = "", children, ...props }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={cx("w-full max-w-lg rounded-xl bg-white p-6 shadow-xl", className)} {...props}>
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-lg font-semibold text-slate-950">{title}</h2>}
          {onClose && <button className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={onClose}>Close</button>}
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export default Dialog;
`;
}

function tableFile() {
  return `${joinHelper()}

export function Table({ className = "", ...props }) {
  return <table className={cx("w-full border-collapse text-sm", className)} {...props} />;
}

export function THead({ className = "", ...props }) {
  return <thead className={cx("border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500", className)} {...props} />;
}

export function TBody({ className = "", ...props }) {
  return <tbody className={cx("divide-y divide-slate-100", className)} {...props} />;
}

export function TRow({ className = "", ...props }) {
  return <tr className={cx("transition hover:bg-slate-50", className)} {...props} />;
}

export function TCell({ className = "", ...props }) {
  return <td className={cx("px-4 py-3 align-middle", className)} {...props} />;
}

export function THeaderCell({ className = "", ...props }) {
  return <th className={cx("px-4 py-3 font-medium", className)} {...props} />;
}

export default Table;
`;
}

function typesFile(names: string[]) {
  const builtIns = new Set(["EntityId", "EntityRecord", "Status", "CurrencyCode"]);
  const safeNames = names.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && !builtIns.has(name));
  const dynamic = safeNames
    .map((name) => `export type ${name} = EntityRecord;\nexport const ${name} = {};`)
    .join("\n\n");
  return `export type EntityId = string | number;
export const EntityId = "";

export type EntityRecord = Record<string, unknown>;
export const EntityRecord = {};

export type Status = "active" | "inactive" | "pending" | "archived";
export const Status = {};

export type CurrencyCode = "USD" | "EUR" | "GBP" | "PKR";
export const CurrencyCode = "USD";

${dynamic}

const types = {};
export default types;
`;
}
