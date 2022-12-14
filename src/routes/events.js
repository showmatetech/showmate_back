const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const userController = require('../controllers/user');
const collectorController = require('../controllers/collector');

router.get('/login', authController.login)
  
router.get('/callback', authController.callback)

router.get('/refresh_token', authController.refresh_token)


router.get('/user', userController.getUserInfo)

router.get('/status', userController.getStatus)

router.post('/user/create', userController.createUser)


router.get('/restart', collectorController.restart)

router.get('/start', collectorController.firstPhase)

router.post('/location', collectorController.secondPhase)

router.post('/selection', collectorController.thirdPhase)

router.post('/eventsselection', collectorController.eventsSelection)

router.post('/finish', collectorController.finish)



module.exports = router