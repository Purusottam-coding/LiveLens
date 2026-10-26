import { Router } from 'express';
import { sessionController } from '../controllers/sessionController';

const router = Router();

router.post('/', sessionController.create);
router.post('/join', sessionController.join);
router.get('/:id', sessionController.get);
router.delete('/:id', sessionController.end);

export default router;
