const { handleRequest } = require('../api.js');

module.exports = function routeRequest(request, response) {
  return handleRequest(request, response);
};
