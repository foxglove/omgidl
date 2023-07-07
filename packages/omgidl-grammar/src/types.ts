import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

export type RawIdlDefinition = DefinitionNode;

export type DefinitionNode = ModuleNode | StructNode | EnumNode | ConstantNode | TypeDefNode;

export type DefinitionFieldNode = StructMemberNode | ConstantNode | TypeDefNode;

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
  isConstant?: boolean;
  /**
   * Map of a key on a MessageDefinitionField to the string identifier of the constant used in that field
   * key example: value arrayLength, arrayUpperBound, defaultValue, upperBound
   * This can be used to resolve those string identifiers to their respective values
   */
  constantUsage?: [keyof MessageDefinitionField, string][];
};

export interface ModuleNode extends BaseIDLNode {
  declarator: "module";
  definitions: DefinitionNode[];
}

export interface StructNode extends BaseIDLNode {
  declarator: "struct";
  definitions: StructMemberNode[];
}

export interface ConstantNode extends BaseIDLNode, MessageDefinitionField {
  declarator: "const";
  isConstant: true;
  value: ConstantValue;
}

export interface StructMemberNode extends BaseIDLNode, MessageDefinitionField {
  declarator: "struct-member";
}

export interface TypeDefNode extends BaseIDLNode, MessageDefinitionField {
  declarator: "typedef";
  type: string;
}

export interface EnumNode extends BaseIDLNode {
  declarator: "enum";
  enumerators: string[];
}
