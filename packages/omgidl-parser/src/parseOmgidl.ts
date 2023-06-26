import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";
import {
  EnumDefinition,
  RawIdlDefinition,
  RawIdlFieldDefinition,
  parseIdl,
} from "@foxglove/omgidl-grammar";

const SIMPLE_TYPES = new Set([
  "bool",
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

/**
 *
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseOmgidl(messageDefinition: string): MessageDefinition[] {
  return buildOmgidlType(messageDefinition);
}

function buildOmgidlType(messageDefinition: string): MessageDefinition[] {
  const results = parseIdl(messageDefinition);

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
  const enumMap = new Map<string, EnumDefinition>();
  const constantValueMap = new Map<string, ConstantValue>();
  for (const definition of definitions) {
    const typedefMap = new Map<string, Partial<RawIdlFieldDefinition>>();
    // build up enums map first so that it can be used by typedefs
    traverseIdl([definition], (path) => {
      const node = path[path.length - 1];
      if (node == undefined || node.definitionType !== "enum") {
        return;
      }
      const namespacedName = path.map((n) => n.name).join("::");
      enumMap.set(namespacedName, node);
      // set enums into constant value map as well
      node.members.forEach((m: string, i: number) => {
        constantValueMap.set(`${namespacedName}::${m}`, i as ConstantValue);
      });
    });

    // build constant and typedef maps
    traverseIdl([definition], (path) => {
      const node = path[path.length - 1];
      // only run on constants and typedefs
      if (
        node == undefined ||
        node.definitionType === "module" ||
        node.definitionType === "struct" ||
        node.definitionType === "enum"
      ) {
        return;
      }

      if (node.definitionType === "typedef") {
        // typedefs must have a name
        const { definitionType: _definitionType, name: _name, ...partialDef } = node;

        // enum values and types are treated as uint32s so they aren't complex
        if (enumMap.has(node.type ?? "")) {
          partialDef.type = "uint32";
          partialDef.isComplex = false;
        } else if (!SIMPLE_TYPES.has(node.type ?? "")) {
          partialDef.isComplex = true;
        }

        typedefMap.set(node.name, partialDef);
      } else if (node.isConstant === true) {
        constantValueMap.set(node.name, node.value);
      }
    });

    // modify ast field nodes in-place to replace typedefs and constants
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
      if (node.type && enumMap.has(node.type)) {
        Object.assign(node, { type: "uint32", isComplex: false, name: node.name });
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

/**
 * Flattens nested modules down into a single message definition
 * Example: `{ name: "foo", definitions: [{ name: "bar", definitions: [{ name: "baz" }] }] }`
 * becomes `{ name: "foo::bar::baz" } with leaf node definitions`
 *
 */
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
          name: path.map((n) => n.name).join("::"),
          definitions: constantDefs,
        });
      }
    } else if (node.definitionType === "struct") {
      // all structs are leaf nodes to be added
      flattened.push({
        name: path.map((n) => n.name).join("::"),
        definitions: node.definitions as MessageDefinitionField[],
      });
    } else if (node.definitionType === "enum") {
      // enums should be considered as a special syntax for modules filled with constants
      flattened.push({
        name: path.map((n) => n.name).join("::"),
        definitions: node.members.map((m: string, i: number) => ({
          name: m,
          type: "uint32", // enums treated as unsigned longs in OMG IDL spec
          isConstant: true,
          value: i as ConstantValue,
          isComplex: false,
        })) as MessageDefinitionField[],
      });
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
