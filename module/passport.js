var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy
const credential = require("../module/credential")

//hashing password
const bcrypt = require('bcrypt')

//LOGIN  USER FRONT-END
var qs = require('qs');
const model_panel_user = require('../models/model_panel_user')

const init = function () {
    passport.serializeUser(function (req, user, done) {
        console.log(user)
        done(null, user);
    });

    passport.deserializeUser(async function (req, user, done) {
        done(null, user);
    });

    passport.use('local',
        new LocalStrategy({
                passReqToCallback: true
            },
            async function (req, username, password, done) {
                var [user, err] = await model_panel_user.getByNik(username);
                if (err || !user) {
                    return done(null, false);
                }

                const data = {
                    user_name: username,
                    user_password: password
                }

                    //check bener ga passwordnya
                    var compare = bcrypt.compareSync(password, user[0].password)
                    if (!compare) {
                        return done(null, false);
                    } else {
                        var access_token = credential.generateAccessToken({
                            app_user: username
                        })
                        var userData = {
                            "id": user[0].id, 
                            "username": user[0].name,
                            "token": access_token,
                            "role": user[0].role
                        }
                        return done(null, userData);
                    }
            }
        )
    )
    return passport
}

module.exports = init()