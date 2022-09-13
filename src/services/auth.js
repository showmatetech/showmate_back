const axios = require('axios')
const querystring = require('querystring');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

async function getAccessToken(code){
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }).toString(),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${new Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
            },
        })
        if (response.status === 200) {
            return { success: true, data: response.data }
        } else {
            return { success: false, error: response }
        }
    } catch (err) {
        return { success: false, error: err }
    }
}

async function refreshToken(refresh_token){
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: querystring.stringify({
              grant_type: 'refresh_token',
              refresh_token: refresh_token
            }),
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${new Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
            },
          })
        if (response.status === 200) {
            return { success: true, data: response.data }
        } else {
            return { success: false, error: response }
        }
    } catch (err) {
        return { success: false, error: err }
    }
}

module.exports = {
    getAccessToken,
    refreshToken
}