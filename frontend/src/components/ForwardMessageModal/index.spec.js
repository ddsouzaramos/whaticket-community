import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import ForwardMessageModal from "./index";

jest.mock("../../services/api", () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock("../../errors/toastError", () => jest.fn());

jest.mock("react-toastify", () => ({
  toast: { success: jest.fn() },
}));

jest.mock("../../translate/i18n", () => ({
  i18n: { t: key => key },
}));

const targets = [
  {
    ticketId: 20,
    contactName: "Maria Silva",
    queueName: "Fiscal",
    status: "open",
  },
  {
    ticketId: 30,
    contactName: "João Santos",
    queueName: "RH",
    status: "pending",
  },
];

const advanceDebounce = async () => {
  await act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderModal = (props = {}) => {
  const onClose = jest.fn();
  render(
    <ForwardMessageModal
      open
      onClose={onClose}
      messageId="message-1"
      sourceTicketId={10}
      {...props}
    />
  );
  return { onClose };
};

describe("ForwardMessageModal", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    api.get.mockResolvedValue({ data: { targets, hasMore: false } });
    api.post.mockResolvedValue({ status: 204 });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("shows loading and loads eligible destinations when opened", async () => {
    renderModal();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await advanceDebounce();

    expect(api.get).toHaveBeenCalledWith(
      "/messages/message-1/forward-targets",
      { params: { searchParam: "", pageNumber: 1 } }
    );
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText("João Santos")).toBeInTheDocument();
  });

  it("debounces contact search and uses only the latest value", async () => {
    renderModal();
    const search = screen.getByLabelText(
      "forwardMessageModal.searchPlaceholder"
    );

    fireEvent.change(search, { target: { value: "Ma" } });
    fireEvent.change(search, { target: { value: "Maria" } });

    act(() => jest.advanceTimersByTime(399));
    expect(api.get).not.toHaveBeenCalled();
    await advanceDebounce();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(
      "/messages/message-1/forward-targets",
      { params: { searchParam: "Maria", pageNumber: 1 } }
    );
  });

  it("keeps the forward button disabled until one destination is selected", async () => {
    renderModal();
    await advanceDebounce();

    const forwardButton = screen.getByText(
      "forwardMessageModal.buttons.forward"
    ).closest("button");
    expect(forwardButton).toBeDisabled();

    fireEvent.click(screen.getByText("Maria Silva"));
    expect(forwardButton).not.toBeDisabled();
  });

  it("keeps a single selection and posts only destinationTicketId", async () => {
    const { onClose } = renderModal();
    await advanceDebounce();

    fireEvent.click(screen.getByText("Maria Silva"));
    fireEvent.click(screen.getByText("João Santos"));
    fireEvent.click(screen.getByText("forwardMessageModal.buttons.forward"));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith("/messages/message-1/forward", {
      destinationTicketId: 30,
    });
    expect(api.post.mock.calls[0][1]).toEqual({ destinationTicketId: 30 });
    expect(toast.success).toHaveBeenCalledWith("forwardMessageModal.success");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prevents a double submit while the forward request is pending", async () => {
    let resolveForward;
    api.post.mockReturnValue(
      new Promise(resolve => {
        resolveForward = resolve;
      })
    );
    renderModal();
    await advanceDebounce();
    fireEvent.click(screen.getByText("Maria Silva"));

    const forwardButton = screen.getByText(
      "forwardMessageModal.buttons.forward"
    );
    fireEvent.click(forwardButton);
    fireEvent.click(forwardButton);

    expect(api.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveForward({ status: 204 });
      await Promise.resolve();
    });
  });

  it("keeps the modal open after an error and does not retry", async () => {
    api.post.mockRejectedValue(new Error("forward failed"));
    const { onClose } = renderModal();
    await advanceDebounce();
    fireEvent.click(screen.getByText("Maria Silva"));
    fireEvent.click(screen.getByText("forwardMessageModal.buttons.forward"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the source ticket defensively from the returned targets", async () => {
    api.get.mockResolvedValue({
      data: {
        targets: [
          ...targets,
          {
            ticketId: 10,
            contactName: "Origem",
            queueName: "Fiscal",
            status: "open",
          },
        ],
        hasMore: false,
      },
    });
    renderModal();
    await advanceDebounce();

    expect(screen.queryByText("Origem")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no destinations", async () => {
    api.get.mockResolvedValue({ data: { targets: [], hasMore: false } });
    renderModal();
    await advanceDebounce();

    expect(
      screen.getByText("forwardMessageModal.noTargets")
    ).toBeInTheDocument();
  });

  it("shows a safe load error state", async () => {
    api.get.mockRejectedValue(new Error("load failed"));
    renderModal();
    await advanceDebounce();

    expect(
      screen.getByText("forwardMessageModal.loadError")
    ).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
