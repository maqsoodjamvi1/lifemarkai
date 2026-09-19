import ts from "typescript";

/** Repair known invalid icon names while preserving the component's local binding. */
export function normalizeLucideImports(content: string): string {
  if (!content.includes("lucide-react") || !content.includes("Contacts")) return content;
  const source = ts.createSourceFile("file.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "lucide-react" || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      if (specifier.isTypeOnly || (specifier.propertyName ?? specifier.name).text !== "Contacts") continue;
      edits.push({ start: specifier.getStart(source), end: specifier.end, text: `Contact as ${specifier.name.text}` });
    }
  }
  for (const edit of edits.reverse()) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  return content;
}
