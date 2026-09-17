import AppError from "../../../errors/AppError";
import UserQueue from "../../../models/UserQueue";
import ShowQueueService from "../../../services/QueueService/ShowQueueService";
import TransferTicketService from "../../../services/TicketServices/TransferTicketService";
import UpdateTicketService from "../../../services/TicketServices/UpdateTicketService";

jest.mock("../../../models/UserQueue", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));

jest.mock("../../../services/QueueService/ShowQueueService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockedUserQueue = UserQueue as unknown as { findOne: jest.Mock };
const mockedShowQueueService = ShowQueueService as jest.Mock;
const mockedUpdateTicketService = UpdateTicketService as jest.Mock;

describe("TransferTicketService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedShowQueueService.mockResolvedValue({ id: 2 });
    mockedUpdateTicketService.mockResolvedValue({ ticket: { id: 1 } });
  });

  it("rejects a transfer without queueId", async () => {
    await expect(
      TransferTicketService({ ticketId: 1, userId: 3 })
    ).rejects.toMatchObject({ message: "ERR_TRANSFER_QUEUE_REQUIRED" });

    expect(mockedShowQueueService).not.toHaveBeenCalled();
    expect(mockedUpdateTicketService).not.toHaveBeenCalled();
  });

  it("transfers to a queue as pending without an assigned user", async () => {
    await TransferTicketService({ ticketId: 1, queueId: 2 });

    expect(mockedUpdateTicketService).toHaveBeenCalledTimes(1);
    expect(mockedUpdateTicketService).toHaveBeenCalledWith({
      ticketId: 1,
      ticketData: {
        queueId: 2,
        userId: null,
        whatsappId: undefined,
        status: "pending"
      }
    });
  });

  it("preserves status when transferring to a user in the selected queue", async () => {
    mockedUserQueue.findOne.mockResolvedValue({ userId: 3, queueId: 2 });

    await TransferTicketService({ ticketId: 1, queueId: 2, userId: 3 });

    expect(mockedUserQueue.findOne).toHaveBeenCalledWith({
      where: { userId: 3, queueId: 2 }
    });
    expect(mockedUpdateTicketService).toHaveBeenCalledTimes(1);
    expect(mockedUpdateTicketService).toHaveBeenCalledWith({
      ticketId: 1,
      ticketData: {
        queueId: 2,
        userId: 3,
        whatsappId: undefined
      }
    });
  });

  it("rejects a user that does not belong to the selected queue", async () => {
    mockedUserQueue.findOne.mockResolvedValue(null);

    await expect(
      TransferTicketService({ ticketId: 1, queueId: 2, userId: 3 })
    ).rejects.toMatchObject({ message: "ERR_USER_NOT_IN_QUEUE" });

    expect(mockedUpdateTicketService).not.toHaveBeenCalled();
  });

  it("reuses the existing queue-not-found error", async () => {
    mockedShowQueueService.mockRejectedValue(
      new AppError("ERR_QUEUE_NOT_FOUND", 404)
    );

    await expect(
      TransferTicketService({ ticketId: 1, queueId: 999 })
    ).rejects.toMatchObject({ message: "ERR_QUEUE_NOT_FOUND" });

    expect(mockedUpdateTicketService).not.toHaveBeenCalled();
  });
});
