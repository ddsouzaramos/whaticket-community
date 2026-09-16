import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL
    }
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token || socket.handshake.query?.token;

    try {
      verify(token, authConfig.secret);
      return next();
    } catch (error) {
      const authError = new Error("Socket authentication failed") as Error & {
        data?: { code: string };
      };
      authError.data = { code: "SOCKET_AUTH_ERROR" };
      logger.warn(
        { error: error instanceof Error ? error.name : "UnknownError" },
        "Socket authentication failed"
      );
      return next(authError);
    }
  });

  io.on("connection", socket => {
    logger.info("Client Connected");
    socket.on("joinChatBox", (ticketId: string) => {
      logger.info("A client joined a ticket channel");
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      logger.info("A client joined notification channel");
      socket.join("notification");
    });

    socket.on("joinTickets", (status: string) => {
      logger.info(`A client joined to ${status} tickets channel.`);
      socket.join(status);
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected");
    });

    return socket;
  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};
