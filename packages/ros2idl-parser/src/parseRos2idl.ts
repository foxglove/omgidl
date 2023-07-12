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
    def.name = normalizeName(def.name!);
    for (const field of def.definitions) {
      field.type = normalizeName(field.type);
    }
  }

  return results;
}

function toRos2ResourceName(name: string): string {
  return name.replaceAll("::", "/");
}

export function normalizeName(name: string): string {
  // Normalize deprecated aliases
  if (name.includes("::")) {
    return toRos2ResourceName(name);
  }
  return name;
}
