# @foxglove/omgidl-serialization

> _OMGIDL message serialization, for reading and writing CDR and XCDR2 messages based on `.idl` schema_

[![npm version](https://img.shields.io/npm/v/@foxglove/omgidl-serialization.svg?style=flat)](https://www.npmjs.com/package/@foxglove/omgidl-serialization)

## MessageReader

Message reader deserializes CDR and XCDR2 messages into plain objects. The messages are fully deserialized.

```typescript
import { MessageReader } from "@foxglove/omgidl-serialization";

// message definition comes from `parseIdl()` in @foxglove/omgidl-parser
const reader = new MessageReader("PointStamped", messageDefinition);

// deserialize a buffer into an object
const message = reader.readMessage([0x00, 0x01, ...]);

// access message fields
message.header.stamp;
```

## MessageWriter

Convert an object, array, or primitive value into binary data using CDR or XCDR2 message serialization.

```Typescript
import { MessageWriter } from "@foxglove/omgidl-serialization";

// message definition comes from `parseIdl()` in @foxglove/omgidl-parser
const writer = new MessageWriter("PointStamped", pointStampedMessageDefinition, cdrOptions);

// serialize the passed in object to a Uint8Array as a PointStamped message
const uint8Array = writer.writeMessage({
  header: {
    stamp: { sec: 0, nanosec: 0 },
    frame_id: ""
  },
  x: 1,
  y: 0,
  z: 0
});
```
