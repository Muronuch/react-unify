import type { ComponentDescriptor } from "../parser/types.js";

export type CategoryName =
  | "form"
  | "list"
  | "card"
  | "modal"
  | "layout"
  | "navigation"
  | "data-display"
  | "input"
  | "other";

export interface ComponentFingerprint {
  component_name: string;
  file_path: string;
  prop_count: number;
  prop_types_sorted: string[];
  hook_names_sorted: string[];
  jsx_tag_bag: string[];
  jsx_depth: number;
  jsx_element_count: number;
  has_list_rendering: boolean;
  has_conditional_rendering: boolean;
  has_state: boolean;
  has_effects: boolean;
  has_data_fetching: boolean;
  has_form: boolean;
  category: CategoryName;
}

export function generateFingerprint(d: ComponentDescriptor): ComponentFingerprint {
  const prop_types_sorted = [...d.props.map((p) => p.type)].sort();
  const hook_names_sorted = [...d.hooks.map((h) => h.hook)].sort();
  const jsx_tag_bag = [...d.jsx_tree.map((n) => n.tag)].sort();
  const has_list_rendering = d.jsx_tree.some((n) => n.has_map);
  const has_conditional_rendering = d.jsx_tree.some((n) => n.has_conditional);
  const fetchHookNames = ["useQuery", "useSWR", "useMutation", "useFetch"];
  const has_data_fetching =
    d.hooks.some((h) => fetchHookNames.includes(h.hook)) ||
    d.imports.some((m) => m === "axios" || m.includes("react-query") || m.includes("@tanstack/react-query") || m.includes("swr")) ||
    /\bfetch\s*\(/.test(d.source_code);
  const has_form =
    d.hooks.some((h) => h.hook === "useForm") ||
    d.jsx_tree.some((n) => n.tag === "form") ||
    d.jsx_tree.filter((n) => n.tag === "input" || n.tag === "select" || n.tag === "textarea").length >= 2;
  return {
    component_name: d.component_name,
    file_path: d.file_path,
    prop_count: d.props.length,
    prop_types_sorted,
    hook_names_sorted,
    jsx_tag_bag,
    jsx_depth: d.jsx_depth,
    jsx_element_count: d.jsx_element_count,
    has_list_rendering,
    has_conditional_rendering,
    has_state: d.has_state,
    has_effects: d.has_effects,
    has_data_fetching,
    has_form,
    category: detectCategory({ jsx_tag_bag, has_list_rendering, has_form, hook_names_sorted, jsx_tree: d.jsx_tree, jsx_element_count: d.jsx_element_count }),
  };
}

interface CategoryInput {
  jsx_tag_bag: string[];
  has_list_rendering: boolean;
  has_form: boolean;
  hook_names_sorted: string[];
  jsx_tree: import("../parser/types.js").JsxTreeNode[];
  jsx_element_count: number;
}

function detectCategory(i: CategoryInput): CategoryName {
  const tags = new Set(i.jsx_tag_bag.map((t) => t.toLowerCase()));
  if (i.has_form || tags.has("form")) return "form";
  if (tags.has("dialog") || i.jsx_tag_bag.some((t) => /modal|dialog|backdrop|overlay/i.test(t))) return "modal";
  if (tags.has("nav") || tags.has("link") || i.hook_names_sorted.includes("useRouter")) return "navigation";
  if (i.has_list_rendering) return "list";
  if (tags.has("table") || tags.has("chart") || /chart|graph|table/.test([...tags].join(" "))) return "data-display";
  if (i.jsx_element_count <= 2 && (tags.has("input") || tags.has("select") || tags.has("textarea"))) return "input";
  if (i.jsx_element_count >= 3 && i.jsx_element_count <= 8 && tags.has("div")) return "card";
  if (tags.has("section") || tags.has("main") || tags.has("aside")) return "layout";
  return "other";
}
