import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  createChannelWithFakeStream,
  encodeFramed,
  encodeResponse,
} from "./_helpers.ts";

Deno.test("service.formatMessages() sends a request packet through streamIn.writeToStdin()", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [{ text: "error message" }],
    options: { kind: "error" as const },
    callback: () => {},
  });
  const packets = fake.getStdinPackets();
  assertEquals(packets.length, 1);
  assertEquals(packets[0].value.command, "format-msgs");
  assertEquals((packets[0].value.messages as unknown[]).length, 1);
  assertEquals(
    (packets[0].value.messages as { text: string }[])[0].text,
    "error message",
  );
});

Deno.test("A response packet with matching id resolves the pending callback", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  let callbackResult: unknown = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "warning" as const },
    callback: (err, res) => {
      callbackError = err;
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, { messages: ["formatted message"] }),
    ),
  );
  assertEquals(callbackError, null);
  assertEquals(callbackResult, ["formatted message"]);
});

Deno.test("A response packet containing .error is surfaced as an error to the callback", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callbackError: Error | null = null;
  let callbackResult: unknown = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error" as const },
    callback: (err, res) => {
      callbackError = err;
      callbackResult = res;
    },
  });
  const requestPacket = fake.getStdinPackets()[0];
  fake.injectFramed(
    encodeFramed(
      encodeResponse(requestPacket.id, false, { error: "something went wrong" }),
    ),
  );
  assertEquals(
    typeof callbackError === "object" && callbackError !== null
      && (callbackError as Error).message === "something went wrong",
    true,
  );
  assertEquals(callbackResult, null);
});

Deno.test("afterClose() fails all pending response callbacks with The service was stopped", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  let callback1Error: Error | string | null = null;
  let callback2Error: Error | string | null = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error" as const },
    callback: (err) => {
      callback1Error = err;
    },
  });
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "warning" as const },
    callback: (err) => {
      callback2Error = err;
    },
  });
  fake.close(new Error("intentional stop"));
  assertEquals(
    typeof callback1Error === "object" && callback1Error !== null
      && (callback1Error as Error).message.includes("The service was stopped"),
    true,
  );
  assertEquals(
    typeof callback2Error === "object" && callback2Error !== null
      && (callback2Error as Error).message.includes("The service was stopped"),
    true,
  );
});

Deno.test("After afterClose(), service methods fail immediately with The service is no longer running", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  fake.close();
  let callbackError: Error | null = null;
  channel.service.formatMessages({
    callName: "formatMessages",
    refs: null,
    messages: [],
    options: { kind: "error" as const },
    callback: (err) => {
      callbackError = err;
    },
  });
  assertEquals(typeof callbackError === "object" && callbackError !== null, true);
  assertEquals(
    (callbackError as unknown as Error).message.includes(
      "The service is no longer running",
    ),
    true,
  );
});
