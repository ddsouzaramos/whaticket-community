import User from "../../../models/User";
import ListUsersService from "../../../services/UserServices/ListUsersService";

jest.mock("../../../models/User", () => ({
  __esModule: true,
  default: { findAndCountAll: jest.fn() }
}));

jest.mock("../../../models/Queue", () => ({
  __esModule: true,
  default: {}
}));

jest.mock("../../../models/Whatsapp", () => ({
  __esModule: true,
  default: {}
}));

const mockedUser = User as unknown as { findAndCountAll: jest.Mock };

describe("ListUsersService queue filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUser.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
  });

  it("filters and paginates users by the selected queue", async () => {
    await ListUsersService({ searchParam: "dan", queueId: 2 });

    expect(mockedUser.findAndCountAll).toHaveBeenCalledTimes(1);
    const query = mockedUser.findAndCountAll.mock.calls[0][0];
    expect(query.distinct).toBe(true);
    expect(query.limit).toBe(20);
    expect(query.offset).toBe(0);
    expect(query.include[0]).toMatchObject({
      as: "queues",
      where: { id: 2 },
      required: true
    });
  });

  it("preserves the existing query when queueId is absent", async () => {
    await ListUsersService({ searchParam: "dan" });

    const query = mockedUser.findAndCountAll.mock.calls[0][0];
    expect(query.include[0]).toMatchObject({ as: "queues" });
    expect(query).not.toHaveProperty("distinct");
    expect(query.include[0]).not.toHaveProperty("where");
    expect(query.include[0]).not.toHaveProperty("required");
  });
});
