import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

/** Internal Types returned by parseIdlToAst
 * These types contain unresolved type and constant values.
 */

export type UnresolvedField = Omit<
  MessageDefinitionField,
  "arrayLength" | "upperBound" | "arrayUpperBound" | "value"
> & {
  upperBound?: number | UnresolvedConstantValue;
  arrayUpperBound?: number | UnresolvedConstantValue;
  value?: ConstantValue | UnresolvedConstantValue;
  /** Outermost arrays are first */
  arrayLengths?: (number | UnresolvedConstantValue)[];
};

export type UnresolvedConstantValue = { usesConstant: true; name: string };

/** All possible top-level definitions that can be present in IDL schema */
export type DefinitionAstNode =
  | ModuleAstNode
  | StructAstNode
  | EnumAstNode
  | ConstantAstNode
  | UnionAstNode
  | TypedefAstNode;

/** Field nodes: these can be fields within a greater struct or module. They all extend MessageDefinitionField. */
export type DefinitionFieldAstNode = StructMemberAstNode | ConstantAstNode | TypedefAstNode;

/** All possible IDL declarator nodes */
export type AnyAstNode =
  | ConstantAstNode
  | StructMemberAstNode
  | ModuleAstNode
  | StructAstNode
  | TypedefAstNode
  | UnionAstNode
  | EnumAstNode;

export interface BaseAstNode {
  declarator: "const" | "typedef" | "struct" | "enum" | "module" | "struct-member" | "union";
  name: string;
  /** Set to true if Node represents a constant value */
  isConstant?: boolean;
  annotations?: Record<string, AnyAnnotation>;
}

/** Node used to represent `module` declarations */
export interface ModuleAstNode extends BaseAstNode {
  declarator: "module";
  /** Definitions contained within the module. Can be `struct`, `const`, `typedef` or `module` */
  definitions: DefinitionAstNode[];
}

/** Node used to represent `struct` declarations */
export interface StructAstNode extends BaseAstNode {
  declarator: "struct";
  /** Members contained in struct declaration in order */
  definitions: StructMemberAstNode[];
}

/** Node used to represent `const` declarations */
export interface ConstantAstNode extends BaseAstNode, UnresolvedField {
  declarator: "const";
  isConstant: true;
  value: ConstantValue | UnresolvedConstantValue;
}

/** Node used to represent `struct-member` declarations */
export interface StructMemberAstNode extends BaseAstNode, UnresolvedField {
  declarator: "struct-member";
}

/** Node used to represent `typedef` declarations */
export interface TypedefAstNode extends BaseAstNode, UnresolvedField {
  declarator: "typedef";
  /** Type identifier used in typedef declaration */
  type: string;
}

/** Node used to represent `enum` declarations */
export interface EnumAstNode extends BaseAstNode {
  declarator: "enum";
  /** Contained enumerator strings in order of declaration */
  enumerators: string[];
}

export type UnresolvedCase = {
  predicates: (UnresolvedConstantValue | number | boolean)[];
  type: UnresolvedField;
};
export interface UnionAstNode extends BaseAstNode {
  declarator: "union";
  switchType: string;
  cases: UnresolvedCase[];
  defaultCase?: UnresolvedField;
}

export type AnyAnnotation = AnnotationNamedParams | AnnotationNoParams | AnnotationConstParam;
export interface BaseAnnotation {
  type: "no-params" | "named-params" | "const-param";
  name: string;
}
export interface AnnotationNoParams extends BaseAnnotation {
  type: "no-params";
}
export interface AnnotationNamedParams extends BaseAnnotation {
  type: "named-params";
  namedParams: Record<string, ConstantValue | UnresolvedConstantValue>;
}
export interface AnnotationConstParam extends BaseAnnotation {
  type: "const-param";
  value: ConstantValue | UnresolvedConstantValue;
}
