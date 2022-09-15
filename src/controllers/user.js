
const User = require('../models/user')
const spotifyService = require('../services/spotify')
const nodemailer = require("nodemailer")

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

async function createUser(req, res, next) {
    try {
        const email = req.body.email

        const userInfo = await User.findOne({ email: email }).lean()
        if (userInfo) {
            res.json({
                status: 401,
                userInfo: userInfo
            })
            return
        }

        let transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            auth: {
                user: "apikey",
                pass: SENDGRID_API_KEY
            }
        })

        await transporter.sendMail({
            from: 'Showmate Support showmate.sup@gmail.com',
            to: 'javiermf.98@gmail.com', //TODO
            subject: "Nuevo usuario!",
            text: `El usuario con email ${email} quiere acceder a Showmate!`
        })
        
        res.json({ status: 200 })
    } catch (err) {
        console.error(`Error in createUser`, err.message);
        next(err);
    }
}

async function getUserInfo(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`User info error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }
        const userInfoResponse = await spotifyService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`User info error. Not userInfoResponse`)
            res.json({
                status: 500
            })
            return
        }

        let filter = { userId: userInfoResponse.id }
        let update = {
            email: userInfoResponse.email,
            country: userInfoResponse.country,
            display_name: userInfoResponse.display_name,
            uri: userInfoResponse.uri,
            access_token: access_token
        }
        const userInfo = await User.findOneAndUpdate(filter, update, { new: true, upsert: true }).lean()

        res.json({ status: 200, userInfo: userInfo })
    } catch (err) {
        console.error(`Error in getUserInfo`, err.message);
        next(err);
    }
}

module.exports = {
    createUser,
    getUserInfo 
}
