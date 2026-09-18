import Contact from "../../../models/Contact";
import Ticket from "../../../models/Ticket";
import FindOrCreateTicketService from "../../../services/TicketServices/FindOrCreateTicketService";
import ShowTicketService from "../../../services/TicketServices/ShowTicketService";

jest.mock("../../../models/Ticket", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    create: jest.fn()
  }
}));

jest.mock("../../../services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockedTicket = Ticket as unknown as {
  findOne: jest.Mock;
  create: jest.Mock;
};
const mockedShowTicketService = ShowTicketService as jest.Mock;

describe("FindOrCreateTicketService", () => {
  const contact = { id: 10 } as Contact;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(["open", "pending"])(
    "reuses an active %s ticket",
    async status => {
      const activeTicket = {
        id: 20,
        status,
        queueId: 3,
        userId: 4,
        update: jest.fn()
      };
      const resolvedTicket = { ...activeTicket } as unknown as Ticket;
      mockedTicket.findOne.mockResolvedValueOnce(activeTicket);
      mockedShowTicketService.mockResolvedValueOnce(resolvedTicket);

      const result = await FindOrCreateTicketService(contact, 1, 2);

      expect(result).toBe(resolvedTicket);
      expect(activeTicket.update).toHaveBeenCalledWith({ unreadMessages: 2 });
      expect(mockedTicket.findOne).toHaveBeenCalledTimes(1);
      expect(mockedTicket.create).not.toHaveBeenCalled();
    }
  );

  it.each([
    "5511999999999@lid",
    "5511999999999@c.us",
    "120363000000000000@g.us"
  ])("preserves providerChatId exactly for %s", async providerChatId => {
    const activeTicket = {
      id: 20,
      update: jest.fn()
    };
    mockedTicket.findOne.mockResolvedValueOnce(activeTicket);
    mockedShowTicketService.mockResolvedValueOnce(
      activeTicket as unknown as Ticket
    );

    await FindOrCreateTicketService(
      contact,
      1,
      2,
      undefined,
      true,
      providerChatId
    );

    expect(activeTicket.update).toHaveBeenCalledWith({
      unreadMessages: 2,
      providerChatId
    });
  });

  it("does not overwrite providerChatId when a new value is absent", async () => {
    const activeTicket = {
      id: 20,
      providerChatId: "5511999999999@lid",
      update: jest.fn()
    };
    mockedTicket.findOne.mockResolvedValueOnce(activeTicket);
    mockedShowTicketService.mockResolvedValueOnce(
      activeTicket as unknown as Ticket
    );

    await FindOrCreateTicketService(contact, 1, 2);

    expect(activeTicket.update).toHaveBeenCalledWith({ unreadMessages: 2 });
  });

  it("persists providerChatId when creating a ticket", async () => {
    const newTicket = { id: 24 };
    mockedTicket.findOne.mockResolvedValueOnce(null);
    mockedTicket.create.mockResolvedValueOnce(newTicket);
    mockedShowTicketService.mockResolvedValueOnce(
      newTicket as unknown as Ticket
    );

    await FindOrCreateTicketService(
      contact,
      1,
      1,
      undefined,
      false,
      "5511999999999@lid"
    );

    expect(mockedTicket.create).toHaveBeenCalledWith({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      unreadMessages: 1,
      whatsappId: 1,
      providerChatId: "5511999999999@lid"
    });
  });

  it("creates a new ticket instead of reopening a closed ticket for an incoming message", async () => {
    const newTicket = { id: 21 };
    const resolvedTicket = {
      id: 21,
      status: "pending",
      queueId: null,
      userId: null
    } as unknown as Ticket;
    mockedTicket.findOne.mockResolvedValueOnce(null);
    mockedTicket.create.mockResolvedValueOnce(newTicket);
    mockedShowTicketService.mockResolvedValueOnce(resolvedTicket);

    const result = await FindOrCreateTicketService(
      contact,
      1,
      1,
      undefined,
      false
    );

    expect(result).toBe(resolvedTicket);
    expect(mockedTicket.findOne).toHaveBeenCalledTimes(1);
    expect(mockedTicket.create).toHaveBeenCalledWith({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      unreadMessages: 1,
      whatsappId: 1
    });
  });

  it("preserves recent-ticket reopening for existing callers by default", async () => {
    const closedTicket = {
      id: 22,
      status: "closed",
      queueId: 5,
      userId: 6,
      update: jest.fn()
    };
    const resolvedTicket = {
      ...closedTicket,
      status: "pending",
      userId: null
    } as unknown as Ticket;
    mockedTicket.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(closedTicket);
    mockedShowTicketService.mockResolvedValueOnce(resolvedTicket);

    await FindOrCreateTicketService(contact, 1, 1);

    expect(closedTicket.update).toHaveBeenCalledWith({
      status: "pending",
      userId: null,
      unreadMessages: 1
    });
    expect(mockedTicket.create).not.toHaveBeenCalled();
  });

  it("keeps the existing group-history behavior", async () => {
    const groupContact = { id: 30 } as Contact;
    const closedGroupTicket = {
      id: 23,
      status: "closed",
      queueId: 7,
      userId: 8,
      update: jest.fn()
    };
    mockedTicket.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(closedGroupTicket);
    mockedShowTicketService.mockResolvedValueOnce(
      closedGroupTicket as unknown as Ticket
    );

    await FindOrCreateTicketService(contact, 1, 1, groupContact, false);

    expect(closedGroupTicket.update).toHaveBeenCalledWith({
      status: "pending",
      userId: null,
      unreadMessages: 1
    });
    expect(mockedTicket.create).not.toHaveBeenCalled();
  });
});
