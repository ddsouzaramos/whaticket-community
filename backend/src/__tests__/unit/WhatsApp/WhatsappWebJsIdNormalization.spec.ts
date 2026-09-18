const Base = require("whatsapp-web.js/src/structures/Base");
const WwebjsMessage = require("whatsapp-web.js/src/structures/Message");

const createMessage = (id: Record<string, unknown>) =>
  new WwebjsMessage(
    {},
    {
      id,
      type: "chat",
      from: "5511999999999@c.us",
      to: "5511888888888@c.us",
      t: 1
    }
  );

describe("whatsapp-web.js ID normalization", () => {
  it("preserves an existing _serialized value", () => {
    const id = {
      _serialized: "existing@lid",
      $1: "replacement@c.us"
    };

    expect(Base._normalizeId(id)).toBe(id);
    expect(id._serialized).toBe("existing@lid");
  });

  it("copies $1 exactly when _serialized is absent", () => {
    const id = { $1: "false_5511999999999@c.us_MESSAGE" };
    const normalized = Base._normalizeId(id);

    expect(normalized).not.toBe(id);
    expect(normalized._serialized).toBe(id.$1);
    expect(id).not.toHaveProperty("_serialized");
  });

  it("does not invent an ID when both properties are absent", () => {
    const id = { remote: "5511999999999@c.us", id: "MESSAGE" };

    expect(Base._normalizeId(id)).toBe(id);
    expect(id).not.toHaveProperty("_serialized");
  });

  it.each(["5511999999999@lid", "5511999999999@c.us", "120363000000000000@g.us"])(
    "preserves the complete WhatsApp address %s",
    address => {
      const serialized = `false_${address}_MESSAGE`;
      const normalized = Base._normalizeId({ $1: serialized });

      expect(normalized._serialized).toBe(serialized);
    }
  );

  it("does not convert a LID address to c.us", () => {
    const serialized = "false_5511999999999@lid_MESSAGE";
    const normalized = Base._normalizeId({ $1: serialized });

    expect(normalized._serialized).toContain("@lid");
    expect(normalized._serialized).not.toContain("@c.us");
  });

  it("normalizes Message.id during structure construction", () => {
    const serialized = "false_5511999999999@c.us_MESSAGE";
    const message = createMessage({
      $1: serialized,
      fromMe: false,
      remote: "5511999999999@c.us",
      id: "MESSAGE"
    });

    expect(message.id.$1).toBe(serialized);
    expect(message.id._serialized).toBe(serialized);
  });
});
