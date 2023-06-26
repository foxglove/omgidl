import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";
import { RawIdlDefinition, RawIdlFieldDefinition, parseIdl } from "@foxglove/omgidl-grammar";

/**
 *
 * @param messageDefinition - ros2idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseRos2idl(messageDefinition: string): MessageDefinition[] {
  return buildRos2idlType(messageDefinition);
}

const ROS2IDL_HEADER = /={80}\nIDL: [a-zA-Z][\w]+(?:\/[a-zA-Z][\w]+)*/g;

function buildRos2idlType(messageDefinition: string): MessageDefinition[] {
  // instead of splitting and reading them in individually we just replace the header to ignore it make it
  // conform to conforming idl and just read it all in a single parse so that we don't have to call parse multiple times
  const idlConformedDef = messageDefinition.replaceAll(ROS2IDL_HEADER, "");

  const results = parseIdl(idlConformedDef);

  const result = results[0] as RawIdlDefinition[];
  const processedResult = postProcessIdlDefinitions(result);
  for (const { definitions } of processedResult) {
    for (const definition of definitions) {
      definition.type = normalizeType(definition.type);
    }
  }

  return processedResult;
}

function postProcessIdlDefinitions(definitions: RawIdlDefinition[]): MessageDefinition[] {
  const finalDefs: MessageDefinition[] = [];
  // Need to update the names of modules and structs to be in their respective namespaces
  for (const definition of definitions) {
    const typedefMap = new Map<string, Partial<RawIdlFieldDefinition>>();
    const constantValueMap = new Map<string, ConstantValue>();
    // build constant and typedef maps
    traverseIdl([definition], (path) => {
      const node = path[path.length - 1] as RawIdlFieldDefinition;
      if (node.definitionType === "typedef") {
        // typedefs must have a name
        const { definitionType: _definitionType, name: _name, ...partialDef } = node;
        typedefMap.set(node.name, partialDef);
      } else if (node.isConstant === true) {
        constantValueMap.set(node.name, node.value);
      }
    });

    // modify ast field nodes in-place to replace typedefs and constants
    // also fix up names to use ros package resource names
    traverseIdl([definition], (path) => {
      const node = path[path.length - 1]!;

      // only run on fields
      if (node.definitionType != undefined) {
        return;
      }
      // replace field definition with corresponding typedef aliased definition
      if (node.type && typedefMap.has(node.type)) {
        Object.assign(node, { ...typedefMap.get(node.type), name: node.name });
      }

      // need to iterate through keys because this can occur on arrayLength, upperBound, arrayUpperBound, value, defaultValue
      for (const [key, constantName] of node.constantUsage ?? []) {
        if (constantValueMap.has(constantName)) {
          (node[key] as ConstantValue) = constantValueMap.get(constantName);
        } else {
          throw new Error(
            `Could not find constant <${constantName}> for field <${
              node.name ?? "undefined"
            }> in <${definition.name}>`,
          );
        }
      }
      delete node.constantUsage;

      if (node.type != undefined) {
        node.type = node.type.replace(/::/g, "/");
      }
    });

    const flattened = flattenIdlNamespaces(definition);
    finalDefs.push(...flattened);
  }
  return finalDefs;
}

/**
 * Iterates through IDL tree and calls `processNode` function on each node.
 * NOTE: Does not process enum members
 */
function traverseIdl(
  path: (RawIdlDefinition | RawIdlFieldDefinition)[],
  processNode: (path: (RawIdlDefinition | RawIdlFieldDefinition)[]) => void,
) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIdl([...path, n], processNode));
  }
  processNode(path);
}

function flattenIdlNamespaces(definition: RawIdlDefinition): MessageDefinition[] {
  const flattened: MessageDefinition[] = [];

  traverseIdl([definition], (path) => {
    const node = path[path.length - 1] as RawIdlDefinition;
    if (node.definitionType === "module") {
      const constantDefs: MessageDefinitionField[] = [];
      for (const def of node.definitions) {
        if (def.definitionType === "typedef") {
          continue;
        }
        // flatten constants into fields
        if ("isConstant" in def && def.isConstant === true) {
          constantDefs.push(def);
        }
      }
      if (constantDefs.length > 0) {
        flattened.push({
          name: path.map((n) => n.name).join("/"),
          definitions: constantDefs,
        });
      }
    } else if (node.definitionType === "struct") {
      // all structs are leaf nodes to be added
      flattened.push({
        name: path.map((n) => n.name).join("/"),
        definitions: node.definitions as MessageDefinitionField[],
      });
    } else if (node.definitionType === "enum") {
      throw new Error("Enums are not supported in ROS 2 IDL");
    }
  });

  return flattened;
}

export function normalizeType(type: string): string {
  // Normalize deprecated aliases
  if (type === "char") {
    return "uint8";
  } else if (type === "byte") {
    return "int8";
  }
  return type;
}
