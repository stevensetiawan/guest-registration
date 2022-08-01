const router = require('express').Router()
const c_auth = require('./controller_auth')

router.get('/', async function(req, res){
    if (req.isAuthenticated()) {
        res.redirect('./panel/home')
    } else {
            res.redirect('/panel/auth/login')
    }
})

router.use("/auth", c_auth)

module.exports = router