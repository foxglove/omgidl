import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";

import { RawIdlDefinition, AnyIDLNode, ConstantNode } from "./types";

const numericTypeMap: Record<string, string> = {
  "unsigned short": "uint16",
  "unsigned long": "uint32",
  "unsigned long long": "uint64",
  short: "int16",
  long: "int32",
  "long long": "int64",
  double: "float64",
  float: "float32",
  octet: "uint8",
  wchar: "uint8",
  char: "uint8",
  byte: "int8",
};

const SIMPLE_TYPES = new Set([
  "bool",
  "string",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  ...Object.keys(numericTypeMap),
]);

const POSSIBLE_UNRESOLVED_MEMBERS = [
  "arrayLength",
  "upperBound",
  "arrayUpperBound",
  "value",
] as const;

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
            type: "unsigned long",
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
        this.map.set(scopedIdentifier, { ...node, type: "unsigned long", isComplex: false });
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
      for (const key of POSSIBLE_UNRESOLVED_MEMBERS) {
        const value = node[key];
        if (typeof value !== "object") {
          continue;
        }
        const constantNode = this.resolveConstantReference({
          constantName: value.name,
          nodeScopedIdentifier: scopedIdentifier,
        });
        // need to make sure we are updating the most up to date node
        // guaranteed to exist since it's the one we are iterating over
        const possiblyUpdatedNode = this.map.get(scopedIdentifier)!;
        this.map.set(scopedIdentifier, {
          ...possiblyUpdatedNode,
          [key]: constantNode.value,
        });
      }
    }
  }

  private resolveConstantReference({
    constantName,
    nodeScopedIdentifier,
  }: {
    constantName: string;
    nodeScopedIdentifier: string;
  }): ConstantNode {
    const constantNode = resolveScopedOrLocalNodeReference({
      usedIdentifier: constantName,
      scopedIdentifierOfUsageNode: nodeScopedIdentifier,
      definitionMap: this.map,
    });
    // need to make sure we are updating the most up to date node
    if (!constantNode || constantNode.declarator !== "const") {
      throw new Error(
        `Could not find constant <${constantName}> used in <${nodeScopedIdentifier}>`,
      );
    }
    return constantNode;
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
        const {
          declarator: _d,
          name: _name,
          annotations: typedefAnnotations,
          ...partialDef
        } = typeNode;

        this.map.set(scopedIdentifier, {
          ...node,
          ...partialDef,
          annotations: { ...typedefAnnotations, ...node.annotations },
        });
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
    const topLevelConstantDefinitions: MessageDefinitionField[] = [];

    // flatten for output to message definition
    // Because the map entries are in original insertion order, they should reflect the original order of the definitions
    // This is important for ros2idl compatibility
    for (const [namespacedName, node] of this.map.entries()) {
      if (node.declarator === "struct") {
        messageDefinitions.push({
          name: namespacedName,
          definitions: node.definitions
            .map((def) =>
              this.idlNodeToMessageDefinitionField(toScopedIdentifier([namespacedName, def.name])),
            )
            .filter(Boolean) as MessageDefinitionField[],
        });
      } else if (node.declarator === "module") {
        const fieldDefinitions = node.definitions
          .map((def) =>
            this.idlNodeToMessageDefinitionField(toScopedIdentifier([namespacedName, def.name])),
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
          .map((enumMember) =>
            this.idlNodeToMessageDefinitionField(toScopedIdentifier([namespacedName, enumMember])),
          )
          .filter(Boolean) as MessageDefinitionField[];
        if (fieldDefinitions.length > 0) {
          messageDefinitions.push({
            name: namespacedName,
            definitions: fieldDefinitions,
          });
        }
      } else if (node.name === namespacedName && node.isConstant === true) {
        // handles top-level constants that aren't within a module
        const fieldDefinition = this.idlNodeToMessageDefinitionField(node.name);
        if (fieldDefinition) {
          topLevelConstantDefinitions.push(fieldDefinition);
        }
      }
    }

    if (topLevelConstantDefinitions.length > 0) {
      messageDefinitions.push({ name: "", definitions: topLevelConstantDefinitions });
    }

    return messageDefinitions;
  }

  private idlNodeToMessageDefinitionField(
    nodeScopedIdentifier: string,
  ): MessageDefinitionField | undefined {
    const node = this.map.get(nodeScopedIdentifier);
    if (!node) {
      return undefined;
    }
    if (node.declarator !== "struct-member" && node.declarator !== "const") {
      return undefined;
    }
    const {
      declarator: _d,
      arrayLength,
      arrayUpperBound,
      upperBound,
      value,
      annotations,
      ...partialMessageDef
    } = node;

    if (
      typeof arrayUpperBound === "object" ||
      typeof arrayLength === "object" ||
      typeof upperBound === "object" ||
      typeof value === "object"
    ) {
      throw Error(`Constants not resolved for ${nodeScopedIdentifier}`);
    }

    const fullMessageDef = {
      ...partialMessageDef,
      type: normalizeType(partialMessageDef.type),
    } as MessageDefinitionField;

    // avoid writing undefined to object fields
    if (arrayLength != undefined) {
      fullMessageDef.arrayLength = arrayLength;
    }
    if (arrayUpperBound != undefined) {
      fullMessageDef.arrayUpperBound = arrayUpperBound;
    }
    if (upperBound != undefined) {
      fullMessageDef.upperBound = upperBound;
    }
    if (value != undefined) {
      fullMessageDef.value = value;
    }

    const maybeDefault = annotations?.default;
    if (maybeDefault && maybeDefault.type !== "no-params") {
      const defaultValue =
        maybeDefault.type === "const-param" ? maybeDefault.value : maybeDefault.namedParams.value;
      if (typeof defaultValue !== "object") {
        fullMessageDef.defaultValue = defaultValue;
      } else {
        // We need to do resolve this here for now instead of in `resolveConstants`
        // because the annotations could be supplied by a typedef that is not resolved until later
        const defaultValueNode = this.resolveConstantReference({
          constantName: defaultValue.name,
          nodeScopedIdentifier,
        });
        if (typeof defaultValueNode.value === "object") {
          throw new Error(`Did not resolve default value for ${nodeScopedIdentifier}`);
        }
        fullMessageDef.defaultValue = defaultValueNode.value;
      }
    }

    return fullMessageDef;
  }
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

function normalizeType(type: string): string {
  const toType = numericTypeMap[type];
  if (toType != undefined) {
    return toType;
  }
  return type;
}
