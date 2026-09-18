import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  Default,
  DefaultScope,
  BelongsTo,
  ForeignKey
} from "sequelize-typescript";
import Contact from "./Contact";
import Ticket from "./Ticket";

@DefaultScope(() => ({
  attributes: {
    exclude: [
      "providerMessageId",
      "remoteJid",
      "providerType",
      "mediaMimeType",
      "mediaFilename",
      "caption"
    ]
  }
}))
@Table
class Message extends Model<Message> {
  @PrimaryKey
  @Column
  id: string;

  @Default(0)
  @Column
  ack: number;

  @Default(false)
  @Column
  read: boolean;

  @Default(false)
  @Column
  fromMe: boolean;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.STRING)
  get mediaUrl(): string | null {
    if (this.getDataValue("mediaUrl")) {
      return `${process.env.BACKEND_URL}:${
        process.env.PROXY_PORT
      }/public/${this.getDataValue("mediaUrl")}`;
    }
    return null;
  }

  @Column
  mediaType: string;

  @Column(DataType.STRING(512))
  providerMessageId: string | null;

  @Column(DataType.STRING)
  remoteJid: string | null;

  @Column(DataType.STRING)
  providerType: string | null;

  @Column(DataType.STRING)
  mediaMimeType: string | null;

  @Column(DataType.STRING(512))
  mediaFilename: string | null;

  @Column(DataType.TEXT)
  caption: string | null;

  @Default(false)
  @Column
  isDeleted: boolean;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @ForeignKey(() => Message)
  @Column
  quotedMsgId: string;

  @BelongsTo(() => Message, "quotedMsgId")
  quotedMsg: Message;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact, "contactId")
  contact: Contact;
}

export default Message;
