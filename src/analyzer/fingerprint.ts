// src/analyzer/fingerprint.ts
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

export function generateFingerprint(_d: ComponentDescriptor): ComponentFingerprint {
  throw new Error("not implemented");
}
