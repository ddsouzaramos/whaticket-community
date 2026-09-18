import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.addColumn("Messages", "providerMessageId", {
      type: DataTypes.STRING(512),
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "remoteJid", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "providerType", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "mediaMimeType", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "mediaFilename", {
      type: DataTypes.STRING(512),
      allowNull: true
    });
    await queryInterface.addColumn("Messages", "caption", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Tickets", "providerChatId", {
      type: DataTypes.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn("Tickets", "providerChatId");
    await queryInterface.removeColumn("Messages", "caption");
    await queryInterface.removeColumn("Messages", "mediaFilename");
    await queryInterface.removeColumn("Messages", "mediaMimeType");
    await queryInterface.removeColumn("Messages", "providerType");
    await queryInterface.removeColumn("Messages", "remoteJid");
    await queryInterface.removeColumn("Messages", "providerMessageId");
  }
};
