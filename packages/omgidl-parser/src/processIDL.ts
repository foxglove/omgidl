import { ConstantValue, MessageDefinitionField } from "@foxglove/message-definition";

import {
  ConstantIDLNode,
  EnumIDLNode,
  ModuleIDLNode,
  StructIDLNode,
  StructMemberIDLNode,
  TypedefIDLNode,
} from "./IDLNodes";
import { UnionIDLNode } from "./IDLNodes/UnionIDLNode";
import { AnyIDLNode } from "./IDLNodes/interfaces";
import { AnyASTNode, AnyAnnotation, UnresolvedConstantValue } from "./astTypes";
import { IDLMessageDefinition } from "./types";

/** Initializes map of IDL nodes to their scoped namespaces */
export function buildMap(definitions: AnyASTNode[]): Map<string, AnyIDLNode> {
  const idlMap = new Map<string, AnyIDLNode>();
  for (const definition of definitions) {
    // build flattened definition map
    traverseIDL([definition], (path) => {
      const node = path[path.length - 1]!;
      const namePath = path.map((n) => n.name);
      const scopePath = namePath.slice(0, -1);

      const newNode = makeIDLNode(scopePath, node, idlMap);
      idlMap.set(newNode.scopedIdentifier, newNode);
      if (node.declarator === "enum") {
        let nextImplicitIEnumValue = 0;
        const enumConstants = node.enumerators.map((m) => ({
          declarator: "const" as const,
          isConstant: true as const,
          name: m.name,
          type: "unsigned long",
          value: getValueAnnotation(m.annotations) ?? (nextImplicitIEnumValue++ as ConstantValue),
          isComplex: false,
        }));
        for (const constant of enumConstants) {
          const idlConstantNode = new ConstantIDLNode(namePath, constant, idlMap);
          idlMap.set(idlConstantNode.scopedIdentifier, idlConstantNode);
        }
      }
    });
  }
  return idlMap;
}

function getValueAnnotation(
  annotations: Record<string, AnyAnnotation> | undefined,
): UnresolvedConstantValue | ConstantValue | undefined {
  if (!annotations) {
    return undefined;
  }
  const valueAnnotation = annotations["value"];
  if (valueAnnotation && valueAnnotation.type === "const-param") {
    return valueAnnotation.value;
  }
  return undefined;
}

/** Convert to IDL Message Definitions for serialization and compatibility foxglove studio's Raw Message panel. Returned in order of original definitions*/
export function toIDLMessageDefinitions(map: Map<string, AnyIDLNode>): IDLMessageDefinition[] {
  const messageDefinitions: IDLMessageDefinition[] = [];
  const topLevelConstantDefinitions: MessageDefinitionField[] = [];

  // flatten for output to message definition
  // Because the map entries are in original insertion order, they should reflect the original order of the definitions
  // This is important for ros2idl compatibility
  for (const node of map.values()) {
    if (node.declarator === "struct") {
      messageDefinitions.push(node.toIDLMessageDefinition());
    } else if (node.declarator === "module") {
      const def = node.toIDLMessageDefinition();
      if (def != undefined) {
        messageDefinitions.push(def);
      }
    } else if (node.declarator === "const") {
      if (node.scopePath.length === 0) {
        topLevelConstantDefinitions.push(node.toIDLMessageDefinitionField());
      }
    } else if (node.declarator === "enum") {
      messageDefinitions.push(node.toIDLMessageDefinition());
    } else if (node.declarator === "union") {
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

const makeIDLNode = (
  scopePath: string[],
  node: AnyASTNode,
  idlMap: Map<string, AnyIDLNode>,
): AnyIDLNode => {
  switch (node.declarator) {
    case "module":
      return new ModuleIDLNode(scopePath, node, idlMap);
    case "enum":
      return new EnumIDLNode(scopePath, node, idlMap);
    case "const":
      return new ConstantIDLNode(scopePath, node, idlMap);
    case "struct":
      return new StructIDLNode(scopePath, node, idlMap);
    case "struct-member":
      return new StructMemberIDLNode(scopePath, node, idlMap);
    case "typedef":
      return new TypedefIDLNode(scopePath, node, idlMap);
    case "union":
      return new UnionIDLNode(scopePath, node, idlMap);
  }
};

/**
 * Iterates through IDL tree and calls `processNode` function on each node.
 * NOTE: Does not process enum members
 */
function traverseIDL(path: AnyASTNode[], processNode: (path: AnyASTNode[]) => void) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIDL([...path, n], processNode));
  }
  processNode(path);
}
