import { DecodeDebugResult, MessageReader } from "./MessageReader";

type DecodeFailure = Extract<DecodeDebugResult<unknown>, { ok: false }>;

/**
 * `JSON.stringify` replacer that renders decoded values which are otherwise not serializable:
 * BigInts become strings and typed arrays / array buffer views become plain number arrays.
 */
export function debugJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as ArrayLike<number>);
  }
  return value;
}

/**
 * Formats the partial decode state captured by {@link MessageReader.readMessageDebug} into a
 * human-readable report describing how far decoding progressed before the reader threw.
 *
 * @param failure The failing result returned by {@link MessageReader.readMessageDebug}.
 * @returns A multi-line report with the error, the nesting path of types, and the partially-decoded
 * message at each level (the last entry is the type that was being decoded when the error occurred).
 */
export function formatDecodeDebugReport(failure: DecodeFailure): string {
  const lines: string[] = [];
  const offsetText = failure.offset != undefined ? ` at byte offset ${failure.offset}` : "";
  lines.push(`MessageReader failed${offsetText}: ${failure.error.message}`);

  if (failure.stack.length > 0) {
    lines.push("");
    lines.push("Decode path (root -> failure):");
    failure.stack.forEach((frame, depth) => {
      lines.push(`  ${"  ".repeat(depth)}${frame.type}`);
    });

    lines.push("");
    lines.push("Partial decode state (each level, last is where it failed):");
    lines.push(JSON.stringify(failure.stack, debugJsonReplacer, 2));
  } else {
    lines.push("");
    lines.push(
      "No partial decode state was captured (failed before decoding any aggregated type).",
    );
  }

  return lines.join("\n");
}

/** Result of {@link debugReadMessage}. */
export type DebugReadMessageResult<R> =
  | { ok: true; message: R }
  | { ok: false; report: string; failure: DecodeFailure };

/**
 * Convenience debugging wrapper around {@link MessageReader.readMessageDebug}. Decodes `buffer` with
 * `reader`, returning the decoded message on success. On failure it returns a formatted report
 * (see {@link formatDecodeDebugReport}) showing exactly what was decoded before the reader threw, so
 * a test can log the message state at the point of failure.
 *
 * Debugging aid only; this does not change deserialization behavior.
 */
export function debugReadMessage<R = unknown>(
  reader: MessageReader,
  buffer: ArrayBufferView,
): DebugReadMessageResult<R> {
  const result = reader.readMessageDebug<R>(buffer);
  if (result.ok) {
    return { ok: true, message: result.message };
  }
  return { ok: false, report: formatDecodeDebugReport(result), failure: result };
}
