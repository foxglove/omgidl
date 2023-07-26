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
    // Modify the definition of builtin_interfaces/msg/Time and Duration so they are interpreted as
    // {sec: number, nsec: number}, compatible with the rest of Studio. The ros2idl builtin types
    // use "nanosec" instead of "nsec".
    if (
      def.name === "builtin_interfaces/msg/Time" ||
      def.name === "builtin_interfaces/msg/Duration"
    ) {
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
