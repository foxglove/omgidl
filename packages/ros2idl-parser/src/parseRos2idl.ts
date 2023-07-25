import { MessageDefinition } from "@foxglove/message-definition";
import { parseIdl } from "@foxglove/omgidl-parser";

/**
 * Parses `ros2idl` schema into flattened message definitions for serialization/deserialization.
 * @param messageDefinition - ros2idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseRos2idl(messageDefinition: string): MessageDefinition[] {
  // instead of splitting and reading them in individually we just replace the header to ignore it make it
  // conform to conforming idl and just read it all in a single parse so that we don't have to call parse multiple times
  const idlConformedDef = messageDefinition.replaceAll(ROS2IDL_HEADER, "");

  const results = parseIdl(idlConformedDef);

  for (const def of results) {
    def.name = normalizeName(def.name!);
    for (const field of def.definitions) {
      field.type = normalizeName(field.type);
    }
    // need to correct the builtin_interfaces/msg/Time nanosec field to nsec so that studio can use it
    if (def.name === "builtin_interfaces/msg/Time") {
      for (const field of def.definitions) {
        if (field.name === "nanosec") {
          field.name = "nsec";
        }
      }
    }
  }

  return results;
}

const ROS2IDL_HEADER = /={80}\nIDL: [a-zA-Z][\w]+(?:\/[a-zA-Z][\w]+)*/g;

function toRos2ResourceName(name: string): string {
  return name.replaceAll("::", "/");
}

function normalizeName(name: string): string {
  // Normalize deprecated aliases
  if (name.includes("::")) {
    return toRos2ResourceName(name);
  }
  return name;
}
