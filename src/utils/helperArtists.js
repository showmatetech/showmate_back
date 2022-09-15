const Artist = require('../models/artist')
const spotifyService = require('../services/spotify')

function _removeDuplicates(newArtists, artists) {
    let newArtistsFiltered = newArtists
    for (let score in artists) {
        newArtistsFiltered = newArtistsFiltered.filter((newArtist) => artists[score].map(function (artist) {
            if (artist.id) return artist.id
            if (artist.artistId) return artist.artistId
        }).indexOf(newArtist.id) < 0)
    }
    return newArtistsFiltered
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

async function getRelatedArtists(access_token, artists, artistToCompare, removeDup) {
    console.log(`Starting Getting Related Artists...`)
    const relatedArtistsResponse = await spotifyService.getArtistsRelatedArtists(access_token, artists)
    let uniqueArtists = removeDup ? _removeDuplicates(relatedArtistsResponse, artistToCompare) : relatedArtistsResponse
    const artistsFound = await findArtists(uniqueArtists.map(function (artist) { return artist.id }))
    for (const artistFound of artistsFound) {
        const foundIndex = uniqueArtists.findIndex(artist => artist.id == artistFound.artistId)
        if (foundIndex !== -1) uniqueArtists[foundIndex] = { ...artistFound, notSave: true }
    }
    //Check artists exists in BD //TODO

    console.log(`Related Artists OK!`)
    return uniqueArtists
}

async function getArtistsToAsk(access_token, artists, artistToCompare, removeDup) {
    console.log(`Starting Getting Artists To Ask...`)
    //Related Artists
    const relatedArtists2Response = await spotifyService.getArtistsRelatedArtists(access_token, artists)
    let uniqueArtists = removeDup ? _removeDuplicates(relatedArtists2Response, artistToCompare) : relatedArtists2Response
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
    const artistsSearchedResponde = await spotifyService.getArtists(access_token, artistsToSearch.map(function (artist) { return artist.id }))
    uniqueArtists = uniqueArtists.map(artist => artistsSearchedResponde.find(artistSearched => artistSearched.id === artist.id || artistSearched.id === artist.artistId) || artist)
    await saveArtists(uniqueArtists)

    //Get random slice
    uniqueArtists.sort(function () { return 0.5 - Math.random() })
    let artistsToAsk = uniqueArtists.slice(0, 60)

    //Get top tracks
    const artistsTopTracksResponse = await spotifyService.getArtistsTopTracks(access_token, artistsToAsk.filter(function (artist) {
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
    const tracksSearchedResponse = await spotifyService.getTracks(access_token, artistsToAsk.map(function (artist) { return artist.topTrack }))
    artistsToAsk = artistsToAsk.map(artist => {
        const found = tracksSearchedResponse.find(trackSearched => trackSearched.id === artist.topTrack)
        if (found) return { ...artist, topTrack: found }
    }
    )
    console.log(`Artists To Ask OK!`)
    return artistsToAsk
}

module.exports = {
    findArtists,
    findArtistsWithTopTracks,
    saveArtists,
    saveTopTracks,
    getRelatedArtists,
    getArtistsToAsk
}