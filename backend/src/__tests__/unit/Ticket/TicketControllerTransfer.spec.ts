import * as TicketController from "../../../controllers/TicketController";
import TransferTicketService from "../../../services/TicketServices/TransferTicketService";
import UpdateTicketService from "../../../services/TicketServices/UpdateTicketService";
import ShowWhatsAppService from "../../../services/WhatsappService/ShowWhatsAppService";

jest.mock("../../../services/TicketServices/TransferTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/WhatsappService/ShowWhatsAppService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/WbotServices/SendWhatsAppMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));

const mockedTransferTicketService = TransferTicketService as jest.Mock;
const mockedUpdateTicketService = UpdateTicketService as jest.Mock;
const mockedShowWhatsAppService = ShowWhatsAppService as jest.Mock;

const makeResponse = () => {
  const response: any = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
};

describe("TicketController update operation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedShowWhatsAppService.mockResolvedValue({ farewellMessage: null });
  });

  it("uses the transfer service only for an explicit transfer operation", async () => {
    const ticket = { id: 1, status: "open", whatsappId: 1 };
    mockedTransferTicketService.mockResolvedValue({ ticket });
    const request: any = {
      params: { ticketId: "1" },
      body: {
        operation: "transfer",
        queueId: 2,
        userId: 3,
        whatsappId: 1
      }
    };

    await TicketController.update(request, makeResponse());

    expect(mockedTransferTicketService).toHaveBeenCalledWith({
      ticketId: "1",
      queueId: 2,
      userId: 3,
      whatsappId: 1
    });
    expect(mockedUpdateTicketService).not.toHaveBeenCalled();
  });

  it.each([
    { status: "closed", userId: 3 },
    { status: "open", userId: 3 },
    { status: "pending", userId: null }
  ])("keeps a normal $status update outside transfer validation", async body => {
    const ticket = { id: 1, status: body.status, whatsappId: 1 };
    mockedUpdateTicketService.mockResolvedValue({ ticket });

    await TicketController.update(
      { params: { ticketId: "1" }, body } as any,
      makeResponse()
    );

    expect(mockedUpdateTicketService).toHaveBeenCalledWith({
      ticketData: body,
      ticketId: "1"
    });
    expect(mockedTransferTicketService).not.toHaveBeenCalled();
  });
});
