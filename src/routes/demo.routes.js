import { Router } from 'express';
import {
  demoEventEmitter,
  demoBuffer,
  demoStreams,
  demoWorkerThread,
  demoFS,
  demoRedis,
  demoDuplex,
} from '../controllers/demo.controller.js';

const router = Router();

/**
 * Demo routes — isolated concept demonstrations
 * All at /api/demo/*
 */
router.get('/event-emitter', demoEventEmitter);
router.get('/buffer', demoBuffer);               // ?text=YourText
router.get('/streams', demoStreams);
router.get('/worker-thread', demoWorkerThread);
router.get('/fs', demoFS);
router.get('/redis', demoRedis);
router.get('/duplex', demoDuplex);

export default router;
