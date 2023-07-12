import { parseIdl } from "@foxglove/omgidl-parser";

import { MessageWriter } from "./MessageWriter";

const serializeString = (str: string): Uint8Array => {
  const data = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.byteLength + 1, 0);
  return Uint8Array.from([...len, ...data, 0x00]);
};

const float32Buffer = (floats: number[]): Uint8Array => {
  return new Uint8Array(Float32Array.from(floats).buffer);
};

describe("MessageWriter", () => {
  it.each([
    [`struct a {int8 sample; /** lowest */};`, "a", [0x80], { sample: -128 }],
    [`struct a {int8 sample; /** highest */};`, "a", [0x7f], { sample: 127 }],
    [`struct a {uint8 sample; /** lowest */};`, "a", [0x00], { sample: 0 }],
    [`struct a {uint8 sample; /** highest */};`, "a", [0xff], { sample: 255 }],
    [`struct a {int16 sample; /** lowest */};`, "a", [0x00, 0x80], { sample: -32768 }],
    [`struct a {int16 sample; /** highest */};`, "a", [0xff, 0x7f], { sample: 32767 }],
    [`struct a {uint16 sample; /** lowest */};`, "a", [0x00, 0x00], { sample: 0 }],
    [`struct a {uint16 sample; /** highest */};`, "a", [0xff, 0xff], { sample: 65535 }],
    [
      `struct a {int32 sample; /** lowest */};`,
      "a",
      [0x00, 0x00, 0x00, 0x80],
      { sample: -2147483648 },
    ],
    [
      `struct a {int32 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0x7f],
      { sample: 2147483647 },
    ],
    [`struct a {uint32 sample; /** lowest */};`, "a", [0x00, 0x00, 0x00, 0x00], { sample: 0 }],
    [
      `struct a {uint32 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0xff],
      { sample: 4294967295 },
    ],
    [
      `struct a {int64 sample; /** lowest */};`,
      "a",
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80],
      { sample: -9223372036854775808n },
    ],
    [
      `struct a {int64 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f],
      { sample: 9223372036854775807n },
    ],
    [
      `struct a {uint64 sample; /** lowest */};`,
      "a",
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      { sample: 0n },
    ],
    [
      `struct a {uint64 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      { sample: 18446744073709551615n },
    ],
    [`struct a {float sample; };`, "a", float32Buffer([5.5]), { sample: 5.5 }],
    [
      `struct a {double sample; };`,
      "a",
      // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
      new Uint8Array(Float64Array.of(0.123456789121212121212).buffer),
      // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
      { sample: 0.123456789121212121212 },
    ],
    [
      `struct a {sequence<int32> arr; };`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...new Uint8Array(Int32Array.of(3, 7).buffer),
      ],
      { arr: Int32Array.from([3, 7]) },
    ],
    // unaligned access
    [
      `struct a {uint8 blank;sequence<int32> arr;};`,
      "a",
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...new Uint8Array(Int32Array.of(3, 7).buffer),
      ],
      { blank: 0, arr: Int32Array.from([3, 7]) },
    ],
    [
      `struct a {float arr[2];};`,
      "a",
      float32Buffer([5.5, 6.5]),
      { arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {uint8 blank; float arr[2]; };`,
      "a",
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...float32Buffer([5.5, 6.5]),
      ],
      { blank: 0, arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {sequence<float> arr;};`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
      ],
      { arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {uint8 blank; sequence<float> arr;};`,
      "a",
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x02, 0x00, 0x00, 0x00],
        ...float32Buffer([5.5, 6.5]),
      ],
      { blank: 0, arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {sequence<float> first; sequence<float> second;};`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
      ],
      {
        first: Float32Array.from([5.5, 6.5]),
        second: Float32Array.from([5.5, 6.5]),
      },
    ],
    [`struct a {string sample; /** empty string */ };`, "a", serializeString(""), { sample: "" }],
    [
      `struct a {string sample; /** some  string */};`,
      "a",
      serializeString("some string"),
      { sample: "some string" },
    ],
    [
      `struct a {int8 first[4];};`,
      "a",
      [0x00, 0xff, 0x80, 0x7f],
      { first: new Int8Array([0, -1, -128, 127]) },
    ],
    [
      `struct a {sequence<int8> first;};`,
      "a",
      [
        ...[0x04, 0x00, 0x00, 0x00], // length
        0x00,
        0xff,
        0x80,
        0x7f,
      ],
      { first: new Int8Array([0, -1, -128, 127]) },
    ],
    [
      `struct a {uint8 first[4];};`,
      "a",
      [0x00, 0xff, 0x80, 0x7f],
      { first: new Uint8Array([0, -1, -128, 127]) },
    ],
    [
      `struct a {string first[2];};`,
      "a",
      [...serializeString("one"), ...serializeString("longer string")],
      { first: ["one", "longer string"] },
    ],
    [
      `struct a {sequence<string> first;};`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...serializeString("one"),
        ...serializeString("longer string"),
      ],
      { first: ["one", "longer string"] },
    ],
    // first size value after fixed size value
    [`struct a {int8 first; int8 second;};`, "a", [0x80, 0x7f], { first: -128, second: 127 }],
    [
      `struct a {string first; int8 second;};`,
      "a",
      [...serializeString("some string"), 0x80],
      { first: "some string", second: -128 },
    ],
    [
      `
    struct a { custom_type::CustomType custom; };
    module custom_type { struct CustomType { uint8 first; }; };
    `,
      "a",
      [0x02],
      {
        custom: { first: 0x02 },
      },
    ],
    [
      `struct a { custom_type::CustomType custom[3]; };
    module custom_type { struct CustomType {
      uint8 first;
    };};
    `,
      "a",
      [0x02, 0x03, 0x04],
      {
        custom: [{ first: 0x02 }, { first: 0x03 }, { first: 0x04 }],
      },
    ],
    [
      `struct a { sequence<custom_type::CustomType> custom; };
    module custom_type { struct CustomType { uint8 first; }; };`,
      "a",
      [
        ...[0x03, 0x00, 0x00, 0x00], // length
        0x02,
        0x03,
        0x04,
      ],
      {
        custom: [{ first: 0x02 }, { first: 0x03 }, { first: 0x04 }],
      },
    ],
    // ignore constants
    [
      `module a {
        module b {
          const int8 STATUS_ONE = 1;
          const int8 STATUS_TWO = 2;
        };
        struct c { int8 status; };
      };`,
      "a::c",
      [0x02],
      { status: 2 },
    ],
    // An array of custom types which themselves have a custom type
    // This tests an array's ability to properly size custom types
    [
      `
    struct a { sequence<custom_type::CustomType> custom; };
    module custom_type { struct CustomType {
        custom_type::MoreCustom another;
    };};
    module custom_type { struct MoreCustom {
        uint8 field;
    };};`,
      "a",
      [
        ...[0x03, 0x00, 0x00, 0x00], // length
        0x02,
        0x03,
        0x04,
      ],
      {
        custom: [
          { another: { field: 0x02 } },
          { another: { field: 0x03 } },
          { another: { field: 0x04 } },
        ],
      },
    ],
  ])(
    "should serialize %s",
    (msgDef: string, rootDef: string, arr: Iterable<number>, message: Record<string, unknown>) => {
      const expected = Uint8Array.from([0, 1, 0, 0, ...arr]);
      const writer = new MessageWriter(rootDef, parseIdl(msgDef));
      const written = writer.writeMessage(message);

      expect(written).toBytesEqual(expected);
      expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
    },
  );

  it("should serialize a ROS 2 IDL tf2_msgs/TFMessage", () => {
    // same buffer as above
    const expected = Uint8Array.from(
      Buffer.from(
        "0001000001000000286fae6169ddd73108000000747572746c6531000e000000747572746c65315f616865616400000000000000000000000000f03f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f03f",
        "hex",
      ),
    );
    const msgDef = `

module geometry_msgs {
  module msg {
    struct Transforms {
      sequence<geometry_msgs::msg::TransformStamped> transforms;
    };
  };
};

module geometry_msgs {
  module msg {
    struct TransformStamped {
      std_msgs::msg::Header header;
      string child_frame_id; // the frame id of the child frame
      geometry_msgs::msg::Transform transform;
    };
  };
};

module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::Time stamp;
      string frame_id;
    };
  };
};

module geometry_msgs {
  module msg {
    struct Transform {
      geometry_msgs::msg::Vector3 translation;
      geometry_msgs::msg::Quaternion rotation;
    };
  };
};

module geometry_msgs {
  module msg {
    struct Vector3 {
      double x;
      double y;
      double z;
    };
  };
};

module geometry_msgs {
  module msg {
    struct Quaternion {
      double x;
      double y;
      double z;
      double w;
    };
  };
};

// Normally added when generating idl schemas

module builtin_interfaces {
  struct Time {
    int32 sec;
    uint32 nanosec;
  };
};
    `;

    const writer = new MessageWriter("geometry_msgs::msg::Transforms", parseIdl(msgDef));
    const message = {
      transforms: [
        {
          header: {
            stamp: { sec: 1638821672, nanosec: 836230505 },
            frame_id: "turtle1",
          },
          child_frame_id: "turtle1_ahead",
          transform: {
            translation: { x: 1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    };
    const written = writer.writeMessage(message);
    expect(written).toBytesEqual(expected);
    expect(writer.calculateByteSize(message)).toEqual(expected.byteLength);
  });
  it("throws if rootDef is not found", () => {
    const msgDef = `
    struct a { int8 sample; };
    `;
    expect(() => new MessageWriter("b", parseIdl(msgDef))).toThrow(/"b" not found/i);
  });
});
