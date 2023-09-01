import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

/** Internal Types returned by parseIDLToAST
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
export type DefinitionASTNode =
  | ModuleASTNode
  | StructASTNode
  | EnumASTNode
  | ConstantASTNode
  | UnionASTNode
  | TypedefASTNode;

/** Field nodes: these can be fields within a greater struct or module. They all extend MessageDefinitionField. */
export type DefinitionFieldASTNode = StructMemberASTNode | ConstantASTNode | TypedefASTNode;

/** All possible IDL declarator nodes */
export type AnyASTNode =
  | ConstantASTNode
  | StructMemberASTNode
  | ModuleASTNode
  | StructASTNode
  | TypedefASTNode
  | UnionASTNode
  | EnumASTNode;

export interface BaseASTNode {
  declarator: "const" | "typedef" | "struct" | "enum" | "module" | "struct-member" | "union";
  name: string;
  /** Set to true if Node represents a constant value */
  isConstant?: boolean;
  annotations?: Record<string, AnyAnnotation>;
}

/** Node used to represent `module` declarations */
export interface ModuleASTNode extends BaseASTNode {
  declarator: "module";
  /** Definitions contained within the module. Can be `struct`, `const`, `typedef` or `module` */
  definitions: DefinitionASTNode[];
}

/** Node used to represent `struct` declarations */
export interface StructASTNode extends BaseASTNode {
  declarator: "struct";
  /** Members contained in struct declaration in order */
  definitions: StructMemberASTNode[];
}

/** Node used to represent `const` declarations */
export interface ConstantASTNode extends BaseASTNode, UnresolvedField {
  declarator: "const";
  isConstant: true;
  value: ConstantValue | UnresolvedConstantValue;
}

/** Node used to represent `struct-member` declarations */
export interface StructMemberASTNode extends BaseASTNode, UnresolvedField {
  declarator: "struct-member";
}

/** Node used to represent `typedef` declarations */
export interface TypedefASTNode extends BaseASTNode, UnresolvedField {
  declarator: "typedef";
  /** Type identifier used in typedef declaration */
  type: string;
}

/** Node used to represent `enum` declarations */
export interface EnumASTNode extends BaseASTNode {
  declarator: "enum";
  /** Contained enumerator strings in order of declaration */
  enumerators: { name: string; annotations?: Record<string, AnyAnnotation> }[];
}

export type UnresolvedCase = {
  predicates: (UnresolvedConstantValue | number | boolean)[];
  type: UnresolvedField;
};
export interface UnionASTNode extends BaseASTNode {
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
