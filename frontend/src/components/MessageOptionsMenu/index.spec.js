import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import MessageOptionsMenu from "./index";

jest.mock("../../translate/i18n", () => ({
  i18n: { t: key => key },
}));

jest.mock("../../services/api", () => ({
  delete: jest.fn(),
}));

jest.mock("../ForwardMessageModal", () => props =>
  props.open ? (
    <div
      data-testid="forward-message-modal"
      data-message-id={props.messageId}
      data-source-ticket-id={props.sourceTicketId}
    />
  ) : null
);

describe("MessageOptionsMenu forwarding", () => {
  it("shows Forward for a valid message and opens the modal with domain IDs", () => {
    const handleClose = jest.fn();

    render(
      <ReplyMessageContext.Provider value={{ setReplyingMessage: jest.fn() }}>
        <MessageOptionsMenu
          message={{ id: "message-1", ticketId: 10, isDeleted: false }}
          menuOpen
          handleClose={handleClose}
          anchorEl={document.body}
        />
      </ReplyMessageContext.Provider>
    );

    fireEvent.click(screen.getByText("messageOptionsMenu.forward"));

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("forward-message-modal")).toHaveAttribute(
      "data-message-id",
      "message-1"
    );
    expect(screen.getByTestId("forward-message-modal")).toHaveAttribute(
      "data-source-ticket-id",
      "10"
    );
  });
});
