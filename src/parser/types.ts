export interface PropField {
  name: string;
  type: string;
  optional: boolean;
}

export interface HookUsage {
  hook: string;
  args_summary: string;
}

export interface JsxTreeNode {
  tag: string;
  children_count: number;
  depth: number;
  has_map: boolean;
  has_conditional: boolean;
}

export type ExportType = "default" | "named";

export interface ComponentDescriptor {
  file_path: string;
  component_name: string;
  export_type: ExportType;
  props: PropField[];
  hooks: HookUsage[];
  jsx_tree: JsxTreeNode[];
  jsx_depth: number;
  jsx_element_count: number;
  has_state: boolean;
  has_effects: boolean;
  has_context: boolean;
  has_refs: boolean;
  imports: string[];
  line_count: number;
  source_code: string;
}
