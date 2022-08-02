const router = require('express').Router()
const c_home = require('./controller_registration')
const c_auth = require('./controller_auth')
const c_guest = require('./controller_guest')

router.get('/', async function(req, res){
    if (req.isAuthenticated()) {
        res.redirect('./home')
    } else {
        res.redirect('./auth')
    }
})

router.use("/auth", c_auth)
router.use("/guest", c_guest)
router.use("/", c_guest)

module.exports = router