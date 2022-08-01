const api_resp_template = require('../config/api_code_status')
module.exports = {
    create_json: async function (code, message, data = []) {
        var code_resp = api_resp_template.getCodeStatus(code)
        if (!code_resp) {
            logger.error({
                error: api_resp_template.getCodeStatus(501)
            })
            code_resp = api_resp_template.getCodeStatus(501)
            code = 501
        }
        if (message == null || message == "")
            message = ""
        const response = {
            "error": code,
            "message": code_resp + message,
            "data": data
        }

        return response;
    },
    create_response: async function (code, message, data = []) {

        var ecode = code
        var emessage = message
        var edata = data

        const response = {
            "error": ecode,
            "message": emessage,
            "data": edata
        }

        return response;
    },
}