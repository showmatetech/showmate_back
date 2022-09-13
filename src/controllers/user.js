
const User = require('../models/user')
const Artist = require('../models/artist')
const Track = require('../models/track')
const Event = require('../models/event')
const userService = require('../services/user')
const eventsService = require('../services/events')
const aiService = require('../services/ai')
const nodemailer = require("nodemailer")
const fs = require('fs')

const SENDGRID_API_KEY = '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'

function removeDuplicates(newArtists, artists) {
    let newArtistsFiltered = newArtists
    for (let score in artists) {
        newArtistsFiltered = newArtistsFiltered.filter((newArtist) => artists[score].map(function (artist) {
            if (artist.id) return artist.id
            if (artist.artistId) return artist.artistId
        }).indexOf(newArtist.id) < 0)
    }
    return newArtistsFiltered
}

async function saveArtists(artists) {
    try {
        const artistsParsed = artists.filter(function (artist) {
            if (!artist._id || artist._id === undefined || !artist.notSave || artist.notSave !== undefined) return true
            return false
        }).map(function (artist) {
            return {
                artistId: artist.id,
                uri: artist.uri,
                popularity: artist.popularity,
                name: artist.name,
                href: artist.href,
                genres: artist.genres,
                externalUrls: artist.external_urls,
                images: artist.images,
                ...(artist.songkickArtistId) && { songkickArtistId: artist.songkickArtistId }
            }
        })
        await Artist.bulkWrite(artistsParsed.map(artistParsed => ({
            updateOne: {  //TODO No actualizar?? Solo crear?? -> Habría que actualizar siempre, ya que puede que se guarden/actualicen artistas bien desde evento o bien desde usuario
                filter: { artistId: artistParsed.artistId },
                update: artistParsed,
                upsert: true
            }
        })))
    }
    catch (err) {
        console.log(err)
    }
}

async function saveTopTracks(topTracksPerArtists) {
    try {
        await Artist.bulkWrite(topTracksPerArtists.map(topTracksPerArtist => ({
            updateOne: {  //No actualizar?? Solo crear??
                filter: { artistId: topTracksPerArtist.artistId },
                update: { topTracks: topTracksPerArtist.topTracks },
                upsert: true
            }
        })))
    }
    catch (err) {
        console.log(err)
    }
}

async function saveTracks(tracks) {
    try {
        const tracksNotNull = tracks.filter(function (track) {
            if (track !== null) return true
            return false
        })

        await Track.bulkWrite(tracksNotNull.map(track => ({
            updateOne: {  //No actualizar?? Solo crear??
                filter: { trackId: track.id },
                update: {
                    trackId: track.id,
                    acousticness: track.acousticness,
                    danceability: track.danceability,
                    duration_ms: track.durationMs,
                    energy: track.energy,
                    instrumentalness: track.instrumentalness,
                    key: track.key,
                    liveness: track.liveness,
                    loudness: track.loudness,
                    mode: track.mode,
                    speechiness: track.speechiness,
                    tempo: track.tempo,
                    time_signature: track.timeSignature,
                    valence: track.valence
                },
                upsert: true
            }
        })))
    }
    catch (err) {
        console.log(err)
    }
}

async function findArtists(artistIds) {
    const result = await Artist.find({
        'artistId': { $in: artistIds }
    }).lean()
    return result
}

async function findArtistsWithTopTracks(artistIds) {
    const result = await Artist.find({
        'artistId': { $in: artistIds },
        'topTracks': { $exists: true, $ne: [] }
    }).select({ artistId: 1 }).lean()
    return result
}

async function getUserArtists(userId) {
    return await User.findOne({ userId: userId }).select({ artists: 1 }).lean()
}

async function updateUserStatus(userId, status) {
    await User.findOneAndUpdate({ userId: userId }, { status: status })
}

async function updateUserRecommendedEvents(userId, recommendedEvents) {
    await User.findOneAndUpdate({ userId: userId }, { recommendedEvents: recommendedEvents })
}

async function saveUserEvents(userId, events) {
    await User.findOneAndUpdate({ userId: userId }, { events: events })
}

async function saveEvents(events) {
    try {

        await Event.bulkWrite(events.map(event => ({
            updateOne: {
                filter: { eventId: event.eventId },
                update: {
                    eventId: event.eventId,
                    artists: event.artists
                },
                upsert: true
            }
        })))
    }
    catch (err) {
        console.log(err)
    }
}

async function _saveUsersArtistsScored(userId, artists) {
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

async function _getArtistsTopTracks(access_token, plainArtistsList) {
    const artistsWithTopTracksFound = await findArtistsWithTopTracks(plainArtistsList)

    const artistsDeletedFound = plainArtistsList.filter((plainArtist) => artistsWithTopTracksFound.map(function (artist) {
        if (artist.artistId) return artist.artistId
        if (artist.id) return artist.id
    }).indexOf(plainArtist) < 0)

    console.log(`Starting Top Tracks of Artists...`)
    const topTracksPerArtists = await userService.getArtistsTopTracks(access_token, artistsDeletedFound)
    await saveTopTracks(topTracksPerArtists)
    console.log(`Top Tracks of Artists OK!`)

    let plainTopTracksList = []
    for (let topTracksPerArtist of topTracksPerArtists) {
        plainTopTracksList = plainTopTracksList.concat(topTracksPerArtist.topTracks)
    }
    const uniqueTracks = plainTopTracksList.filter((v, i, a) => a.indexOf(v) === i)
    return uniqueTracks
}

async function _getTracksInfo(access_token, uniqueTracks) {
    console.log(`Starting Tracks Audio Features...`)
    const tracksInfo = await userService.getTracksAudioFeatures(access_token, uniqueTracks)
    await saveTracks(tracksInfo)
    console.log(`Tracks Audio Features OK!`)
}

async function _processTracks(access_token, plainArtistsList) {
    console.log(`Starting Processing Tracks...`)
    const uniqueTracks = await _getArtistsTopTracks(access_token, plainArtistsList)
    _getTracksInfo(access_token, uniqueTracks)
    console.log(`Process Tracks OK!`)
}

async function _getUserTopArtists(access_token) {
    console.log(`Starting Getting User Top Artists...`)
    let userTop100ArtistsResponseByTimeRange = await userService.getUserTopArtists(access_token)
    let userTop100ArtistsResponse = []
    for (const userTop100ArtistResponseByTimeRange of userTop100ArtistsResponseByTimeRange) {
        userTop100ArtistsResponse = userTop100ArtistsResponse.concat(userTop100ArtistResponseByTimeRange)
    }

    let artistsFound = await findArtists(userTop100ArtistsResponse.map(function (artist) { return artist.id }))

    for (const artistFound of artistsFound) {
        const foundIndex = userTop100ArtistsResponse.findIndex(artist => artist.id == artistFound.artistId)
        if (foundIndex !== -1) userTop100ArtistsResponse[foundIndex] = { ...artistFound, notSave: true }
    }
    //Check artists exists in BD //TODO

    console.log(`User Top Artists OK!`)
    return userTop100ArtistsResponse
}

async function _getRelatedArtists(access_token, artists, artistToCompare, removeDup) {
    console.log(`Starting Getting Related Artists...`)
    const relatedArtistsResponse = await userService.getArtistsRelatedArtists(access_token, artists)
    let uniqueArtists = removeDup ? removeDuplicates(relatedArtistsResponse, artistToCompare) : relatedArtistsResponse
    const artistsFound = await findArtists(uniqueArtists.map(function (artist) { return artist.id }))
    for (const artistFound of artistsFound) {
        const foundIndex = uniqueArtists.findIndex(artist => artist.id == artistFound.artistId)
        if (foundIndex !== -1) uniqueArtists[foundIndex] = { ...artistFound, notSave: true }
    }
    //Check artists exists in BD //TODO

    console.log(`Related Artists OK!`)
    return uniqueArtists
}

async function _getArtistsToAsk(access_token, artists, artistToCompare, removeDup) {
    console.log(`Starting Getting Artists To Ask...`)
    //Related Artists
    const relatedArtists2Response = await userService.getArtistsRelatedArtists(access_token, artists)
    let uniqueArtists = removeDup ? removeDuplicates(relatedArtists2Response, artistToCompare) : relatedArtists2Response
    const artistsFound = await findArtists(uniqueArtists.map(function (artist) { return artist.id }))
    for (const artistFound of artistsFound) {
        const foundIndex = uniqueArtists.findIndex(artist => artist.id == artistFound.artistId)
        if (foundIndex !== -1) uniqueArtists[foundIndex] = { ...artistFound, notSave: true }
    }

    //Check artists exists in BD
    const artistsToSearch = uniqueArtists.filter(function (artist) {
        if (!artist.name) return true
        return false
    })
    const artistsSearchedResponde = await userService.getArtists(access_token, artistsToSearch.map(function (artist) { return artist.id }))
    uniqueArtists = uniqueArtists.map(artist => artistsSearchedResponde.find(artistSearched => artistSearched.id === artist.id || artistSearched.id === artist.artistId) || artist)
    await saveArtists(uniqueArtists)

    //Get random slice
    uniqueArtists.sort(function () { return 0.5 - Math.random() })
    let artistsToAsk = uniqueArtists.slice(0, 60)

    //Get top tracks
    const artistsTopTracksResponse = await userService.getArtistsTopTracks(access_token, artistsToAsk.filter(function (artist) {
        if (artist.topTracks && artist.topTracks.length > 0) return false
        return true
    }).map(artist => {
        if (artist.id) return artist.id
        if (artist.artistId) return artist.artistId
    })
    )
    artistsToAsk = artistsToAsk.map(artist => {
        const found = artistsTopTracksResponse.find(artistTopTracksSearched => artistTopTracksSearched.artistId === artist.id || artistTopTracksSearched.artistId === artist.artistId)
        if (found) return { ...artist, topTracks: found.topTracks, topTrack: found.topTracks[0] }
        return { ...artist, topTrack: artist.topTracks[0] }
    }
    )

    //Get tracks info
    const tracksSearchedResponse = await userService.getTracks(access_token, artistsToAsk.map(function (artist) { return artist.topTrack }))
    artistsToAsk = artistsToAsk.map(artist => {
        const found = tracksSearchedResponse.find(trackSearched => trackSearched.id === artist.topTrack)
        if (found) return { ...artist, topTrack: found }
    }
    )
    console.log(`Artists To Ask OK!`)
    return artistsToAsk
}

async function _getPossibleEvents(access_token, userId, lat, long, minDate, maxDate) {
    console.log(`Starting Getting Possible Events...`)
    let artistsByEvent = {}
    const events = await eventsService.getUpcomingEventsByMetroArea(lat, long, minDate, maxDate)

    for (const event of events) {
        for (const artist of event.performance) {
            let artistEvents = [event.id]
            if (artistsByEvent[artist.artist.id] && artistsByEvent[artist.artist.id].events.length > 0) {
                artistEvents = artistsByEvent[artist.artist.id].events
                artistEvents.push(event.id)
            }
            artistsByEvent[artist.artist.id] = {
                events: artistEvents,
                artistName: artist.artist.displayName
            }
        }
    }

    const resultSearchArtistsOnSpotify = await userService.searchArtists(access_token, artistsByEvent)
    const artistsByEventList = Object.entries(resultSearchArtistsOnSpotify).map(entry => entry[1])

    let artistByEventFound = await findArtists(artistsByEventList.map(function (artistByEvent) { return artistByEvent.id }))
    artistByEventFound = artistByEventFound.filter(function (artistFound) {
        if (artistFound.topTracks && artistFound.topTracks.length > 0) return true
        return false
    })

    const artistsByEventListDeletedFound = artistsByEventList.filter((artistByEvent) => artistByEventFound.map(function (artist) {
        return artist.artistId
    }).indexOf(artistByEvent.id) < 0)

    const topTracksPerArtistsPerEvent = await userService.getArtistsTopTracks(access_token, artistsByEventListDeletedFound.map(function (artistByEvent) { return artistByEvent.id }))

    await saveArtists(artistsByEventList)
    await saveTopTracks(topTracksPerArtistsPerEvent)

    let plainTopTracksPerArtistsPerEvent = []
    for (let topTracksPerArtist of topTracksPerArtistsPerEvent) {
        plainTopTracksPerArtistsPerEvent = plainTopTracksPerArtistsPerEvent.concat(topTracksPerArtist.topTracks)
    }
    const uniqueTracksEvents = plainTopTracksPerArtistsPerEvent.filter((v, i, a) => a.indexOf(v) === i)

    console.log(`Starting Tracks Audio Features for Events...`)
    const tracksInfoEvents = await userService.getTracksAudioFeatures(access_token, uniqueTracksEvents)
    await saveTracks(tracksInfoEvents)
    console.log(`Tracks Audio Features for Events OK!`)

    let eventsToSave = {}
    for (const artistByEvent of artistsByEventList) {
        for (const event of artistByEvent.events) {
            let artistOnEvent = [artistByEvent.id]
            if (eventsToSave[event] && eventsToSave[event].artists.length > 0) {
                artistOnEvent = eventsToSave[event].artists
                artistOnEvent.push(artistByEvent.id)
            }
            eventsToSave[event] = {
                eventId: event,
                artists: artistOnEvent
            }
        }
    }
    eventsToSave = Object.entries(eventsToSave).map(entry => entry[1])
    await saveEvents(eventsToSave)
    await saveUserEvents(userId, eventsToSave.map(event => event.eventId))
    console.log(`Possible Events OK!`)
}

async function _sendProcessFinishedEmail(email) {
    let transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
            user: "apikey",
            pass: SENDGRID_API_KEY
        }
    })

    const html = fs.readFileSync('/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/mail.html').toString()

    // send mail with defined transport object
    let info = await transporter.sendMail({
        from: 'Showmate Support showmate.sup@gmail.com',
        to: email,
        subject: "Eventos recomendados disponibles!",
        text: html,
        html: html,
        attachments: [{
            filename: 'image-1.png',
            path: '/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/images/image-1.png',
            cid: 'images/image-1.png'
        },
        {
            filename: 'image-2.png',
            path: '/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/images/image-2.png',
            cid: 'images/image-2.png'
        },
        {
            filename: 'image-3.png',
            path: '/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/images/image-3.png',
            cid: 'images/image-3.png'
        },
        {
            filename: 'image-4.png',
            path: '/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/images/image-4.png',
            cid: 'images/image-4.png'
        },
        {
            filename: 'image-5.png',
            path: '/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/images/image-5.png',
            cid: 'images/image-5.png'
        },
        {
            filename: 'image-6.png',
            path: '/Users/javiermartinezfernandez/Documents/PROJECTS/tfm/back/src/mail/finish/images/image-6.png',
            cid: 'images/image-6.png'
        }]
    })

    console.log("Message sent: %s", info.messageId)
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
        const userInfoResponse = await userService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`User info error. Not userInfoResponse`)
            res.json({
                status: 500
            })
            return
        }

        //await aiService.processUserAI(userInfoResponse.id)

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

async function startAI(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`Start AI error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }
        const userInfoResponse = await userService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`Start AI error. Not userInfoResponse.`)
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
            access_token: access_token,
            status: 'COLLECTING_DATA',
            //artists: [], TODO
            //events: [] TODO
        }
        const userInfo = await User.findOneAndUpdate(filter, update, { new: true, upsert: true })

        //Possible envents
        _getPossibleEvents(access_token, userInfoResponse.id, '52.370216', '4.895168', '2022-09-01', '2022-10-30')

        let artists = {}

        //User Top Artists
        const userTopArtists = await _getUserTopArtists(access_token)
        artists[1] = userTopArtists
        await saveArtists(userTopArtists)

        //Related Artists
        const relatedArtists = await _getRelatedArtists(access_token, artists[1], artists, true)
        artists[1] = (artists[1] && artists[1].length > 0) ? artists[1].concat(relatedArtists) : relatedArtists
        await saveArtists(relatedArtists)
        console.log(`Score 1 OK!`)

        //Save scored artists on user
        const plainArtistsList = await _saveUsersArtistsScored(userInfoResponse.id, artists)

        //Start async processing tracks -> no await
        _processTracks(access_token, plainArtistsList)

        //Artists to ask
        const artistsToAsk = await _getArtistsToAsk(access_token, relatedArtists, artists, true)

        res.json({ status: 200, userInfo: userInfo, artistsToAsk: artistsToAsk })

    } catch (err) {
        console.error(`Error in startAI`, err.message);
        next(err);
    }
}

async function setUserSelection(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`User Selection error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }

        const userInfoResponse = await userService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`User Selection error. Not userInfoResponse.`)
            res.json({
                status: 500
            })
            return
        }

        const user = await getUserArtists(userInfoResponse.id)
        const likedItems = req.body.likedItems
        const discardedItems = req.body.discardedItems

        let scoredArtistsIds = []
        for (let { score, artists } of user.artists) {
            scoredArtistsIds = scoredArtistsIds.concat(artists)
        }

        const likedItemsRemovedDuplicates = likedItems.filter((likedArtist) => {
            const id = likedArtist.id || likedArtist.artistId
            return scoredArtistsIds.indexOf(id) < 0
        })

        const discardedItemsRemovedDuplicates = discardedItems.filter((discardedArtist) => {
            const id = discardedArtist.id || discardedArtist.artistId
            return scoredArtistsIds.indexOf(id) < 0
        })

        let artists = {}

        const relatedArtistsLiked = await _getRelatedArtists(access_token, likedItemsRemovedDuplicates, artists, true)
        artists[1] = relatedArtistsLiked
        await saveArtists(relatedArtistsLiked)

        const relatedArtistsLiked2 = await _getRelatedArtists(access_token, relatedArtistsLiked, artists, true)
        artists[1] = (artists[1] && artists[1].length > 0) ? artists[1].concat(relatedArtistsLiked2) : relatedArtistsLiked2
        await saveArtists(relatedArtistsLiked2)

        const relatedArtistsDiscarded = await _getRelatedArtists(access_token, discardedItemsRemovedDuplicates, artists, true)
        artists[0] = relatedArtistsDiscarded
        await saveArtists(relatedArtistsDiscarded)

        const relatedArtistsDiscarded2 = await _getRelatedArtists(access_token, relatedArtistsDiscarded, artists, true)
        artists[0] = (artists[0] && artists[0].length > 0) ? artists[0].concat(relatedArtistsDiscarded2) : relatedArtistsDiscarded2
        await saveArtists(relatedArtistsDiscarded2)

        //Save scored artists on user
        const plainArtistsList = await _saveUsersArtistsScored(userInfoResponse.id, artists)

        //Start async processing tracks -> no await
        _processTracks(access_token, plainArtistsList)

        await aiService.processUserAI(userInfoResponse.id)

        res.json({ status: 200 })

    } catch (err) {
        console.error(`Error in setUserSelection`, err.message);
        next(err);
    }
}

async function finish(req, res, next) {
    try {
        const userId = req.body.user_id
        const events = req.body.events

        const userInfo = await User.findOne({ userId: userId }).lean()
        if (!userInfo) {
            console.error(`Finish error. Not userInfo.`)
            res.json({
                status: 500
            })
            return
        }

        let recommendedEvents = []
        for (const { eventId, artistId, trackId } of events) {
            const artistInfo = await Artist.findOne({ artistId: artistId }).lean()
            const trackInfo = await userService.getTracks(userInfo.access_token, [trackId])
            const eventInfo = await eventsService.getEventInfo(eventId)
            recommendedEvents.push({
                eventId: eventId,
                info: eventInfo,
                artistInfo: artistInfo,
                trackInfo: trackInfo[0]
            })
        }

        await updateUserRecommendedEvents(userId, recommendedEvents)
        await updateUserStatus(userId, 'AVAILABLE_RESULTS')

        await _sendProcessFinishedEmail(userInfo.email)

        res.json({ status: 200 })
    } catch (err) {
        console.error(`Error in getUserStatus`, err.message);
        next(err);
    }
}

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

module.exports = {
    startAI,
    getUserInfo,
    setUserSelection,
    finish,
    createUser
}
