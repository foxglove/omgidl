import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";

type UnresolvedConstantField = Omit<
  MessageDefinitionField,
  "arrayLength" | "upperBound" | "arrayUpperBound" | "value"
> & {
  arrayLength?: number | ResolveToConstantValue;
  upperBound?: number | ResolveToConstantValue;
  arrayUpperBound?: number | ResolveToConstantValue;
  value?: ConstantValue | ResolveToConstantValue;
};

export type RawIdlDefinition = DefinitionNode;

/** All possible top-level definitions that can be present in IDL schema */
export type DefinitionNode = ModuleNode | StructNode | EnumNode | ConstantNode | TypeDefNode;

/** Field nodes: these can be fields within a greater struct or module. They all extend MessageDefinitionField. */
export type DefinitionFieldNode = StructMemberNode | ConstantNode | TypeDefNode;

/** All possible IDL declarator nodes */
export type AnyIDLNode =
  | ConstantNode
  | StructMemberNode
  | ModuleNode
  | StructNode
  | TypeDefNode
  | EnumNode;

export type BaseIDLNode = {
  declarator: "const" | "typedef" | "struct" | "enum" | "module" | "struct-member";
  name: string;
  /** Set to true if Node represents a constant value */
  isConstant?: boolean;
  annotations?: Record<string, AnyAnnotation>;
};

/** Node used to represent `module` declarations */
export interface ModuleNode extends BaseIDLNode {
  declarator: "module";
  /** Definitions contained within the module. Can be `struct`, `const`, `typedef` or `module` */
  definitions: DefinitionNode[];
}

/** Node used to represent `struct` declarations */
export interface StructNode extends BaseIDLNode {
  declarator: "struct";
  /** Members contained in struct declaration in order */
  definitions: StructMemberNode[];
}

/** Node used to represent `const` declarations */
export interface ConstantNode extends BaseIDLNode, UnresolvedConstantField {
  declarator: "const";
  isConstant: true;
  value: ConstantValue | ResolveToConstantValue;
}

/** Node used to represent `struct-member` declarations */
export interface StructMemberNode extends BaseIDLNode, UnresolvedConstantField {
  declarator: "struct-member";
}

/** Node used to represent `typedef` declarations */
export interface TypeDefNode extends BaseIDLNode, UnresolvedConstantField {
  declarator: "typedef";
  /** Type identifier used in typedef declaration */
  type: string;
}

/** Node used to represent `enum` declarations */
export interface EnumNode extends BaseIDLNode {
  declarator: "enum";
  /** Contained enumerator strings in order of declaration */
  enumerators: string[];
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
  namedParams: Record<string, ConstantValue | ResolveToConstantValue>;
}
export interface AnnotationConstParam extends BaseAnnotation {
  type: "const-param";
  value: ConstantValue | ResolveToConstantValue;
}

type ResolveToConstantValue = { usesConstant: true; name: string };

export type AnnotatedMessageDefinitionField = MessageDefinitionField & {
  annotations?: Record<string, AnyAnnotation>;
};

export type AnnotatedMessageDefinition = Omit<MessageDefinition, "definitions"> & {
  annotations?: Record<string, AnyAnnotation>;
  definitions: AnnotatedMessageDefinitionField[];
};
