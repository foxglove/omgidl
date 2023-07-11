import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";
import { RawIdlDefinition, AnyIDLNode, StructMemberNode } from "@foxglove/omgidl-grammar";

const SIMPLE_TYPES = new Set([
  "bool",
  "char",
  "byte",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "string",
]);

/** Class used for processing and resolving raw IDL node definitions */
export class IDLNodeProcessor {
  definitions: RawIdlDefinition[];
  map: Map<string, AnyIDLNode>;
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

        this.map.set(toScopedIdentifier(namePath), node);
        // expand enums into constants for usage downstream
        if (node.declarator === "enum") {
          const enumConstants = node.enumerators.map((m: string, i: number) => ({
            declarator: "const" as const,
            isConstant: true as const,
            name: m,
            type: "uint32",
            value: i as ConstantValue,
            isComplex: false,
          }));
          for (const constant of enumConstants) {
            this.map.set(toScopedIdentifier([...namePath, constant.name]), constant);
          }
        }
      });
    }
  }

  /** Resolve enum types to uint32 */
  resolveEnumTypes(): void {
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (
        node.declarator !== "typedef" &&
        node.declarator !== "struct-member" &&
        node.declarator !== "const"
      ) {
        continue;
      }
      const type = node.type;
      if (SIMPLE_TYPES.has(type)) {
        continue;
      }
      const typeNode = resolveScopedOrLocalNodeReference({
        usedIdentifier: type,
        scopedIdentifierOfUsageNode: scopedIdentifier,
        definitionMap: this.map,
      });
      if (!typeNode) {
        throw new Error(
          `Could not find type <${type}> for field <${node.name ?? "undefined"}> in <${node.name}>`,
        );
      }
      if (typeNode.declarator === "enum") {
        this.map.set(scopedIdentifier, { ...node, type: "uint32", isComplex: false });
      }
    }
  }

  resolveConstants(): void {
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (
        node.declarator !== "struct-member" &&
        node.declarator !== "typedef" &&
        node.declarator !== "const"
      ) {
        continue;
      }
      // need to iterate through keys because this can occur on arrayLength, upperBound, arrayUpperBound, value, defaultValue
      for (const [key, constantName] of node.constantUsage ?? []) {
        const constantNode = resolveScopedOrLocalNodeReference({
          usedIdentifier: constantName,
          scopedIdentifierOfUsageNode: scopedIdentifier,
          definitionMap: this.map,
        });
        // need to make sure we are updating the most up to date node
        const possiblyUpdatedNode = this.map.get(scopedIdentifier)!;
        if (constantNode != undefined && constantNode.declarator === "const") {
          this.map.set(scopedIdentifier, { ...possiblyUpdatedNode, [key]: constantNode.value });
        } else {
          throw new Error(
            `Could not find constant <${constantName}> for field <${
              possiblyUpdatedNode.name ?? "undefined"
            }> in <${scopedIdentifier}>`,
          );
        }
      }
    }
  }

  /**  Resolve typedefs that reference structs as complex*/
  resolveTypeDefs(): void {
    // assume that typedefs can't reference other typedefs
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (node.declarator !== "typedef") {
        continue;
      }
      const type = node.type;
      if (SIMPLE_TYPES.has(type)) {
        continue;
      }
      const typeNode = resolveScopedOrLocalNodeReference({
        usedIdentifier: type,
        scopedIdentifierOfUsageNode: scopedIdentifier,
        definitionMap: this.map,
      });
      if (!typeNode) {
        throw new Error(
          `Could not find type <${type}> for field <${node.name ?? "undefined"}> in <${node.name}>`,
        );
      }
      if (typeNode.declarator === "typedef") {
        // To fully support this we would need to either make multiple passes or recursively resolve typedefs
        throw new Error(
          `We do not support typedefs that reference other typedefs ${node.name} -> ${typeNode.name}`,
        );
      }
      if (typeNode.declarator === "struct") {
        this.map.set(scopedIdentifier, { ...node, isComplex: true });
      }
    }
  }

  /** Resolve struct-members that refer to complex types as complex */
  resolveComplexTypes(): void {
    // resolve non-primitive struct member types
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (node.declarator !== "struct-member") {
        continue;
      }
      const type = node.type;
      if (SIMPLE_TYPES.has(type)) {
        continue;
      }

      const typeNode = resolveScopedOrLocalNodeReference({
        usedIdentifier: type,
        scopedIdentifierOfUsageNode: scopedIdentifier,
        definitionMap: this.map,
      });
      if (!typeNode) {
        throw new Error(
          `Could not find type <${type}> for field <${node.name ?? "undefined"}> in <${node.name}>`,
        );
      }
      if (typeNode.declarator === "typedef") {
        // apply typedef definition to struct member
        const { declarator: _d, name: _name, ...partialDef } = typeNode;
        this.map.set(scopedIdentifier, { ...node, ...partialDef });
      } else if (typeNode.declarator === "struct") {
        this.map.set(scopedIdentifier, { ...node, isComplex: true });
      } else {
        throw new Error(
          `Unexpected type <${typeNode.declarator}> for  <${node.name}>. Must be typedef or struct`,
        );
      }
    }
  }

  /** Convert to Message Definitions for serialization and usage in foxglove studio's Raw Message panel. Returned in order of original definitions*/
  toMessageDefinitions(): MessageDefinition[] {
    const messageDefinitions: MessageDefinition[] = [];

    // flatten for output to message definition
    // Because the map entries are in original insertion order, they should reflect the original order of the definitions
    // This is important for ros2idl compatibility
    for (const [namespacedName, node] of this.map.entries()) {
      if (node.declarator === "struct") {
        messageDefinitions.push({
          name: namespacedName,
          definitions: node.definitions
            .map((d) =>
              idlNodeToMessageDefinitionField(
                this.map.get(toScopedIdentifier([namespacedName, d.name])) as StructMemberNode,
              ),
            )
            .filter(Boolean) as MessageDefinitionField[],
        });
      } else if (node.declarator === "module") {
        const fieldDefinitions = node.definitions
          .map((d) =>
            idlNodeToMessageDefinitionField(
              this.map.get(toScopedIdentifier([namespacedName, d.name])) as StructMemberNode,
            ),
          )
          .filter(Boolean) as MessageDefinitionField[];
        if (fieldDefinitions.length > 0) {
          messageDefinitions.push({
            name: namespacedName,
            definitions: fieldDefinitions,
          });
        }
      } else if (node.declarator === "enum") {
        const fieldDefinitions = node.enumerators
          .map((e) =>
            idlNodeToMessageDefinitionField(
              this.map.get(toScopedIdentifier([namespacedName, e])) as StructMemberNode,
            ),
          )
          .filter(Boolean) as MessageDefinitionField[];
        if (fieldDefinitions.length > 0) {
          messageDefinitions.push({
            name: namespacedName,
            definitions: fieldDefinitions,
          });
        }
      } else if (node.name === namespacedName) {
        const fieldDefinition = idlNodeToMessageDefinitionField(node);
        if (fieldDefinition) {
          messageDefinitions.push({ name: "", definitions: [fieldDefinition] });
        }
      }
    }

    return messageDefinitions;
  }
}

export function idlNodeToMessageDefinitionField(
  node: AnyIDLNode,
): MessageDefinitionField | undefined {
  if (node.declarator !== "struct-member" && node.declarator !== "const") {
    return undefined;
  }
  const { declarator: _d, constantUsage: _cU, ...messageDefinition } = node;
  return messageDefinition;
}

export function resolveScopedOrLocalNodeReference({
  usedIdentifier,
  scopedIdentifierOfUsageNode,
  definitionMap,
}: {
  usedIdentifier: string;
  scopedIdentifierOfUsageNode: string;
  definitionMap: Map<string, AnyIDLNode>;
}): AnyIDLNode | undefined {
  // If using local un-scoped identifier, it will not be found in the definitions map
  // In this case we try by building up the namespace prefix until we find a match
  let referencedNode = undefined;
  const namespacePrefixes = fromScopedIdentifier(scopedIdentifierOfUsageNode).slice(0, -1); // do not add node name
  const currPrefix: string[] = [];
  do {
    referencedNode = definitionMap.get(toScopedIdentifier([...currPrefix, usedIdentifier]));
    currPrefix.push(namespacePrefixes.shift()!);
  } while (referencedNode == undefined && namespacePrefixes.length > 0);

  return referencedNode;
}

/**
 * Iterates through IDL tree and calls `processNode` function on each node.
 * NOTE: Does not process enum members
 */
function traverseIdl(path: AnyIDLNode[], processNode: (path: AnyIDLNode[]) => void) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIdl([...path, n], processNode));
  }
  processNode(path);
}

function toScopedIdentifier(path: string[]): string {
  return path.join("::");
}

function fromScopedIdentifier(path: string): string[] {
  return path.split("::");
}
