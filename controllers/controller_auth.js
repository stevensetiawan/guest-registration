const router = require('express').Router()
const api_response = require('../module/api_response')
const passport = require('passport')

router.get('/', async function(req, res){
    console.log("masuk ga")
        let error = req.session.error
        req.session.error = ""
        res.render("./login", {
            title: "Login",
            error: error
        })
})

router.post('/login/submit', async (req, res, next) => {
	let username = req.body.username
	let password = req.body.password

	// validation for nik
	if(!username){
    	let response = await api_response.create_json(400,"Username")
    	res.status(200).json(response);
    	return
	}

	// validation for password
	if(!password){
    	let response = await api_response.create_json(400,"Password")
    	res.status(200).json(response);
    	return
	}

	try {
        // validation for login_username
        if (!req.body.username) {
            return res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Username field is empty"
            });
        }

        // validation for login_password
        if (!req.body.password) {
            return res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Password field is empty"
            });
        }

        passport.authenticate('local', async function (err, user, info) {
                if (err || !user) {
                    console.log(err)
                    return res.status(200).json({
                        status: "FAILED",
                        error_code: 3,
                        message: "Incorrect Username or Password"
                    });
                }
                req.login(user, async function (err) {
                    console.log("Ini user:\n")
                    console.log(user)
                    if (!err) {
                        return res.status(200).json({
                            status: "SUCCESS",
                            error_code: 200,
                            message: "LoggedIn",
                            user: user.role
                        });
                    }
                    if (err) {
                        console.log(err)
                        return res.status(200).json({
                            status: "FAILED",
                            error_code: 3,
                            message: "Incorrect Username or Password"
                        });
                    }
                    return
                })
            })
            (req, res, next)
    } catch (error) {
        logger.error(error)
        return res.status(200).json({
            status: "FAILED",
            error_code: 4,
            message: "Internal Server Error"
        });
    }
})

router.get('/logout', async function (req, res) {
    req.session.destroy(async function (err) {
        req.logout()
        res.redirect('/panel/auth/login');
    })
})

module.exports = router