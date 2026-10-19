import express from 'express';
import cors from 'cors';
import sessionRoutes from './routes/sessionRoutes';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();

// Allow requests from any origin (local network, phone IP, localhost)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/api', rateLimiter);

app.use('/api/sessions', sessionRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

export default app;
