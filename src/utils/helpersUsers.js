const User = require('../models/user')
const spotifyService = require('../services/spotify')
const helperArtists = require('./helperArtists')
const nodemailer = require("nodemailer")
const fs = require('fs')
const path = require('path')

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY

async function getUserArtists(userId) {
    return await User.findOne({ userId: userId }).select({ artists: 1 }).lean()
}

async function updateUserStatus(userId, status) {
    const user = await User.findOneAndUpdate({ userId: userId }, { status: status }, {new: true}).lean()
    return user.status
}

async function updateUserLatLong(userId, lat, long) {
    const user = await User.findOneAndUpdate({ userId: userId }, { location: {lat: lat, long: long} }, {new: true}).lean()
    return user.location
}

async function updateEventsSelection(userId, eventsSelection) {
    const user = await User.findOneAndUpdate({ userId: userId }, { eventsSelection: eventsSelection }, {new: true}).lean()
    return user.eventsSelection
}

async function increaseUserProcessedPhases(userId) {
    const user = await User.findOneAndUpdate({ userId: userId }, {$inc : {'processedPhases' : 1}}, {new: true}).lean()
    return user.processedPhases
}

async function updateUserRecommendedEvents(userId, recommendedEvents) {
    await User.findOneAndUpdate({ userId: userId }, { recommendedEvents: recommendedEvents })
}

async function saveArtistsToAsk(userId, artistsToAsk) {
    await User.findOneAndUpdate({ userId: userId }, { artistsToAsk: artistsToAsk })
}

async function saveUserEvents(userId, events) {
    await User.findOneAndUpdate({ userId: userId }, { events: events })
}

async function saveUserArtistsScored(userId, artists) {
    console.log(`Starting Saving User's Artists Scored...`)
    const user = await getUserArtists(userId)
    let userArtists = {}
    if (user.artists) {
        user.artists.forEach(function (item) {
            userArtists[item.score] = item.artists
        })
    }

    let artistsScoredIds = []
    let plainArtistsList = []
    for (let key in artists) {
        const artistIds = artists[key].map(function (artist) {
            if (artist.id) return artist.id
            if (artist.artistId) return artist.artistId
        })
        let artistIdsConcated = artistIds
        artistIdsConcated = artistIdsConcated.concat(userArtists[key])
        artistsScoredIds.push({
            score: key,
            artists: artistIdsConcated
        })
        plainArtistsList = plainArtistsList.concat(artistIds)
    }
    await User.findOneAndUpdate({ userId: userId }, { artists: artistsScoredIds })
    console.log(`User's Artists Scored Saved OK!`)
    return plainArtistsList
}

async function getUserTopArtists(access_token) {
    console.log(`Starting Getting User Top Artists...`)
    let userTop100ArtistsResponseByTimeRange = await spotifyService.getUserTopArtists(access_token)
    let userTop100ArtistsResponse = []
    for (const userTop100ArtistResponseByTimeRange of userTop100ArtistsResponseByTimeRange) {
        userTop100ArtistsResponse = userTop100ArtistsResponse.concat(userTop100ArtistResponseByTimeRange)
    }

    let artistsFound = await helperArtists.findArtists(userTop100ArtistsResponse.map(function (artist) { return artist.id }))

    for (const artistFound of artistsFound) {
        const foundIndex = userTop100ArtistsResponse.findIndex(artist => artist.id == artistFound.artistId)
        if (foundIndex !== -1) userTop100ArtistsResponse[foundIndex] = { ...artistFound, notSave: true }
    }
    //Check artists exists in BD //TODO

    console.log(`User Top Artists OK!`)
    return userTop100ArtistsResponse
}

async function sendProcessFinishedEmail(email) {
    let transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
            user: "apikey",
            pass: SENDGRID_API_KEY
        }
    })

    const html = fs.readFileSync(path.resolve(__dirname, '../mail/finish/mail.html'));

    // send mail with defined transport object
    let info = await transporter.sendMail({
        from: 'Showmate Support showmate.sup@gmail.com',
        to: email,
        subject: "Eventos recomendados disponibles!",
        text: html,
        html: html,
        attachments: [{
            filename: 'image-1.png',
            path: path.resolve(__dirname, '../mail/finish/images/image-1.png'),
            cid: 'images/image-1.png'
        },
        {
            filename: 'image-2.png',
            path: path.resolve(__dirname, '../mail/finish/images/image-2.png'),
            cid: 'images/image-2.png'
        },
        {
            filename: 'image-3.png',
            path: path.resolve(__dirname, '../mail/finish/images/image-3.png'),
            cid: 'images/image-3.png'
        },
        {
            filename: 'image-4.png',
            path: path.resolve(__dirname, '../mail/finish/images/image-4.png'),
            cid: 'images/image-4.png'
        },
        {
            filename: 'image-5.png',
            path: path.resolve(__dirname, '../mail/finish/images/image-5.png'),
            cid: 'images/image-5.png'
        },
        {
            filename: 'image-6.png',
            path: path.resolve(__dirname, '../mail/finish/images/image-6.png'),
            cid: 'images/image-6.png'
        }]
    })

    console.log("Message sent: %s", info.messageId)
}

module.exports = {
    getUserArtists,
    updateUserStatus,
    saveArtistsToAsk,
    increaseUserProcessedPhases,
    updateUserRecommendedEvents,
    saveUserEvents,
    saveUserArtistsScored,
    getUserTopArtists,
    sendProcessFinishedEmail,
    updateUserLatLong,
    updateEventsSelection
}