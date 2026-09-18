import { Op } from "sequelize";

import Message from "../../../models/Message";
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import UserQueue from "../../../models/UserQueue";
import Whatsapp from "../../../models/Whatsapp";
import ListForwardMessageTargetsService from "../../../services/MessageServices/ListForwardMessageTargetsService";

jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: { unscoped: jest.fn() }
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

const mockedMessage = Message as unknown as { unscoped: jest.Mock };
const mockedTicket = Ticket as unknown as { unscoped: jest.Mock };
const mockedUser = User as unknown as { findByPk: jest.Mock };
const mockedUserQueue = UserQueue as unknown as { findAll: jest.Mock };
const mockedWhatsapp = Whatsapp as unknown as { findByPk: jest.Mock };

const messageFindByPk = jest.fn();
const ticketFindByPk = jest.fn();
const ticketFindAndCountAll = jest.fn();

const sourceMessage = {
  id: "database-message-id",
  ticketId: 10,
  providerMessageId: "false_5511999999999@lid_OPAQUE_MESSAGE_ID"
};

const sourceTicket = {
  id: 10,
  status: "open",
  userId: 7,
  queueId: 100,
  whatsappId: 3
};

describe("ListForwardMessageTargetsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedMessage.unscoped.mockReturnValue({ findByPk: messageFindByPk });
    mockedTicket.unscoped.mockReturnValue({
      findByPk: ticketFindByPk,
      findAndCountAll: ticketFindAndCountAll
    });
    messageFindByPk.mockResolvedValue({ ...sourceMessage });
    ticketFindByPk.mockResolvedValue({ ...sourceTicket });
    mockedUser.findByPk.mockResolvedValue({ id: 7, profile: "user" });
    mockedUserQueue.findAll.mockResolvedValue([{ queueId: 100 }]);
    mockedWhatsapp.findByPk.mockResolvedValue({ id: 3, status: "CONNECTED" });
    ticketFindAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          id: 20,
          status: "pending",
          contact: { id: 2, name: "Maria Silva" },
          queue: { id: 100, name: "Fiscal" },
          providerChatId: "must-not-leak@lid"
        }
      ]
    });
  });

  it("returns only safe destination fields", async () => {
    const result = await ListForwardMessageTargetsService({
      messageId: sourceMessage.id,
      userId: 7
    });

    expect(result).toEqual({
      targets: [
        {
          ticketId: 20,
          contactName: "Maria Silva",
          queueName: "Fiscal",
          status: "pending"
        }
      ],
      hasMore: false
    });
    expect(result.targets[0]).not.toHaveProperty("providerChatId");
    expect(result.targets[0]).not.toHaveProperty("providerMessageId");
    expect(result.targets[0]).not.toHaveProperty("remoteJid");
    expect(result.targets[0]).not.toHaveProperty("number");
  });

  it("filters common-user targets by queue, access, connection, provider ID and source ticket", async () => {
    await ListForwardMessageTargetsService({
      messageId: sourceMessage.id,
      userId: 7
    });

    const query = ticketFindAndCountAll.mock.calls[0][0];
    expect(query.where.id).toEqual({ [Op.ne]: sourceTicket.id });
    expect(query.where.whatsappId).toBe(sourceTicket.whatsappId);
    expect(query.where.providerChatId).toEqual({ [Op.ne]: null });
    expect(query.where.queueId).toEqual({ [Op.in]: [100] });
    expect(query.where[Op.or]).toEqual([
      { status: "pending" },
      { userId: 7 }
    ]);
    expect(query.attributes).toEqual(["id", "status"]);
  });

  it("applies contact-name search without exposing contact numbers", async () => {
    await ListForwardMessageTargetsService({
      messageId: sourceMessage.id,
      userId: 7,
      searchParam: "  MARIA  "
    });

    const query = ticketFindAndCountAll.mock.calls[0][0];
    expect(query.include[0].attributes).toEqual(["id", "name"]);
    expect(query.include[0].where).toBeDefined();
  });

  it("allows administrators to receive queue-less eligible targets", async () => {
    mockedUser.findByPk.mockResolvedValue({ id: 7, profile: "admin" });
    ticketFindAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          id: 21,
          status: "pending",
          contact: { id: 3, name: "Sem fila" },
          queue: null
        }
      ]
    });

    const result = await ListForwardMessageTargetsService({
      messageId: sourceMessage.id,
      userId: 7
    });

    const query = ticketFindAndCountAll.mock.calls[0][0];
    expect(mockedUserQueue.findAll).not.toHaveBeenCalled();
    expect(query.where.queueId).toBeUndefined();
    expect(query.where[Op.or]).toBeUndefined();
    expect(result.targets[0].queueName).toBeNull();
  });

  it("rejects an inaccessible source before listing targets", async () => {
    ticketFindByPk.mockResolvedValue({ ...sourceTicket, queueId: null });

    await expect(
      ListForwardMessageTargetsService({
        messageId: sourceMessage.id,
        userId: 7
      })
    ).rejects.toMatchObject({
      message: "ERR_FORWARD_SOURCE_TICKET_FORBIDDEN"
    });
    expect(ticketFindAndCountAll).not.toHaveBeenCalled();
  });

  it("does not list targets when the WhatsApp connection is not ready", async () => {
    mockedWhatsapp.findByPk.mockResolvedValue({
      id: 3,
      status: "DISCONNECTED"
    });

    await expect(
      ListForwardMessageTargetsService({
        messageId: sourceMessage.id,
        userId: 7
      })
    ).rejects.toMatchObject({ message: "ERR_FORWARD_WHATSAPP_NOT_READY" });
    expect(ticketFindAndCountAll).not.toHaveBeenCalled();
  });
});
