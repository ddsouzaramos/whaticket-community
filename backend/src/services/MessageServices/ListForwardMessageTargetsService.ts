import { col, fn, Op, where } from "sequelize";

import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import {
  CanAccessForwardTicket,
  GetForwardMessageAccessContext
} from "./ForwardMessageAccessPolicy";

interface Request {
  messageId: string;
  userId: number | string;
  searchParam?: string;
  pageNumber?: string;
}

interface ForwardTarget {
  ticketId: number;
  contactName: string;
  queueName: string | null;
  status: string;
}

interface Response {
  targets: ForwardTarget[];
  hasMore: boolean;
}

const ListForwardMessageTargetsService = async ({
  messageId,
  userId,
  searchParam = "",
  pageNumber = "1"
}: Request): Promise<Response> => {
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

  if (!access || !CanAccessForwardTicket(sourceTicket, access)) {
    throw new AppError("ERR_FORWARD_SOURCE_TICKET_FORBIDDEN", 403);
  }

  if (!sourceMessage.providerMessageId) {
    throw new AppError("ERR_FORWARD_PROVIDER_MESSAGE_ID_MISSING");
  }

  if (!sourceTicket.whatsappId) {
    throw new AppError("ERR_FORWARD_DESTINATION_WHATSAPP_UNAVAILABLE", 404);
  }

  const whatsapp = await Whatsapp.findByPk(sourceTicket.whatsappId, {
    attributes: ["id", "status"]
  });

  if (!whatsapp) {
    throw new AppError("ERR_FORWARD_DESTINATION_WHATSAPP_UNAVAILABLE", 404);
  }

  if (whatsapp.status !== "CONNECTED") {
    throw new AppError("ERR_FORWARD_WHATSAPP_NOT_READY", 503);
  }

  const limit = 20;
  const parsedPageNumber = Math.max(Number(pageNumber) || 1, 1);
  const offset = limit * (parsedPageNumber - 1);
  const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();
  const targetWhere: any = {
    id: { [Op.ne]: sourceTicket.id },
    whatsappId: sourceTicket.whatsappId,
    providerChatId: { [Op.ne]: null }
  };

  if (!access.isAdmin) {
    targetWhere.queueId = { [Op.in]: Array.from(access.userQueueIds) };
    targetWhere[Op.or] = [
      { status: "pending" },
      { userId: access.userId }
    ];
  }

  const { count, rows } = await Ticket.unscoped().findAndCountAll({
    attributes: ["id", "status"],
    where: targetWhere,
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name"],
        required: true,
        ...(sanitizedSearchParam
          ? {
              where: where(
                fn("LOWER", col("contact.name")),
                "LIKE",
                `%${sanitizedSearchParam}%`
              )
            }
          : {})
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name"],
        required: false
      }
    ],
    distinct: true,
    limit,
    offset,
    order: [[{ model: Contact, as: "contact" }, "name", "ASC"]]
  });

  const targets = rows.map(ticket => ({
    ticketId: ticket.id,
    contactName: ticket.contact.name,
    queueName: ticket.queue?.name || null,
    status: ticket.status
  }));

  return {
    targets,
    hasMore: count > offset + rows.length
  };
};

export default ListForwardMessageTargetsService;
