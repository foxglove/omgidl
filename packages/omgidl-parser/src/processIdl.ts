import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

import {
  ConstantIdlNode,
  EnumIdlNode,
  IdlNode,
  ModuleIdlNode,
  StructIdlNode,
  StructMemberIdlNode,
  TypedefIdlNode,
} from "./IdlNodes";
import { AnyASTNode, RawIdlDefinition } from "./astTypes";
import { IDLMessageDefinition } from "./types";

/** Initializes map of IDL nodes to their scoped namespaces */
export function buildMap(definitions: RawIdlDefinition[]): Map<string, IdlNode> {
  const idlMap = new Map<string, IdlNode>();
  for (const definition of definitions) {
    // build flattened definition map
    traverseIdl([definition], (path) => {
      const node = path[path.length - 1]!;
      const namePath = path.map((n) => n.name);
      const scopePath = namePath.slice(0, -1);

      const newNode = makeIdlNode(scopePath, node, idlMap);
      idlMap.set(newNode.scopedIdentifier, newNode);
      if (node.declarator === "enum") {
        const enumConstants = node.enumerators.map((m: string, i: number) => ({
          declarator: "const" as const,
          isConstant: true as const,
          name: m,
          type: "unsigned long",
          value: i as ConstantValue,
          isComplex: false,
        }));
        for (const constant of enumConstants) {
          const idlConstantNode = new ConstantIdlNode(namePath, constant, idlMap);
          idlMap.set(idlConstantNode.scopedIdentifier, idlConstantNode);
        }
      }
    });
  }
  return idlMap;
}

/** Convert to IDL Message Definitions for serialization and compatibility foxglove studio's Raw Message panel. Returned in order of original definitions*/
export function toIDLMessageDefinitions(map: Map<string, IdlNode>): IDLMessageDefinition[] {
  const messageDefinitions: IDLMessageDefinition[] = [];
  const topLevelConstantDefinitions: MessageDefinitionField[] = [];

  // flatten for output to message definition
  // Because the map entries are in original insertion order, they should reflect the original order of the definitions
  // This is important for ros2idl compatibility
  for (const node of map.values()) {
    if (node instanceof StructIdlNode) {
      messageDefinitions.push(node.toIDLMessageDefinition());
    } else if (node instanceof ModuleIdlNode) {
      const def = node.toIDLMessageDefinition();
      if (def != undefined) {
        messageDefinitions.push(def);
      }
    } else if (node instanceof ConstantIdlNode) {
      if (node.scopePath.length === 0) {
        topLevelConstantDefinitions.push(node.toIDLMessageDefinitionField());
      }
    } else if (node instanceof EnumIdlNode) {
      messageDefinitions.push(node.toIDLMessageDefinition());
    }
  }
  if (topLevelConstantDefinitions.length > 0) {
    messageDefinitions.push({
      name: "",
      definitions: topLevelConstantDefinitions,
      aggregatedKind: "module",
    });
  }
  return messageDefinitions;
}

const makeIdlNode = (scopePath: string[], node: AnyASTNode, idlMap: Map<string, IdlNode>) => {
  switch (node.declarator) {
    case "module":
      return new ModuleIdlNode(scopePath, node, idlMap);
    case "enum":
      return new EnumIdlNode(scopePath, node, idlMap);
    case "const":
      return new ConstantIdlNode(scopePath, node, idlMap);
    case "struct":
      return new StructIdlNode(scopePath, node, idlMap);
    case "struct-member":
      return new StructMemberIdlNode(scopePath, node, idlMap);
    case "typedef":
      return new TypedefIdlNode(scopePath, node, idlMap);
    default:
      throw new Error(`Unexpected declarator ${node.declarator} in ${node.name}`);
  }
};

/**
 * Iterates through IDL tree and calls `processNode` function on each node.
 * NOTE: Does not process enum members
 */
function traverseIdl(path: AnyASTNode[], processNode: (path: AnyASTNode[]) => void) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIdl([...path, n], processNode));
  }
  processNode(path);
}
