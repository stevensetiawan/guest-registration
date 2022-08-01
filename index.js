const express = require('express')
const path = require('path')
const session = require("express-session")
const redis = require("redis")
require('dotenv').config()
const redisStore = require("connect-redis")(session);
const bodyParser = require("body-parser");
const c_main = require('./controllers/controller_main')
const passport = require("./module/passport")
const app = express()
app.enable("trust proxy")

//Views
app.use(bodyParser.urlencoded({
  limit: '50mb',
  extended: true
}))
app.use(bodyParser.json({
  limit: '50mb'
}))
app.use(
  session({
    store: new redisStore({
      client: redis.createClient({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      })
    }),
    secret: process.env.SECRET,
    resave: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000
    },
    saveUninitialized: false
  })
)
app.set('views', path.join(__dirname, '/views'))
app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname + '/public')))
app.use(passport.initialize())
app.use(passport.session())
app.use('/', c_main)

app.listen(process.env.APP_PORT, () => console.log('Example app listening on port ' + process.env.APP_PORT))