import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

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
  /**
   * Map of a key on a MessageDefinitionField to the string identifier of the constant used in that field
   * key example: value arrayLength, arrayUpperBound, defaultValue, upperBound
   * This can be used to resolve those string identifiers to their respective values
   */
  constantUsage?: [keyof MessageDefinitionField, string][];
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
export interface ConstantNode extends BaseIDLNode, MessageDefinitionField {
  declarator: "const";
  isConstant: true;
  /** literal value that constant represents */
  value: ConstantValue;
}

/** Node used to represent `struct-member` declarations */
export interface StructMemberNode extends BaseIDLNode, MessageDefinitionField {
  declarator: "struct-member";
}

/** Node used to represent `typedef` declarations */
export interface TypeDefNode extends BaseIDLNode, MessageDefinitionField {
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
