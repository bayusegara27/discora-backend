const { Client, Databases, Query, ID } = require('node-appwrite');
const config = require('../config');

const appwriteClient = new Client()
    .setEndpoint(config.APPWRITE.ENDPOINT)
    .setProject(config.APPWRITE.PROJECT_ID)
    .setKey(config.APPWRITE.API_KEY);

const databases = new Databases(appwriteClient);

module.exports = {
    databases,
    Query,
    ID
};
