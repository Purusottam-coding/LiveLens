import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { config } from './config/env';
import { registerSignalingSocket } from './sockets/signalingSocket';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

registerSignalingSocket(io);

// Listen on 0.0.0.0 so phone and devices on LAN can connect
server.listen(config.port, '0.0.0.0', () => {
  console.log(`LiveLens server running on port ${config.port} in ${config.nodeEnv} mode`);
});
