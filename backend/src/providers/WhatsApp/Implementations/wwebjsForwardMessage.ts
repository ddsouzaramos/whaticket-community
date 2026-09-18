import AppError from "../../../errors/AppError";

interface ForwardableMessage {
  forward(destinationProviderChatId: string): Promise<void>;
}

interface ForwardCapableClient {
  getState(): Promise<string>;
  getMessageById(
    providerMessageId: string
  ): Promise<ForwardableMessage | null | undefined>;
}

const ForwardWwebjsMessage = async (
  client: ForwardCapableClient,
  providerMessageId: string,
  destinationProviderChatId: string
): Promise<void> => {
  const state = await client.getState();

  if (state !== "CONNECTED") {
    throw new AppError("ERR_FORWARD_WHATSAPP_NOT_READY", 503);
  }

  const originalMessage = await client.getMessageById(providerMessageId);

  if (!originalMessage) {
    throw new AppError("ERR_FORWARD_ORIGINAL_MESSAGE_UNAVAILABLE", 404);
  }

  await originalMessage.forward(destinationProviderChatId);
};

export default ForwardWwebjsMessage;
