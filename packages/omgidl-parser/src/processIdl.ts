import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

import {
  ConstantIdlNode,
  EnumIdlNode,
  ModuleIdlNode,
  StructIdlNode,
  StructMemberIdlNode,
  TypedefIdlNode,
} from "./IdlNodes";
import { AnyIdlNode } from "./IdlNodes/interfaces";
import { AnyAstNode } from "./astTypes";
import { IdlMessageDefinition } from "./types";

/** Initializes map of IDL nodes to their scoped namespaces */
export function buildMap(definitions: AnyAstNode[]): Map<string, AnyIdlNode> {
  const idlMap = new Map<string, AnyIdlNode>();
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
export function toIDLMessageDefinitions(map: Map<string, AnyIdlNode>): IdlMessageDefinition[] {
  const messageDefinitions: IdlMessageDefinition[] = [];
  const topLevelConstantDefinitions: MessageDefinitionField[] = [];

  // flatten for output to message definition
  // Because the map entries are in original insertion order, they should reflect the original order of the definitions
  // This is important for ros2idl compatibility
  for (const node of map.values()) {
    if (node.declarator === "struct") {
      messageDefinitions.push(node.toIdlMessageDefinition());
    } else if (node.declarator === "module") {
      const def = node.toIdlMessageDefinition();
      if (def != undefined) {
        messageDefinitions.push(def);
      }
    } else if (node.declarator === "const") {
      if (node.scopePath.length === 0) {
        topLevelConstantDefinitions.push(node.toIdlMessageDefinitionField());
      }
    } else if (node.declarator === "enum") {
      messageDefinitions.push(node.toIdlMessageDefinition());
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

const makeIdlNode = (
  scopePath: string[],
  node: AnyAstNode,
  idlMap: Map<string, AnyIdlNode>,
): AnyIdlNode => {
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
function traverseIdl(path: AnyAstNode[], processNode: (path: AnyAstNode[]) => void) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIdl([...path, n], processNode));
  }
  processNode(path);
}
