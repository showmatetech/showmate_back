const axios = require('axios')

async function processUserAI(userId) {
    try {
        const response = await axios.get(`http://localhost:8005/user/${userId}`, {})
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