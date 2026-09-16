import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import ShowTicketService from "./ShowTicketService";

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  groupContact?: Contact
): Promise<Ticket> => {
  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending"]
      },
      contactId: groupContact ? groupContact.id : contact.id,
      whatsappId: whatsappId
    }
  });

  logger.info(
    {
      stage: "active_lookup",
      found: Boolean(ticket),
      ticketId: ticket?.id,
      previousStatus: ticket?.status,
      hasQueueId: ticket
        ? ticket.queueId !== null && ticket.queueId !== undefined
        : undefined,
      queueId: ticket?.queueId,
      decision: ticket ? "reused_active" : undefined,
      success: true
    },
    "Ticket resolution checkpoint"
  );

  let decision = ticket ? "reused_active" : "not_resolved";

  if (ticket) {
    await ticket.update({ unreadMessages });
  }

  if (!ticket && groupContact) {
    ticket = await Ticket.findOne({
      where: {
        contactId: groupContact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    logger.info(
      {
        stage: "group_history_lookup",
        found: Boolean(ticket),
        ticketId: ticket?.id,
        previousStatus: ticket?.status,
        hasQueueId: ticket
          ? ticket.queueId !== null && ticket.queueId !== undefined
          : undefined,
        queueId: ticket?.queueId,
        success: true
      },
      "Ticket resolution checkpoint"
    );

    if (ticket) {
      const previousStatus = ticket.status;
      const preservedQueueId = ticket.queueId;

      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages
      });

      decision = "reopened_group_history";
      logger.info(
        {
          stage: "reopened",
          ticketId: ticket.id,
          previousStatus,
          finalStatus: ticket.status,
          hasQueueId:
            preservedQueueId !== null && preservedQueueId !== undefined,
          queueId: preservedQueueId,
          decision,
          success: true
        },
        "Ticket resolution checkpoint"
      );
    }
  }

  if (!ticket && !groupContact) {
    ticket = await Ticket.findOne({
      where: {
        updatedAt: {
          [Op.between]: [+subHours(new Date(), 2), +new Date()]
        },
        contactId: contact.id,
        whatsappId: whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    logger.info(
      {
        stage: "recent_history_lookup",
        found: Boolean(ticket),
        ticketId: ticket?.id,
        previousStatus: ticket?.status,
        hasQueueId: ticket
          ? ticket.queueId !== null && ticket.queueId !== undefined
          : undefined,
        queueId: ticket?.queueId,
        success: true
      },
      "Ticket resolution checkpoint"
    );

    if (ticket) {
      const previousStatus = ticket.status;
      const preservedQueueId = ticket.queueId;

      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages
      });

      decision = "reopened_recent_history";
      logger.info(
        {
          stage: "reopened",
          ticketId: ticket.id,
          previousStatus,
          finalStatus: ticket.status,
          hasQueueId:
            preservedQueueId !== null && preservedQueueId !== undefined,
          queueId: preservedQueueId,
          decision,
          success: true
        },
        "Ticket resolution checkpoint"
      );
    }
  }

  if (!ticket) {
    ticket = await Ticket.create({
      contactId: groupContact ? groupContact.id : contact.id,
      status: "pending",
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId
    });

    decision = "created_new";
    logger.info(
      {
        stage: "created",
        ticketId: ticket.id,
        finalStatus: ticket.status,
        hasQueueId:
          ticket.queueId !== null && ticket.queueId !== undefined,
        queueId: ticket.queueId,
        decision,
        success: true
      },
      "Ticket resolution checkpoint"
    );
  }

  ticket = await ShowTicketService(ticket.id);

  logger.info(
    {
      stage: "ticket_resolved",
      ticketId: ticket.id,
      finalStatus: ticket.status,
      hasQueueId: ticket.queueId !== null && ticket.queueId !== undefined,
      queueId: ticket.queueId,
      decision,
      success: true
    },
    "Ticket resolution checkpoint"
  );

  return ticket;
};

export default FindOrCreateTicketService;
