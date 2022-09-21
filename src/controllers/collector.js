const User = require('../models/user')
const Artist = require('../models/artist')
const songkickService = require('../services/songkick')
const spotifyService = require('..//services/spotify')
const helperArtists = require('../utils/helperArtists')
const helpersEvents = require('../utils/helpersEvents')
const helpersTracks = require('../utils/helpersTracks')
const helpersUsers = require('../utils/helpersUsers')

async function _getArtistsToAsk(access_token, userInfoResponse) {
        let artists = {}
        //User Top Artists
        const userTopArtists = await helpersUsers.getUserTopArtists(access_token)
        artists[1] = userTopArtists
        await helperArtists.saveArtists(userTopArtists)

        //Related Artists
        const relatedArtists = await helperArtists.getRelatedArtists(access_token, artists[1], artists, true)
        artists[1] = (artists[1] && artists[1].length > 0) ? artists[1].concat(relatedArtists) : relatedArtists
        await helperArtists.saveArtists(relatedArtists)
        console.log(`Score 1 OK!`)

        //Save scored artists on user
        const plainArtistsList = await helpersUsers.saveUserArtistsScored(userInfoResponse.id, artists)

        //Start async processing tracks -> no await
        helpersTracks.processTracks(access_token, plainArtistsList, userInfoResponse.id)

        //Artists to ask
        const artistsToAsk = await helperArtists.getArtistsToAsk(access_token, relatedArtists, artists, true)

        await helpersUsers.saveArtistsToAsk(userInfoResponse.id, artistsToAsk)

        await helpersUsers.updateUserStatus(userInfoResponse.id, 'WAITING_SELECTION')
}
async function firstPhase(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`Start AI error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }
        const userInfoResponse = await spotifyService.getUserInfo(access_token)
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
            artists: [],
            events: [],
            processedPhases: 0,
            artistsToAsk: [],
            status: 'INITIAL_STATE',
            location: {},
            eventsSelection: []
        }
        await User.findOneAndUpdate(filter, update, { new: true, upsert: true })

        _getArtistsToAsk(access_token, userInfoResponse)

        res.json({ status: 200 })

    } catch (err) {
        console.error(`Error in startAI`, err.message);
        next(err);
    }
}
async function _getEvents(access_token, userInfoResponse, lat, long) {
    //Possible envents
    const today = new Date()
    const todayFormatted = today.toISOString().split('T')[0]
    const today1Month = new Date(today.setMonth(today.getMonth()+8))
    const today1MonthFormatted = today1Month.toISOString().split('T')[0]
    helpersEvents.getPossibleEvents(access_token, userInfoResponse.id, lat, long, todayFormatted, today1MonthFormatted)
}

async function secondPhase(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`Get events error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }
        const userInfoResponse = await spotifyService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`Get events error. Not userInfoResponse.`)
            res.json({
                status: 500
            })
            return
        }

        const lat = req.body.lat
        const long = req.body.long

        _getEvents(access_token, userInfoResponse, lat, long)

        await helpersUsers.updateUserLatLong(userInfoResponse.id, lat, long)

        res.json({ status: 200 })

    } catch (err) {
        console.error(`Error in startAI`, err.message);
        next(err);
    }
}

async function _processSelection(access_token, userInfoResponse, user, likedItems, discardedItems) {
    try {
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

        const relatedArtistsLiked = await helperArtists.getRelatedArtists(access_token, likedItemsRemovedDuplicates, artists, true)
        artists[1] = relatedArtistsLiked
        await helperArtists.saveArtists(relatedArtistsLiked)

        const relatedArtistsLiked2 = await helperArtists.getRelatedArtists(access_token, relatedArtistsLiked, artists, true)
        artists[1] = (artists[1] && artists[1].length > 0) ? artists[1].concat(relatedArtistsLiked2) : relatedArtistsLiked2
        await helperArtists.saveArtists(relatedArtistsLiked2)

        const relatedArtistsDiscarded = await helperArtists.getRelatedArtists(access_token, discardedItemsRemovedDuplicates, artists, true)
        artists[0] = relatedArtistsDiscarded
        await helperArtists.saveArtists(relatedArtistsDiscarded)

        const relatedArtistsDiscarded2 = await helperArtists.getRelatedArtists(access_token, relatedArtistsDiscarded, artists, true)
        artists[0] = (artists[0] && artists[0].length > 0) ? artists[0].concat(relatedArtistsDiscarded2) : relatedArtistsDiscarded2
        await helperArtists.saveArtists(relatedArtistsDiscarded2)

        //Save scored artists on user
        const plainArtistsList = await helpersUsers.saveUserArtistsScored(userInfoResponse.id, artists)

        //Start async processing tracks -> no await
        helpersTracks.processTracks(access_token, plainArtistsList, userInfoResponse.id)
    } catch (err) {
        console.error(`Error in _setUserSelection`, err.message);
        next(err);
    }
}

async function thirdPhase(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`User Selection error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }

        const userInfoResponse = await spotifyService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`User Selection error. Not userInfoResponse.`)
            res.json({
                status: 500
            })
            return
        }

        const user = await helpersUsers.getUserArtists(userInfoResponse.id)
        const likedItems = req.body.likedItems
        const discardedItems = req.body.discardedItems

        await helpersUsers.updateUserStatus(userInfoResponse.id, 'COLLECTING_DATA')

        _processSelection(access_token, userInfoResponse, user, likedItems, discardedItems)

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
            const trackInfo = await spotifyService.getTracks(userInfo.access_token, [trackId])
            const eventInfo = await songkickService.getEventInfo(eventId)
            recommendedEvents.push({
                eventId: eventId,
                info: eventInfo,
                artistInfo: artistInfo,
                trackInfo: trackInfo[0]
            })
        }

        await helpersUsers.updateUserRecommendedEvents(userId, recommendedEvents)
        await helpersUsers.updateUserStatus(userId, 'AVAILABLE_RESULTS')

        await helpersUsers.sendProcessFinishedEmail(userInfo.email)

        res.json({ status: 200 })
    } catch (err) {
        console.error(`Error in getUserStatus`, err.message);
        next(err);
    }
}

async function eventsSelection(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`Get events error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }
        const userInfoResponse = await spotifyService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`Get events error. Not userInfoResponse.`)
            res.json({
                status: 500
            })
            return
        }

        const likedItems = req.body.likedItems
        const discardedItems = req.body.discardedItems

        await helpersUsers.updateEventsSelection(userInfoResponse.id, {likedItems, discardedItems})
        await helpersUsers.updateUserStatus(userInfoResponse.id, 'RESULTS_RANKED')

        res.json({ status: 200 })

    } catch (err) {
        console.error(`Error in startAI`, err.message);
        next(err);
    }
}

async function restart(req, res, next) {
    try {
        const access_token = req.query.access_token
        if (!access_token) {
            console.error(`Restart error. Not access_token.`)
            res.json({
                status: 500
            })
            return
        }
        const userInfoResponse = await spotifyService.getUserInfo(access_token)
        if (!userInfoResponse) {
            console.error(`Restart error. Not userInfoResponse.`)
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
            artists: [],
            events: [],
            processedPhases: 0,
            artistsToAsk: [],
            status: 'INITIAL_STATE',
            location: {},
            eventsSelection: []
        }
        await User.findOneAndUpdate(filter, update, { new: true, upsert: true })

        res.json({ status: 200 })

    } catch (err) {
        console.error(`Error in restart`, err.message);
        next(err);
    }
}


module.exports = {
    firstPhase,
    secondPhase,
    thirdPhase,
    finish,
    eventsSelection,
    restart
}