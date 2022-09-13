const axios = require('axios')
const Artist = require('../models/artist')

const sleep = s => new Promise(r => setTimeout(r, s * 1000))
const SPOTIFY_API_RETRIES = 50
const EXTRA_SECONDS = 2
const TIME_RANGES = ['long_term', 'medium_term', 'short_term']

/**
 * USER'S PROFILE
 */
async function getUserInfo(access_token) {
    try {
        const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        if (response.status === 200) {
            return response.data
        }
    } catch (err) {
        console.error(`Error getting User Info`, err.message)
        throw err
    }
}

/**
 * USER'S TOP ARTIST
 */

async function _getUserTopArtistsAPI(access_token, time_range) {
    try {
        let artists = []
        let finish = false
        let offset = 0
        const limit = 50
        while (!finish) {
            try {
                const { data } = await axios.get('https://api.spotify.com/v1/me/top/artists', {
                    headers: {
                        Authorization: `Bearer ${access_token}`
                    },
                    params: {
                        time_range: time_range,
                        limit: limit,
                        offset: offset
                    }
                })
                if (data.items.length > 0) {
                    const newArtists = data.items
                    artists = artists.concat(newArtists.filter((newArtist) => artists.map(function (artist) { return artist.id }).indexOf(newArtist.id) < 0))
                    offset = (offset + data.total) - 1
                }
                else {
                    finish = true
                }
            } catch (err) {
                console.error(`Error getting User Top Artists API. Offset: ${offset}`, err.message)
                throw err
            }
        }
        return artists
    } catch (err) {
        console.error(`Error getting User Top Artist`, err.message)
        throw err
    }
}

async function getUserTopArtists(access_token) {
    try {
        let artists = []
        let promises = []
        TIME_RANGES.forEach(async function (time_range) {
            promises.push(_getUserTopArtistsAPI(access_token, time_range))
        })
        const resultPromises = await Promise.all(promises)
        resultPromises.forEach(function (newArtists) {
            let newArtistsFiltered = newArtists
            for (let artistsToCompare of artists) {
                newArtistsFiltered = newArtistsFiltered.filter((newArtistFiltered) => artistsToCompare.map(function (artist) {
                    return artist.id
                }).indexOf(newArtistFiltered.id) < 0)
            }
            artists.push(newArtistsFiltered)
        })
        return artists
    } catch (err) {
        console.error(`Error getting User Top Artist`, err.message)
        throw err
    }
}

/**
 * USER'S TOP TRACKS
 */
async function _getUserTopTracksAPI(access_token, time_range) {
    let tracks = []
    let finish = false
    let offset = 0
    while (!finish) {
        try {
            const { data } = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
                headers: {
                    Authorization: `Bearer ${access_token}`
                },
                params: {
                    time_range: time_range,
                    limit: 50,
                    offset: 0
                }

            })
            let tracksIds = data.items.map(function (item) {
                return item.id
            })
            tracks = tracks.concat(tracksIds.filter((tracksId) => tracks.indexOf(tracksId) < 0))
            offset = offset + data.items.length
            if (data.total <= offset) finish = true
        } catch (err) {
            console.error(`Error getting User Top Tracks API. Offset: ${offset}`, err.message)
            throw err
        }
    }
    return tracks
}

async function getUserTopTracks(access_token) {
    try {
        const time_ranges = ['long_term', 'medium_term', 'short_term']
        let promises = []
        time_ranges.forEach(function (time_range) {
            promises.push(_getUserTopTracksAPI(access_token, time_range))
        })
        let uniqueTracks = []
        const tracksByTimeRange = await Promise.all(promises)
        tracksByTimeRange.forEach(function (tracks) {
            uniqueTracks = uniqueTracks.concat(tracks.filter((trackId) => uniqueTracks.indexOf(trackId) < 0))
        })
        return uniqueTracks
    } catch (err) {
        console.error(`Error getting User Top Tracks`, err.message)
        throw err
    }
}

/**
 * ARTIST'S TOP TRACKS
 */
async function _getArtistTopTracksAPI(access_token, artistId, reties, count, total) {
    try {
        const { data } = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/top-tracks`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            params: {
                market: 'ES' //TODO
            }
        })
        const tracksIds = data.tracks.map(function (item) {
            return item.id
        })
        console.log(`Artist's Top Tracks OK! ${count}/${total}`)
        return { artistId: artistId, topTracks: tracksIds }
    } catch (err) {
        if (err.response && err.response.status === 429 && reties < SPOTIFY_API_RETRIES) {
            const seconds = parseInt(err.response.headers['retry-after']) + EXTRA_SECONDS
            await sleep(seconds)
            try {
                return await _getArtistTopTracksAPI(access_token, artistId, reties + 1, count, total)
            } catch (err) {
                console.error(`Error getting Artists Top Tracks on Retry API`, err.message)
                //throw err
            }
        }
        else {
            console.error(`Error getting Artists Top Tracks API`, err.message)
            //throw err
        }
    }
}

async function getArtistsTopTracks(access_token, artists) {
    try {
        let result = []
        const chunkSize = 20
        let count = 0
        const total = artists.length
        for (let i = 0; i < artists.length; i += chunkSize) {
            const chunk = artists.slice(i, i + chunkSize)
            let promises = []
            for (const artistId of chunk) {
                promises.push(_getArtistTopTracksAPI(access_token, artistId, 0, count, total))
                count = count + 1
            }
            const promisesResult = await Promise.all(promises)
            for (const promiseResult of promisesResult) {
                pos = artists.indexOf(promiseResult.artistId)
                result.push({ artistId: artists[pos], topTracks: promiseResult.topTracks })
            }
        }
        return result
    } catch (err) {
        console.error(`Error getting Artists Top Tracks`, err.message)
        throw err
    }
}

/**
 * ARTIST'S RELATED ARTISTS
 */
async function _getArtistsRelatedArtistsAPI(access_token, artistId, reties, count, total) {
    //TODO Paralelizar las 3 llamadas
    try {
        const { data } = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        })
        console.log(`Artist's Related Artists OK! ${count}/${total}`)
        return { relatedArtists: data.artists, relatedTo: artistId }

    } catch (err) {
        if (err.response && err.response.status === 429 && reties < SPOTIFY_API_RETRIES) {
            const seconds = parseInt(err.response.headers['retry-after']) + EXTRA_SECONDS
            await sleep(seconds)
            try {
                return await _getArtistsRelatedArtistsAPI(access_token, artistId, reties + 1, count, total)
            } catch (err) {
                console.error(`Error getting Artist Related Artists on Retry API`, err.message)
                throw err
            }
        }
        else {
            console.error(`Error getting Artist Related Artists API`, err.message)
            throw err
        }
    }
}

async function getArtistsRelatedArtists(access_token, artists) {
    try {
        let promises = []
        let count = 1
        const total = artists.length
        artists.forEach(function (artist) {
            if (!artist.relatedArtists || artist.relatedArtists === undefined || (artist.relatedArtists && artist.relatedArtists.length === 0)) { //Comprobar si ya está en BD y tiene relatedArtists
                const artistId = artist.id || artist.artistId
                promises.push(_getArtistsRelatedArtistsAPI(access_token, artistId, 0, count, total))
                count = count + 1
            }
        })
        let uniqueArtists = []
        const existingArtistsList = artists.filter(function (artist) {
            if (!artist.relatedArtists || artist.relatedArtists === undefined || (artist.relatedArtists && artist.relatedArtists.length === 0)) return false
            return true
        }).map(function (artist) { 
            return artist.relatedArtists.map(function (id) { return { id: id } }) //Añado id para que parezca uno devuelto por la API de Spotify
        })

        for (const existingArtists of existingArtistsList){
            uniqueArtists = uniqueArtists.concat(existingArtists.filter((existingArtist) => uniqueArtists.map(function (artist) { return artist.id }).indexOf(existingArtist.id) < 0))
        }

        const artistsByArtist = await Promise.all(promises)
        for (const {relatedArtists, relatedTo} of artistsByArtist){
            await Artist.findOneAndUpdate({artistId: relatedTo}, {relatedArtists: relatedArtists.map(function (artist) { return artist.id })})
            uniqueArtists = uniqueArtists.concat(relatedArtists.filter((relatedArtist) => uniqueArtists.map(function (artist) { return artist.id }).indexOf(relatedArtist.id) < 0))
        }
        return uniqueArtists
    } catch (err) {
        console.error(`Error getting Artist Related Artists`, err.message)
        throw err
    }
}

/**
 * TRACK'S AUDIO FEATURES
 */
async function _getTracksAudioFeaturesAPI(access_token, trackIds, reties, count, total) {
    try {
        const { data } = await axios.get(`https://api.spotify.com/v1/audio-features`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            params: {
                ids: trackIds.join(",")
            }
        })
        console.log(`Track's Audio Features OK! ${count}/${total}`)
        return data.audio_features
    } catch (err) {
        if (err.response && err.response.status === 429 && reties < SPOTIFY_API_RETRIES) {
            const seconds = parseInt(err.response.headers['retry-after']) + EXTRA_SECONDS
            await sleep(seconds)
            try {
                return await _getTracksAudioFeaturesAPI(access_token, trackIds, reties + 1, count, total)
            } catch (err) {
                console.error(`Error getting Track Audio Features on Retry API`, err.message)
                throw err
            }
        }
        else {
            console.error(`Error getting Track Audio Features API`, err.message)
            throw err
        }
    }
}

async function getTracksAudioFeatures(access_token, tracks) {
    try {
        let promises = []
        const chunkSize = 100
        let count = 0
        const total = tracks.length
        for (let i = 0; i < tracks.length; i += chunkSize) {
            const chunk = tracks.slice(i, i + chunkSize)
            count = count + chunk.length
            promises.push(_getTracksAudioFeaturesAPI(access_token, chunk, 0, count, total))
        }
        const tracksWithInfoPromises = await Promise.all(promises)
        let allTracksInfo = []
        tracksWithInfoPromises.forEach(function (tracksWithInfo) {
            allTracksInfo = allTracksInfo.concat(tracksWithInfo)
        })
        return allTracksInfo
    } catch (err) {
        console.error(`Error getting Track Audio Features`, err.message)
        throw err
    }
}

/**
 * SEARCH ARTISTS
 */
 async function _searchArtistAPI(access_token, artistName, songkickArtistId, reties, count, total) {
    try {
        const { data } = await axios.get('https://api.spotify.com/v1/search', {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            params: {
                q: `artist:${artistName}`,
                type: 'artist'
            }
        })
        if (data.artists && data.artists.items){ //TODO iterar sobre todos los resultados (paginaicón)
            for (const artist of data.artists.items) {
                if (artist.name === artistName ){
                    console.log(`Searching Artist OK! ${count}/${total}`)
                    return { songkickArtistId: songkickArtistId, ...artist }
                } 
            }
        }
        return
    } catch (err) {
        if (err.response && err.response.status === 429 && reties < SPOTIFY_API_RETRIES) {
            const seconds = parseInt(err.response.headers['retry-after']) + EXTRA_SECONDS
            await sleep(seconds)
            try {
                return await _searchArtistAPI(access_token, artistName, songkickArtistId, reties + 1, count, total)
            } catch (err) {
                console.error(`Error Searching Artist on Retry API`, err.message)
                //throw err
            }
        }
        else {
            console.error(`Error Searching Artist on Retry API`, err.message)
            //throw err
        }
    }
}

async function searchArtists(access_token, artists) {
    try {
        let artistsResult = {}
        const chunkSize = 20
        let count = 0
        const total = Object.keys(artists).length
        for (let i = 0; i < total; i += chunkSize) {
            const chunk =  Object.entries(artists).slice(i, i + chunkSize).map(entry => entry[0]);
            let promises = []
            for (const songkickArtistId of chunk) {
                promises.push(_searchArtistAPI(access_token, artists[songkickArtistId].artistName, songkickArtistId, 0, count, total))
                count = count + 1
            }
            const promisesResult = await Promise.all(promises)
            for (const promiseResult of promisesResult) {
                if (promiseResult) {
                    artistsResult[promiseResult.songkickArtistId] = {
                        ...artists[promiseResult.songkickArtistId],
                        ...promiseResult
                    }
                }
            }
        }
        return artistsResult
    } catch (err) {
        console.error(`Error Searching Artist`, err.message)
        throw err
    }
}

/**
 * GET ARTISTS
 */
 async function _getArtistsAPI(access_token, artistIds, reties) {
    //TODO Paralelizar las 3 llamadas
    try {
        const { data } = await axios.get(`https://api.spotify.com/v1/artists`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            params: {
                ids: artistIds.join(",")
            }
        })
        return data.artists

    } catch (err) {
        if (err.response && err.response.status === 429 && reties < SPOTIFY_API_RETRIES) {
            const seconds = parseInt(err.response.headers['retry-after']) + EXTRA_SECONDS
            await sleep(seconds)
            try {
                return await _getArtistsAPI(access_token, artistIds, reties + 1)
            } catch (err) {
                console.error(`Error getting Artists on Retry API`, err.message)
                throw err
            }
        }
        else {
            console.error(`Error getting Artists API`, err.message)
            throw err
        }
    }
}

async function getArtists(access_token, artists) {
    try {
        let promises = []
        const chunkSize = 50
        for (let i = 0; i < artists.length; i += chunkSize) {
            const chunk = artists.slice(i, i + chunkSize)
            promises.push(_getArtistsAPI(access_token, chunk, 0))
        }
        const artistsPromises = await Promise.all(promises)
        let artistsInfo = []
        artistsPromises.forEach(function (artistInfo) {
            artistsInfo = artistsInfo.concat(artistInfo)
        })
        return artistsInfo
    } catch (err) {
        console.error(`Error getting Artists`, err.message)
        throw err
    }
}

/**
 * GET TRACKS
 */
 async function _getTracksAPI(access_token, tracksIds, reties) {
    //TODO Paralelizar las 3 llamadas
    try {
        const { data } = await axios.get(`https://api.spotify.com/v1/tracks`, {
            headers: {
                Authorization: `Bearer ${access_token}`
            },
            params: {
                market: 'ES', //TODO
                ids: tracksIds.join(",")
            }
        })
        return data.tracks

    } catch (err) {
        if (err.response && err.response.status === 429 && reties < SPOTIFY_API_RETRIES) {
            const seconds = parseInt(err.response.headers['retry-after']) + EXTRA_SECONDS
            await sleep(seconds)
            try {
                return await _getTracksAPI(access_token, artistIds, reties + 1)
            } catch (err) {
                console.error(`Error getting Tracks on Retry API`, err.message)
                throw err
            }
        }
        else {
            console.error(`Error getting Tracks API`, err.message)
            throw err
        }
    }
}

async function getTracks(access_token, tracks) {
    try {
        let promises = []
        const chunkSize = 50
        for (let i = 0; i < tracks.length; i += chunkSize) {
            const chunk = tracks.slice(i, i + chunkSize)
            promises.push(_getTracksAPI(access_token, chunk, 0))
        }
        const tracksPromises = await Promise.all(promises)
        let tracksInfo = []
        tracksPromises.forEach(function (trackInfo) {
            tracksInfo = tracksInfo.concat(trackInfo)
        })
        return tracksInfo
    } catch (err) {
        console.error(`Error getting Tracks`, err.message)
        throw err
    }
}

module.exports = {
    getUserInfo,
    getUserTopArtists,
    getUserTopTracks,
    getArtistsTopTracks,
    getArtistsRelatedArtists,
    getTracksAudioFeatures,
    searchArtists,
    getArtists,
    getTracks
}