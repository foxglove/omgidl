import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";

import { IDLModuleNode } from "./IDLModuleNode";
import { IDLConstantNode, IDLEnumNode, IDLNode } from "./IDLNode";
import { IDLStructNode } from "./IDLStructNode";
import { RawIdlDefinition, AnyASTNode, IDLMessageDefinition } from "./types";
import { IDLStructMemberNode, IDLTypedefNode } from "./ReferenceTypeNode";

/** Class used for processing and resolving raw IDL node definitions */
export class IDLDefinitionMap {
  definitions: RawIdlDefinition[];
  map: Map<string, IDLNode>;
  firstStructName?: string;

  constructor(definitions: RawIdlDefinition[]) {
    this.definitions = definitions;
    this.map = new Map();
    this.buildMap();
  }

  /** Initializes map of IDL nodes to their scoped namespaces */
  buildMap(): void {
    for (const definition of this.definitions) {
      // build flattened definition map
      traverseIdl([definition], (path) => {
        const node = path[path.length - 1]!;
        const namePath = path.map((n) => n.name);
        const scopePath = namePath.slice(0, -1);

        if (node.declarator in declaratorToMapNodeClass) {
          // @ts-ignore
          const NodeClass = declaratorToMapNodeClass[node.declarator] as typeof IDLNode;
          this.map.set(toScopedIdentifier(namePath), new NodeClass(scopePath, node, this));
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
              this.map.set(
                toScopedIdentifier([...namePath, constant.name]),
                new IDLConstantNode(namePath, constant, this),
              );
            }
          }
        }
      });
    }
  }

  getNode(scopedPath: string[], name: string): IDLNode | undefined {
    return resolveScopedOrLocalNodeReference({
      usedIdentifier: name,
      scopeOfUsage: scopedPath,
      definitionMap: this.map,
    });
  }

  /** Convert to Message Definitions for serialization and usage in foxglove studio's Raw Message panel. Returned in order of original definitions*/
  toIDLMessageDefinitions(): IDLMessageDefinition[] {
    const messageDefinitions: IDLMessageDefinition[] = [];
    const topLevelConstantDefinitions: MessageDefinitionField[] = [];

    // flatten for output to message definition
    // Because the map entries are in original insertion order, they should reflect the original order of the definitions
    // This is important for ros2idl compatibility
    for (const [namespacedName, node] of this.map.entries()) {
      if (node instanceof IDLStructNode) {
        messageDefinitions.push(node.toIDLMessageDefinition());
      } else if (node instanceof IDLModuleNode) {
        const def = node.toIDLMessageDefinition();
        if (def != undefined) {
          messageDefinitions.push(def);
        }
      } else if (node instanceof IDLConstantNode) {
        if (node.scopePath.length === 0) {
          topLevelConstantDefinitions.push(node.toIDLMessageDefinitionField());
        }
      } else if (node instanceof IDLEnumNode) {
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
}

const declaratorToMapNodeClass = {
  ["module"]: IDLModuleNode,
  ["struct"]: IDLStructNode,
  ["const"]: IDLConstantNode,
  ["typedef"]: IDLTypedefNode,
  ["struct-member"]: IDLStructMemberNode,
  // ["union"]: IDLUnionNode,
  ["enum"]: IDLEnumNode,
} as const;

// Removes `annotation` field from the Definition and DefinitionField objects
function toMessageDefinition(idlMsgDef: IDLMessageDefinition): MessageDefinition {
  if (idlMsgDef.aggregatedKind === "union" || idlMsgDef.aggregatedKind === "module") {
    throw new Error(`Unions are not supported in MessageDefinition type`);
  }
  const { definitions, annotations: _a, ...partialDef } = idlMsgDef;
  const fieldDefinitions = definitions.map((def) => {
    const { annotations: _an, arrayLengths, ...partialFieldDef } = def;
    const fieldDef = { ...partialFieldDef };
    if (arrayLengths != undefined) {
      if (arrayLengths.length > 1) {
        throw new Error(`Multi-dimensional arrays are not supported in MessageDefinition type`);
      }
      const [arrayLength] = arrayLengths;

      (fieldDef as MessageDefinitionField).arrayLength = arrayLength;
    }
    return fieldDef;
  });

  return { ...partialDef, definitions: fieldDefinitions };
}

export function resolveScopedOrLocalNodeReference({
  usedIdentifier,
  scopeOfUsage,
  definitionMap,
}: {
  usedIdentifier: string;
  scopeOfUsage: string[];
  definitionMap: Map<string, IDLNode>;
}): IDLNode | undefined {
  // If using local un-scoped identifier, it will not be found in the definitions map
  // In this case we try by building up the namespace prefix until we find a match
  let referencedNode = undefined;
  const namespacePrefixes = [...scopeOfUsage];
  const currPrefix: string[] = [];
  for (;;) {
    const identifierToTry = toScopedIdentifier([...currPrefix, usedIdentifier]);
    referencedNode = definitionMap.get(identifierToTry);
    if (referencedNode != undefined) {
      break;
    }
    if (namespacePrefixes.length === 0) {
      break;
    }
    currPrefix.push(namespacePrefixes.shift()!);
  }

  return referencedNode;
}

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

export function toScopedIdentifier(path: string[]): string {
  return path.join("::");
}

function fromScopedIdentifier(path: string): string[] {
  return path.split("::");
}

/** Used for error messages. Returns "global scope" when there is no parent scoped identifier */
function getParentScopedIdentifier(scopedIdentifier: string): string {
  const path = fromScopedIdentifier(scopedIdentifier);
  if (path.length === 1) {
    return "global scope";
  }
  return toScopedIdentifier(path.slice(0, -1));
}
