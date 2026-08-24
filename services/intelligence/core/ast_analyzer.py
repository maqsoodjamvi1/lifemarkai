"""
Real AST-based structural analysis for TS/TSX/JS/JSX, via tree-sitter.

This is the upgrade path code-analyzer.ts explicitly calls out in its own
header comment: "Upgrade path: swap the internals for the TS compiler API
if `typescript` is moved to dependencies." Tree-sitter is the lighter-weight
alternative to embedding the full TS compiler — it doesn't type-check, but
it parses precisely (handles nested braces, template literals, JSX, multi-line
signatures) where the current regex/line heuristics in code-analyzer.ts can
misfire on those same constructs.

Output shape intentionally mirrors code-analyzer.ts's FileAnalysis so the
TypeScript client can treat this as a drop-in richer analyzer.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tree_sitter_languages import get_parser

_EXT_TO_LANG = {
    "ts": "typescript",
    "tsx": "tsx",
    "js": "javascript",
    "jsx": "tsx",  # tsx grammar parses JSX-in-JS fine; javascript grammar does not
    "mjs": "javascript",
    "cjs": "javascript",
}

_FUNCTION_KIND_NODES = {"function_declaration", "generator_function_declaration"}
_CLASS_KIND_NODES = {"class_declaration"}


@dataclass
class SymbolInfo:
    kind: str
    name: str
    line: int
    exported: bool
    signature: str | None = None


@dataclass
class ImportInfo:
    what: str
    source: str
    line: int


@dataclass
class FileAnalysis:
    path: str
    imports: list[ImportInfo] = field(default_factory=list)
    symbols: list[SymbolInfo] = field(default_factory=list)
    default_export: str | None = None
    loc: int = 0


def _lang_for_path(path: str) -> str | None:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return _EXT_TO_LANG.get(ext)


def _text(node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _is_pascal_case(name: str) -> bool:
    return bool(name) and name[0].isupper()


def _classify_value_kind(name: str, value_node, source: bytes) -> str:
    is_fn = value_node is not None and value_node.type in (
        "arrow_function",
        "function",
        "function_expression",
    )
    if not is_fn:
        return "const"
    if name.startswith("use") and len(name) > 3 and name[3].isupper():
        return "hook"
    return "component" if _is_pascal_case(name) else "function"


def analyze_file(path: str, content: str) -> FileAnalysis:
    lang = _lang_for_path(path)
    loc = content.count("\n") + 1
    analysis = FileAnalysis(path=path, loc=loc)
    if lang is None:
        return analysis  # unsupported extension — caller falls back to regex analyzer

    parser = get_parser(lang)
    source = content.encode("utf-8")
    tree = parser.parse(source)
    root = tree.root_node

    def line_of(node) -> int:
        return node.start_point[0] + 1

    def walk_top_level(node, exported: bool):
        for child in node.children:
            if child.type == "export_statement":
                # export default X / export { X } / export const|function|class ...
                default_marker = child.child_by_field_name("value")
                if default_marker is None:
                    # look for the literal `default` token among children
                    has_default = any(c.type == "default" for c in child.children)
                else:
                    has_default = True
                declaration = child.child_by_field_name("declaration")
                if has_default:
                    target = declaration or default_marker
                    if target is not None:
                        if target.type in _FUNCTION_KIND_NODES | _CLASS_KIND_NODES:
                            name_node = target.child_by_field_name("name")
                            if name_node is not None:
                                analysis.default_export = _text(name_node, source)
                        elif target.type == "identifier":
                            analysis.default_export = _text(target, source)
                if declaration is not None:
                    walk_top_level_declaration(declaration, exported=True)
                continue
            walk_top_level_declaration(child, exported)

    def walk_top_level_declaration(node, exported: bool):
        if node.type in _FUNCTION_KIND_NODES:
            name_node = node.child_by_field_name("name")
            if name_node is None:
                return
            name = _text(name_node, source)
            params = node.child_by_field_name("parameters")
            sig = f"function {name}{_text(params, source) if params else '()'}"
            kind = "hook" if name.startswith("use") and len(name) > 3 and name[3].isupper() else (
                "component" if _is_pascal_case(name) else "function"
            )
            analysis.symbols.append(SymbolInfo(kind=kind, name=name, line=line_of(node), exported=exported, signature=sig[:200]))

        elif node.type in _CLASS_KIND_NODES:
            name_node = node.child_by_field_name("name")
            if name_node is None:
                return
            name = _text(name_node, source)
            analysis.symbols.append(SymbolInfo(kind="class", name=name, line=line_of(node), exported=exported))

        elif node.type == "interface_declaration":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                analysis.symbols.append(
                    SymbolInfo(kind="interface", name=_text(name_node, source), line=line_of(node), exported=exported)
                )

        elif node.type == "type_alias_declaration":
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                analysis.symbols.append(
                    SymbolInfo(kind="type", name=_text(name_node, source), line=line_of(node), exported=exported)
                )

        elif node.type in ("lexical_declaration", "variable_declaration"):
            for declarator in node.children:
                if declarator.type != "variable_declarator":
                    continue
                name_node = declarator.child_by_field_name("name")
                value_node = declarator.child_by_field_name("value")
                if name_node is None or name_node.type != "identifier":
                    continue
                name = _text(name_node, source)
                kind = _classify_value_kind(name, value_node, source)
                sig = _text(declarator, source).split("\n")[0].strip()[:200] if value_node else None
                analysis.symbols.append(
                    SymbolInfo(kind=kind, name=name, line=line_of(declarator), exported=exported, signature=sig)
                )

        elif node.type == "import_statement":
            source_node = node.child_by_field_name("source")
            src = _text(source_node, source).strip("'\"") if source_node else ""
            import_clause = next((c for c in node.children if c.type == "import_clause"), None)
            what = _text(import_clause, source) if import_clause else "(side-effect)"
            analysis.imports.append(ImportInfo(what=what, source=src, line=line_of(node)))

    walk_top_level(root, exported=False)
    return analysis


def find_definition(files: list[tuple[str, str]], symbol: str) -> list[dict]:
    hits = []
    for path, content in files:
        a = analyze_file(path, content)
        for s in a.symbols:
            if s.name == symbol:
                hits.append(
                    {
                        "file": path,
                        "line": s.line,
                        "kind": s.kind,
                        "exported": s.exported,
                        "signature": s.signature,
                    }
                )
    return hits
