const axios = require('axios')
const Artist = require('../models/artist')

const SONGKICK_API_KEY = process.env.SONGKICK_API_KEY

async function getUpcomingEventsByMetroArea(lat, long, min_date, max_date) {
    try {
        let events = []
        let page = 1
        let finish = false
        let processed = 0
        while (!finish) {
            const { data } = await axios.get(`https://api.songkick.com/api/3.0/events.json`, {
                params: {
                    apikey: SONGKICK_API_KEY,
                    location: `geo:${lat},${long}`,
                    min_date: min_date,
                    max_date: max_date,
                    page: page
                }
            })
            if (data.resultsPage && data.resultsPage.status === 'ok') {
                events = events.concat(data.resultsPage.results.event)
                processed = processed + data.resultsPage.perPage
                if (processed >= data.resultsPage.totalEntries) {
                    finish = true
                }
                else {
                    page = page + 1
                }
            }
        }
        return events
    } catch (err) {
        console.error(`Error getting Upcoming Events By Metro Area`, err.message)
        throw err
    }
}

async function getEventInfo(eventId) {
    try {
        const { data } = await axios.get(`https://api.songkick.com/api/3.0/events/${eventId}.json`, {
            params: {
                apikey: SONGKICK_API_KEY
            }
        })
        if (data.resultsPage && data.resultsPage.status === 'ok' && data.resultsPage.results) {
            return data.resultsPage.results.event
        }
    } catch (err) {
        console.error(`Error getting Upcoming Events By Metro Area`, err.message)
        throw err
    }
}

module.exports = {
    getUpcomingEventsByMetroArea,
    getEventInfo
}