const User = require('../models/user')
const Artist = require('../models/artist')
const songkickService = require('../services/songkick')
const spotifyService = require('..//services/spotify')
const helperArtists = require('../utils/helperArtists')
const helpersEvents = require('../utils/helpersEvents')
const helpersTracks = require('../utils/helpersTracks')
const helpersUsers = require('../utils/helpersUsers')

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

        const lat = req.body.lat
        const long = req.body.long

        let filter = { userId: userInfoResponse.id }
        let update = {
            email: userInfoResponse.email,
            country: userInfoResponse.country,
            display_name: userInfoResponse.display_name,
            uri: userInfoResponse.uri,
            access_token: access_token,
            artists: [], //TODO
            events: [], //TODO
            processedPhases: 0
        }
        const userInfo = await User.findOneAndUpdate(filter, update, { new: true, upsert: true })

        //Possible envents
        helpersEvents.getPossibleEvents(access_token, userInfoResponse.id, lat, long, '2022-09-01', '2022-10-30')

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

        res.json({ status: 200, userInfo: userInfo, artistsToAsk: artistsToAsk })

    } catch (err) {
        console.error(`Error in startAI`, err.message);
        next(err);
    }
}

async function _secondPhase(access_token, userInfoResponse, user, likedItems, discardedItems) {
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

async function secondPhase(req, res, next) {
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

        _secondPhase(access_token, userInfoResponse, user, likedItems, discardedItems)

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


module.exports = {
    firstPhase,
    secondPhase,
    finish,
}