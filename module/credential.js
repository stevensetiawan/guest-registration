const jwt = require('jsonwebtoken')

module.exports = {
    generateKey: function(app_user){
        return jwt.sign({"app_user":app_user}, process.env.SECRET)
    },
    verifyKey: function(key){
        try{
            var decode = jwt.verify(key, process.env.SECRET)
            return decode
        }catch(err){
            return null
        }
    },
    generateAccessToken: function(data){
        return jwt.sign(data, process.env.SECRET, { expiresIn: '300m' });
    }
}