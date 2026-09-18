import Ticket from "../../models/Ticket";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";

export interface ForwardMessageAccessContext {
  userId: number;
  isAdmin: boolean;
  userQueueIds: Set<number>;
}

export const GetForwardMessageAccessContext = async (
  userId: number | string
): Promise<ForwardMessageAccessContext | null> => {
  const authenticatedUserId = Number(userId);
  const user = await User.findByPk(authenticatedUserId, {
    attributes: ["id", "profile"]
  });

  if (!user) return null;

  const isAdmin = user.profile === "admin";
  const userQueues = isAdmin
    ? []
    : await UserQueue.findAll({
        where: { userId: authenticatedUserId },
        attributes: ["queueId"]
      });

  return {
    userId: authenticatedUserId,
    isAdmin,
    userQueueIds: new Set(userQueues.map(item => Number(item.queueId)))
  };
};

export const CanAccessForwardTicket = (
  ticket: Ticket,
  access: ForwardMessageAccessContext
): boolean => {
  if (access.isAdmin) return true;

  const hasQueueAccess =
    ticket.queueId !== null &&
    ticket.queueId !== undefined &&
    access.userQueueIds.has(Number(ticket.queueId));
  const hasAssignmentAccess =
    (ticket.userId !== null &&
      ticket.userId !== undefined &&
      Number(ticket.userId) === access.userId) ||
    ticket.status === "pending";

  return hasQueueAccess && hasAssignmentAccess;
};
