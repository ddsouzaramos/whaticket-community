import type {
  MediaPayload,
  MessagePayload
} from "../../handlers/handleWhatsappEvents";
import type { MessageData } from "./CreateMessageService";

interface BuildMessageDataParams {
  messagePayload: MessagePayload;
  ticketId: number;
  contactId?: number;
  mediaPayload?: MediaPayload;
  storedMediaFilename?: string;
}

const BuildMessageData = ({
  messagePayload,
  ticketId,
  contactId,
  mediaPayload,
  storedMediaFilename
}: BuildMessageDataParams): MessageData => {
  const messageData: MessageData = {
    id: messagePayload.id,
    ticketId,
    contactId,
    body: messagePayload.body,
    fromMe: messagePayload.fromMe,
    read: messagePayload.fromMe,
    mediaType: messagePayload.type,
    quotedMsgId: messagePayload.quotedMsgId,
    ack: messagePayload.ack !== undefined ? messagePayload.ack : 0,
    providerMessageId: messagePayload.providerMessageId,
    remoteJid: messagePayload.remoteJid,
    providerType: messagePayload.providerType,
    caption: messagePayload.caption
  };

  if (mediaPayload && messagePayload.hasMedia && storedMediaFilename) {
    messageData.mediaUrl = storedMediaFilename;
    messageData.body = messagePayload.body || storedMediaFilename;
    const [mediaType] = mediaPayload.mimetype.split("/");
    messageData.mediaType = mediaType;
    messageData.mediaMimeType = mediaPayload.mimetype || undefined;
    messageData.mediaFilename = mediaPayload.filename || undefined;
  }

  return messageData;
};

export default BuildMessageData;
