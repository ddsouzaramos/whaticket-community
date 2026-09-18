import AppError from "../../../errors/AppError";
import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import UserQueue from "../../../models/UserQueue";
import Whatsapp from "../../../models/Whatsapp";
import { whatsappProvider } from "../../../providers/WhatsApp";
import ForwardWwebjsMessage from "../../../providers/WhatsApp/Implementations/wwebjsForwardMessage";
import CreateMessageService from "../../../services/MessageServices/CreateMessageService";
import ForwardWhatsAppMessageService from "../../../services/MessageServices/ForwardWhatsAppMessageService";

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    unscoped: jest.fn(),
    upsert: jest.fn()
  }
}));

jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: { unscoped: jest.fn() }
}));

jest.mock("../../../models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));

jest.mock("../../../models/UserQueue", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));

jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));

jest.mock("../../../providers/WhatsApp", () => ({
  whatsappProvider: { forwardMessage: jest.fn() }
}));

jest.mock("../../../services/MessageServices/CreateMessageService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

const mockedMessage = Message as unknown as {
  unscoped: jest.Mock;
  upsert: jest.Mock;
};
const mockedTicket = Ticket as unknown as { unscoped: jest.Mock };
const mockedUser = User as unknown as { findByPk: jest.Mock };
const mockedUserQueue = UserQueue as unknown as { findAll: jest.Mock };
const mockedWhatsapp = Whatsapp as unknown as { findByPk: jest.Mock };
const mockedProvider = whatsappProvider as unknown as {
  forwardMessage: jest.Mock;
};
const mockedCreateMessageService = CreateMessageService as jest.Mock;

const messageFindByPk = jest.fn();
const ticketFindByPk = jest.fn();

const sourceMessage = {
  id: "database-message-id",
  ticketId: 10,
  providerMessageId: "false_5511999999999@lid_OPAQUE_MESSAGE_ID",
  providerType: "ptt"
};

const sourceTicket = {
  id: 10,
  status: "open",
  userId: 7,
  queueId: 100,
  whatsappId: 3
};

const destinationTicket = {
  id: 20,
  status: "pending",
  userId: null,
  queueId: 200,
  whatsappId: 3,
  providerChatId: "5511888888888@lid"
};

const execute = () =>
  ForwardWhatsAppMessageService({
    messageId: sourceMessage.id,
    destinationTicketId: destinationTicket.id,
    userId: 7
  });

describe("ForwardWhatsAppMessageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedMessage.unscoped.mockReturnValue({ findByPk: messageFindByPk });
    mockedTicket.unscoped.mockReturnValue({ findByPk: ticketFindByPk });
    messageFindByPk.mockResolvedValue({ ...sourceMessage });
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket }
          : { ...destinationTicket }
      )
    );
    mockedUser.findByPk.mockResolvedValue({ id: 7, profile: "user" });
    mockedUserQueue.findAll.mockResolvedValue([
      { queueId: sourceTicket.queueId },
      { queueId: destinationTicket.queueId }
    ]);
    mockedWhatsapp.findByPk.mockResolvedValue({
      id: sourceTicket.whatsappId,
      status: "CONNECTED"
    });
    mockedProvider.forwardMessage.mockResolvedValue(undefined);
  });

  it.each([
    "5511888888888@lid",
    "5511888888888@c.us",
    "120363000000000000@g.us"
  ])(
    "passes the persisted PTT ID and destination %s byte-for-byte",
    async providerChatId => {
      ticketFindByPk.mockImplementation((id: number) =>
        Promise.resolve(
          id === sourceTicket.id
            ? { ...sourceTicket }
            : { ...destinationTicket, providerChatId }
        )
      );

      await execute();

      expect(mockedProvider.forwardMessage).toHaveBeenCalledWith(
        sourceTicket.whatsappId,
        sourceMessage.providerMessageId,
        providerChatId
      );
      expect(sourceMessage.providerMessageId).toContain("@lid");
      expect(mockedMessage.upsert).not.toHaveBeenCalled();
      expect(mockedCreateMessageService).not.toHaveBeenCalled();
    }
  );

  it("allows a pending source ticket in one of the user's queues", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket, status: "pending", userId: null }
          : { ...destinationTicket }
      )
    );

    await execute();

    expect(mockedProvider.forwardMessage).toHaveBeenCalledTimes(1);
  });

  it("allows an open source ticket assigned to the user in their queue", async () => {
    await execute();

    expect(mockedProvider.forwardMessage).toHaveBeenCalledTimes(1);
  });

  it("rejects a message that does not exist", async () => {
    messageFindByPk.mockResolvedValue(null);

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_MESSAGE_NOT_FOUND"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a missing providerMessageId", async () => {
    messageFindByPk.mockResolvedValue({
      ...sourceMessage,
      providerMessageId: null
    });

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_PROVIDER_MESSAGE_ID_MISSING"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a missing destination providerChatId", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket }
          : { ...destinationTicket, providerChatId: null }
      )
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_PROVIDER_CHAT_ID_MISSING"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a destination ticket that does not exist", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(id === sourceTicket.id ? { ...sourceTicket } : null)
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_DESTINATION_TICKET_NOT_FOUND"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects forwarding between different WhatsApp connections", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket }
          : { ...destinationTicket, whatsappId: 4 }
      )
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_DIFFERENT_WHATSAPP_CONNECTIONS"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a user without access to the source ticket", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket, userId: 99, status: "open" }
          : { ...destinationTicket }
      )
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_SOURCE_TICKET_FORBIDDEN"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a user outside the source ticket queue", async () => {
    mockedUserQueue.findAll.mockResolvedValue([
      { queueId: destinationTicket.queueId }
    ]);

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_SOURCE_TICKET_FORBIDDEN"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a pending source ticket outside the user's queues", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket, status: "pending", userId: null }
          : { ...destinationTicket }
      )
    );
    mockedUserQueue.findAll.mockResolvedValue([
      { queueId: destinationTicket.queueId }
    ]);

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_SOURCE_TICKET_FORBIDDEN"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a pending source ticket without a queue", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? {
              ...sourceTicket,
              status: "pending",
              userId: null,
              queueId: null
            }
          : { ...destinationTicket }
      )
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_SOURCE_TICKET_FORBIDDEN"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a pending destination ticket without a queue", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket }
          : { ...destinationTicket, queueId: null }
      )
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_DESTINATION_TICKET_FORBIDDEN"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a user without access to the destination ticket", async () => {
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket }
          : { ...destinationTicket, userId: 99, status: "open" }
      )
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_DESTINATION_TICKET_FORBIDDEN"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("rejects a disconnected WhatsApp session", async () => {
    mockedWhatsapp.findByPk.mockResolvedValue({
      id: sourceTicket.whatsappId,
      status: "DISCONNECTED"
    });

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_WHATSAPP_NOT_READY"
    });
    expect(mockedProvider.forwardMessage).not.toHaveBeenCalled();
  });

  it("does not retry when the provider forward fails", async () => {
    mockedProvider.forwardMessage.mockRejectedValue(
      new Error("provider failure")
    );

    await expect(execute()).rejects.toMatchObject({
      message: "ERR_FORWARD_PROVIDER_FAILURE"
    });
    expect(mockedProvider.forwardMessage).toHaveBeenCalledTimes(1);
    expect(mockedMessage.upsert).not.toHaveBeenCalled();
    expect(mockedCreateMessageService).not.toHaveBeenCalled();
  });

  it("allows an administrator to use tickets without queues", async () => {
    mockedUser.findByPk.mockResolvedValue({ id: 7, profile: "admin" });
    mockedUserQueue.findAll.mockResolvedValue([]);
    ticketFindByPk.mockImplementation((id: number) =>
      Promise.resolve(
        id === sourceTicket.id
          ? { ...sourceTicket, userId: 99, queueId: null }
          : {
              ...destinationTicket,
              status: "open",
              userId: 99,
              queueId: null
            }
      )
    );

    await execute();

    expect(mockedUserQueue.findAll).not.toHaveBeenCalled();
    expect(mockedProvider.forwardMessage).toHaveBeenCalledTimes(1);
  });
});

describe("ForwardWwebjsMessage", () => {
  it("uses getMessageById and Message.forward without changing either ID", async () => {
    const forward = jest.fn().mockResolvedValue(undefined);
    const client = {
      getState: jest.fn().mockResolvedValue("CONNECTED"),
      getMessageById: jest.fn().mockResolvedValue({ forward })
    };
    const providerMessageId =
      "false_5511999999999@lid_OPAQUE_MESSAGE_ID";
    const destinationProviderChatId = "5511888888888@lid";

    await ForwardWwebjsMessage(
      client,
      providerMessageId,
      destinationProviderChatId
    );

    expect(client.getMessageById).toHaveBeenCalledWith(providerMessageId);
    expect(forward).toHaveBeenCalledWith(destinationProviderChatId);
  });

  it("returns an explicit error when getMessageById returns null", async () => {
    const client = {
      getState: jest.fn().mockResolvedValue("CONNECTED"),
      getMessageById: jest.fn().mockResolvedValue(null)
    };

    await expect(
      ForwardWwebjsMessage(
        client,
        sourceMessage.providerMessageId,
        destinationTicket.providerChatId
      )
    ).rejects.toMatchObject({
      message: "ERR_FORWARD_ORIGINAL_MESSAGE_UNAVAILABLE"
    });
  });

  it("does not query the message when the live client is not ready", async () => {
    const client = {
      getState: jest.fn().mockResolvedValue("UNPAIRED"),
      getMessageById: jest.fn()
    };

    await expect(
      ForwardWwebjsMessage(
        client,
        sourceMessage.providerMessageId,
        destinationTicket.providerChatId
      )
    ).rejects.toEqual(
      new AppError("ERR_FORWARD_WHATSAPP_NOT_READY", 503)
    );
    expect(client.getMessageById).not.toHaveBeenCalled();
  });
});
