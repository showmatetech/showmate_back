const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth');
const userController = require('../controllers/user');

router.get('/login', authController.login)
  
router.get('/callback', authController.callback)

router.get('/refresh_token', authController.refresh_token)

router.get('/start', userController.startAI)

router.get('/user', userController.getUserInfo)

router.post('/user/create', userController.createUser)

router.post('/selection', userController.setUserSelection)

router.post('/finish', userController.finish)


module.exports = router