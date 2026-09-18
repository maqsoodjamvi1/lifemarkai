import ts from "typescript";

/** Parse the returned element so arrows and `>` inside props cannot hide a key. */
export function missingMapJsxKeys(source: string) {
  const file = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const results: Array<{ callback: ts.ArrowFunction; element: ts.JsxOpeningElement | ts.JsxSelfClosingElement; file: ts.SourceFile }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map") {
      const callback = node.arguments[0];
      if (callback && ts.isArrowFunction(callback)) {
        let body = callback.body;
        while (ts.isParenthesizedExpression(body)) body = body.expression;
        const element = ts.isJsxElement(body) ? body.openingElement : ts.isJsxSelfClosingElement(body) ? body : null;
        if (element && !element.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(file) === "key")) {
          results.push({ callback, element, file });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return results;
}
