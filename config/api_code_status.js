function returnCode(code) {
    switch (code) {
        case 200:
            return "Success";
        case 201:
            return "Succesfully Logged In But Not Verified";
        case 400:
            return "Missing ";
        case 401:
            return "Invalid ";
        case 402:
            return "Phone Number / Username is Not Registered"
        case 403:
            return "Phone Number / Username is Already Registered"
        case 404:
            return "You Have Requested OTP More than 5 Times"
        case 405:
            return "Your OTP Has Expired"
        case 406:
            return "No OTP Verification Method Found"
        case 407:
            return "You Have Failed to Enter OTP Code for 10 Times, Wait For 24 Hours to Try Again"
        case 408:
            return "No Such OTP Found, Please Request Again!"
        case 409:
            return "Phone Number Already Connected to Another Google Account"
        case 410:
            return "Your Phone Has Not Set a Password Yet!"
	    case 430:
	        return "Unknown Error "        
        case 491:
            return "Invalid Token" 
        case 500:
            return "Internal Server Error";
        case 501:
            return "No Api Code Status Found";
        case 502:
            return "Failed to Connect to Database";
        case 503:
            return "No Data is Found";
        case 504:
            return "File Not Found!";
        default:
            return 
    }
}

module.exports = {
    getCodeStatus: function (code) {
        var response = returnCode(code);
        return response;
    },
}