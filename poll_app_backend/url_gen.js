exports.generateShortUrl = (pollID, country, email, forceID) => {

    let b64Universe = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split('');
    let mappings = [];
    let b64String = "";
    let shortEmail = "";
    let res = "";
    country = country.toLowerCase();

    while(pollID > 0) {
        let r = Math.round(pollID%62);
        pollID = Math.round(pollID/62);
        mappings.push(r);
    }

    for(let i of mappings)
        b64String = b64String + b64Universe[i];

    shortEmail = email.charAt(0) + "" + email.charAt(email.indexOf('@') - 1) + email.lastIndexOf('.');

    if(forceID) {
        res = pollID + "" + b64String + shortEmail;
    } else {
        res = country.charAt(0) + "" + b64String + country.charAt(1) + shortEmail + country.charAt(2);
    }

    return res;

}