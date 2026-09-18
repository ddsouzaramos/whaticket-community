import * as MessageController from "../../../controllers/MessageController";
import ForwardWhatsAppMessageService from "../../../services/MessageServices/ForwardWhatsAppMessageService";
import ListForwardMessageTargetsService from "../../../services/MessageServices/ListForwardMessageTargetsService";

jest.mock("../../../helpers/SetTicketMessagesAsRead", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/MessageServices/ListMessagesService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/WbotServices/DeleteWhatsAppMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/WbotServices/SendWhatsAppMedia", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../services/WbotServices/SendWhatsAppMessage", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock(
  "../../../services/MessageServices/ForwardWhatsAppMessageService",
  () => ({
    __esModule: true,
    default: jest.fn()
  })
);

jest.mock(
  "../../../services/MessageServices/ListForwardMessageTargetsService",
  () => ({
    __esModule: true,
    default: jest.fn()
  })
);

const mockedForwardService = ForwardWhatsAppMessageService as jest.Mock;
const mockedTargetsService = ListForwardMessageTargetsService as jest.Mock;

describe("MessageController.forward", () => {
  it("uses the authenticated user and only domain IDs from the request", async () => {
    const request: any = {
      params: { messageId: "database-message-id" },
      body: {
        destinationTicketId: 20,
        providerMessageId: "must-not-be-used",
        providerChatId: "must-not-be-used@lid"
      },
      user: { id: "7", profile: "user" }
    };
    const response: any = {
      status: jest.fn(),
      send: jest.fn()
    };
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);

    await MessageController.forward(request, response);

    expect(mockedForwardService).toHaveBeenCalledWith({
      messageId: "database-message-id",
      destinationTicketId: 20,
      userId: "7"
    });
    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.send).toHaveBeenCalledTimes(1);
  });
});

describe("MessageController.forwardTargets", () => {
  it("uses the authenticated user and message domain ID", async () => {
    mockedTargetsService.mockResolvedValue({ targets: [], hasMore: false });
    const request: any = {
      params: { messageId: "database-message-id" },
      query: { searchParam: "Maria", pageNumber: "1" },
      user: { id: "7", profile: "user" }
    };
    const response: any = {
      status: jest.fn(),
      json: jest.fn()
    };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);

    await MessageController.forwardTargets(request, response);

    expect(mockedTargetsService).toHaveBeenCalledWith({
      messageId: "database-message-id",
      userId: "7",
      searchParam: "Maria",
      pageNumber: "1"
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      targets: [],
      hasMore: false
    });
  });
});
