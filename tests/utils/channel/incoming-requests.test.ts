import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  createChannelWithFakeStream,
  encodeFramed,
  encodeResponse,
} from "./_helpers.ts";

Deno.test("An incoming request with command: ping triggers an empty response", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  fake.injectFramed(
    encodeFramed(encodeResponse(99, true, { command: "ping" })),
  );
  const packets = fake.getStdinPackets();
  const response = packets[packets.length - 1];
  assertEquals(response.isRequest, false);
  assertEquals(response.id, 99);
  assertEquals(response.value, {});
});

Deno.test("An incoming request with an unknown command returns an error response", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  fake.injectFramed(
    encodeFramed(
      encodeResponse(99, true, { command: "unknown-cmd" }),
    ),
  );
  const packets = fake.getStdinPackets();
  const response = packets[packets.length - 1];
  assertEquals(response.isRequest, false);
  assertEquals(response.id, 99);
  const responseValue = response.value as { errors?: unknown[] };
  assertEquals(responseValue.errors?.length, 1);
});

Deno.test("An incoming request with an unknown key is ignored", async () => {
  const { channel, fake, version } = await createChannelWithFakeStream();
  channel.readFromStdout(
    encodeFramed(new TextEncoder().encode(version)),
  );
  const initialPacketCount = fake.getStdinPackets().length;
  fake.injectFramed(
    encodeFramed(encodeResponse(99, true, {
      command: "on-load",
      key: 99999,
    })),
  );
  const packets = fake.getStdinPackets();
  assertEquals(packets.length, initialPacketCount);
});
