import AppError from "../../errors/AppError";
import UserQueue from "../../models/UserQueue";
import ShowQueueService from "../QueueService/ShowQueueService";
import UpdateTicketService from "./UpdateTicketService";

interface Request {
  ticketId: string | number;
  queueId?: number;
  userId?: number | null;
  whatsappId?: number;
}

const TransferTicketService = async ({
  ticketId,
  queueId,
  userId,
  whatsappId
}: Request) => {
  if (!queueId) {
    throw new AppError("ERR_TRANSFER_QUEUE_REQUIRED");
  }

  await ShowQueueService(queueId);

  if (userId !== null && userId !== undefined) {
    const userQueue = await UserQueue.findOne({
      where: { userId, queueId }
    });

    if (!userQueue) {
      throw new AppError("ERR_USER_NOT_IN_QUEUE");
    }
  }

  return UpdateTicketService({
    ticketId,
    ticketData: {
      queueId,
      userId: userId || null,
      whatsappId,
      ...(userId ? {} : { status: "pending" })
    }
  });
};

export default TransferTicketService;
