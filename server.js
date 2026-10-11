// Vercel detects this root server entry point and routes requests into the
// existing Node.js application. Local development remains available through api.js.
const { server } = require('./api.js');

server.listen(Number(process.env.PORT || 3000));
