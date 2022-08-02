const express = require('express')
const router = express.Router()
const logger = require('../../module/poly_logger')
const response_maker = require("../../module/api_response")
const axios_call = require('../../module/axios_call')
const axios = require('axios').default
const credential = require('../../module/credential')
const model_panel_registration = require('../../models/model_panel_registration')
const passwordGenerator = require('generate-otp')
const QRCode = require('qrcode')
const google_vision = require('../../module/google_vision')
const error_handling = require('../../module/api_response')
const app_config = require('../../config/app.json')
const configuration = require("../../module/configuration")
const {
    PdfDocument
} = require("../../module/pdf-tables-parser")
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const sharp = require('sharp')

const temporaryPath = path.join(process.cwd(), 'public/temp/')
const uploadedPath = path.join(process.cwd(), 'public/files/')


const {
    del
} = require('express/lib/application')
const {
    status,
    format
} = require('express/lib/response')
const read = require('body-parser/lib/read')
const {
    sort
} = require('mysql2/lib/constants/charset_encodings')
const {
    Console
} = require('console')

const generateQR = async text => {
    try {
        return await QRCode.toDataURL(text);
    } catch (err) {
        return console.error(err);
    }
}

//set storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, temporaryPath)
    },
    filename: function (req, file, cb) {
        console.log(file, "ini file di multer")
        var now = Math.floor(new Date() / 1000)

        cb(null, file.fieldname + "_" + now + path.extname(file.originalname))
    }
})

//init upload
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log(file, "ini file di multer bwh")
        sanitizeFile(file, cb);
    }
}).fields([{
    name: 'input_pdf'
}])

function sanitizeFile(file, cb) {
    console.log(file, "ini file di multer")
    let fileExts = ['pdf']
    let isAllowedExt = fileExts.includes(file.originalname.split('.')[1].toLowerCase());
    let isAllowedMimeType = file.mimetype.startsWith("application/pdf")
    if (isAllowedExt) {
        return cb(null, true) // no errors
    } else {
        cb('Error: File type not allowed!')
    }
}

router.get('/', async function (req, res) {
    if (req.isAuthenticated()) {
        var token = req.user.token
        var key_token = credential.verifyKey(token)
        if (!key_token) {
            req.session.error = 'Your session is expired'
            return res.redirect("/panel/auth/logout")
        }
        if (req.user.role === "Admin") {
            return res.redirect('/panel/user_admin')
        } else {
            console.log("masuk sini")
            return res.render("./panel/tracker", {
                title: "Tracker",
                data: [],
                user: req.user
            })
        }
    } else {
        var error = req.session.error
        req.session.error = ""
        return res.redirect("/auth/logout")
    }
})

//CUD BUTUH LOGGER
router.post("/list", async function (req, res) {
    console.log("masuk list tracker", req.body)
    var start = req.body.start
    var length = req.body.length
    var order = req.body.columns[3].data
    var direction = req.body.order[0].dir
    var search = req.body.search.value
    let status_cikarang = 0

    try {
        var [ret, err] = await model_panel_tracker.list({
            start: parseInt(start),
            length: parseInt(length),
            status_cikarang: status_cikarang,
            search: search,
            order: order,
            direction: direction,
        })
        console.log(ret, "ini ret")
        if (ret == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    try {
        let [count, err] = await model_panel_tracker.count({
            start: parseInt(start),
            length: parseInt(length),
            status_cikarang: status_cikarang,
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
        var [result, err] = await model_panel_tracker.get(req.body.id)
        if (result == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
    }));
})

router.post("/get-in", async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    console.log(req.body, "ini req.body")
    try {
        let [result, err] = await model_panel_tracker.get_in(req.body.id)
        console.log(result, "ini result di controller get in")
        if (result) {
            let [dni, err_dni] = await model_panel_tracker.get_dni(req.body.id)
            if (dni.length > 0) {
                result.dni = dni
                let [receiver, err_receiver] = await model_panel_tracker.get_receiver_by_id(dni[0].receiver)
                console.log(receiver, "ini receiver di cont get in")
                result.receiver = receiver
            }
            if (result === null) {
                throw err
            }
            console.log(result, "ini result di controller get in")
            return res.status(200).send(JSON.stringify({
                status: "SUCCESS",
                data: result,
            }))
        }
    } catch (error) {
        logger.error(error + "")
        return
    }
})

router.get("/barang-keluar", async function (req, res) {

    return res.render("./panel/barang_keluar", {
        title: "Tracker",
        data: [],
        user: req.user
    })
})

router.post("/detail-barang-keluar", async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    console.log(req.body, "ini req.body")
    try {
        let [sc, err_sc] = await model_panel_tracker.get_detail_ship_code(req.body.id_ship_code)
        if (sc) {
            let [dno, err_dno] = await model_panel_tracker.get_dno_keluar(sc.id)
            if (dno.length > 0) {
                sc.dno = dno
                for (let i of dno) {
                    let [dnoi, err_dnoi] = await model_panel_tracker.get_dnoi_keluar(i.id)
                    let [receiver, err_receiver] = await model_panel_tracker.get_receiver_by_id(i.received_by)
                    i.dnoi = dnoi
                    sc.receiver = receiver
                }
            }
        }
        console.log(sc, "ini sc")
        if (sc == null) {
            throw err;
        }
        console.log(sc, "ini sc di controller detail brg keluar")
        return res.status(200).send(JSON.stringify({
            status: "SUCCESS",
            data: sc,
        }))
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }
})

router.get("/add-barang-keluar/:id_ship_code", async function (req, res) {

    return res.render("./panel/barang_keluar", {
        title: "Tracker",
        data: {
            id_ship_code: req.params.id_ship_code,
        },
        user: req.user
    })
})

router.post("/get-receiver", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.user, "ini req user di get receiver")
    console.log(req.body.warehouse, "ini warehouse option")
    try {
        var [result, err] = await model_panel_tracker.get_receiver(req.body.warehouse.id, req.user.id)
        console.log(result, "ini result")
        if (result == null)
            throw err;
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    console.log(result, "ini result sebelum se header")
    return res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
        user: req.user
    }));
})

router.post("/get-supplier", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.user, "ini req user di get receiver")
    try {
        var [result, err] = await model_panel_tracker.get_supplier(req.user.id)
        console.log(result, "ini result")
        if (result == null)
            throw err;
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    console.log(result, "ini result sebelum se header")
    return res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
        user: req.user
    }));
})

router.post("/get-ship-code", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.user, "ini req user di get ship code")
    try {
        var [result, err] = await model_panel_tracker.get_ship_code(req.body.id)
        console.log(result, "ini result")
        if (result == null)
            throw err;
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    console.log(result, "ini result sebelum se header")
    return res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
        user: req.user
    }));
})

router.post("/get-tab", async function (req, res) {
    console.log("masuk list tracker")
    var start = req.body.start
    var length = req.body.length
    var order = req.body.columns[0].data
    var direction = 'asc'
    var search = req.body.search.value
    console.log(req.user, "ini isi req user")
    console.log(req.body, "ini req body di tab di get tab")

    if (req.body.status === 'arriving' || req.body.status === 'transit') {
        try {
            let [ship_code, err_ship_code] = await model_panel_tracker.get_ship_code(req.body.id_shipcode)
            if (ship_code == null) {
                throw err;
            } else if (ship_code) {
                console.log(ship_code, "KESINIII JUGA MASUK??")
                if (ship_code.is_cikarang == 1) {
                    console.log("maASSSUKKKKK SINIIIII!!!!")
                    var [ret, err] = await model_panel_tracker.get_tab_in_cikarang({
                        start: parseInt(start),
                        length: parseInt(length),
                        search: search,
                        order: order,
                        direction: direction,
                        id_shipcode: req.body.id_shipcode,
                        status: req.body.status
                    })
                    console.log(ret, "ini ret")
                    if (ret == null)
                        throw err;
                    if (ret) {
                        if (ret.length > 0) {
                            for (let i of ret) {
                                i.ship_code = ship_code.ship_code
                            }
                        }
                        console.log(ret, "ini ret kedua")
                    }
                } else {
                    console.log(
                        "masukkkk GAAA SEHHH"
                    )
                    var [ret, err] = await model_panel_tracker.get_tab_in({
                        start: parseInt(start),
                        length: parseInt(length),
                        search: search,
                        order: order,
                        direction: direction,
                        id_shipcode: req.body.id_shipcode,
                        status: req.body.status
                    })
                    console.log(ret, "ini ret")
                    if (ret == null)
                        throw err;
                    if (ret) {
                        if (ret.length > 0) {
                            for (let i of ret) {
                                i.ship_code = ship_code.ship_code
                            }
                        }
                        console.log(ret, "ini ret kedua")
                    }
                }
            }
        } catch (error) {
            logger.error(error + "")
            return;
        }

        try {
            var [count, err] = await model_panel_tracker.count_tab_in({
                start: parseInt(start),
                length: parseInt(length),
                search: search,
                order: order,
                direction: direction,
                id_shipcode: req.body.id_shipcode,
                status: req.body.status
            })
            if (count == null)
                throw err;
        } catch (error) {
            logger.error(error + "")
            return;
        }
    } else if (req.body.status === 'ready_to_ship' || req.body.status === 'ship' || req.body.status === 'delivered') {
        try {
            var [ret, err] = await model_panel_tracker.get_tab_out({
                start: parseInt(start),
                length: parseInt(length),
                search: search,
                order: order,
                direction: direction,
                id_shipcode: req.body.id_shipcode,
                status: req.body.status
            })
            console.log(ret, "ini ret")
            if (ret == null)
                throw err;
            if (ret.length > 0) {
                for (let i of ret) {
                    [i.ship_code, err_ship_code] = await model_panel_tracker.get_ship_code(req.body.id_shipcode)
                }
            }
        } catch (error) {
            logger.error(error + "")
            return;
        }

        try {
            var [count, err] = await model_panel_tracker.count_tab_out({
                start: parseInt(start),
                length: parseInt(length),
                search: search,
                order: order,
                direction: direction,
                id_shipcode: req.body.id_shipcode,
                status: req.body.status
            })
            if (count == null)
                throw err;
        } catch (error) {
            logger.error(error + "")
            return;
        }
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify({
        data: ret,
        recordsTotal: count,
        recordsFiltered: count,
    }));
})

router.post("/get-detail-tab", async function (req, res) {
    console.log("masuk list detail tab")
    console.log(req.user, "ini isi req user")
    console.log(req.body, "ini req body di tab di get tab")

    try {
        let [ship_code, err_sc] = await model_panel_tracker.getShipCodeById(req.body.id_shipcode)

        if (ship_code) {
            if (req.body.status === 'transit') {
                [ship_code.detail_tab_in, err] = await model_panel_tracker.get_detail_tab_in({
                    id_ship_code: req.body.id_shipcode,
                    status: 'arriving'
                })

                if (ship_code.detail_tab_in.length > 0) {
                    if (ship_code.is_cikarang === 0) {
                        console.log("masuk sini")
                        let [delivery_note, err_dnoi1] = await model_panel_tracker.get_detail_tab_delivery_note_in(ship_code.detail_tab_in[0].id_delivery_note_in)
                        ship_code.delivery_note = delivery_note
                    } else if (ship_code.is_cikarang === 1 && req.body.status === 'transit') {
                        console.log("masuk sini 2")
                        let [delivery_note_cikarang, err_dnoi2] = await model_panel_tracker.get_detail_tab_delivery_note_in_transit_cikarang(ship_code.detail_tab_in[0].id_delivery_note_in)
                        ship_code.delivery_note = delivery_note_cikarang
                    }
                }
            } else if (req.body.status === 'arriving') {
                [ship_code.detail_tab_in, err] = await model_panel_tracker.get_detail_tab_in({
                    id_ship_code: req.body.id_shipcode,
                    status: req.body.status
                })
                if (ship_code.detail_tab_in.length > 0) {
                    let [delivery_note, err_dnoi1] = await model_panel_tracker.get_detail_tab_delivery_note_in_arriving(ship_code.detail_tab_in[0].id_delivery_note_in)
                    ship_code.delivery_note = delivery_note
                }
            } else if (req.body.status === 'ready_to_ship') {
                console.log("masuk3")[ship_code.detail_tab_out, err] = await model_panel_tracker.get_detail_tab_out({
                    id_ship_code: req.body.id_shipcode,
                    status: req.body.status
                })

                if (ship_code.detail_tab_out.length > 0) {
                    let [delivery_note, err_dnoi1] = await model_panel_tracker.get_detail_tab_delivery_note_out_ready_to_ship(ship_code.detail_tab_out[0].id_delivery_note_out)
                    ship_code.delivery_note = delivery_note
                }
            } else if (req.body.status === 'ship' || req.body.status === 'delivered') {
                console.log("masuk4")[ship_code.detail_tab_out, err] = await model_panel_tracker.get_detail_tab_out({
                    id_ship_code: req.body.id_shipcode,
                    status: 'ready_to_ship'
                })
                if (ship_code.detail_tab_out.length > 0) {
                    let [delivery_note_ready_to_ship, err_dnoi2] = await model_panel_tracker.get_detail_tab_delivery_note_out(ship_code.detail_tab_out[0].id_delivery_note_out)
                    ship_code.delivery_note = delivery_note_ready_to_ship
                }
            }

            let [date, err_date] = await model_panel_tracker.get_date_status_ship_code(req.body.status, req.body.id_shipcode)
            if (date.length > 0) {
                ship_code.date = date[0].created_at
            } else {
                ship_code.date = '-'
            }
            console.log(ship_code, "ini ship code in controller")
        } else {
            throw err
        }
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(JSON.stringify({
            data: ship_code
        }))
    } catch (error) {
        logger.error(error + "")
        return;
    }
})

router.post("/get-all-log", async function (req, res) {
    console.log("masuk get all log")
    console.log("masuk list detail tab")
    console.log(req.user, "ini isi req user")
    console.log(req.body, "ini req body di tab di get all log")
    var order = req.body.columns[3].data
    var direction = req.body.order[0].dir
    try {
        if (req.body.id_shipcode) {
            // let [sc_log, err_sc_log] = await model_panel_tracker.getAllLogSc(req.body.id_shipcode)
            // let [dni_log, err_dni_log] = await model_panel_tracker.getAllLogDni(req.body.id_shipcode)
            // let [dno_log, err_dno_log] = await model_panel_tracker.getAllLogDno(req.body.id_shipcode)

            let [log, err_sc_log] = await model_panel_tracker.getAllLog(req.body.id_shipcode)
            // if(sc_log.length > 0){
            //     let log = sc_log.concat(dni_log, dno_log)
            //     // log.sort((a, b) => a.created_at.localeCompare(b.created_at) || b.delivery_note - a.delivery_note)
            //    let sorting_log = log.sort(function(x, y){

            //         // let a = c.ship_code
            //         // let b = d.delivery_note
            //         let sorting_date = x.created_at - y.created_at

            //         console.log(sorting_date,"ini sorting date")
            //         return sorting_date
            //     })
            console.log(log, "ini log")
            res.setHeader('Content-Type', 'application/json')
            return res.status(200).send(JSON.stringify({
                data: log
            }))
            // }
        }

    } catch (error) {
        logger.error(error + "")
        return;
    }
})

router.post("/get-detail-tab-all", async function (req, res) {
    console.log("masuk list detail tab")
    console.log(req.user, "ini isi req user")
    console.log(req.body, "ini req body di tab di get tab")

    try {
        let [ship_code, err_sc] = await model_panel_tracker.getShipCodeById(req.body.id_shipcode)
        console.log(ship_code, "ini ship code in controller")
        if (ship_code) {
            // transit
            if (ship_code.is_cikarang === 0) {
                console.log("masuk sini")
                let [transit, err_dni_transit] = await model_panel_tracker.get_detail_tab_in({
                    id_ship_code: req.body.id_shipcode,
                    status: 'arriving'
                })
                if (transit.length > 0) {
                    ship_code.transit = transit[0]
                } else {
                    ship_code.transit = {}
                }
                if (ship_code.transit) {
                    let [delivery_note, err_dnoi1] = await model_panel_tracker.get_detail_tab_delivery_note_in(ship_code.transit.id_delivery_note_in)
                    ship_code.transit.delivery_note = delivery_note
                }
            } else if (ship_code.is_cikarang === 1) {
                console.log("masuk sini 2")
                let [transit, err_dni_transit] = await model_panel_tracker.get_detail_tab_in({
                    id_ship_code: req.body.id_shipcode,
                    status: 'transit'
                })
                if (transit.length > 0) {
                    ship_code.transit = transit[0]
                } else {
                    ship_code.transit = {}
                }
                if (ship_code.transit) {

                    let [delivery_note_cikarang, err_dnoi2] = await model_panel_tracker.get_detail_tab_delivery_note_in_transit_cikarang(ship_code.transit.id_delivery_note_in)
                    ship_code.transit.delivery_note = delivery_note_cikarang
                }
            }
            let [date_transit, err_date_transit] = await model_panel_tracker.get_date_status_ship_code('transit', req.body.id_shipcode)
            if (date_transit.length > 0) {
                ship_code.transit.date = date_transit[0].created_at
            } else {
                ship_code.transit.date = '-'
            }
            console.log(ship_code, "ini ship code di transit")
            // arriving
            let [arriving, err_arriving] = await model_panel_tracker.get_detail_tab_in({
                id_ship_code: req.body.id_shipcode,
                status: 'arriving'
            })
            if (arriving.length > 0) {
                ship_code.arriving = arriving[0]
            } else {
                ship_code.arriving = {}
            }
            console.log(ship_code, "ini ship code")
            if (ship_code.arriving) {
                console.log("masuk sini")
                let [delivery_note, err_dnoi1] = await model_panel_tracker.get_detail_tab_delivery_note_in_arriving(ship_code.arriving.id_delivery_note_in)
                ship_code.arriving.delivery_note = delivery_note
            }
            let [date_arriving, err_date_arriving] = await model_panel_tracker.get_date_status_ship_code('arriving', req.body.id_shipcode)
            if (date_arriving.length > 0) {
                ship_code.arriving.date = date_arriving[0].created_at
            } else {
                ship_code.arriving.date = '-'
            }
            console.log(ship_code, "ini ship code di arriving")
            // ready_to_ship'
            console.log("masuk3")
            let [ready_to_ship, err_ready_to_ship] = await model_panel_tracker.get_detail_tab_out({
                id_ship_code: req.body.id_shipcode,
                status: 'ready_to_ship'
            })

            if (ready_to_ship.length > 0) {
                ship_code.ready_to_ship = ready_to_ship[0]
            } else {
                ship_code.ready_to_ship = {}
            }

            if (ship_code.ready_to_ship) {
                let [delivery_note, err_dnoi1] = await model_panel_tracker.get_detail_tab_delivery_note_out_ready_to_ship(ship_code.ready_to_ship.id_delivery_note_out)
                ship_code.ready_to_ship.delivery_note = delivery_note
            }

            let [date_ready_to_ship, err_date_ready_to_ship] = await model_panel_tracker.get_date_status_ship_code('ready_to_ship', req.body.id_shipcode)

            if (date_ready_to_ship.length > 0) {
                ship_code.ready_to_ship.date = date_ready_to_ship[0].created_at
            } else {
                ship_code.ready_to_ship.date = '-'
            }
            //shipping
            console.log("masuk4")

            let [shipping, err_shipping] = await model_panel_tracker.get_detail_tab_out({
                id_ship_code: req.body.id_shipcode,
                status: 'ready_to_ship'
            })

            if (shipping.length > 0) {
                ship_code.ship = shipping[0]
            } else {
                ship_code.ship = {}
            }

            if (ship_code.ship) {
                let [delivery_note_ready_to_ship, err_dnoi2] = await model_panel_tracker.get_detail_tab_delivery_note_out(ship_code.ship.id_delivery_note_out)
                ship_code.ship.delivery_note = delivery_note_ready_to_ship
            }

            let [date_ship, err_date_ship] = await model_panel_tracker.get_date_status_ship_code('ship', req.body.id_shipcode)
            if (date_ship.length > 0) {
                ship_code.ship.date = date_ship[0].created_at
            } else {
                ship_code.ship.date = '-'
            }
            //delivered

            let [delivered, err_delivered] = await model_panel_tracker.get_detail_tab_out({
                id_ship_code: req.body.id_shipcode,
                status: 'ready_to_ship'
            })

            if (delivered.length > 0) {
                ship_code.delivered = delivered[0]
            } else {
                ship_code.delivered = {}
            }

            if (ship_code.delivered) {
                let [delivery_note_ready_to_ship, err_dnoi2] = await model_panel_tracker.get_detail_tab_delivery_note_out(ship_code.delivered.id_delivery_note_out)
                ship_code.delivered.delivery_note = delivery_note_ready_to_ship
            }

            let [date_delivered, err_date_delivered] = await model_panel_tracker.get_date_status_ship_code('delivered', req.body.id_shipcode)
            if (date_delivered.length > 0) {
                ship_code.delivered.date = date_delivered[0].created_at
            } else {
                ship_code.delivered.date = '-'
            }
            console.log(ship_code, "ini ship code in controller")
        } else {
            throw err
        }
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(JSON.stringify({
            data: ship_code
        }))
    } catch (error) {
        console.log(error)
        logger.error(error + "")
        return;
    }
})

router.post("/get-location", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    try {
        var [result, err] = await model_panel_tracker.get_location(req.body.id)
        console.log(result, "ini result")
        if (result == null)
            throw err;
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    console.log(result, "ini result sebelum se header")
    return res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
    }))
})

router.post("/resend-otp-in", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.body, "ini req.body di resend OTP")
    try {
        let [result, err] = await model_panel_tracker.get_resend_otp_in(req.body.id_shipcode)
        console.log(result, " ini result")
        let arr_delivery_note = []
        if (result && result.length > 0) {
            console.log("masuk sini ya")
            for (let i of result) {
                arr_delivery_note.push(i.delivery_note)
            }

            let [update_otp_date, err_otp_date] = await model_panel_tracker.update_otp_date_in(req.body.id_shipcode)
            console.log(arr_delivery_note)
            console.log(result)
            console.log(update_otp_date, "ini update otp date")
            if (update_otp_date.changedRows > 0) {
                axios({
                        method: 'post',
                        url: configuration["APP_EMAIL_URL"],
                        auth: {
                            username: configuration["APP_EMAIL_USERNAME"],
                            password: configuration["APP_EMAIL_PASSWORD"]
                        },
                        data: {
                            to: [result[0].email],
                            subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${result[0].ship_code}`,
                            message: `<!DOCTYPE html>
                            <style>
                            @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                            </style>
                            <body style='font-family:'OpenSans';'>
                            <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                            <div style='text-align:center;'>
                                <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${result[0].ship_code} sebagai berikut : </h3>
                                <h1  style="font-weight: 600; font-size: 50px;">${result[0].otp}</h1>
                            </div>
                            <br>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${result[0].ship_code} , dengan Surat Jalan sebagai berikut :</p>
                                <div style=' text-align:center;'>
                                    <h2>  <span style="color : #D91921">&bull;</span>  ${arr_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')}</h2>
                                </div>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <br>
                            <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                <p> Jakarta, ${new Date().getFullYear()} </p>
                                <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                            </div>
                            </body>
                        </html>`
                        }
                    })
                    .then(function (response) {
                        console.log(response.data.data, "ini response<<<---");

                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    });
                logger.access_response("panel", req, res, true)
                return res.status(200).send({
                    data: result,
                    status: "SUCCESS"
                })
            }
        }
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }
})

router.post("/resend-otp-out", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.body, "ini req.body di resend OTP")
    try {
        let [result, err] = await model_panel_tracker.get_resend_otp_out(req.body.id_shipcode)
        console.log(result, " ini result")
        let arr_delivery_note = []
        if (result && result.length > 0) {
            console.log("masuk sini ya")
            for (let i of result) {
                arr_delivery_note.push(i.delivery_note)
            }

            let [update_otp_date, err_otp_date] = await model_panel_tracker.update_otp_date_out(req.body.id_shipcode)
            console.log(arr_delivery_note)
            console.log(result)
            console.log(update_otp_date, "ini update otp date")
            if (update_otp_date.changedRows > 0) {
                axios({
                        method: 'post',
                        url: configuration["APP_EMAIL_URL"],
                        auth: {
                            username: configuration["APP_EMAIL_USERNAME"],
                            password: configuration["APP_EMAIL_PASSWORD"]
                        },
                        data: {
                            to: [result[0].email],
                            subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${result[0].ship_code}`,
                            message: `<!DOCTYPE html>
                        <style>
                        @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                        </style>
                        <body style='font-family:'OpenSans';'>
                        <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                        <div style='text-align:center;'>
                            <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${result[0].ship_code} sebagai berikut : </h3>
                            <h1  style="font-weight: 600; font-size: 50px;">${result[0].otp}</h1>
                        </div>
                        <br>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${result[0].ship_code} , dengan Surat Jalan sebagai berikut :</p>
                            <div style=' text-align:center;'>
                                <h2>  <span style="color : #D91921">&bull;</span>  ${arr_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')}</h2>
                            </div>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <br>
                        <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                            <p> Jakarta, ${new Date().getFullYear()} </p>
                            <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                            <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                        </div>
                        </body>
                    </html>`
                        }
                    })
                    .then(function (response) {
                        console.log(response.data.data, "ini response<<<---");

                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    });
                logger.access_response("panel", req, res, true)
                return res.status(200).send({
                    data: result,
                    status: "SUCCESS"
                })
            }
        }
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }
})

router.post("/get-last-date-otp-in", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.body, "ini req.body di get last date OTP")
    try {
        let [result, err] = await model_panel_tracker.get_last_date_otp_in(req.body.id_shipcode)
        console.log(result, " ini result")
        // if (result) {
        console.log("masuk sini ya")
        return res.status(200).send(JSON.stringify({
            status: "SUCCESS",
            data: result
        }))
        // }
    } catch {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }
})

router.post("/get-last-date-otp-out", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.body, "ini req.body di get last date OTP")
    try {
        let [result, err] = await model_panel_tracker.get_last_date_otp_out(req.body.id_shipcode)
        console.log(result, " ini result")
        // if (result) {
        console.log("masuk sini ya")
        return res.status(200).send(JSON.stringify({
            status: "SUCCESS",
            data: result
        }))
        // }
    } catch {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }
})

router.get("/detail/:id_ship_code", async function (req, res) {
    // res.setHeader('Content-Type', 'application/json');
    console.log(req.params.id_ship_code, "ini params di get detail id ship code")
    try {
        var [result, err] = await model_panel_tracker.get_detail_ship_code(req.params.id_ship_code)
        if (result == null) {
            throw err;
        }
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    if (req.query.print && req.query.tab) {
        result.print = req.query.print
        result.tab = req.query.tab
    }
    console.log(result, "ini result")
    console.log("masuk mau render")
    return res.render("./panel/detail_tracker", {
        title: "Tracker",
        data: result,
        user: req.user
    })
})

router.get("/detail/:id_ship_code/dni_print", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            let [delivery_note, err_delivery_note] = await model_panel_tracker.get_all_delivery_note_in_arriving(req.params.id_ship_code)
            console.log(delivery_note, "ini delivery note")
            if (delivery_note === null) {
                throw err;
            }
            if (delivery_note.length > 0) {
                for (let i of delivery_note) {
                    i.receiver_name = await model_panel_tracker.get_receiver_name_by_id(i.received_by)
                    i.qr = await generateQR(`${configuration['APP_DOMAIN']}/scan/dni/${i.id_md5_dni}`)
                    try {
                        let [update_print, err_update_print] = await model_panel_tracker.update_is_print(i.id)
                    } catch (error) {
                        console.log(error, "ini error")
                        logger.error(error + "")
                        return;
                    }
                }
            }

            console.log(delivery_note, "ini final dn")
            console.log("masuk mau render")
            return res.render("./panel/detail_tracker_print_dni", {
                title: "Tracker",
                data: delivery_note,
                user: req.user
            })
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return;
        }
    }),

    router.get("/detail/:id_ship_code/add_dni_print", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            let [delivery_note, err_delivery_note] = await model_panel_tracker.get_all_delivery_note_in_arriving_not_print(req.params.id_ship_code)
            console.log(delivery_note, "ini delivery note")
            if (delivery_note === null) {
                throw err;
            }
            if (delivery_note.length > 0) {
                for (let i of delivery_note) {
                    i.receiver_name = await model_panel_tracker.get_receiver_name_by_id(i.received_by)
                    i.qr = await generateQR(`${configuration['APP_DOMAIN']}/scan/dni/${i.id_md5_dni}`)
                    try {
                        let [update_print, err_update_print] = await model_panel_tracker.update_is_print(i.id)
                    } catch (error) {
                        console.log(error, "ini error")
                        logger.error(error + "")
                        return;
                    }
                }
            }

            console.log(delivery_note, "ini final dn")
            console.log("masuk mau render")
            return res.render("./panel/detail_tracker_print_dni", {
                title: "Tracker",
                data: delivery_note,
                user: req.user
            })
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return;
        }
    }),

    router.post("/check-print-dni", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            res.setHeader('Content-Type', 'application/json');
            console.log("MASUKKKK CHECK PRINT DNIIII")
            let [delivery_note, err_delivery_note] = await model_panel_tracker.get_all_delivery_note_in_arriving_not_print(req.body.id)
            console.log(delivery_note, "ini delivery note")
            if (delivery_note === null) {
                throw err;
            }
            // if (delivery_note.length > 0) {
            //     for (let i of delivery_note) {
            //         i.receiver_name = await model_panel_tracker.get_receiver_name_by_id(i.received_by)
            //         i.qr = await generateQR(`${configuration['APP_DOMAIN']}/scan/dni/${i.id_md5_dni}`)
            //         try {
            //             let [update_print, err_update_print] = await model_panel_tracker.update_is_print(i.id)
            //         } catch (error) {
            //             console.log(error, "ini error")
            //             logger.error(error + "")
            //             return;
            //         }
            //     }
            // }

            console.log(delivery_note, "ini final dn")
            console.log("masuk mau render")
            return res.status(200).send(JSON.stringify({
                status: "SUCCESS",
                data: delivery_note,
                user: req.user
            }))
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return;
        }
    }),

    router.post("/check-print-dno", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            res.setHeader('Content-Type', 'application/json');
            console.log("MASUKKKK CHECK PRINT DNOOOO")
            let [delivery_note, err_delivery_note] = await model_panel_tracker.get_all_delivery_note_out_not_print(req.body.id)
            console.log(delivery_note, "ini delivery note")
            if (delivery_note === null) {
                throw err;
            }
            // if (delivery_note.length > 0) {
            //     for (let i of delivery_note) {
            //         i.receiver_name = await model_panel_tracker.get_receiver_name_by_id(i.received_by)
            //         i.qr = await generateQR(`${configuration['APP_DOMAIN']}/scan/dni/${i.id_md5_dni}`)
            //         try {
            //             let [update_print, err_update_print] = await model_panel_tracker.update_is_print(i.id)
            //         } catch (error) {
            //             console.log(error, "ini error")
            //             logger.error(error + "")
            //             return;
            //         }
            //     }
            // }

            console.log(delivery_note, "ini final dn")
            console.log("masuk mau render")
            return res.status(200).send(JSON.stringify({
                status: "SUCCESS",
                data: delivery_note,
                user: req.user
            }))
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return;
        }
    }),

    router.get("/detail/:id_ship_code/dno_print", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            let [delivery_note, err_delivery_note] = await model_panel_tracker.get_all_delivery_note_out_ready(req.params.id_ship_code)
            console.log(delivery_note, "ini delivery note")
            if (delivery_note === null) {
                throw err;
            }
            if (delivery_note.length > 0) {
                for (let i of delivery_note) {
                    i.receiver_name = await model_panel_tracker.get_receiver_name_by_id(i.received_by)
                    i.qr = await generateQR(`${configuration['APP_DOMAIN']}/scan/dno/${i.id_md5_dno}`)
                    i.qr2 = await generateQR(`${configuration['APP_DOMAIN']}/scan/dno/security/${i.id_md5_dno}`)
                    let [dnoi, err_dnoi] = await model_panel_tracker.get_delivery_note_out_item(i.id)
                    if (dnoi.length > 0) {
                        i.dnoi = dnoi
                    }
                    try {
                        let [update_print, err_update_print] = await model_panel_tracker.update_is_print_dno(i.id)
                    } catch (error) {
                        console.log(error, "ini error")
                        logger.error(error + "")
                        return;
                    }
                }
            }

            console.log(delivery_note, "ini final dn")
            console.log("masuk mau render")
            return res.render("./panel/detail_tracker_print_dno", {
                title: "Tracker",
                data: delivery_note,
                user: req.user
            })
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return;
        }
    }),

    router.get("/detail/:id_ship_code/add_dno_print", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            let [delivery_note, err_delivery_note] = await model_panel_tracker.get_all_delivery_note_out_not_print(req.params.id_ship_code)
            console.log(delivery_note, "ini delivery note")
            if (delivery_note === null) {
                throw err;
            }
            if (delivery_note.length > 0) {
                for (let i of delivery_note) {
                    i.receiver_name = await model_panel_tracker.get_receiver_name_by_id(i.received_by)
                    i.qr = await generateQR(`${configuration['APP_DOMAIN']}/scan/dno/${i.id_md5_dno}`)
                    i.qr2 = await generateQR(`${configuration['APP_DOMAIN']}/scan/dno/security/${i.id_md5_dno}`)
                    let [dnoi, err_dnoi] = await model_panel_tracker.get_delivery_note_out_item(i.id)
                    if (dnoi.length > 0) {
                        i.dnoi = dnoi
                    }
                    try {
                        let [update_print, err_update_print] = await model_panel_tracker.update_is_print_dno(i.id)
                    } catch (error) {
                        console.log(error, "ini error")
                        logger.error(error + "")
                        return;
                    }
                }
            }

            console.log(delivery_note, "ini final dn")
            console.log("masuk mau render")
            return res.render("./panel/detail_tracker_print_dno", {
                title: "Tracker",
                data: delivery_note,
                user: req.user
            })
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return;
        }
    }),

    router.get("/detail/:id_ship_code/dni_print_transit", async function (req, res) {
        // res.setHeader('Content-Type', 'application/json');
        try {
            let [result, err_result] = await model_panel_tracker.get_detail_ship_code(req.params.id_ship_code)
            if (result == null) {
                throw err;
            }

            try {
                let [ret, err_ret] = await model_panel_tracker.get_transit({
                    id_shipcode: req.params.id_ship_code,
                    status: 'transit'
                })
                console.log(ret, "ini ret")

                if (ret.length > 0) {
                    result.delivery_note_collection = ret
                }
                if (ret == null)
                    throw err;
                // if (ret.length > 0) {
                //     for (let i of ret) {
                //         [i.ship_code, err_ship_code] = await model_panel_tracker.get_ship_code(req.body.id_shipcode)
                //     }
                // }
                console.log(result, "ini result kedua")
                console.log(result, "ini result")
                console.log("masuk mau render")
                return res.render("./panel/detail_tracker_print_dni_transit", {
                    title: "Tracker",
                    data: result,
                    user: req.user
                })
            } catch (error) {
                console.log(error, "ini error")
                logger.error(error + "")
                return;
            }
        } catch (error) {
            logger.error(error + "")
            return;
        }
    })

router.get("/detail-delivery-note-in/:ship_code/:id_delivery_note/:status", async function (req, res) {
    // res.setHeader('Content-Type', 'application/json');
    console.log(req.params.status, "ini req param status")
    try {
        if (req.params.status === 'transit') {
            let [ship_code, err_ship_code] = await model_panel_tracker.get_ship_code_cikarang(req.params.ship_code)
            console.log(ship_code, "ini ship code")
            if (ship_code.is_cikarang === 1) {
                var [result, err] = await model_panel_tracker.get_detail_delivery_note_in_cikarang(req.params.ship_code, req.params.id_delivery_note)
            } else {
                var [result, err] = await model_panel_tracker.get_detail_delivery_note_in(req.params.ship_code, req.params.id_delivery_note)
            }
        } else {
            var [result, err] = await model_panel_tracker.get_detail_delivery_note_in(req.params.ship_code, req.params.id_delivery_note)
        }
        console.log(result, "ini result")
        if (result == null) {
            throw err;
        }

        console.log("masuk mau render")
        QRCode.toDataURL(`${configuration["APP_DOMAIN"]}/scan/dni/${result.id_md5}`, function (err, url) {
        return res.render("./panel/detail_delivery_note", {
            title: "Tracker",
            data: result,
            status: req.params.status,
            qr: url,
            user: req.user
        })
    })
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: error
        })
    }
})

router.get("/detail-delivery-note-out/:ship_code/:delivery_note/:status", async function (req, res) {
    // res.setHeader('Content-Type', 'application/json');
    try {
        var [result, err] = await model_panel_tracker.get_detail_delivery_note_out(req.params.ship_code, req.params.delivery_note)
        console.log(result, "ini result")
        if (result == null) {
            throw err;
        }
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    console.log("masuk mau render")

    QRCode.toDataURL(`${configuration["APP_DOMAIN"]}/scan/dno/${result.id_md5}`, function (err, url) {
        QRCode.toDataURL(`${configuration["APP_DOMAIN"]}/scan/dno/security/${result.id_md5}`, function (err, url2) {
            console.log(url, "ini URL delivery note keluar")
            return res.render("./panel/detail_delivery_note", {
                title: "Tracker",
                data: result,
                qr: url,
                qr2: url2,
                status: req.params.status,
                user: req.user
            })
        })
    })
})

router.post("/detail-delivery-note-out-item", async function (req, res) {
    console.log("masuk detail delivery note out item")
    res.setHeader('Content-Type', 'application/json');
    var start = req.body.start
    var length = req.body.length
    var order = req.body.columns[req.body.order[0].column].data
    var direction = req.body.order[0].dir
    var search = req.body.search.value

    try {
        var [ret, err] = await model_panel_tracker.get_detail_delivery_note_out_item({
            start: parseInt(start),
            length: parseInt(length),
            search: search,
            order: order,
            direction: direction,
            id_delivery_note_out: req.body.id_delivery_note_out,
        })
        console.log(ret, "ini ret")
        if (ret == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    try {
        var [count, err] = await model_panel_tracker.count_delivery_note_out_item({
            start: parseInt(start),
            length: parseInt(length),
            search: search,
            order: order,
            direction: direction,
            id_delivery_note_out: req.body.id_delivery_note_out
        })
        if (count == null)
            throw err;
    } catch (error) {
        logger.error(error + "")
        return;
    }

    console.log("masuk mau render")
    return res.status(200).send(JSON.stringify({
        data: ret,
        recordsTotal: count,
        recordsFiltered: count,
    }))
})

router.post("/get-warehouse", async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.user, "ini req user di get receiver")
    try {
        var [result, err] = await model_panel_tracker.get_warehouse()
        console.log(result, "ini result")
        if (result == null)
            throw err;
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return;
    }

    console.log(result, "ini result sebelum se header")
    return res.status(200).send(JSON.stringify({
        status: "SUCCESS",
        data: result,
        user: req.user
    }));
})

router.post('/add', async function (req, res) {
    console.log(req.user, "ini req user")
    console.log(req.body)
    res.setHeader('Content-Type', 'application/json')
    let pattern = /^[0-9.]*$/

    if (req.user.role === 'admin_cikarang') {
        req.body.warehouse = '{"id" : 0}'
    }

    if (!req.body.panel_tracker_ship_code || !req.body.panel_tracker_weight || !req.body.warehouse || !req.body.supplier_option || !req.body.panel_tracker_receiver || !req.body.panel_tracker_delivery_note) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "This form can't be empty!"
        });
    }

    if (!pattern.test(req.body.panel_tracker_weight)) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Weight must be a number or dot!"
        })
    }

    if (req.body.panel_tracker_delivery_note) {
        if (Array.isArray(req.body.panel_tracker_delivery_note)) {
            let clean_dni = req.body.panel_tracker_delivery_note.map(el => el.trim())
            let dni = clean_dni.includes('')
            if (dni) {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: "Delivery note can't be empty!"
                })
            }
        } else if (req.body.panel_tracker_delivery_note.trim() === '') {
            return res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Delivery note can't be empty!"
            })
        }
    }
    let [check, err_check] = await model_panel_tracker.getByShipCode(req.body.panel_tracker_ship_code)
    if (check && check.length > 0) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Ship Code Already Exist!"
        });
    }
    try {
        let status_ship_code = "arriving"
        let flag_cikarang = false

        if (req.user.role === "admin_cikarang") {
            status_ship_code = "transit"
            flag_cikarang = true
        }

        console.log("ini isi req.body: ", req.body)
        console.log(req.user, "ini req user id")
        let [tracker, err_tracker] = await model_panel_tracker.insertShipcode({
            ship_code: req.body.panel_tracker_ship_code,
            weight: req.body.panel_tracker_weight,
            jenis: req.body.panel_tracker_jenis,
            supplier: req.body.supplier_option,
            status: status_ship_code,
            is_cikarang: flag_cikarang,
            id_user: req.user.id
        })

        let [ship_code_log, err_ship_code_log] = await model_panel_tracker.insertShipcodeLog({
            id_ship_code: tracker.insertId,
            prior_status: "none",
            current_status: status_ship_code,
        })

        console.log(tracker, "ini tracker")
        console.log(req.body.panel_tracker_delivery_note.length)
        let otp = 0
        if (req.user.role !== "admin_cikarang") {
            otp = await passwordGenerator.generate(6)
        }
        let arr_delivery_note = []

        if (Array.isArray(req.body.panel_tracker_delivery_note)) {
            for (let i in req.body.panel_tracker_delivery_note) {
                console.log("masuk delivery note multiple")
                arr_delivery_note.push(req.body.panel_tracker_delivery_note[i])
                let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                    delivery_note: req.body.panel_tracker_delivery_note[i],
                    police_no: req.body.panel_tracker_police_no[i],
                    driver: req.body.panel_tracker_driver[i],
                    total_colly: req.body.panel_tracker_total_colly[i],
                    id_user: req.user.id,
                    id_ship_code: tracker.insertId,
                    otp: otp,
                    status: status_ship_code,
                    warehouse: JSON.parse(req.body.warehouse).id,
                    address: req.body.panel_tracker_address,
                    id_receiver: req.body.panel_tracker_receiver
                })
                let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                    status: status_ship_code,
                    id_user: req.user.id,
                    id_ship_code: tracker.insertId,
                    id_delivery_note_in: delivery_note.insertId
                })
            }
            try {
                var [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)
            } catch {
                console.log(error, "ini error")
                logger.error(error + "")
                return
            }
            if (req.user.role !== "admin_cikarang") {
                axios({
                        method: 'post',
                        url: configuration["APP_EMAIL_URL"],
                        auth: {
                            username: configuration["APP_EMAIL_USERNAME"],
                            password: configuration["APP_EMAIL_PASSWORD"]
                        },
                        data: {
                            to: [result.email],
                            subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                            message: `<!DOCTYPE html>
                            <style>
                            @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                            </style>
                            <body style="font-family: 'Open Sans';">
                            <div>
                                <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='LOGO WAREHOUSE' style="width: 200px">
                                </div>
                            <div style='text-align:center;'>
                                <p style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code} sebagai berikut : </p3>
                                <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                            </div>
                            <br>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <p style="font-size: 13px; padding : 20px ; text-align: justify ;"> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code}, dengan Surat Jalan sebagai berikut :</p>
                                <div style=' text-align:center; padding: 20px;'>
                                   <h2 style="margin-bottom : 10px;">  <span style="color : #D91921">&bull;</span> ${arr_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>')} </h2>
                                </div>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <br>
                            <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                <p> Jakarta, ${new Date().getFullYear()} </p>
                                <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='LOGO POLYTRON' style="width: 130px ">
                            </div>
                            </body>
                        </html>`
                        }
                    })
                    .then(function (response) {
                        console.log(response, "ini response<<<---");

                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    })

            } else {
                axios({
                        method: 'post',
                        url: configuration["URL_TELEGRAM"],
                        auth: {
                            username: configuration["USERNAME_TELEGRAM"],
                            password: configuration["PASSWORD_TELEGRAM"]
                        },
                        data: {
                            app_name: configuration["APP_NAME_TELEGRAM"],
                            title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                            text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                        }
                    })
                    .then(function (response) {
                        console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                        logger.access_response("panel", req, res, true)
                        return res.status(200).send(JSON.stringify({
                            status: "SUCCESS",
                            id_ship_code: tracker.insertId,
                            message: "Data have been added"
                        }))
                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    })

            }
            axios({
                    method: 'post',
                    url: configuration["URL_TELEGRAM"],
                    auth: {
                        username: configuration["USERNAME_TELEGRAM"],
                        password: configuration["PASSWORD_TELEGRAM"]
                    },
                    data: {
                        app_name: configuration["APP_NAME_TELEGRAM"],
                        title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                        text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                    }
                })
                .then(function (response) {
                    console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        id_ship_code: tracker.insertId,
                        message: "Data have been added"
                    }))
                })
                .catch(function (err) {
                    console.log(err, "ini err")
                });
        } else {
            let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                delivery_note: req.body.panel_tracker_delivery_note,
                police_no: req.body.panel_tracker_police_no,
                driver: req.body.panel_tracker_driver,
                total_colly: req.body.panel_tracker_total_colly,
                id_user: req.user.id,
                otp: otp,
                id_ship_code: tracker.insertId,
                status: status_ship_code,
                warehouse: JSON.parse(req.body.warehouse).id,
                address: req.body.panel_tracker_address,
                id_receiver: req.body.panel_tracker_receiver
            })
            let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                status: status_ship_code,
                id_user: req.user.id,
                id_ship_code: tracker.insertId,
                id_delivery_note_in: delivery_note.insertId
            })
            try {
                var [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)
            } catch {
                console.log(error, "ini error")
                logger.error(error + "")
                return
            }
            if (req.user.role !== "admin_cikarang") {
                axios({
                        method: 'post',
                        url: configuration["APP_EMAIL_URL"],
                        auth: {
                            username: configuration["APP_EMAIL_USERNAME"],
                            password: configuration["APP_EMAIL_PASSWORD"]
                        },
                        data: {
                            to: [result.email],
                            subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                            message: `<!DOCTYPE html>
                        <style>
                        @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                        </style>
                            <body style='font-family:'OpenSans';'>
                            <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                            <div style='text-align:center;'>
                                <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                                <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                            </div>
                            <br>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code} , dengan Surat Jalan sebagai berikut :</p>
                                <div style=' text-align:center;'>
                                    <h2> <span style="color : #D91921">&bull;</span>  ${req.body.panel_tracker_delivery_note} </h2>
                                </div>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <br>
                            <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                <p> Jakarta, ${new Date().getFullYear()} </p>
                                <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                            </div>
                            </body>
                        </html>`
                        }
                    })
                    .then(function (response) {
                        console.log(response, "ini response<<<---");

                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    })
                axios({
                        method: 'post',
                        url: configuration["URL_TELEGRAM"],
                        auth: {
                            username: configuration["USERNAME_TELEGRAM"],
                            password: configuration["PASSWORD_TELEGRAM"]
                        },
                        data: {
                            app_name: configuration["APP_NAME_TELEGRAM"],
                            title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                            text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                        }
                    })
                    .then(function (response) {
                        console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                        logger.access_response("panel", req, res, true)
                        return res.status(200).send(JSON.stringify({
                            status: "SUCCESS",
                            id_ship_code: tracker.insertId,
                            message: "Data have been added"
                        }))
                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    });
            } else {
                if (tracker && delivery_note) {
                    axios({
                            method: 'post',
                            url: configuration["URL_TELEGRAM"],
                            auth: {
                                username: configuration["USERNAME_TELEGRAM"],
                                password: configuration["PASSWORD_TELEGRAM"]
                            },
                            data: {
                                app_name: configuration["APP_NAME_TELEGRAM"],
                                title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                                text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                            }
                        })
                        .then(function (response) {
                            console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                            logger.access_response("panel", req, res, true)
                            return res.status(200).send(JSON.stringify({
                                status: "SUCCESS",
                                id_ship_code: tracker.insertId,
                                message: "Data have been added"
                            }))
                        })
                        .catch(function (err) {
                            console.log(err, "ini err")
                        });
                }
            }
        }
    } catch {
        logger.error(error + "")
        return res.status(200).send(JSON.stringify({
            status: "FAILED",
            message: "Something wrong with your insert data"
        }))
    }
})

router.post('/add-dni', async function (req, res) {
    console.log(req.user, "ini req user")
    console.log(req.body)
    res.setHeader('Content-Type', 'application/json')
    let pattern = /^[0-9.]*$/

    if (!req.body.panel_tracker_id || !req.body.panel_tracker_ship_code || !req.body.panel_tracker_weight || !req.body.warehouse || !req.body.supplier_option || !req.body.panel_tracker_receiver || !req.body.panel_tracker_delivery_note) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Ship Code, Weight, Receiver, Warehouse, Supplier and Delivery Note can't be empty!"
        });
    }
    if (!pattern.test(req.body.panel_tracker_weight)) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Weight must be a number or dot!"
        })
    }

    if (req.body.panel_tracker_delivery_note) {
        if (Array.isArray(req.body.panel_tracker_delivery_note)) {
            let clean_dni = req.body.panel_tracker_delivery_note.map(el => el.trim())
            let dni = clean_dni.includes('')
            if (dni) {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: "Delivery note can't be empty!"
                })
            }
        } else if (req.body.panel_tracker_delivery_note.trim() === '') {
            return res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Delivery note can't be empty!"
            })
        }
    }
    let [check, err_check] = await model_panel_tracker.getByShipCode(req.body.panel_tracker_ship_code)
    // if (check && check.length > 0) {
    //     return res.status(200).json({
    //         status: "FAILED",
    //         error_code: 1,
    //         message: "Ship Code Already Exist!"
    //     });
    // }
    try {
        let status_ship_code = "arriving"
        let flag_cikarang = false

        if (req.user.role === "admin_cikarang") {
            status_ship_code = "transit"
            flag_cikarang = true
        }

        console.log("ini isi req.body: ", req.body)
        console.log(req.user, "ini req user id")
        // let [tracker, err_tracker] = await model_panel_tracker.insertShipcode({
        //     ship_code: req.body.panel_tracker_ship_code,
        //     weight: req.body.panel_tracker_weight,
        //     jenis: req.body.panel_tracker_jenis,
        //     supplier: req.body.supplier_option,
        //     status: status_ship_code,
        //     is_cikarang: flag_cikarang,
        //     id_user: req.user.id
        // })

        // let [ship_code_log, err_ship_code_log] = await model_panel_tracker.insertShipcodeLog({
        //     id_ship_code: tracker.insertId,
        //     prior_status: "none",
        //     current_status: status_ship_code,
        // })

        console.log(req.body.panel_tracker_delivery_note.length)
        let otp = 0
        if (req.user.role !== "admin_cikarang") {
            otp = await passwordGenerator.generate(6)
        }
        let arr_delivery_note = []

        if (Array.isArray(req.body.panel_tracker_delivery_note)) {
            for (let i in req.body.panel_tracker_delivery_note) {
                console.log("masuk delivery note multiple")
                arr_delivery_note.push(req.body.panel_tracker_delivery_note[i])
                let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                    delivery_note: req.body.panel_tracker_delivery_note[i],
                    police_no: req.body.panel_tracker_police_no[i],
                    driver: req.body.panel_tracker_driver[i],
                    total_colly: req.body.panel_tracker_total_colly[i],
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id,
                    otp: otp,
                    status: status_ship_code,
                    warehouse: JSON.parse(req.body.warehouse).id,
                    address: req.body.panel_tracker_address,
                    id_receiver: req.body.panel_tracker_receiver
                })
                let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                    status: status_ship_code,
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id,
                    id_delivery_note_in: delivery_note.insertId
                })
            }
            try {
                var [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)
            } catch {
                console.log(error, "ini error")
                logger.error(error + "")
                return
            }
            if (req.user.role !== "admin_cikarang") {
                axios({
                        method: 'post',
                        url: configuration["APP_EMAIL_URL"],
                        auth: {
                            username: configuration["APP_EMAIL_USERNAME"],
                            password: configuration["APP_EMAIL_PASSWORD"]
                        },
                        data: {
                            to: [result.email],
                            subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                            message: `<!DOCTYPE html>
                        <style>
                        @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                        </style>
                        <body style='font-family:'OpenSans';'>
                        <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                        <div style='text-align:center;'>
                            <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                            <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                        </div>
                        <br>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code} , dengan Surat Jalan sebagai berikut :</p>
                            <div style=' text-align:center;'>
                              <h2>   <span style="color : #D91921">&bull;</span>  ${arr_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')} </h2>
                            </div>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <br>
                        <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                            <p> Jakarta, ${new Date().getFullYear()} </p>
                            <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                            <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                        </div>
                        </body>
                    </html>`
                        }
                    })
                    .then(function (response) {
                        console.log(response, "ini response<<<---");

                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    })

            } else {
                axios({
                        method: 'post',
                        url: configuration["URL_TELEGRAM"],
                        auth: {
                            username: configuration["USERNAME_TELEGRAM"],
                            password: configuration["PASSWORD_TELEGRAM"]
                        },
                        data: {
                            app_name: configuration["APP_NAME_TELEGRAM"],
                            title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                            text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                        }
                    })
                    .then(function (response) {
                        console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                        logger.access_response("panel", req, res, true)
                        return res.status(200).send(JSON.stringify({
                            status: "SUCCESS",
                            id_ship_code: req.body.panel_tracker_id,
                            message: "Data have been added"
                        }))
                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    })

            }
            axios({
                    method: 'post',
                    url: configuration["URL_TELEGRAM"],
                    auth: {
                        username: configuration["USERNAME_TELEGRAM"],
                        password: configuration["PASSWORD_TELEGRAM"]
                    },
                    data: {
                        app_name: configuration["APP_NAME_TELEGRAM"],
                        title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                        text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                    }
                })
                .then(function (response) {
                    console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        id_ship_code: req.body.panel_tracker_id,
                        message: "Data have been added"
                    }))
                })
                .catch(function (err) {
                    console.log(err, "ini err")
                });
        } else {
            let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                delivery_note: req.body.panel_tracker_delivery_note,
                police_no: req.body.panel_tracker_police_no,
                driver: req.body.panel_tracker_driver,
                total_colly: req.body.panel_tracker_total_colly,
                id_user: req.user.id,
                otp: otp,
                id_ship_code: req.body.panel_tracker_id,
                status: status_ship_code,
                warehouse: JSON.parse(req.body.warehouse).id,
                address: req.body.panel_tracker_address,
                id_receiver: req.body.panel_tracker_receiver
            })
            let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                status: status_ship_code,
                id_user: req.user.id,
                id_ship_code: req.body.panel_tracker_id,
                id_delivery_note_in: delivery_note.insertId
            })
            try {
                var [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)
            } catch {
                console.log(error, "ini error")
                logger.error(error + "")
                return
            }
            if (req.user.role !== "admin_cikarang") {
                axios({
                        method: 'post',
                        url: configuration["APP_EMAIL_URL"],
                        auth: {
                            username: configuration["APP_EMAIL_USERNAME"],
                            password: configuration["APP_EMAIL_PASSWORD"]
                        },
                        data: {
                            to: [result.email],
                            subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                            message: `<!DOCTYPE html>
                        <style>
                        @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                        </style>
                        <body style='font-family:'OpenSans';'>
                        <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                        <div style='text-align:center;'>
                            <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                            <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                        </div>
                        <br>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code} , dengan Surat Jalan sebagai berikut :</p>
                            <div style=' text-align:center;'>
                              <h2>   <span style="color : #D91921">&bull;</span>  ${req.body.panel_tracker_delivery_note} </h2>
                            </div>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <br>
                        <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                            <p> Jakarta, ${new Date().getFullYear()} </p>
                            <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                            <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                        </div>
                        </body>
                    </html>`
                        }
                    })
                    .then(function (response) {
                        console.log(response, "ini response<<<---");

                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    })
                axios({
                        method: 'post',
                        url: configuration["URL_TELEGRAM"],
                        auth: {
                            username: configuration["USERNAME_TELEGRAM"],
                            password: configuration["PASSWORD_TELEGRAM"]
                        },
                        data: {
                            app_name: configuration["APP_NAME_TELEGRAM"],
                            title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                            text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                        }
                    })
                    .then(function (response) {
                        console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                        logger.access_response("panel", req, res, true)
                        return res.status(200).send(JSON.stringify({
                            status: "SUCCESS",
                            id_ship_code: req.body.panel_tracker_id,
                            message: "Data have been added"
                        }))
                    })
                    .catch(function (err) {
                        console.log(err, "ini err")
                    });
            } else {
                if (tracker && delivery_note) {
                    axios({
                            method: 'post',
                            url: configuration["URL_TELEGRAM"],
                            auth: {
                                username: configuration["USERNAME_TELEGRAM"],
                                password: configuration["PASSWORD_TELEGRAM"]
                            },
                            data: {
                                app_name: configuration["APP_NAME_TELEGRAM"],
                                title: `[${status_ship_code}] ${req.body.panel_tracker_ship_code}`,
                                text: `Status ${req.body.panel_tracker_ship_code} is updated to ${status_ship_code} by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                            }
                        })
                        .then(function (response) {
                            console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                            logger.access_response("panel", req, res, true)
                            return res.status(200).send(JSON.stringify({
                                status: "SUCCESS",
                                id_ship_code: req.body.panel_tracker_id,
                                message: "Data have been added"
                            }))
                        })
                        .catch(function (err) {
                            console.log(err, "ini err")
                        });
                }
            }
        }
    } catch (error) {
        logger.error(error + "")
        console.log(error)
        return res.status(200).send(JSON.stringify({
            status: "FAILED",
            message: "Something wrong with your insert data"
        }))
    }
})

router.post('/update-dno', async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    console.log(req.user, "ini req user")
    console.log(req.body, "ini req body ")
    if (!req.body.panel_tracker_id_ship_code_keluar) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Ship code can't be empty"
        });
    }
    if (req.body.panel_tracker_receiver_keluar === '-1') {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Receiver can't be empty!"
        });
    }

    try {
        console.log("ini isi req.body: ", req.body)
        let filtered_tracker_delivery_note_keluar = Object.keys(req.body).map(body => body.replace(/[^\d]/g, ''))
        let index = filtered_tracker_delivery_note_keluar.filter((item, index) => {
            return (filtered_tracker_delivery_note_keluar.indexOf(item) === index && item !== '')
        })
        console.log(index, "INI FILTER TRACKER DELIVERY NOTE KELUAR")


        for (let n = 0; n < index.length; n += 1) {
            if (req.body[`panel_tracker_delivery_note_keluar_${index[n]}`].trim() === '') {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: "delivery note can't be empty"
                })
            }
        }

        for (let l = 0; l < index.length; l += 1) {
            if (Array.isArray(req.body[`panel_item_keluar_${index[l]}`])) {
                let clean_dni = req.body[`panel_item_keluar_${index[l]}`].map(el => el.trim())
                let dni = clean_dni.includes('')
                if (dni) {
                    return res.status(200).json({
                        status: "FAILED",
                        error_code: 1,
                        message: "Delivery note item can't be empty!"
                    })
                }
            } else {
                if (req.body[`panel_item_keluar_${index[l]}`].trim() === '') {
                    return res.status(200).json({
                        status: "FAILED",
                        error_code: 1,
                        message: "Delivery note item can't be empty!"
                    })
                }
            }
        }

        try {
            let [check, err] = await model_panel_tracker.getShipCodeById(req.body.panel_tracker_id_ship_code_keluar)
            console.log(check, 'ini check')
            if (!check && check.length <= 0) {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: "Ship Code isn't Exist!"
                });
            }
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return
        }
        let arr_delivery_note = []

        let [check_delivery_note, err_check_delivery_note] = await model_panel_tracker.get_all_dno_by_id(req.body.panel_tracker_id_ship_code_keluar)
        let finalArray = check_delivery_note.map(function (obj) {
            return obj.id;
        });
        console.log(finalArray);
        let [otp, err_otp] = await model_panel_tracker.get_otp_out(req.body[`panel_tracker_delivery_note_id_keluar_${index[0]}`])
        // while (req.body[`panel_tracker_delivery_note_keluar_${index[i]}`]) {
        for (let i = 0; i < index.length; i += 1) {
            arr_delivery_note.push(req.body[`panel_tracker_delivery_note_keluar_${index[i]}`])

            // console.log(Number(req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`]))
            //             console.log(req.body[`panel_tracker_delivery_note_keluar_${index[i]}`], "delivery note while")
            //             console.log(i, "ini i di atas")
            // console.log(finalArray.includes(Number(req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`])))
            // if (finalArray.includes(Number(req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`]))) {
            if (req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`] !== '') {
                let [update_dno, err_update_dno] = await model_panel_tracker.updateDeliveryNoteOut({
                    delivery_note: req.body[`panel_tracker_delivery_note_keluar_${index[i]}`],
                    police_no: req.body[`panel_tracker_police_no_keluar_${index[i]}`],
                    driver: req.body[`panel_tracker_driver_keluar_${index[i]}`],
                    total_colly: req.body[`panel_tracker_total_colly_keluar_${index[i]}`],
                    date: req.body[`panel_date_start_keluar_${index[i]}`],
                    warehouse: req.body.panel_tracker_warehouse_keluar,
                    address: req.body.panel_tracker_address_keluar,
                    note: req.body[`panel_tracker_note_keluar_${index[i]}`],
                    id_receiver: req.body.panel_tracker_receiver_keluar,
                    id: req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`]
                })

                let [check_delivery_note_item, err_check_delivery_note_item] = await model_panel_tracker.get_all_dnoi_by_id(req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`])
                let dniArray = check_delivery_note_item.map(function (obj) {
                    return obj.id;
                });

                if (Array.isArray(req.body[`panel_item_keluar_${index[i]}`])) {
                    for (let j in req.body[`panel_item_keluar_${index[i]}`]) {
                        // if (dniArray.includes(Number(req.body[`panel_item_keluar_id_${index[i]}`][j]))) {
                        if (req.body[`panel_item_keluar_id_${index[i]}`][j] !== '') {
                            let [update_item_delivery_note, err_item_delivery_note] = await model_panel_tracker.updateDeliveryNoteItemOut({
                                item: req.body[`panel_item_keluar_${index[i]}`][j],
                                quantity: req.body[`panel_item_quantity_${index[i]}`][j],
                                satuan: req.body[`panel_item_satuan_${index[i]}`][j],
                                keterangan: req.body[`panel_item_keterangan_${index[i]}`][j],
                                id: req.body[`panel_item_keluar_id_${index[i]}`][j]
                            })
                        } else {
                            let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.insertDeliveryNoteItemOut({
                                item: req.body[`panel_item_keluar_${index[i]}`][j],
                                quantity: req.body[`panel_item_quantity_${index[i]}`][j],
                                satuan: req.body[`panel_item_satuan_${index[i]}`][j],
                                keterangan: req.body[`panel_item_keterangan_${index[i]}`][j],
                                id_delivery_note_out: req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`]
                            })
                            console.log(item_delivery_note)
                            let [item_delivery_note_conjunction, err_item_delivery_note_conjunction] = await model_panel_tracker.insertDeliveryNoteItemOutConjunction({
                                id_delivery_note_out: req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`],
                                id_delivery_note_out_item: item_delivery_note.insertId,
                            })
                        }
                    }
                } else {
                    if (req.body[`panel_item_keluar_id_${index[i]}`] !== '') {
                        let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.updateDeliveryNoteItemOut({
                            item: req.body[`panel_item_keluar_${index[i]}`],
                            quantity: req.body[`panel_item_quantity_${index[i]}`],
                            satuan: req.body[`panel_item_satuan_${index[i]}`],
                            keterangan: req.body[`panel_item_keterangan_${index[i]}`],
                            id: req.body[`panel_item_keluar_id_${index[i]}`]
                        })
                    } else {
                        let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.insertDeliveryNoteItemOut({
                            item: req.body[`panel_item_keluar_${index[i]}`],
                            quantity: req.body[`panel_item_quantity_${index[i]}`],
                            satuan: req.body[`panel_item_satuan_${index[i]}`],
                            keterangan: req.body[`panel_item_keterangan_${index[i]}`],
                            id_delivery_note_out: req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`],
                        })
                        let [item_delivery_note_conjunction, err_item_delivery_note_conjunction] = await model_panel_tracker.insertDeliveryNoteItemOutConjunction({
                            id_delivery_note_out: req.body[`panel_tracker_delivery_note_id_keluar_${index[i]}`],
                            id_delivery_note_out_item: item_delivery_note.insertId,
                        })
                    }
                }
            } else {

                let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteOut({
                    delivery_note: req.body[`panel_tracker_delivery_note_keluar_${index[i]}`],
                    police_no: req.body[`panel_tracker_police_no_keluar_${index[i]}`],
                    driver: req.body[`panel_tracker_driver_keluar_${index[i]}`],
                    total_colly: req.body[`panel_tracker_total_colly_keluar_${index[i]}`],
                    otp: otp,
                    date: req.body[`panel_date_start_keluar_${index[i]}`],
                    status: "ready_to_ship",
                    warehouse: req.body.panel_tracker_warehouse_keluar,
                    address: req.body.panel_tracker_address_keluar,
                    note: req.body[`panel_tracker_note_keluar_${index[i]}`],
                    id_receiver: req.body.panel_tracker_receiver_keluar,
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id_ship_code_keluar
                })

                let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteOutLog({
                    status: 'ready_to_ship',
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id_ship_code_keluar,
                    id_delivery_note_out: delivery_note.insertId
                })

                if (Array.isArray(req.body[`panel_item_keluar_${index[i]}`])) {
                    for (let j in req.body[`panel_item_keluar_${index[i]}`]) {
                        let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.insertDeliveryNoteItemOut({
                            item: req.body[`panel_item_keluar_${index[i]}`][j],
                            quantity: req.body[`panel_item_quantity_${index[i]}`][j],
                            satuan: req.body[`panel_item_satuan_${index[i]}`][j],
                            keterangan: req.body[`panel_item_keterangan_${index[i]}`][j],
                            id_delivery_note_out: delivery_note.insertId
                        })
                        console.log(item_delivery_note)
                        console.log(delivery_note)
                        let [item_delivery_note_conjunction, err_item_delivery_note_conjunction] = await model_panel_tracker.insertDeliveryNoteItemOutConjunction({
                            id_delivery_note_out: delivery_note.insertId,
                            id_delivery_note_out_item: item_delivery_note.insertId,
                        })
                    }
                } else {
                    let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.insertDeliveryNoteItemOut({
                        item: req.body[`panel_item_keluar_${index[i]}`],
                        quantity: req.body[`panel_item_quantity_${index[i]}`],
                        satuan: req.body[`panel_item_satuan_${index[i]}`],
                        keterangan: req.body[`panel_item_keterangan_${index[i]}`],
                        id_delivery_note_out: delivery_note.insertId,
                    })
                    let [item_delivery_note_conjunction, err_item_delivery_note_conjunction] = await model_panel_tracker.insertDeliveryNoteItemOutConjunction({
                        id_delivery_note_out: delivery_note.insertId,
                        id_delivery_note_out_item: item_delivery_note.insertId,
                    })
                }
            }
            console.log(i, "ini i di bawah")
        }
        try {
            let [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver_keluar)

            axios({
                    method: 'post',
                    url: configuration["APP_EMAIL_URL"],
                    auth: {
                        username: configuration["APP_EMAIL_USERNAME"],
                        password: configuration["APP_EMAIL_PASSWORD"]
                    },
                    data: {
                        to: [result.email],
                        subject: `Your OTP for Ship Code ${req.body.panel_tracker_ship_code_keluar} and Delivery Note ${arr_delivery_note.join(', ')}`,
                        message: `<!DOCTYPE html>
                        <style>
                        @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                        </style>
                        <body style='font-family:'OpenSans';'>
                        <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                        <div style='text-align:center;'>
                            <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code_keluar} sebagai berikut : </h3>
                            <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                        </div>
                        <br>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code_keluar} , dengan Surat Jalan sebagai berikut :</p>
                            <div style=' text-align:center;'>
                             <h2>   <span style="color : #D91921">&bull;</span>  ${arr_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')} </h2>
                            </div>
                        <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                        <br>
                        <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                            <p> Jakarta, ${new Date().getFullYear()} </p>
                            <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                            <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                        </div>
                        </body>
                    </html>`
                    }
                })
                .then(function (response) {
                    console.log(response, "ini response<<<---");
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        message: "Data have been added"
                    }))
                })
                .catch(function (err) {
                    console.log(err, "ini err")
                })
        } catch {
            console.log(error, "ini error")
            logger.error(error + "")
            return
        }
    } catch (e) {
        logger.error(error + "")
        console.log(e, "ini error")
        return res.status(200).send(JSON.stringify({
            status: "FAILED",
            message: "Something wrong with your insert data"
        }))
    }
})

router.post('/add-keluar', async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    console.log(req.user, "ini req user")
    console.log(req.body, "ini req body")
    if (!req.body.panel_tracker_id_ship_code_keluar) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Ship code can't be empty"
        });
    }
    if (!req.body.panel_tracker_receiver_keluar) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Receiver can't be empty!"
        });
    }

    try {
        console.log("ini isi req.body: ", req.body)
        let filtered_tracker_delivery_note_keluar = Object.keys(req.body).map(body => body.replace(/[^\d]/g, ''))
        let index = filtered_tracker_delivery_note_keluar.filter((item, index) => {
            return (filtered_tracker_delivery_note_keluar.indexOf(item) === index && item !== '')
        })
        console.log(index)
        if (index.length <= 0) {
            return res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Delivery note and item at least have one!"
            });
        }
        let warehouse_code = JSON.parse(req.body.warehouse_option).warehouse_code
        for (let n = 0; n < index.length; n += 1) {
            console.log(req.body[`panel_tracker_delivery_note_keluar_${index[n]}`], "ini trim")
            if (req.body[`panel_tracker_delivery_note_keluar_${index[n]}`].trim() === '') {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: `delivery note Row ${n + 1} can't be empty`
                })
            } else if (req.body[`panel_tracker_delivery_note_keluar_${index[n]}`][1].toUpperCase() !== warehouse_code) {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: `Delivery Note Code Row ${n + 1} must match with Warehouse Code ${warehouse_code}`
                })
            }
        }

        for (let l = 0; l < index.length; l += 1) {
            if (Array.isArray(req.body[`panel_item_keluar_${index[l]}`])) {
                let clean_dni = req.body[`panel_item_keluar_${index[l]}`].map(el => el.trim())
                let dni = clean_dni.includes('')
                if (dni) {
                    return res.status(200).json({
                        status: "FAILED",
                        error_code: 1,
                        message: "Delivery note item can't be empty!"
                    })
                }
            } else {
                if (req.body[`panel_item_keluar_${index[l]}`].trim() === '') {
                    return res.status(200).json({
                        status: "FAILED",
                        error_code: 1,
                        message: "Delivery note item can't be empty!"
                    })
                }
            }
        }

        console.log(index, "INI FILTER TRACKER DELIVERY NOTE KELUAR")
        console.log(req.user, "ini req user id")
        let [tracker, err_tracker] = await model_panel_tracker.updateTracker({
            status: "ready_to_ship",
            id_user: req.user.id,
            id: req.body.panel_tracker_id_ship_code_keluar
        })
        let [tracker_log, err_tracker_log] = await model_panel_tracker.insertShipcodeLog({
            id_ship_code: req.body.panel_tracker_id_ship_code_keluar,
            prior_status: 'transit',
            current_status: 'ready_to_ship',
        })
        console.log(tracker, "ini tracker")
        let otp = await passwordGenerator.generate(6)
        let arr_delivery_note = []

        let i = 0
        console.log(req.body[`panel_tracker_delivery_note_keluar_${index[i]}`])
        while (req.body[`panel_tracker_delivery_note_keluar_${index[i]}`]) {
            let date = req.body[`panel_date_start_keluar_${index[i]}`].split('-').reverse().join('-')
            console.log(req.body[`panel_tracker_delivery_note_keluar_${index[i]}`], "delivery note while")
            console.log(i, "ini i di atas")
            arr_delivery_note.push(req.body[`panel_tracker_delivery_note_keluar_${index[i]}`])
            let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteOut({
                delivery_note: req.body[`panel_tracker_delivery_note_keluar_${index[i]}`].toUpperCase(),
                police_no: req.body[`panel_tracker_police_no_keluar_${index[i]}`],
                driver: req.body[`panel_tracker_driver_keluar_${index[i]}`],
                total_colly: req.body[`panel_tracker_total_colly_keluar_${index[i]}`],
                otp: otp,
                date,
                status: "ready_to_ship",
                warehouse: JSON.parse(req.body.warehouse_option).id,
                address: req.body.panel_tracker_address_keluar,
                note: req.body[`panel_tracker_note_keluar_${index[i]}`],
                id_receiver: req.body.panel_tracker_receiver_keluar,
                id_user: req.user.id,
                id_ship_code: req.body.panel_tracker_id_ship_code_keluar
            })
            let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteOutLog({
                status: 'ready_to_ship',
                id_user: req.user.id,
                id_ship_code: req.body.panel_tracker_id_ship_code_keluar,
                id_delivery_note_out: delivery_note.insertId
            })
            if (Array.isArray(req.body[`panel_item_keluar_${index[i]}`])) {
                for (let j in req.body[`panel_item_keluar_${index[i]}`]) {
                    let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.insertDeliveryNoteItemOut({
                        item: req.body[`panel_item_keluar_${index[i]}`][j],
                        quantity: req.body[`panel_item_quantity_${index[i]}`][j],
                        satuan: req.body[`panel_item_satuan_${index[i]}`][j],
                        keterangan: req.body[`panel_item_keterangan_${index[i]}`][j],
                        id_delivery_note_out: delivery_note.insertId
                    })
                    console.log(item_delivery_note)
                    console.log(delivery_note)
                    let [item_delivery_note_conjunction, err_item_delivery_note_conjunction] = await model_panel_tracker.insertDeliveryNoteItemOutConjunction({
                        id_delivery_note_out: delivery_note.insertId,
                        id_delivery_note_out_item: item_delivery_note.insertId,
                    })
                }
            } else {
                let [item_delivery_note, err_item_delivery_note] = await model_panel_tracker.insertDeliveryNoteItemOut({
                    item: req.body[`panel_item_keluar_${index[i]}`],
                    quantity: req.body[`panel_item_quantity_${index[i]}`],
                    satuan: req.body[`panel_item_satuan_${index[i]}`],
                    keterangan: req.body[`panel_item_keterangan_${index[i]}`],
                    id_delivery_note_out: delivery_note.insertId,
                })
                let [item_delivery_note_conjunction, err_item_delivery_note_conjunction] = await model_panel_tracker.insertDeliveryNoteItemOutConjunction({
                    id_delivery_note_out: delivery_note.insertId,
                    id_delivery_note_out_item: item_delivery_note.insertId,
                })
            }
            i += 1
            console.log(i, "ini i di bawah")
        }
        try {
            let [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver_keluar)

            axios({
                    method: 'post',
                    url: configuration["APP_EMAIL_URL"],
                    auth: {
                        username: configuration["APP_EMAIL_USERNAME"],
                        password: configuration["APP_EMAIL_PASSWORD"]
                    },
                    data: {
                        to: [result.email],
                        subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code_keluar}`,
                        message: `<!DOCTYPE html>
                    <style>
                    @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                    </style>
                    <body style='font-family:'OpenSans';'>
                    <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                    <div style='text-align:center;'>
                        <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code_keluar} sebagai berikut : </h3>
                        <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                    </div>
                    <br>
                    <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                    <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code_keluar} , dengan Surat Jalan sebagai berikut :</p>
                        <div style=' text-align:center;'>
                          <h2>   <span style="color : #D91921">&bull;</span>  ${arr_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')} </h2>
                        </div>
                    <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                    <br>
                    <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                        <p> Jakarta, ${new Date().getFullYear()} </p>
                        <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                        <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                    </div>
                    </body>
                </html>`
                    }
                })
                .then(function (response) {
                    console.log(response, "ini response<<<---");

                })
                .catch(function (err) {
                    console.log(err, "ini err")
                })
            axios({
                    method: 'post',
                    url: configuration["URL_TELEGRAM"],
                    auth: {
                        username: configuration["USERNAME_TELEGRAM"],
                        password: configuration["PASSWORD_TELEGRAM"]
                    },
                    data: {
                        app_name: configuration["APP_NAME_TELEGRAM"],
                        title: `[Ready to Ship] ${req.body.panel_tracker_ship_code_keluar}`,
                        text: `Status ${req.body.panel_tracker_ship_code_keluar} is updated to ready to ship by ${req.user.username} at ` + new Date(Date.now()).toLocaleString()
                    }
                })
                .then(function (response) {
                    console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        id_ship_code: tracker.insertId,
                        message: "Data have been added"
                    }))
                })
                .catch(function (err) {
                    console.log(err, "ini err")
                });
        } catch (error) {
            console.log(error, "ini error")
            logger.error(error + "")
            return
        }
    } catch (e) {
        logger.error(e + "")
        console.log(e, "ini error")
        return res.status(200).send(JSON.stringify({
            status: "FAILED",
            message: "Something wrong with your insert data"
        }))
    }
})

router.post('/get_nik_data', async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
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
        if (resp.error == 1) {
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

router.post('/get-check-tab-all', async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    try {
        let data = {}
        let [arriving, err_arriving] = await model_panel_tracker.get_detail_tab_all_in(req.body.id_shipcode, 'arriving')
        console.log(arriving, "ini arriving")
        if (arriving.length > 0) {
            data.arriving = arriving[0]['count(id)']
        } else {
            data.arriving = 0
        }
        let [transit, err_transit] = await model_panel_tracker.get_detail_tab_all_in(req.body.id_shipcode, 'transit')
        console.log(transit, "ini transit")
        if (transit.length > 0) {
            data.transit = transit[0]['count(id)']
        } else {
            data.transit = 0
        }
        let [ready_to_ship, err_ready_to_ship] = await model_panel_tracker.get_detail_tab_all_out(req.body.id_shipcode, 'ready_to_ship')
        console.log(ready_to_ship, "ini ready to ship")
        if (ready_to_ship.length > 0) {
            data.ready_to_ship = ready_to_ship[0]['count(id)']
        } else {
            data.ready_to_ship = 0
        }
        let [ship, err_ship] = await model_panel_tracker.get_detail_tab_all_out(req.body.id_shipcode, 'ship')
        console.log(ship, "ini ship")
        if (ship.length > 0) {
            data.ship = ship[0]['count(id)']
        } else {
            data.ship = 0
        }
        let [delivered, err_delivered] = await model_panel_tracker.get_detail_tab_all_out(req.body.id_shipcode, 'delivered')
        console.log(delivered, "ini delivered")
        if (delivered.length > 0) {
            data.delivered = delivered[0]['count(id)']
        } else {
            data.delivered = 0
        }

        console.log(data, "ini data")

        return res.status(200).send(JSON.stringify({
            status: "SUCCESS",
            data
        }))

    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }
})

router.post('/update', async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    if (!req.body.panel_ship_code_id_update || !req.body.panel_ship_code_update) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Ship code can't be empty!"
        });
    }

    let [ship_code_status, err_ship_code_status] = await model_panel_tracker.getShipCodeStatus(req.body.panel_ship_code_id_update)
    console.log(ship_code_status, "ini ship code status")
    if (ship_code_status.length > 0) {
        let [ret, err] = await model_panel_tracker.update({
            status: req.body.panel_status_tracker,
            updated_by: req.user.id,
            id: req.body.panel_ship_code_id_update
        })

        let [ship_code_log, err_ship_code_log] = await model_panel_tracker.insertShipcodeLog2({
            id_ship_code: req.body.panel_ship_code_id_update,
            prior_status: ship_code_status[0].status,
            current_status: req.body.panel_status_tracker,
            is_backlog: 1
        })

        if (ret) {
            axios({
                    method: 'post',
                    url: configuration["URL_TELEGRAM"],
                    auth: {
                        username: configuration["USERNAME_TELEGRAM"],
                        password: configuration["PASSWORD_TELEGRAM"]
                    },
                    data: {
                        app_name: configuration["APP_NAME_TELEGRAM"],
                        title: `Status Ship Code ${req.body.panel_ship_code_update}`,
                        text: `[SPECIAL UPDATE] Status ${req.body.panel_ship_code_update} is updated to ${req.body.panel_status_tracker} by ${req.user.username} as Manager at ` + new Date(Date.now()).toLocaleString()
                    }
                })
                .then(function (response) {
                    console.log(response.data, "ini response<<<<<<<<<<<<<-------")
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        message: "Data have been updated"
                    }))
                })
                .catch(function (err) {
                    console.log(err, "ini err")
                })
        } else {
            logger.error(error + "")
            return res.status(200).send(JSON.stringify({
                status: "FAILED",
                message: "Something wrong with your insert data"
            }))
        }
    }
})

router.post('/update-dni', async function (req, res) {
    console.log(req.user, "ini req user")
    console.log(req.body, "ini req body")
    res.setHeader('Content-Type', 'application/json')
    if (req.user.role === 'admin_cikarang') {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Can't be updated by Admin Cikarang!"
        })
    }
    let pattern = /^[0-9.]*$/

    if (!req.body.panel_tracker_ship_code || !req.body.panel_tracker_weight || !req.body.panel_tracker_receiver === '-1') {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Ship Code, Weight, and Receiver can't be empty!"
        });
    }
    if (!pattern.test(req.body.panel_tracker_weight)) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Weight must be a number or point!"
        })
    }
    try {
        let [check, err] = await model_panel_tracker.getShipCodeById(req.body.panel_tracker_id)
        console.log(check, 'ini check')
        if (!check && check.length <= 0) {
            return res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Ship Code isn't Exist!"
            });
        }
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }
    try {
        console.log("ini isi req.body: ", req.body)
        console.log(req.user, "ini req user id")
        let [tracker, err_tracker] = await model_panel_tracker.updateShipcode({
            ship_code: req.body.panel_tracker_ship_code,
            weight: req.body.panel_tracker_weight,
            jenis: req.body.panel_tracker_jenis,
            id: req.body.panel_tracker_id
        })
        console.log(tracker, "ini tracker")

        // try {
        //     let [ship_code_log, err_ship_code_log] = await model_panel_tracker.insertShipcodeLog({
        //         id_ship_code: req.body.panel_tracker_id,
        //         prior_status: check[0].status,
        //         current_status: check[0].status
        //     })
        // } catch(error) {
        //     console.log(error, "ini error")
        //     logger.error(error + "")
        //     return
        // }
    } catch (error) {
        console.log(error, "ini error")
        logger.error(error + "")
        return
    }

    console.log(req.body.panel_tracker_delivery_note.length)
    let clean_dni = req.body.panel_tracker_delivery_note.map(el => el.trim())
    let dni = clean_dni.includes('')
    if (dni) {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Delivery note can't be empty!"
        })
    }

    if (req.body.panel_tracker_delivery_note) {
        if (Array.isArray(req.body.panel_tracker_delivery_note)) {
            if (Array.isArray(req.body.panel_tracker_delivery_note_id)) {
                let [otp, err_otp] = await model_panel_tracker.get_otp(req.body.panel_tracker_delivery_note_id[0])

                for (let i = 0; i < req.body.panel_tracker_delivery_note_id.length; i += 1) {
                    let [all_delivery_note_in, err_delivery_note_in] = await model_panel_tracker.get_all_dni_by_id(req.body.panel_tracker_delivery_note_id[i])
                    if (all_delivery_note_in) {
                        if (req.body.panel_tracker_delivery_note !== all_delivery_note_in.delivery_note || req.body.panel_tracker_police_no !== all_delivery_note_in.police_no || req.body.panel_tracker_driver !== all_delivery_note_in.driver || req.body.panel_tracker_total_colly !== all_delivery_note_in.total_colly) {
                            let [delivery_note, err_delivery_note] = await model_panel_tracker.updateDeliveryNoteIn({
                                delivery_note: req.body.panel_tracker_delivery_note[i],
                                police_no: req.body.panel_tracker_police_no[i],
                                driver: req.body.panel_tracker_driver[i],
                                total_colly: req.body.panel_tracker_total_colly[i],
                                warehouse: req.body.warehouse_option,
                                address: req.body.panel_tracker_address,
                                id_receiver: req.body.panel_tracker_receiver,
                                id: all_delivery_note_in.id
                            })

                            console.log(req.body.panel_tracker_delivery_note_id.length, "ini length di dni id")
                            console.log(req.body.panel_tracker_delivery_note.length, "ini length di dni dn")
                        }
                    }
                }

                if (req.body.panel_tracker_delivery_note_id.length < req.body.panel_tracker_delivery_note.length) {
                    console.log("masuk juga")
                    for (let i = req.body.panel_tracker_delivery_note_id.length; i < req.body.panel_tracker_delivery_note.length; i += 1) {
                        let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                            delivery_note: req.body.panel_tracker_delivery_note[i],
                            police_no: req.body.panel_tracker_police_no[i],
                            driver: req.body.panel_tracker_driver[i],
                            total_colly: req.body.panel_tracker_total_colly[i],
                            id_user: req.user.id,
                            id_ship_code: req.body.panel_tracker_id,
                            otp,
                            status: 'arriving',
                            warehouse: req.body.warehouse_option,
                            address: req.body.panel_tracker_address,
                            id_receiver: req.body.panel_tracker_receiver
                        })
                        let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                            status: 'arriving',
                            id_user: req.user.id,
                            id_ship_code: req.body.panel_tracker_id,
                            id_delivery_note_in: delivery_note.insertId
                        })
                    }

                }

                let [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)

                if (result) {
                    axios({
                            method: 'post',
                            url: configuration["APP_EMAIL_URL"],
                            auth: {
                                username: configuration["APP_EMAIL_USERNAME"],
                                password: configuration["APP_EMAIL_PASSWORD"]
                            },
                            data: {
                                to: [result.email],
                                subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                                message: `<!DOCTYPE html>
                            <style>
                            @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                            </style>
                            <body style='font-family:'OpenSans';'>
                            <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                            <div style='text-align:center;'>
                                <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                                <h1  style="font-weight: 600; font-size: 50px;">${otp.otp}</h1>
                            </div>
                            <br>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code} , dengan Surat Jalan sebagai berikut :</p>
                                <div style=' text-align:center;'>
                                  <h2>   <span style="color : #D91921">&bull;</span>  ${req.body.panel_tracker_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')} </h2>
                                </div>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <br>
                            <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                <p> Jakarta, ${new Date().getFullYear()} </p>
                                <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                            </div>
                            </body>
                        </html>`
                            }
                        })
                        .then(function (response) {
                            console.log(response, "ini response<<<---");


                        })
                        .catch(function (err) {
                            console.log(err, "ini err")
                        })
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        id_ship_code: req.body.panel_tracker_id,
                        message: "Data have been added"
                    }))
                }
            } else if (!Array.isArray(req.body.panel_tracker_delivery_note_id)) {
                let [otp, err_otp] = await model_panel_tracker.get_otp(req.body.panel_tracker_delivery_note_id)

                let [all_delivery_note_in, err_delivery_note_in] = await model_panel_tracker.get_all_dni_by_id(req.body.panel_tracker_delivery_note_id)
                if (all_delivery_note_in) {
                    if (req.body.panel_tracker_delivery_note !== all_delivery_note_in.delivery_note || req.body.panel_tracker_police_no !== all_delivery_note_in.police_no || req.body.panel_tracker_driver !== all_delivery_note_in.driver || req.body.panel_tracker_total_colly !== all_delivery_note_in.total_colly) {
                        let [delivery_note, err_delivery_note] = await model_panel_tracker.updateDeliveryNoteIn({
                            delivery_note: req.body.panel_tracker_delivery_note[0],
                            police_no: req.body.panel_tracker_police_no[0],
                            driver: req.body.panel_tracker_driver[0],
                            total_colly: req.body.panel_tracker_total_colly[0],
                            warehouse: req.body.warehouse_option,
                            address: req.body.panel_tracker_address,
                            id_receiver: req.body.panel_tracker_receiver,
                            id: all_delivery_note_in.id
                        })

                        console.log("masuk juga")
                        for (let i = 1; i < req.body.panel_tracker_delivery_note.length; i += 1) {
                            let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                                delivery_note: req.body.panel_tracker_delivery_note[i],
                                police_no: req.body.panel_tracker_police_no[i],
                                driver: req.body.panel_tracker_driver[i],
                                total_colly: req.body.panel_tracker_total_colly[i],
                                id_ship_code: req.body.panel_tracker_id,
                                id_user: req.user.id,
                                otp,
                                status: 'arriving',
                                warehouse: req.body.warehouse_option,
                                address: req.body.panel_tracker_address,
                                id_receiver: req.body.panel_tracker_receiver
                            })

                            let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                                status: 'arriving',
                                id_user: req.user.id,
                                id_ship_code: req.body.panel_tracker_id,
                                id_delivery_note_in: delivery_note.insertId
                            })

                        }
                        console.log(req.body.panel_tracker_delivery_note_id.length, "ini length di dni id")
                        console.log(req.body.panel_tracker_delivery_note.length, "ini length di dni dn")

                        let [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)

                        if (result) {
                            axios({
                                    method: 'post',
                                    url: configuration["APP_EMAIL_URL"],
                                    auth: {
                                        username: configuration["APP_EMAIL_USERNAME"],
                                        password: configuration["APP_EMAIL_PASSWORD"]
                                    },
                                    data: {
                                        to: [result.email],
                                        subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                                        message: `<!DOCTYPE html>
                                    <style>
                                    @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                                    </style>
                                    <body style='font-family:'OpenSans';'>
                                        <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                                        <div style='text-align:center;'>
                                            <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                                            <h1  style="font-weight: 600; font-size: 50px;">${otp.otp}</h1>
                                        </div>
                                        <br>
                                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                                        <br>
                                        <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code_keluar} , dengan Surat Jalan sebagai berikut :</p>
                                            <div style=' text-align:center;'>
                                              <h2> <span style="color : #D91921">&bull;</span>  ${req.body.panel_tracker_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>')} </h2>
                                            </div>
                                        <br>
                                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                                        <br>
                                        <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                            <p> Jakarta, ${new Date().getFullYear()} </p>
                                            <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                            <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                                        </div>
                                        </body>
                                    </html>`
                                    }
                                })
                                .then(function (response) {
                                    console.log(response, "ini response<<<---");


                                })
                                .catch(function (err) {
                                    console.log(err, "ini err")
                                })
                            logger.access_response("panel", req, res, true)
                            return res.status(200).send(JSON.stringify({
                                status: "SUCCESS",
                                id_ship_code: req.body.panel_tracker_id,
                                message: "Data have been added"
                            }))
                        }
                    }
                }
            }
        } else {
            let otp = await passwordGenerator.generate(6)

            for (let i = 0; i < req.body.panel_tracker_delivery_note.length; i += 1) {
                let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                    delivery_note: req.body.panel_tracker_delivery_note[i],
                    police_no: req.body.panel_tracker_police_no[i],
                    driver: req.body.panel_tracker_driver[i],
                    total_colly: req.body.panel_tracker_total_colly[i],
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id,
                    otp,
                    status: 'arriving',
                    warehouse: req.body.warehouse_option,
                    address: req.body.panel_tracker_address,
                    id_receiver: req.body.panel_tracker_receiver
                })
                let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                    status: 'arriving',
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id,
                    id_delivery_note_in: delivery_note.insertId
                })
                let [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)

                if (result) {
                    axios({
                            method: 'post',
                            url: configuration["APP_EMAIL_URL"],
                            auth: {
                                username: configuration["APP_EMAIL_USERNAME"],
                                password: configuration["APP_EMAIL_PASSWORD"]
                            },
                            data: {
                                to: [result.email],
                                subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                                message: `<!DOCTYPE html>
                            <style>
                            @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                            </style>
                            <body style='font-family:'OpenSans';'>
                            <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                            <div style='text-align:center;'>
                                <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                                <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                            </div>
                            <br>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code} , dengan Surat Jalan sebagai berikut :</p>
                                <div style=' text-align:center;'>
                                  <h2>   <span style="color : #D91921">&bull;</span>  ${req.body.panel_tracker_delivery_note.join(' <br> <span style="color : #D91921">&bull;</span>  ')} </h2>
                                </div>
                            <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                            <br>
                            <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                <p> Jakarta, ${new Date().getFullYear()} </p>
                                <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                            </div>
                            </body>
                        </html>`
                            }
                        })
                        .then(function (response) {
                            console.log(response, "ini response<<<---");


                        })
                        .catch(function (err) {
                            console.log(err, "ini err")
                        })
                    logger.access_response("panel", req, res, true)
                    return res.status(200).send(JSON.stringify({
                        status: "SUCCESS",
                        id_ship_code: req.body.panel_tracker_id,
                        message: "Data have been added"
                    }))
                }
            }
        }
    } else {
        if (req.body.panel_tracker_delivery_note_id) {
            // let [otp, err_otp] = await model_panel_tracker.get_otp(req.body.panel_tracker_delivery_note_id)
            let [all_delivery_note_in, err_delivery_note_in] = await model_panel_tracker.get_all_dni_by_id(req.body.panel_tracker_delivery_note_id)
            if (all_delivery_note_in) {

                let [delivery_note, err_delivery_note] = await model_panel_tracker.updateDeliveryNoteIn({
                    delivery_note: req.body.panel_tracker_delivery_note,
                    police_no: req.body.panel_tracker_police_no,
                    driver: req.body.panel_tracker_driver,
                    total_colly: req.body.panel_tracker_total_colly,
                    warehouse: req.body.warehouse_option,
                    address: req.body.panel_tracker_address,
                    id_receiver: req.body.panel_tracker_receiver,
                    id: all_delivery_note_in.id
                })
            } else {
                let otp = await passwordGenerator.generate(6)
                let [delivery_note, err_delivery_note] = await model_panel_tracker.insertDeliveryNoteIn({
                    delivery_note: req.body.panel_tracker_delivery_note,
                    police_no: req.body.panel_tracker_police_no,
                    driver: req.body.panel_tracker_driver,
                    total_colly: req.body.panel_tracker_total_colly,
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id,
                    otp,
                    status: 'arriving',
                    warehouse: req.body.warehouse_option,
                    address: req.body.panel_tracker_address,
                    id_receiver: req.body.panel_tracker_receiver
                })
                let [delivery_note_log, err_delivery_note_log] = await model_panel_tracker.insertDeliveryNoteInLog({
                    status: 'arriving',
                    id_user: req.user.id,
                    id_ship_code: req.body.panel_tracker_id,
                    id_delivery_note_in: delivery_note.insertId
                })
                let [result, err] = await model_panel_tracker.get_send_otp(req.body.panel_tracker_receiver)
                if (result) {
                    if (req.user.role !== "admin_cikarang") {
                        axios({
                                method: 'post',
                                url: configuration["APP_EMAIL_URL"],
                                auth: {
                                    username: configuration["APP_EMAIL_USERNAME"],
                                    password: configuration["APP_EMAIL_PASSWORD"]
                                },
                                data: {
                                    to: [result.email],
                                    subject: `Kode OTP untuk Barang Masuk dengan Ship Code ${req.body.panel_tracker_ship_code}`,
                                    message: `<!DOCTYPE html>
                                <style>
                                @import url('https://fonts.googleapis.com/css2?family=Open+Sans&display=swap');
                                </style>
                                <body style='font-family:'OpenSans';'>
                                <div> <img src='https://gudanginventory.onigiri.fira.id/image/logo-apps.png' alt='logo' style="width: 200px"> </div>
                                <div style='text-align:center;'>
                                    <h3 style='font-size: 15px; text-align: justify;'> Kode OTP untuk Barang Masuk dengan Ship Code  ${req.body.panel_tracker_ship_code} sebagai berikut : </h3>
                                    <h1  style="font-weight: 600; font-size: 50px;">${otp}</h1>
                                </div>
                                <br>
                                <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                                <p style='font-size: 13px; padding : 20px ; text-align: justify ;'> Berikut adalah informasi kedatangan barang  untuk Ship Code ${req.body.panel_tracker_ship_code} , dengan Surat Jalan sebagai berikut :</p>
                                    <div style=' text-align:center;'>
                                      <h2>   <span style="color : #D91921">&bull;</span>  ${req.body.panel_tracker_delivery_note} </h2>
                                    </div>
                                <hr style="border: 1px solid rgba(0, 0, 0, 0.15);">
                                <br>
                                <div style="text-align:center; letter-spacing: 0.05em; font-size: 12px;">
                                    <p> Jakarta, ${new Date().getFullYear()} </p>
                                    <p> &copy; PT Hartono Istana Teknologi (Polytron) </p>
                                    <img src='https://polytron.co.id/wp-content/uploads/2021/01/Logo-Polytron-New-1.png' alt='logo'>
                                </div>
                                </body>
                            </html>`
                                }
                            })
                            .then(function (response) {
                                console.log(response, "ini response<<<---");

                            })
                            .catch(function (err) {
                                console.log(err, "ini err")
                            })
                        logger.access_response("panel", req, res, true)
                        return res.status(200).send(JSON.stringify({
                            status: "SUCCESS",
                            id_ship_code: tracker.insertId,
                            message: "Data have been added"
                        }))
                    } else {
                        if (delivery_note) {
                            logger.access_response("panel", req, res, true)
                            return res.status(200).send(JSON.stringify({
                                status: "SUCCESS",
                                id_ship_code: tracker.insertId,
                                message: "Data have been added"
                            }))
                        }
                    }
                }
                return res.status(200).send(JSON.stringify({
                    status: "FAILED",
                    message: "Something wrong with your insert data"
                }))
            }
        }
    }
})

router.post('/delete', async function (req, res) {
    var [user, arr] = await model_panel_user.get(req.body.panel_user_id_delete)
    console.log(user)
    if (user) {
        if (user[0].username == 'administrator' || user[0].username == 'Administrator') {
            res.status(200).json({
                status: "FAILED",
                error_code: 1,
                message: "Cannot delete super admin!"
            })
        } else {
            var data = {
                id: user[0].id,
                updated_by: req.user.username
            }
            var [result, arr] = await model_panel_user.delete(data)
            if (result) {
                res.status(200).json({
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
        }
        return;
    } else {
        return res.status(200).json({
            status: "FAILED",
            error_code: 1,
            message: "Data not found"
        })
    }
})

router.post("/get_all_text_from_file", async function (req, res) {
    var tempPath = temporaryPath
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, "0777")
    }
    var uploadPath = uploadedPath
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, "0777")
    }
    const pdf = new PdfDocument()
    upload(req, res, async function (err) {
        res.setHeader('Content-Type', 'application/json')
        try {
            console.log("masuk ini")
            console.log(req.files.input_pdf[0], "ini req")
            console.log(req.body.warehouse_option, "ini req body")
            console.log(req.files.input_pdf[0].originalname[5], "ini req file name")
            console.log((JSON.parse(req.body.warehouse_option).warehouse_code === req.files.input_pdf[0].originalname[5]))
            if (req.files['input_pdf']) {
                // let [valid_code, err_valid_code] = await model_panel_tracker.check_code(req.body.warehouse.warehouse_code)
                if (JSON.parse(req.body.warehouse_option).warehouse_code === req.files.input_pdf[0].originalname[5]) {
                    // if(req.files.input_pdf[0].filename[5]!== )
                    try {
                        fs.readdirSync(uploadPath, (err, files) => {
                            if (err) throw err;
                            for (const file of files) {
                                fs.unlinkSync(path.join(uploadPath, file), err => {
                                    if (err) throw err;
                                });
                            }
                        })
                        let file_path = path.join(temporaryPath, req.files.input_pdf[0].filename)

                        await pdf.load(file_path)
                        
                        .then(() => data_tulisan = pdf.pages[0].tables)
                        
                        .catch(err => console.error("ini error" + err));

                        // let data_tulisan = await google_vision.setEndpoint(file_path);
                        console.log(data_tulisan, " ini data tulisannn")
                        return res.status(200).json({
                            status: "SUCCESS",
                            data: data_tulisan
                        })
                    } catch (error) {
                        console.log(error)
                    }
                } else {
                    return res.status(200).json({
                        status: "FAILED",
                        error_code: 1,
                        message: "Kode Surat Jalan tidak sesuai dengan kode Warehouse"
                    })
                }
            } else {
                return res.status(200).json({
                    status: "FAILED",
                    error_code: 1,
                    message: "File PDF tidak ditemukan"
                })
            }
        } catch (error) {
            console.log("masuk sini")
            let response = await error_handling.create_response(1000, "error in controller_test router.post('/get_all_text_from_file')", error)
            console.log(error.message)
            logger.error("error", response)
            let obj = {
                response,
                error
            }
            return res.status(200).json(response)
        }
    })

})

module.exports = router