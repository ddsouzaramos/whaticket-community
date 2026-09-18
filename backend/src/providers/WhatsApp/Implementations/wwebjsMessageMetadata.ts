interface WwebjsMessageMetadataSource {
  id: {
    _serialized?: string;
    remote?: string;
  };
  type: string;
  hasMedia: boolean;
  body: string;
}

interface DownloadedMedia {
  filename?: string | null;
  mimetype: string;
  data: string;
}

export const extractWwebjsMessageMetadata = (
  message: WwebjsMessageMetadataSource
) => ({
  providerMessageId: message.id._serialized || undefined,
  remoteJid:
    typeof message.id.remote === "string" ? message.id.remote : undefined,
  providerType: message.type,
  caption: message.hasMedia && message.body ? message.body : undefined
});

export const buildWwebjsMediaPayload = (media: DownloadedMedia) => ({
  filename: media.filename || "",
  mimetype: media.mimetype,
  data: media.data
});
