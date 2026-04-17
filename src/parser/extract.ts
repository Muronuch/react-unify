import {
  Project,
  Node,
  SyntaxKind,
  ts,
  type SourceFile,
  type FunctionDeclaration,
  type ArrowFunction,
  type FunctionExpression,
  type ParameterDeclaration,
  type CallExpression,
  type JsxElement,
  type JsxSelfClosingElement,
  type BinaryExpression,
} from "ts-morph";
import path from "node:path";
import type {
  ComponentDescriptor,
  PropField,
  HookUsage,
  JsxTreeNode,
  ExportType,
} from "./types.js";

const EXCLUDED_DIRS = new Set([
  "node_modules", "dist", "build", ".next", "coverage", "__tests__", ".git",
]);

export function extractComponents(
  projectDir: string,
  fileFilter?: string[]
): ComponentDescriptor[] {
  const project = new Project({
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      allowJs: true,
      target: ts.ScriptTarget.ESNext,
      noEmit: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  const globPattern = path
    .join(projectDir, "**/*.{tsx,jsx}")
    .replace(/\\/g, "/");
  project.addSourceFilesAtPaths(globPattern);

  let files = project.getSourceFiles();
  if (fileFilter && fileFilter.length > 0) {
    const want = new Set(fileFilter.map((f) => path.basename(f)));
    files = files.filter((f) => want.has(path.basename(f.getFilePath())));
  }
  files = files.filter((f) =>
    !f.getFilePath().split(/[\\/]/).some((part) => EXCLUDED_DIRS.has(part))
  );

  const out: ComponentDescriptor[] = [];
  for (const file of files) {
    out.push(...extractFromFile(file));
  }
  return out;
}

function extractFromFile(file: SourceFile): ComponentDescriptor[] {
  const results: ComponentDescriptor[] = [];
  const sourceText = file.getFullText();
  const filePath = file.getFilePath();

  for (const decl of findComponentLikeDeclarations(file)) {
    const desc = describeComponent(decl, file, sourceText, filePath);
    if (desc) results.push(desc);
  }
  return results;
}

interface ComponentLike {
  name: string;
  exportType: ExportType;
  param: ParameterDeclaration | undefined;
  body: Node;
  hostNode: Node;
}

function findComponentLikeDeclarations(file: SourceFile): ComponentLike[] {
  const out: ComponentLike[] = [];
  for (const fn of file.getFunctions()) {
    if (returnsJsx(fn)) {
      if (!fn.isDefaultExport() && !fn.isExported()) continue;
      out.push({
        name: fn.getName() ?? "",
        exportType: fn.isDefaultExport() ? "default" : "named",
        param: fn.getParameters()[0],
        body: fn,
        hostNode: fn,
      });
    }
  }
  for (const v of file.getVariableDeclarations()) {
    const init = v.getInitializer();
    if (!init) continue;
    if (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression) {
      const fn = init as ArrowFunction | FunctionExpression;
      if (returnsJsx(fn)) {
        const stmt = v.getVariableStatement();
        const isDefault = !!stmt && stmt.isDefaultExport();
        const isNamed = !!stmt && stmt.isExported();
        if (!isDefault && !isNamed) continue;
        out.push({
          name: v.getName(),
          exportType: isDefault ? "default" : "named",
          param: fn.getParameters()[0],
          body: fn,
          hostNode: v,
        });
      }
    }
  }
  return out.filter((c) => c.name && /^[A-Z]/.test(c.name));
}

function returnsJsx(node: FunctionDeclaration | ArrowFunction | FunctionExpression): boolean {
  let found = false;
  node.forEachDescendant((d) => {
    if (found) return;
    const k = d.getKind();
    if (
      k === SyntaxKind.JsxElement ||
      k === SyntaxKind.JsxSelfClosingElement ||
      k === SyntaxKind.JsxFragment
    ) found = true;
  });
  return found;
}

function describeComponent(
  c: ComponentLike,
  file: SourceFile,
  sourceText: string,
  filePath: string
): ComponentDescriptor | null {
  const props = extractProps(c.param);
  const hooks = extractHooks(c.body);
  const { jsx_tree, jsx_depth, jsx_element_count } = extractJsxTree(c.body);
  const has_state = hooks.some((h) => h.hook === "useState" || h.hook === "useReducer");
  const has_effects = hooks.some((h) => h.hook === "useEffect" || h.hook === "useLayoutEffect");
  const has_context = hooks.some((h) => h.hook === "useContext");
  const has_refs = hooks.some((h) => h.hook === "useRef" || h.hook === "useImperativeHandle");
  const imports = file.getImportDeclarations().map((d) => d.getModuleSpecifierValue());
  const line_count = c.hostNode.getEndLineNumber() - c.hostNode.getStartLineNumber() + 1;
  return {
    file_path: filePath,
    component_name: c.name,
    export_type: c.exportType,
    props,
    hooks,
    jsx_tree,
    jsx_depth,
    jsx_element_count,
    has_state,
    has_effects,
    has_context,
    has_refs,
    imports,
    line_count,
    source_code: sourceText,
  };
}

function extractProps(param: ParameterDeclaration | undefined): PropField[] {
  if (!param) return [];
  const typeNode = param.getTypeNode();
  if (typeNode) {
    const type = param.getType();
    const props: PropField[] = [];
    for (const prop of type.getProperties()) {
      const name = prop.getName();
      const valueDecl = prop.getValueDeclaration();
      const optional = !!valueDecl && Node.isPropertySignature(valueDecl) && valueDecl.hasQuestionToken();
      const propType = valueDecl ? prop.getTypeAtLocation(valueDecl).getText() : "unknown";
      props.push({ name, type: cleanTypeText(propType), optional });
    }
    if (props.length > 0) return props;
  }
  const bindingPattern = param.getNameNode();
  if (Node.isObjectBindingPattern(bindingPattern)) {
    return bindingPattern.getElements().map((el) => ({
      name: el.getName(),
      type: "unknown",
      optional: !!el.getInitializer(),
    }));
  }
  return [];
}

function cleanTypeText(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

function extractHooks(body: Node): HookUsage[] {
  const hooks: HookUsage[] = [];
  body.forEachDescendant((d) => {
    if (d.getKind() === SyntaxKind.CallExpression) {
      const expr = (d as CallExpression).getExpression();
      const name = expr.getText();
      if (/^use[A-Z]/.test(name)) {
        const args = (d as CallExpression).getArguments();
        const args_summary = args.map((a) => truncate(a.getText(), 40)).join(", ");
        hooks.push({ hook: name, args_summary });
      }
    }
  });
  return hooks;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

interface JsxStats {
  jsx_tree: JsxTreeNode[];
  jsx_depth: number;
  jsx_element_count: number;
}

function extractJsxTree(body: Node): JsxStats {
  const tree: JsxTreeNode[] = [];
  let maxDepth = 0;
  let count = 0;
  function walk(node: Node, depth: number): void {
    const k = node.getKind();
    if (k === SyntaxKind.JsxElement || k === SyntaxKind.JsxSelfClosingElement) {
      const tag = getJsxTagName(node);
      let children_count = 0;
      let has_map = false;
      let has_conditional = false;
      if (k === SyntaxKind.JsxElement) {
        const children = (node as JsxElement).getJsxChildren();
        children_count = children.length;
        for (const ch of children) {
          if (containsMap(ch)) has_map = true;
          if (containsConditional(ch)) has_conditional = true;
        }
      }
      tree.push({ tag, children_count, depth, has_map, has_conditional });
      count++;
      if (depth > maxDepth) maxDepth = depth;
      node.forEachChild((c) => walk(c, depth + 1));
      return;
    }
    node.forEachChild((c) => walk(c, depth));
  }
  walk(body, 0);
  return { jsx_tree: tree, jsx_depth: maxDepth, jsx_element_count: count };
}

function getJsxTagName(node: Node): string {
  const k = node.getKind();
  if (k === SyntaxKind.JsxElement) {
    return (node as JsxElement).getOpeningElement().getTagNameNode().getText();
  }
  if (k === SyntaxKind.JsxSelfClosingElement) {
    return (node as JsxSelfClosingElement).getTagNameNode().getText();
  }
  return "Unknown";
}

function containsMap(node: Node): boolean {
  let found = false;
  node.forEachDescendant((d) => {
    if (found) return;
    if (d.getKind() === SyntaxKind.CallExpression) {
      const call = d as CallExpression;
      const expr = call.getExpression();
      if (expr.getText().endsWith(".map")) {
        found = true;
      }
    }
  });
  return found;
}

function containsConditional(node: Node): boolean {
  let found = false;
  node.forEachDescendant((d) => {
    if (found) return;
    const k = d.getKind();
    if (k === SyntaxKind.ConditionalExpression) found = true;
    if (k === SyntaxKind.BinaryExpression) {
      const op = (d as BinaryExpression).getOperatorToken().getText();
      if (op === "&&" || op === "||") found = true;
    }
  });
  return found;
}
