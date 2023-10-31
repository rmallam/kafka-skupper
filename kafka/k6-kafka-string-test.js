/*

This is a k6 test script that imports the xk6-kafka and
tests Kafka with a 200 JSON messages per iteration.

*/

import { check } from "k6";
import {
  Writer,
  Reader,
  Connection,
  SchemaRegistry,
  SCHEMA_TYPE_JSON,
  SCHEMA_TYPE_STRING,
  SASL_PLAIN,
  TLS_1_2,
} from "k6/x/kafka"; // import kafka extension

// Prints module-level constants
// console.log(kafka);

const brokers = ["kafka:9092"];
const topic = "testing";

// SASL config is optional
const saslConfig = {
  username: "admin",
  password: "admin",
  // Possible values for the algorithm is:
  // NONE (default)
  // SASL_PLAIN
  // SASL_SCRAM_SHA256
  // SASL_SCRAM_SHA512
  // SASL_SSL (must enable TLS)
  // SASL_AWS_IAM (configurable via env or AWS IAM config files - no username/password needed)
  algorithm: SASL_PLAIN,
};

const writer = new Writer({
  brokers: brokers,
  topic: topic,
  sasl: saslConfig,
  autoCreateTopic: true,
});
const reader = new Reader({
  brokers: brokers,
  topic: topic,
  sasl: saslConfig,
});
const connection = new Connection({
  address: brokers[0],
  sasl: saslConfig,
});
const schemaRegistry = new SchemaRegistry();

if (__VU == 0) {
  connection.createTopic({ topic: topic });
}

export const options = {
  thresholds: {
    // Base thresholds to see if the writer or reader is working
    kafka_writer_error_count: ["count == 0"],
    kafka_reader_error_count: ["count == 0"],
  },
};

export default function () {
  for (let index = 0; index < 100; index++) {
    let messages = [
      {
        key: schemaRegistry.serialize({
          data: "test-key-string",
          schemaType: SCHEMA_TYPE_STRING,
        }),
        value: schemaRegistry.serialize({
          data: "test-value-string",
          schemaType: SCHEMA_TYPE_STRING,
        }),
        headers: {
          mykey: "myvalue",
        },
        offset: index,
        partition: 0,
        time: new Date(), // Will be converted to timestamp automatically
      },
      {
        key: schemaRegistry.serialize({
          data: "test-key-string",
          schemaType: SCHEMA_TYPE_STRING,
        }),
        value: schemaRegistry.serialize({
          data: "test-value-string",
          schemaType: SCHEMA_TYPE_STRING,
        }),
        headers: {
          mykey: "myvalue",
        },
      },
    ];

    writer.produce({ messages: messages });
  }

  // Read 10 messages only
  let messages = reader.consume({ limit: 10 });

  check(messages, {
    "10 messages are received": (messages) => messages.length == 10,
  });

  check(messages[0], {
    "Topic equals to xk6_kafka_json_topic": (msg) => msg["topic"] == topic,
    "Key is a string and is correct": (msg) =>
      schemaRegistry.deserialize({
        data: msg.key,
        schemaType: SCHEMA_TYPE_STRING,
      }) == "test-key-string",
    "Value is a string and is correct": (msg) =>
      typeof schemaRegistry.deserialize({
        data: msg.value,
        schemaType: SCHEMA_TYPE_STRING,
      }) == "string" &&
      schemaRegistry.deserialize({
        data: msg.value,
        schemaType: SCHEMA_TYPE_STRING,
      }) == "test-value-string",
    "Header equals {'mykey': 'myvalue'}": (msg) =>
      "mykey" in msg.headers &&
      String.fromCharCode(...msg.headers["mykey"]) == "myvalue",
    "Time is past": (msg) => new Date(msg["time"]) < new Date(),
    "Partition is zero": (msg) => msg["partition"] == 0,
    "Offset is gte zero": (msg) => msg["offset"] >= 0,
    "High watermark is gte zero": (msg) => msg["highWaterMark"] >= 0,
  });
}

export function teardown(data) {
  if (__VU == 0) {
    // Delete the topic
    connection.deleteTopic(topic);
  }
  writer.close();
  reader.close();
  connection.close();
}