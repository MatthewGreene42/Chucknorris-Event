const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('node:url');
const querystring = require('node:querystring');
const googlecredential = require('./auth/googlecredential.json');
const BASE_URL = 'http://127.0.0.1:3000/';
const port = 3000;
const server = http.createServer();


server.on("request", connection_handler);
function connection_handler(req, res){
    console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
    req.on('error', e => console.log(e));
    res.on('error', e => console.log(e));
    if (req.url == '/') {
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200, {'Content-Type':'text/html'});
		main.pipe(res);
    }
    else if (req.url == '/favicon.ico') {
		const file = fs.createReadStream('./data/favicon.png');
		res.writeHead(200, {'Content-Type':'image/x-icon'});
		file.pipe(res);
	}
    else if (req.url == '/googleredirect') {
        const googleOAUTHurl = "https://accounts.google.com/o/oauth2/auth";
        const query = querystring.stringify({
            client_id : googlecredential.web.client_id,
            project_id : googlecredential.web.project_id,
            auth_uri : googlecredential.web.auth_uri,
            token_uri : googlecredential.web.token_uri,
            auth_provider_x509_cert_url : googlecredential.web.auth_provider_x509_cert_url,
            response_type : 'code',
            scope : 'https://www.googleapis.com/auth/calendar',
            redirect_uri : 'http://localhost:3000/Entry/'
        })
        let redirect_url = googleOAUTHurl + "?" + query;
        res.writeHead(302, {
            'Location': redirect_url
        });
        res.end();
	}
    else if(req.url.startsWith("/Entry/")) {
        // EXPECT /Entry/?code=4/0AanRRrsTQuZ1p5k5rJwb3Aq6r_SI4wqnW8kaBuqfCtuVKE-_KpL1cS3KFkUkoEIApon6Mg&scope=https://www.googleapis.com/auth/calendar
        let parsestring = req.url.slice(8);
        let obj = querystring.parse(parsestring);
        let query = querystring.stringify({
            client_id : googlecredential.web.client_id,
            client_secret : googlecredential.web.client_secret,
            code : obj.code,
            grant_type : `authorization_code`,
            redirect_uri : 'http://localhost:3000/Entry/'
        });
        const oauth_options = {
            method : "POST",
            headers : {
                "Content-Type" : "application/x-www-form-urlencoded"
            }
        }
        let query_url = "https://oauth2.googleapis.com/token?" + query
        console.log("building google oauth request", query_url);
        let oauth_final_req = https.request(query_url, oauth_options);
        oauth_final_req.on('error', e => console.log(e));
        oauth_final_req.once('response', (in_socket) => {
            console.log("handling google oauth request");
            stream_to_message(in_socket, auth_message => recieved_auth(auth_message))
        });
        oauth_final_req.end(query);
        function recieved_auth(auth_message) {
            auth_message = JSON.parse(auth_message);
            let token = auth_message.token_type + " " + auth_message.access_token;
            console.log("token", token);
            get_norris_fact(quote => {
                take_gauth_and_quote(token, quote);
            });
        }
        // norris api get random quote
        function get_norris_fact(callback) {
            console.log("fetching chucknorris facts");
            let norris_req = https.get("https://api.chucknorris.io/jokes/random", handle_norris);
            norris_req.on('error', e => console.log(e));
            norris_req.end();
            function handle_norris(norris_res) {
                console.log("handling norris??");
                stream_to_message(norris_res, handle_norris_body);
            }
            function handle_norris_body(body){
                let norris_obj = JSON.parse(body);
                let quote = norris_obj.value;
                callback(quote);
            }
        }
        function take_gauth_and_quote(token, quote) {
            // fetch all calendars
            console.log("here", token, quote)
            let cal_options = {
                method : "GET",
                headers : {
                    "Content-Type" : "application/x-www-form-urlencoded",
                    "Authorization" : token
                }
            }
            let cal_req = https.request("https://www.googleapis.com/calendar/v3/users/me/calendarList",cal_options);
            cal_req.on('error', e => console.log(e));
            cal_req.once('response', cal_req_handler);
            cal_req.end();
            function cal_req_handler(response) {
                stream_to_message(response, body => {
                    let data = JSON.parse(body);
                    calendarID = data.items[0].id;
                    create_event_on_id(calendarID);
                });
            }
            //create event on primary calendar
            function create_event_on_id(calendarId) {
                let url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
                const cal_post_options = {
                    method : "POST",
                    headers : {
                        // "Content-Type" : "application/x-www-form-urlencoded",
                        "Authorization" : token
                    }
                }
                let request = https.request(url, cal_post_options);
                request.on('error', e => console.log(e));
                request.once('response', (socket) => {
                    stream_to_message(socket, body => {
                        let event_resource = JSON.parse(body);
                        res.write("<p>" + quote + '</p>');
                        res.write(`<a href=${event_resource.htmlLink}>Link to event</a>`);
                        res.end();
                    })
                });
                let d = new Date();
                let request_body = {
                    start : {
                        date : "2024-12-28", // date
                        timeZone : "US/Eastern" // string
                    },
                    end : {
                        date : "2024-12-29",
                        timeZone : "US/Eastern"
                    },
                    description: quote,
                    summary: "Chuck Norris Says amazing things"
                }
                request.end(JSON.stringify(request_body));
            }
            res.writeHead(200, {'Content-Type':'text/html'})
        }
    }
    else {
        res.end("404 content not found");
    }
}

server.on("listening", listening_handler);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}
server.listen(port);


function stream_to_message(stream, callback) {
	let body = "";
	stream.on('data', chunk => body += chunk);
    stream.on('error', e => console.log(e));
	stream.on('end', () => callback(body));
}
