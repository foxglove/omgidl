import { MessageDefinition } from "@foxglove/message-definition";
import { parseIdl } from "@foxglove/omgidl-parser";

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

  for (const def of results) {
    def.name = toRos2ResourceName(def.name!);
    for (const field of def.definitions) {
      field.type = normalizeType(field.type);
    }
  }

  return results;
}

function toRos2ResourceName(name: string): string {
  return name.replaceAll("::", "/");
}

export function normalizeType(type: string): string {
  // Normalize deprecated aliases
  if (type.includes("::")) {
    return toRos2ResourceName(type);
  } else if (type === "char") {
    return "uint8";
  } else if (type === "byte") {
    return "int8";
  }
  return type;
}
