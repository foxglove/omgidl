import { CdrWriter, EncapsulationKind } from "@foxglove/cdr";
import { parseIdl } from "@foxglove/omgidl-parser";

import { MessageReader } from "./MessageReader";

const serializeString = (str: string): Uint8Array => {
  const data = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.byteLength + 1, 0);
  return Uint8Array.from([...len, ...data, 0x00]);
};

const float32Buffer = (floats: number[]): Uint8Array => {
  return new Uint8Array(Float32Array.from(floats).buffer);
};

describe("MessageReader", () => {
  it("simple test", () => {
    const msgDef = `module a {
        struct c { int8 status; };
        module b {
          const int8 STATUS_ONE = 1;
          const int8 STATUS_TWO = 2;
        };
      };`;
    const ast = parseIdl(msgDef);
    expect(ast).not.toBeUndefined();
  });
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
      { first: new Uint8Array([0x00, 0xff, 0x80, 0x7f]) },
    ],
    [
      `struct a {uint8 first[2][2];};`,
      "a",
      [0x00, 0xff, 0x80, 0x7f],
      { first: [new Uint8Array([0x00, 0xff]), new Uint8Array([0x80, 0x7f])] },
    ],
    [
      `struct a {uint8 first[2][1];};`,
      "a",
      [0xff, 0x80],
      { first: [new Uint8Array([0xff]), new Uint8Array([0x80])] },
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
    "should deserialize %s",
    (msgDef: string, rootDef: string, arr: Iterable<number>, expected: Record<string, unknown>) => {
      const buffer = Uint8Array.from([0, 1, 0, 0, ...arr]);
      const reader = new MessageReader(rootDef, parseIdl(msgDef));
      const read = reader.readMessage(buffer);

      // check that our message matches the object
      expect(read).toEqual(expected);
    },
  );

  it("should deserialize ros2idl tf2_msg/TFMessage", () => {
    // same buffer as above
    const buffer = Uint8Array.from(
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
    const reader = new MessageReader("geometry_msgs::msg::Transforms", parseIdl(msgDef));
    const read = reader.readMessage(buffer);

    expect(read).toEqual({
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
    });
  });

  it("reads simple mutable struct", () => {
    const msgDef = `
        @mutable
        struct Address {
            octet pointer;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    writer.dHeader(1); // first writes dHeader for struct object - not taken into consideration for objects
    writer.emHeader(true, 1, 1); // then writes emHeader for struct object
    writer.uint8(0x0f); // then writes the octet

    const rootDef = "Address";
    const reader = new MessageReader(rootDef, parseIdl(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({ pointer: 15 });
  });

  it("reads simple nested mutable struct", () => {
    const msgDef = `
        @mutable
        struct Address {
            octet pointer;
        };
        @mutable
        struct Person {
          double heightMeters;
          Address address;
          uint8 age;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      heightMeters: 1.8,
      address: {
        pointer: 15,
      },
      age: 30,
    };

    writer.dHeader(1);
    writer.emHeader(true, 1, 8); // heightMeters emHeader
    writer.float64(data.heightMeters);
    writer.emHeader(true, 2, 4 + 4 + 1); // address emHeader
    // dHeader for inner object not written again because the object size is already specified in the emHeader
    writer.emHeader(true, 1, 1); // pointer emHeader
    writer.uint8(data.address.pointer);
    writer.emHeader(true, 3, 1); // age emHeader
    writer.uint8(data.age);

    const rootDef = "Person";
    const reader = new MessageReader(rootDef, parseIdl(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      heightMeters: 1.8,
      address: { pointer: 15 },
      age: 30,
    });
  });

  it("reads mutable structs with arrays", () => {
    const msgDef = `
        @mutable
        struct Plot {
          string name;
          sequence<double> xValues;
          sequence<double> yValues;
          uint32 count;
        };
    `;

    const writer = new CdrWriter({ size: 256, kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      name: "MPG",
      xValues: [1, 2, 3],
      yValues: [4, 5, 6],
      count: 3,
    };

    writer.dHeader(1);
    writer.emHeader(true, 1, data.name.length + 1); // "name" field emHeader. add 1 for null terminator
    writer.string(data.name, false); // don't write length again
    writer.emHeader(true, 2, 3 * 8); // xValues emHeader
    writer.float64Array(data.xValues, false); // do not write length of array again. Already included in emHeader

    writer.emHeader(true, 3, 3 * 8); // yValues emHeader
    writer.float64Array(data.yValues, false); // do not write length of array again. Already included in emHeader

    writer.emHeader(true, 4, 4); // count emHeader
    writer.uint32(data.count);

    const rootDef = "Plot";
    const reader = new MessageReader(rootDef, parseIdl(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      name: "MPG",
      xValues: new Float64Array([1, 2, 3]),
      yValues: new Float64Array([4, 5, 6]),
      count: 3,
    });
  });

  it("reads multi-dimensional fixed size arrays", () => {
    const msgDef = `
        @mutable
        struct Grid {
          float table[2][3];
        };
    `;

    const data = {
      grid: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    };
    const writer = new CdrWriter({ size: 1028, kind: EncapsulationKind.PL_CDR2_LE });
    writer.emHeader(true, 1, data.grid.length * data.grid[0]!.length * 4); // size of grid
    for (const row of data.grid) {
      writer.float32Array(row, false); // do not write length for fixed-size arrays
    }

    const rootDef = "Grid";
    const reader = new MessageReader(rootDef, parseIdl(msgDef));
    expect(reader.readMessage(writer.data)).toEqual({
      table: [new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])],
    });
  });

  it("reads an empty double (8-byte) array", () => {
    const msgDef = `
        @mutable
        struct Array {
          sequence<double> numbers;
        };
    `;

    const writer = new CdrWriter({ size: 256, kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      numbers: [],
    };

    writer.emHeader(true, 1, data.numbers.length + 4); // writes 4 because the sequence length is after it
    writer.sequenceLength(0);

    const rootDef = "Array";
    const reader = new MessageReader(rootDef, parseIdl(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      numbers: new Float64Array([]),
    });
  });

  it("throws if rootDef is not found", () => {
    const msgDef = `
    struct a { int8 sample; };
    `;
    expect(() => new MessageReader("b", parseIdl(msgDef))).toThrow(/"b" not found/i);
  });

  it("throws when id annotation does not match emHeader", () => {
    const msgDef = `
        @mutable
        struct Address {
            @id(1) octet pointer1;
            @id(2) octet pointer2;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    writer.dHeader(1); // first writes dHeader for struct object - not taken into consideration for objects
    writer.emHeader(true, 1, 1); // then writes emHeader for struct object
    writer.uint8(0x0f); // then writes the octet

    writer.emHeader(true, 3, 1); // write wrong annotation
    writer.uint8(0x0f); // then writes the octet

    const rootDef = "Address";
    const reader = new MessageReader(rootDef, parseIdl(msgDef));

    expect(() => reader.readMessage(writer.data)).toThrow(
      /expected 2 but emheader contained 3 for field "pointer2"/i,
    );
  });
});
