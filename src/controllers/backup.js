
async function getTop10TracksOfRelatedArtists(access_token, artistChunk, level, nextLevel) {
    const res = {}
    const relatedArtistsResponse = await userService.getArtistsRelatedArtists(access_token, artistChunk)
    const uniqueArtists = relatedArtistsResponse
    const relatedArtistsTop10TracksResponse = await userService.getArtistsTopTracks(access_token, uniqueArtists)

    res[`level${level}`] = { tracks: relatedArtistsTop10TracksResponse }
    if (nextLevel !== -1) {
        res[`level${nextLevel}`] = { artistsToUse: uniqueArtists }
    }
    return res
}


/**
 * SCORE 1
 */
async function getScore_1_Tracks(access_token, tracks) {
    try {
        const userTop100TracksResponse = await userService.getUserTopTracks(access_token)
        tracks[1] = userTop100TracksResponse
        console.log('Score 1 OK!')
        return tracks
    } catch (err) {
        console.error(`Error getting Score 1`, err.message)
    }
}

/**
 * SCORE 0.99
 */
async function getScore_099_Tracks(access_token, userTop100UniqueArtists, tracks) {
    try {
        const topArtistsTop10TracksResponse = await userService.getArtistsTopTracks(access_token, userTop100UniqueArtists)
        tracks[0.99] = removeDuplicates(topArtistsTop10TracksResponse, tracks)
        console.log('Score 0.99 OK!')
        return tracks
    } catch (err) {
        console.error(`Error getting Score 0.99`, err.message)
    }
}

/**
 * SCORES 0.95 - 0.5
 */
async function getScores_095_05_Tracks(access_token, userTop100UniqueArtists, tracks) {
    try {
        const scores = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]
        let promises = []
        const chunkSize = 10
        for (let i = 0; i < userTop100UniqueArtists.length; i += chunkSize) {
            const chunk = userTop100UniqueArtists.slice(i, i + chunkSize)
            promises.push(getTop10TracksOfRelatedArtists(access_token, chunk, 1, 2))
        }
        const tracksPromisesAll = await Promise.all(promises)
        let score = 0
        let promisesForNextScoreLevel = []
        tracksPromisesAll.forEach(function (tracksPromiseAll) {
            tracks[scores[score]] = removeDuplicates(tracksPromiseAll.level1.tracks, tracks)
            console.log(`Score ${scores[score]} OK!`)
            score = score + 1
            //Next score level
            promisesForNextScoreLevel.push(getTop10TracksOfRelatedArtists(access_token, tracksPromiseAll.level2.artistsToUse, 2, -1))
        })
        return { tracks, promisesForNextScoreLevel }
    } catch (err) {
        console.error(`Error getting Scores 0.95 - 0.5`, err.message)
    }
}

/**
 * SCORES 0.55 - 0.05
 */
async function getScores_055_005_Tracks(promises, tracks) {
    try {
        const scores = [0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05, 0.05]
        //const tracksPromisesAll = await Promise.all(promises)
        let score = 0
        promises.forEach(async function (promise) {
            console.log(`Starting Score ${scores[score]}`)
            const tracksPromise = await Promise.resolve(promise)
            tracks[scores[score]] = removeDuplicates(tracksPromise.level2.tracks, tracks)
            console.log(`Score ${scores[score]} OK!`)
            score = score + 1
        })
        return tracks
    } catch (err) {
        console.error(`Error getting Scores 0.45 - 0.05`, err.message)
    }
}