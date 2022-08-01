const express = require('express')
const router = express.Router()
const model_panel_user = require('../../models/model_panel_user')
const logger = require('../../module/poly_logger')
const response_maker = require("../../module/api_response")
const axios_call = require('../../module/axios_call')
const credential = require('../../module/credential')

router.get('/', async function (req, res) {
    //var[result,arr] = await ms_product_model.getAll()
    if (req.isAuthenticated()) {
        var token = req.user.token
        var key_token = credential.verifyKey(token)
        if (!key_token) {
            req.session.error = 'Your session is expired'
            return res.redirect("/panel/auth/logout")
        }
        if(req.user.role === "Admin")
        {
            res.render("./panel/ms_admin_user", {
                title: "Admin Management",
                data: 0,
                user: req.user
            })
        }
        else{
            return res.redirect('/panel/tracker/')

        }
    } else {
        var error = req.session.error
        req.session.error = ""
        res.redirect("/panel/auth/logout")
    }    
})
//CUD BUTUH LOGGER
router.post("/list", async function (req, res) {
    var start = req.body.start
    var length = req.body.length
    var order = req.body.columns[req.body.order[0].column].data
    var direction = req.body.order[0].dir
    var search = req.body.search.value

    try {
        var [ret, err] = await model_panel_user.list({
            start: parseInt(start),
            length: parseInt(length),
            search: search,
            order: order,
            direction: direction,
        })
        if (ret == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    try {
        var [count, err] = await model_panel_user.count({
            start: parseInt(start),
            length: parseInt(length),
            search: search,
            order: order,
            direction: direction,
        })
        if (count == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify({
        data: ret,
        recordsTotal: count,
        recordsFiltered: count,
    }));
})

router.post("/get", async function (req, res) {
    try {
        var [result, err] = await model_panel_user.get(req.body.id)
        if (result == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
    }));
})

router.post('/add', async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    if (!req.body.panel_submit_nik_data || !req.body.panel_user_name) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Something Went Wrong, Please Try  2Again!"
        });
    } 
    
    if(req.body.panel_user_role === ''){
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Please select the role first!"
        });
    }

    var [check, err] = await model_panel_user.getByNik(req.body.panel_submit_nik_data)
    if ((check && check.length > 0) && check[0].is_delete == 0) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "User Already Registered!"
        });
    } else if ((check && check.length > 0) && check[0].is_delete == 1) {
        var data = {
            id: check[0].id,
            updated_by: req.user.username,
            role: req.body.panel_user_role
        }
        var [ret, err] = await model_panel_user.unDelete(data)
        if (ret) {
            logger.access_response("panel", req, res, true)
            return res.status(200).send(JSON.stringify({
                status: "SUCCESS",
                message: "Data have been added"
            }))
        } else {
            return res.status(200).send(JSON.stringify({
                status: "FAILED",
                message: "Something wrong with your insert data"
            }))
        }
    } else {
        var [ret, err] = await model_panel_user.insert({
            username: req.body.panel_submit_nik_data,
            name: req.body.panel_user_name,
            role: req.body.panel_user_role,
            is_delete: 0,
            created: Math.floor(new Date() / 1000),
            created_by: req.user.username,
            updated: Math.floor(new Date() / 1000),
            updated_by: req.user.username
        })
        if (ret) {
            logger.access_response("panel", req, res, true)
            return res.status(200).send(JSON.stringify({
                status: "SUCCESS",
                message: "Data have been added"
            }))
        } else {
            return res.status(200).send(JSON.stringify({
                status: "FAILED",
                message: "Something wrong with your insert data"
            }))
        }
    }
})

router.post('/get_nik_data', async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.body)
    if (!req.body.panel_user_nik) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Please Fill the Required Field!"
        });
    }
    sentData = {
        nik: req.body.panel_user_nik
    }
    await axios_call.make_axios_hr_gateway("POST", sentData, "get_user_profile", "application/json").then(async function (resp) {
        if(resp.error==1)
        {
            return res.status(200).send(JSON.stringify({
                status: "FAILED",
                error_code: 1,
                message: "Failed no Data Found!"
            }))
        }
        return res.status(200).send(JSON.stringify({
            status: "SUCCESS",
            data: resp,
        }));
    }).catch(async function (error) {
        logger.error(error + "")
        return res.status(200).send(JSON.stringify({
            status: "FAILED",
            data: []
        }));
    })
})

router.post('/update', async function (req, res) {
    res.setHeader('Content-Type', 'application/json')

    if(req.body.panel_user_role === ''){
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Please select the role first!"
        });
    }

    let [ret, err] = await model_panel_user.update({
        role: req.body.panel_user_role,
        updated_by: req.user.username,
        id: req.body.panel_user_id
    })

    if (ret) {
        logger.access_response("panel", req, res, true)
        res.status(200).send(JSON.stringify({
            status: "SUCCESS",
            message: "Data have been updated"
        }))
    } else {
        res.status(200).send(JSON.stringify({
            status: "FAILED",
            message: "Something wrong with your insert data"
        }))
    }
})

router.post('/delete', async function (req, res) {
    var [user, arr] = await model_panel_user.get(req.body.id)
    console.log(user)
    if (user) {
        // if (user[0].username == 'administrator' || user[0].username == 'Administrator') {
        //     res.status(200).json({
        //         status: "FAILED",
        //         error_code: 1,
        //         message: "Cannot delete super admin!"
        //     })
        // } else {
            var data = {
                id: req.body.id,
                updated_by: req.user.id
            }
            var [result, arr] = await model_panel_user.delete(data)
            if (result) {
                logger.access_response("panel", req, res, true)
                return res.status(200).json({
                    status: "SUCCESS",
                    data: "Success delete data"
                })
            } else {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: "Cannot delete data"
                })
            }
        // }
    } else {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Data not found"
        })
    }
})
module.exports = router