import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import { encodePacket } from "@ggpwnkthx/esbuild/utils";
import { createChannelWithFakeStream, encodeFramed } from "./_helpers.ts";

Deno.test("createChannel().readFromStdout() rejects a first packet whose version does not match", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const badVersion = encodeFramed(new TextEncoder().encode("1.0.0"));
  assertThrows(
    () => fake.injectFramed(badVersion),
    Error,
    `Host version "${version}" does not match binary version`,
  );
});

Deno.test("createChannel().readFromStdout() accepts the correct handshake packet", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const handshake = encodeFramed(new TextEncoder().encode(version));
  fake.injectFramed(handshake);
});

Deno.test("createChannel().readFromStdout() reassembles a packet split across multiple stdout chunks", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const handshake = encodeFramed(new TextEncoder().encode(version));
  fake.injectFramed(handshake);
  const packet = encodePacket({ id: 1, isRequest: true, value: { command: "ping" } });
  const chunk1 = packet.subarray(0, 5);
  const chunk2 = packet.subarray(5);
  fake.injectFramed(chunk1);
  fake.injectFramed(chunk2);
  const packets = fake.getStdinPackets();
  const response = packets[packets.length - 1];
  assertEquals(response.id, 1);
  assertEquals(response.isRequest, false);
});

Deno.test("createChannel().readFromStdout() processes multiple framed packets delivered in one chunk", async () => {
  const { fake, version } = await createChannelWithFakeStream();
  const handshake = encodeFramed(new TextEncoder().encode(version));
  fake.injectFramed(handshake);
  const packet1 = encodePacket({ id: 1, isRequest: true, value: { command: "ping" } });
  const packet2 = encodePacket({ id: 2, isRequest: true, value: { command: "ping" } });
  const combined = new Uint8Array(packet1.length + packet2.length);
  combined.set(packet1, 0);
  combined.set(packet2, packet1.length);
  fake.injectFramed(combined);
  const packets = fake.getStdinPackets();
  const responses = packets.filter((p) => !p.isRequest);
  assertEquals(responses.length, 2);
  assertEquals(responses[0].id, 1);
  assertEquals(responses[1].id, 2);
});
