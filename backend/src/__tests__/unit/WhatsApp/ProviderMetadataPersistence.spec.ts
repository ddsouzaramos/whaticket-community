import { QueryInterface } from "sequelize";

import { getIO } from "../../../libs/socket";
import Message from "../../../models/Message";
import type { MessagePayload } from "../../../handlers/handleWhatsappEvents";
import {
  buildWwebjsMediaPayload,
  extractWwebjsMessageMetadata
} from "../../../providers/WhatsApp/Implementations/wwebjsMessageMetadata";
import BuildMessageData from "../../../services/MessageServices/BuildMessageData";
import CreateMessageService from "../../../services/MessageServices/CreateMessageService";

jest.mock("../../../libs/socket", () => ({
  getIO: jest.fn()
}));

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    upsert: jest.fn(),
    findByPk: jest.fn()
  }
}));

const migration = require("../../../database/migrations/20260918000000-add-provider-metadata-to-messages-and-tickets");

const mockedMessage = Message as unknown as {
  upsert: jest.Mock;
  findByPk: jest.Mock;
};
const mockedGetIO = getIO as jest.Mock;

const createWwebjsMessage = ({
  remoteJid,
  type = "chat",
  body = "",
  hasMedia = false
}: {
  remoteJid: string;
  type?: string;
  body?: string;
  hasMedia?: boolean;
}) => {
  const providerMessageId = `false_${remoteJid}_OPAQUE_MESSAGE_ID`;

  return {
    id: {
      id: "OPAQUE_MESSAGE_ID",
      remote: remoteJid,
      fromMe: false,
      _serialized: providerMessageId
    },
    body,
    fromMe: false,
    hasMedia,
    type,
    timestamp: 1,
    from: remoteJid,
    to: "current-user@c.us",
    hasQuotedMsg: false,
    ack: 0
  };
};

const createMessagePayload = (
  providerType: MessagePayload["type"],
  overrides: Partial<MessagePayload> = {}
): MessagePayload => ({
  id: "OPAQUE_MESSAGE_ID",
  providerMessageId: "false_5511999999999@lid_OPAQUE_MESSAGE_ID",
  remoteJid: "5511999999999@lid",
  providerType,
  body: "",
  fromMe: false,
  hasMedia: providerType !== "chat",
  type: providerType,
  timestamp: 1,
  from: "5511999999999@lid",
  to: "current-user@c.us",
  ...overrides
});

const createProviderMessagePayload = ({
  remoteJid,
  type,
  body = ""
}: {
  remoteJid: string;
  type: MessagePayload["type"];
  body?: string;
}): MessagePayload => {
  const message = createWwebjsMessage({
    remoteJid,
    type,
    body,
    hasMedia: type !== "chat"
  });

  return {
    id: message.id.id,
    ...extractWwebjsMessageMetadata(message),
    body: message.body,
    fromMe: message.fromMe,
    hasMedia: message.hasMedia,
    type,
    timestamp: message.timestamp,
    from: message.from,
    to: message.to,
    hasQuotedMsg: message.hasQuotedMsg
  };
};

describe("WhatsApp provider metadata persistence", () => {
  beforeEach(() => {
    const io = {
      to: jest.fn()
    } as { to: jest.Mock; emit?: jest.Mock };
    io.to.mockReturnValue(io);
    io.emit = jest.fn();

    mockedGetIO.mockReturnValue(io);
    mockedMessage.upsert.mockResolvedValue(undefined);
    mockedMessage.findByPk.mockResolvedValue({
      ticketId: 1,
      ticket: {
        status: "open",
        contact: {}
      }
    });
  });

  it.each([
    "5511999999999@lid",
    "5511999999999@c.us",
    "120363000000000000@g.us"
  ])("preserves provider IDs and remote JIDs exactly for %s", async remoteJid => {
    const message = createWwebjsMessage({ remoteJid });
    const result = extractWwebjsMessageMetadata(message);

    expect(result.providerMessageId).toBe(message.id._serialized);
    expect(result.remoteJid).toBe(remoteJid);
  });

  it("does not reconstruct a missing serialized provider ID", async () => {
    const message = createWwebjsMessage({
      remoteJid: "5511999999999@lid"
    });
    (message.id as { _serialized?: string })._serialized = undefined;

    const result = extractWwebjsMessageMetadata(message);

    expect(result.providerMessageId).toBeUndefined();
    expect(result.remoteJid).toBe("5511999999999@lid");
  });

  it("keeps PTT provider type while preserving the current audio media type", () => {
    const result = BuildMessageData({
      messagePayload: createMessagePayload("ptt"),
      ticketId: 1,
      mediaPayload: {
        filename: "voice.ogg",
        mimetype: "audio/ogg; codecs=opus",
        data: "base64"
      },
      storedMediaFilename: "voice.saved.ogg"
    });

    expect(result.providerType).toBe("ptt");
    expect(result.mediaType).toBe("audio");
    expect(result.mediaMimeType).toBe("audio/ogg; codecs=opus");
  });

  it.each([
    ["image", "image/jpeg", "image"],
    ["document", "application/pdf", "application"]
  ] as const)(
    "keeps %s provider type and current media type behavior",
    (providerType, mimetype, expectedMediaType) => {
      const result = BuildMessageData({
        messagePayload: createMessagePayload(providerType),
        ticketId: 1,
        mediaPayload: {
          filename: providerType === "document" ? "contract.pdf" : "photo.jpg",
          mimetype,
          data: "base64"
        },
        storedMediaFilename: "stored-file"
      });

      expect(result.providerType).toBe(providerType);
      expect(result.mediaType).toBe(expectedMediaType);
      expect(result.mediaMimeType).toBe(mimetype);
    }
  );

  it("preserves the original media filename", async () => {
    const media = buildWwebjsMediaPayload({
      filename: "original-contract.pdf",
      mimetype: "application/pdf",
      data: "base64"
    });

    expect(media.filename).toBe("original-contract.pdf");
    expect(media.mimetype).toBe("application/pdf");
  });

  it.each(["image", "video"])(
    "preserves captions for %s messages",
    async type => {
      const message = createWwebjsMessage({
        remoteJid: "5511999999999@c.us",
        type,
        body: "Original caption",
        hasMedia: true
      });

      const result = extractWwebjsMessageMetadata(message);

      expect(result.caption).toBe("Original caption");
    }
  );

  it("defines every new database column as nullable", async () => {
    const addColumn = jest.fn().mockResolvedValue(undefined);
    const queryInterface = { addColumn } as unknown as QueryInterface;

    await migration.up(queryInterface);

    expect(addColumn).toHaveBeenCalledTimes(7);
    addColumn.mock.calls.forEach(([, , definition]) => {
      expect(definition.allowNull).toBe(true);
    });
  });

  it("reverses every added database column", async () => {
    const removeColumn = jest.fn().mockResolvedValue(undefined);
    const queryInterface = { removeColumn } as unknown as QueryInterface;

    await migration.down(queryInterface);

    expect(removeColumn).toHaveBeenCalledTimes(7);
    expect(removeColumn).toHaveBeenCalledWith("Tickets", "providerChatId");
    expect(removeColumn).toHaveBeenCalledWith(
      "Messages",
      "providerMessageId"
    );
  });

  it("allows legacy message payloads without provider metadata", () => {
    const result = BuildMessageData({
      messagePayload: {
        id: "LEGACY_ID",
        body: "Legacy message",
        fromMe: false,
        hasMedia: false,
        type: "chat",
        timestamp: 1,
        from: "",
        to: ""
      },
      ticketId: 1
    });

    expect(result.providerMessageId).toBeUndefined();
    expect(result.remoteJid).toBeUndefined();
    expect(result.providerType).toBeUndefined();
    expect(result.mediaMimeType).toBeUndefined();
    expect(result.mediaFilename).toBeUndefined();
    expect(result.caption).toBeUndefined();
  });

  it.each([
    {
      description: "PTT with LID",
      remoteJid: "5511999999999@lid",
      type: "ptt" as const,
      mimetype: "audio/ogg; codecs=opus",
      originalFilename: "voice.ogg",
      storedFilename: "voice.saved.ogg",
      expectedMediaType: "audio",
      caption: undefined
    },
    {
      description: "PDF document",
      remoteJid: "5511999999999@c.us",
      type: "document" as const,
      mimetype: "application/pdf",
      originalFilename: "original-contract.pdf",
      storedFilename: "original-contract.saved.pdf",
      expectedMediaType: "application",
      caption: undefined
    },
    {
      description: "captioned image",
      remoteJid: "5511999999999@c.us",
      type: "image" as const,
      mimetype: "image/jpeg",
      originalFilename: "photo.jpg",
      storedFilename: "photo.saved.jpg",
      expectedMediaType: "image",
      caption: "Original caption"
    }
  ])(
    "passes real provider metadata to Message.upsert for $description",
    async ({
      remoteJid,
      type,
      mimetype,
      originalFilename,
      storedFilename,
      expectedMediaType,
      caption
    }) => {
      const messagePayload = createProviderMessagePayload({
        remoteJid,
        type,
        body: caption
      });
      const mediaPayload = buildWwebjsMediaPayload({
        filename: originalFilename,
        mimetype,
        data: "base64"
      });
      const messageData = BuildMessageData({
        messagePayload,
        ticketId: 1,
        contactId: 2,
        mediaPayload,
        storedMediaFilename: storedFilename
      });

      await CreateMessageService({ messageData });

      expect(mockedMessage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          providerMessageId: `false_${remoteJid}_OPAQUE_MESSAGE_ID`,
          remoteJid,
          providerType: type,
          mediaType: expectedMediaType,
          mediaMimeType: mimetype,
          mediaFilename: originalFilename,
          caption
        })
      );
    }
  );

  it("never converts absent optional metadata to null before upsert", async () => {
    const completeMessageData = BuildMessageData({
      messagePayload: createProviderMessagePayload({
        remoteJid: "5511999999999@lid",
        type: "chat"
      }),
      ticketId: 1
    });
    const incompleteMessageData = BuildMessageData({
      messagePayload: {
        id: "OPAQUE_MESSAGE_ID",
        body: "Repeated event",
        fromMe: false,
        hasMedia: false,
        type: "chat",
        timestamp: 1,
        from: "",
        to: ""
      },
      ticketId: 1
    });

    await CreateMessageService({ messageData: completeMessageData });
    await CreateMessageService({ messageData: incompleteMessageData });

    const repeatedUpsertPayload = mockedMessage.upsert.mock.calls[1][0];
    expect(repeatedUpsertPayload.providerMessageId).toBeUndefined();
    expect(repeatedUpsertPayload.remoteJid).toBeUndefined();
    expect(repeatedUpsertPayload.providerType).toBeUndefined();
    expect(repeatedUpsertPayload.providerMessageId).not.toBeNull();
    expect(repeatedUpsertPayload.remoteJid).not.toBeNull();
    expect(repeatedUpsertPayload.providerType).not.toBeNull();
  });
});
