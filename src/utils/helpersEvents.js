const Event = require('../models/event')
const songkickService = require('../services/songkick')
const spotifyService = require('../services/spotify')
const helperArtists = require('./helperArtists')
const helpersTracks = require('./helpersTracks')
const helpersUsers = require('./helpersUsers')

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

async function getPossibleEvents(access_token, userId, lat, long, minDate, maxDate) {
    console.log(`Starting Getting Possible Events...`)
    let artistsByEvent = {}
    let events = await songkickService.getUpcomingEventsByMetroArea(lat, long, minDate, maxDate)
    console.log(`${events.length} Possible Events found...`)

    events = events.slice(0, 100) //TODO

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

    const resultSearchArtistsOnSpotify = await spotifyService.searchArtists(access_token, artistsByEvent)
    const artistsByEventList = Object.entries(resultSearchArtistsOnSpotify).map(entry => entry[1])

    let artistByEventFound = await helperArtists.findArtists(artistsByEventList.map(function (artistByEvent) { return artistByEvent.id }))
    artistByEventFound = artistByEventFound.filter(function (artistFound) {
        if (artistFound.topTracks && artistFound.topTracks.length > 0) return true
        return false
    })

    const artistsByEventListDeletedFound = artistsByEventList.filter((artistByEvent) => artistByEventFound.map(function (artist) {
        return artist.artistId
    }).indexOf(artistByEvent.id) < 0)

    const topTracksPerArtistsPerEvent = await spotifyService.getArtistsTopTracks(access_token, artistsByEventListDeletedFound.map(function (artistByEvent) { return artistByEvent.id }))

    await helperArtists.saveArtists(artistsByEventList)
    await helperArtists.saveTopTracks(topTracksPerArtistsPerEvent)

    let plainTopTracksPerArtistsPerEvent = []
    for (let topTracksPerArtist of topTracksPerArtistsPerEvent) {
        plainTopTracksPerArtistsPerEvent = plainTopTracksPerArtistsPerEvent.concat(topTracksPerArtist.topTracks)
    }
    const uniqueTracksEvents = plainTopTracksPerArtistsPerEvent.filter((v, i, a) => a.indexOf(v) === i)

    console.log(`Starting Tracks Audio Features for Events...`)
    const tracksInfoEvents = await spotifyService.getTracksAudioFeatures(access_token, uniqueTracksEvents)
    await helpersTracks.saveTracks(tracksInfoEvents)
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
    await helpersUsers.saveUserEvents(userId, eventsToSave.map(event => event.eventId))
    console.log(`Possible Events OK!`)
}

module.exports = {
    getPossibleEvents
}