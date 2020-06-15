import passport from 'passport'
import refresh from 'passport-oauth2-refresh'
import jwt from 'jsonwebtoken'
import jwtDecode from 'jwt-decode'
import { decrypt } from './crypto'
import User from '../../models/user'
import config from '../../config.js'

// Helper to generate a JWT containing user info
export const addJWT = config => (user, expiration = 20) => {
  // export const addJWT = config => (user, expiration = 60 * 60 * 24 * 30 * 6) => {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      provider: user.provider,
      name: user.name,
      admin: user.admin,
    },
    config.auth.jwt.secret,
    {
      expiresIn: expiration,
    },
  )
  return Object.assign({}, user, { token })
}

/**
 * Extract the JWT from a cookie
 * @param {Object} req
 */
export const jwtFromRequest = req => {
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken
  } else {
    return null
  }
}
const parsedJwtFromRequest = req => {
  const jwt = jwtFromRequest(req)
  if (jwt) return decodeJWT(jwt)
  else return null
}

// attach user obj to request based on jwt
// if user does not exist, continue
export const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    console.log('AUTHENTICATE')
    console.log(user)
    console.log('^^^^^^^^^^^^')
    req.login(
      user,
      { session: false },
      () => (console.log('LOGIN CALLBACK'), next()),
    )
  })(req, res, next)
}

export const handleRefresh = (req, res, next) => {
  console.log('REFRESH???')
  if (req.user) console.log('  user!', req.user)
  if (!req.user) {
    const jwt = parsedJwtFromRequest(req)
    User.findOne({ id: jwt.sub, provider: jwt.provider })
      .then(user => {
        if (user && user.refresh) {
          const refreshToken = decrypt(user.refresh)
          refresh.requestNewAccessToken(
            jwt.provider,
            refreshToken,
            (err, accessToken) => {
              console.log('REFRESHED')
              console.log(user)
              console.log('^^^^^^^^^')
              if (accessToken) req.login(user, { session: false }, () => next())
            },
          )
        }
      })
      .catch(() => next())
  } else next()
}

export const authSuccessHandler = (req, res, next) => {
  if (req.user) {
    // Set the JWT associated with this login on a cookie
    res.cookie('accessToken', req.user.token)
    res.redirect('/')
  } else {
    res.status(401)
  }
  return next()
}

export const decodeJWT = token => {
  return jwt.decode(token)
}

export const generateDataladCookie = config => user => {
  return user ? `accessToken=${addJWT(config)(user).token}` : ''
}
