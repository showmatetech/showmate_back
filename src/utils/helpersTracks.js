const Track = require('../models/track')
const spotifyService = require('../services/spotify')
const aiService = require('../services/ai')
const helpersUsers = require('./helpersUsers')
const helperArtists = require('./helperArtists')

async function _getArtistsTopTracks(access_token, plainArtistsList) {
    const artistsWithTopTracksFound = await helperArtists.findArtistsWithTopTracks(plainArtistsList)

    const artistsDeletedFound = plainArtistsList.filter((plainArtist) => artistsWithTopTracksFound.map(function (artist) {
        if (artist.artistId) return artist.artistId
        if (artist.id) return artist.id
    }).indexOf(plainArtist) < 0)

    console.log(`Starting Top Tracks of Artists...`)
    const topTracksPerArtists = await spotifyService.getArtistsTopTracks(access_token, artistsDeletedFound)
    await helperArtists.saveTopTracks(topTracksPerArtists)
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
    const tracksInfo = await spotifyService.getTracksAudioFeatures(access_token, uniqueTracks)
    await saveTracks(tracksInfo)
    console.log(`Tracks Audio Features OK!`)
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

async function processTracks(access_token, plainArtistsList, userId) {
    console.log(`Starting Processing Tracks...`)
    const uniqueTracks = await _getArtistsTopTracks(access_token, plainArtistsList)
    await _getTracksInfo(access_token, uniqueTracks)
    console.log(`Process Tracks OK!`)

    const processedPhases = await helpersUsers.increaseUserProcessedPhases(userId)

    if (processedPhases === 2){
        console.log(`Call AI Module...`)
        await aiService.processUserAI(userId)
    }
}

module.exports = {
    saveTracks,
    processTracks
}