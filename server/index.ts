import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/config';
import { setupMatchRoutes, setupSlipRoutes, setupOddsRoutes, setupAuthRoutes } from './routes/api';
import { errorHandler } from './middleware/auth';

const app = express();

app.use(express.json());
app.use(cors());

setupMatchRoutes(app);
setupSlipRoutes(app);
setupOddsRoutes(app);
setupAuthRoutes(app);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Multiplatore server running on port ${config.port} (${config.nodeEnv})`);
});

export default app;
