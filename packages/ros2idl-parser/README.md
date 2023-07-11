# @foxglove/ros2idl-parser

> _ROS2IDL message definition parser_

[![npm version](https://img.shields.io/npm/v/@foxglove/ros2idl-parser.svg?style=flat)](https://www.npmjs.com/package/@foxglove/ros2idl-parser)

## Introduction

[The Robot Operating System (ROS)](https://www.ros.org/) defines a [supported subset of IDL](https://design.ros2.org/articles/idl_interface_definition.html) for describing data types. This library parses those message definitions and can round trip them back into a canonical string format suitable for checksum generation. The parsed definitions are useful for serialization or deserialization when paired with other libraries.

## Usage

```Typescript
import { parseRos2idl } from "@foxglove/ros2idl-parser";

const ros2idlDefinitionStr = `
================================================================================
IDL: geometry_msgs/msg/Pose

module geometry_msgs {
  module msg {
    struct Pose {
      geometry_msgs::msg::Point position;
      geometry_msgs::msg::Quaternion orientation;
    };
  };
};

================================================================================
IDL: geometry_msgs/msg/Point

module geometry_msgs {
  module msg {
    struct Point {
      double x;
      double y;
      double z;
    };
  };
};

================================================================================
IDL: geometry_msgs/msg/Quaternion

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
`;

const messageDefinition = parseRos2idl(ros2idlDefinitionStr);

// print the parsed message definition structure
console.log(JSON.stringify(messageDefinition, null, 2));
```

Prints:

```JSON
[
  {
    "definitions": [
      {
        "type": "geometry_msgs/msg/Point",
        "isArray": false,
        "name": "position",
        "isComplex": true
      },
      {
        "type": "geometry_msgs/msg/Quaternion",
        "isArray": false,
        "name": "orientation",
        "isComplex": true
      }
    ]
  },
  {
    "name": "geometry_msgs/msg/Point",
    "definitions": [
      {
        "type": "float64",
        "isArray": false,
        "name": "x",
        "isComplex": false
      },
      {
        "type": "float64",
        "isArray": false,
        "name": "y",
        "isComplex": false
      },
      {
        "type": "float64",
        "isArray": false,
        "name": "z",
        "isComplex": false
      }
    ]
  },
  {
    "name": "geometry_msgs/msg/Quaternion",
    "definitions": [
      {
        "type": "float64",
        "isArray": false,
        "name": "x",
        "isComplex": false
      },
      {
        "type": "float64",
        "isArray": false,
        "name": "y",
        "isComplex": false
      },
      {
        "type": "float64",
        "isArray": false,
        "name": "z",
        "isComplex": false
      },
      {
        "type": "float64",
        "isArray": false,
        "name": "w",
        "isComplex": false
      }
    ]
  }
]
```

## Stay in touch

Join our [Slack channel](https://foxglove.dev/join-slack) to ask questions, share feedback, and stay up to date on what our team is working on.
