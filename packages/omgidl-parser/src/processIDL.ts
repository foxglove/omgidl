import { ConstantValue } from "@foxglove/message-definition";

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

      const newNodes = makeIDLNode(scopePath, node, idlMap);

      idlMap.set(newNodes.scopedIdentifier, newNodes);
      if (node.declarator === "enum") {
        // DDS X-Types spec section 7.3.1.2.1.5: Enumerated Literal Values
        // How C++ does implicit enums is that they will increment after the last explicit enum
        // even if it collides with an existing enum
        // initialize to -1 so that first value is 0
        let prevEnumValue = -1;
        const enumConstants = node.enumerators.flatMap((m) => {
          const enumValue = getValueAnnotation(m.annotations) ?? (++prevEnumValue as ConstantValue);
          if (typeof enumValue !== "number") {
            throw new Error(
              // eslint-disable-next-line @typescript-eslint/no-base-to-string
              `Enum value, ${enumValue?.toString() ?? "undefined"}, assigned to ${node.name}::${
                m.name
              } must be a number`,
            );
          }
          prevEnumValue = enumValue;
          return {
            declarator: "const" as const,
            isConstant: true as const,
            name: m.name,
            type: "unsigned long",
            value: enumValue,
            isComplex: false,
          };
        });
        // Enum scope constants
        for (const constant of enumConstants) {
          const idlConstantNode = new ConstantIDLNode(namePath, constant, idlMap);
          idlMap.set(idlConstantNode.scopedIdentifier, idlConstantNode);
        }
        // enums constants can be referred to by their Enum::VALUE or by their parent module followed by ::VALUE.
        // Ex: Test::Colors::RED or Test::RED
        const moduleLevelNamePath = namePath.slice(0, -1);
        for (const constant of enumConstants) {
          const idlConstantNode = new ConstantIDLNode(moduleLevelNamePath, constant, idlMap);
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

/** Convert to IDL Message Definitions for serialization and compatibility with Foxglove's Raw Message panel. Returned in order of original definitions*/
export function toIDLMessageDefinitions(map: Map<string, AnyIDLNode>): IDLMessageDefinition[] {
  const messageDefinitions: IDLMessageDefinition[] = [];

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
      // Don't need constants for deserialization, all constant usage should be resolved by now.
      // This does not omit enum constants from output because they are added under the enum toIDLMessageDefinition.
    } else if (node.declarator === "enum") {
      messageDefinitions.push(node.toIDLMessageDefinition());
    } else if (node.declarator === "union") {
      messageDefinitions.push(node.toIDLMessageDefinition());
    }
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
    currNode.definitions.forEach((n) => {
      traverseIDL([...path, n], processNode);
    });
  }
  processNode(path);
}
