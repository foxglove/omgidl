# @foxglove/omgidl-serialization

> _OMG IDL message serialization, for reading and writing CDR and XCDR2 messages based on `.idl` schema_

[![npm version](https://img.shields.io/npm/v/@foxglove/omgidl-serialization.svg?style=flat)](https://www.npmjs.com/package/@foxglove/omgidl-serialization)

## MessageReader

Message reader deserializes CDR, XCDR1 and XCDR2 messages into plain objects. The messages are fully deserialized.

```typescript
import { parseIDL } from "@foxglove/omgidl-parser";
import { MessageReader } from "@foxglove/omgidl-serialization";

const msgDef = `
  module geometry_msgs {
    struct PointStamped {
      Header header;
      Point point;
    };
  };
  struct Header {
    uint32 seq;
    Time stamp;
    string frame_id;
  };
  struct Time {
    uint32 sec;
    uint64 nsec;
  };
  struct Point {
    float x;
    float y;
    float z;
  };
`;

const messageDefinition = parseIDL(msgDef);
const reader = new MessageReader("geometry_msgs::PointStamped", messageDefinition);

// deserialize a buffer into an object
const message = reader.readMessage([0x00, 0x01, ...]);

// access message fields
message.header.stamp;
```

## MessageWriter

Convert an object, array, or primitive value into binary data using CDR message serialization. (XCDR1 and XCDR2 writing is not yet supported.)

```Typescript
import { MessageWriter } from "@foxglove/omgidl-serialization";

const msgDef = `
  module geometry_msgs {
    struct PointStamped {
      Header header;
      Point point;
    };
  };
  struct Header {
    uint32 seq;
    Time stamp;
    string frame_id;
  };
  struct Time {
    uint32 sec;
    uint64 nsec;
  };
  struct Point {
    float x;
    float y;
    float z;
  };
`;

const messageDefinition = parseIDL(msgDef);

const writer = new MessageWriter("geometry_msgs::PointStamped", messageDefinition, cdrOptions);

// serialize the passed in object to a Uint8Array as a PointStamped message
const uint8Array = writer.writeMessage({
  header: {
    stamp: { sec: 0, nsec: 0 },
    frame_id: ""
  },
  x: 1,
  y: 0,
  z: 0
});
```

## Known Limitations

`MessageReader` does not support:

- arrays of variable-size arrays. `parseIDL` will error if this is detected in the schema to prevent incorrect deserialization.

`MessageWriter` does not support:

- does not support writing XCDR1 (`PL_CDR`) or XCDR2 (`PL_CDR2`, `DELIMITED_CDR2`) encoded messages utilizing extensible types. However we can deserialize these encapsulation kinds in `MessageReader`.

Both do not support:

- `wchar` and `wstring` - These are written and read using custom implementations that are specific to someone's environment. They are read in by-default as `uint8` chars.

Also see the current IDL parser schema limitations [here](../omgidl-parser/README.md#omg-idl-subset-support)
