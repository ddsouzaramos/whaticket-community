import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";
import { logger } from "../../utils/logger";
import {
  CanAccessForwardTicket,
  GetForwardMessageAccessContext
} from "./ForwardMessageAccessPolicy";

interface Request {
  messageId: string;
  destinationTicketId: number;
  userId: number | string;
}

const ForwardWhatsAppMessageService = async ({
  messageId,
  destinationTicketId,
  userId
}: Request): Promise<void> => {
  if (!Number.isInteger(destinationTicketId)) {
    throw new AppError("ERR_FORWARD_DESTINATION_TICKET_REQUIRED");
  }

  const sourceMessage = await Message.unscoped().findByPk(messageId);

  if (!sourceMessage) {
    throw new AppError("ERR_FORWARD_MESSAGE_NOT_FOUND", 404);
  }

  const sourceTicket = await Ticket.unscoped().findByPk(
    sourceMessage.ticketId
  );

  if (!sourceTicket) {
    throw new AppError("ERR_FORWARD_SOURCE_TICKET_NOT_FOUND", 404);
  }

  const access = await GetForwardMessageAccessContext(userId);

  if (!access) {
    throw new AppError("ERR_FORWARD_SOURCE_TICKET_FORBIDDEN", 403);
  }

  if (!CanAccessForwardTicket(sourceTicket, access)) {
    throw new AppError("ERR_FORWARD_SOURCE_TICKET_FORBIDDEN", 403);
  }

  const destinationTicket = await Ticket.unscoped().findByPk(
    destinationTicketId
  );

  if (!destinationTicket) {
    throw new AppError("ERR_FORWARD_DESTINATION_TICKET_NOT_FOUND", 404);
  }

  if (!CanAccessForwardTicket(destinationTicket, access)) {
    throw new AppError("ERR_FORWARD_DESTINATION_TICKET_FORBIDDEN", 403);
  }

  if (!sourceMessage.providerMessageId) {
    throw new AppError("ERR_FORWARD_PROVIDER_MESSAGE_ID_MISSING");
  }

  if (!destinationTicket.providerChatId) {
    throw new AppError("ERR_FORWARD_PROVIDER_CHAT_ID_MISSING");
  }

  if (
    !sourceTicket.whatsappId ||
    !destinationTicket.whatsappId ||
    sourceTicket.whatsappId !== destinationTicket.whatsappId
  ) {
    throw new AppError("ERR_FORWARD_DIFFERENT_WHATSAPP_CONNECTIONS");
  }

  const whatsapp = await Whatsapp.findByPk(destinationTicket.whatsappId, {
    attributes: ["id", "status"]
  });

  if (!whatsapp) {
    throw new AppError("ERR_FORWARD_DESTINATION_WHATSAPP_UNAVAILABLE", 404);
  }

  if (whatsapp.status !== "CONNECTED") {
    throw new AppError("ERR_FORWARD_WHATSAPP_NOT_READY", 503);
  }

  if (!whatsappProvider.forwardMessage) {
    throw new AppError("ERR_FORWARD_NOT_SUPPORTED_BY_PROVIDER", 501);
  }

  const logContext = {
    messageId: sourceMessage.id,
    sourceTicketId: sourceTicket.id,
    destinationTicketId: destinationTicket.id,
    whatsappId: destinationTicket.whatsappId,
    providerType: sourceMessage.providerType
  };

  logger.info({ stage: "whatsapp_forward_start", ...logContext });

  try {
    await whatsappProvider.forwardMessage(
      destinationTicket.whatsappId,
      sourceMessage.providerMessageId,
      destinationTicket.providerChatId
    );

    logger.info({ stage: "whatsapp_forward_success", ...logContext });
  } catch (err) {
    logger.error({
      stage: "whatsapp_forward_error",
      ...logContext,
      errorName:
        err instanceof AppError
          ? "AppError"
          : err instanceof Error
          ? err.name
          : "UnknownError"
    });

    if (err instanceof AppError) throw err;

    throw new AppError("ERR_FORWARD_PROVIDER_FAILURE", 502);
  }
};

export default ForwardWhatsAppMessageService;
