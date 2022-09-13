const auth = require('../services/auth');
const { generateRandomString } = require('../utils/generateRandomString');
const querystring = require('querystring');

const stateKey = 'spotify_auth_state';
const CLIENT_ID = process.env.CLIENT_ID;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONT_URL = process.env.FRONT_URL;

async function login(req, res, next) {
    try {
        const scope = 'user-read-private user-read-email user-top-read';
        const state = generateRandomString(16);
        res.cookie(stateKey, state);

        const queryParams = querystring.stringify({
            client_id: CLIENT_ID,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            state: state,
            scope: scope,
        });
        res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
    } catch (err) {
        console.error(`Error while getting programming languages`, err.message);
        next(err);
    }
}

async function callback(req, res, next) {
    try {
        const code = req.query.code || null
        const accessTokenResponse = await auth.getAccessToken(code)
        if (accessTokenResponse.success) {
            const { access_token, refresh_token, expires_in } = accessTokenResponse.data;
            const queryParams = querystring.stringify({
                access_token,
                refresh_token,
                expires_in,
            });
            res.redirect(`${FRONT_URL}/?${queryParams}`)
        }
        else {
            console.error(`Invalid token error: ${accessTokenResponse.error}`)
            res.redirect(`/?${querystring.stringify({ error: 'invalid_token' })}`);
        }
    } catch (err) {
        console.error(`Error in auth callback`, err.message);
        next(err);
    }
}

async function refresh_token(req, res, next) {
    try {
        const { refresh_token } = req.query;
        const refreshTokenResponse = await auth.refreshToken(refresh_token)
        if (refreshTokenResponse.success) {
            res.json({ status: 200, ...refreshTokenResponse.data })
        }
        else {
            console.log(`Refresh token error: ${refreshTokenResponse.error}`)
            res.json({
                status: 500,
                error: refreshTokenResponse.error
            })
        }
    } catch (err) {
        console.error(`Error while updating programming language`, err.message);
        next(err);
    }
}

module.exports = {
    login,
    callback,
    refresh_token
}