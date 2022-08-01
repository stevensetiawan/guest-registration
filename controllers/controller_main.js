const router = require('express').Router()
const c_auth = require('./controller_auth')

router.get('/', async function(req, res){
    if (req.isAuthenticated()) {
        res.redirect('./home')
    } else {
        res.redirect('./auth')
    }
})
console.log("Sampe sini")

router.use("/auth", c_auth)

module.exports = router