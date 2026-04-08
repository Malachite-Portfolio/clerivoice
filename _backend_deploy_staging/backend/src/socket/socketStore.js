let socketServer = null;

const setSocketServer = (io) => {
  socketServer = io;
};

const getSocketServer = () => socketServer;

module.exports = {
  setSocketServer,
  getSocketServer,
};
