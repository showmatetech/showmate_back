const axios = require('axios')

const AI_URL = process.env.AI_URL;

async function processUserAI(userId) {
    try {
        const response = await axios.get(`${AI_URL}/user/${userId}`, {})
        if (response.status === 200) {
            return response
        }
    } catch (err) {
        console.error(`Error processing User AI`, err.message)
        throw err
    }
}

module.exports = {
    processUserAI
}