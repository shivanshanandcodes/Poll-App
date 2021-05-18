const mysql = require("mysql");
const urlGen = require("./url_gen");
const msgObj = require("./msg_objs");

const CREATE_ERR_1 = "Error in Poll Creation, TYPE CREATE_FUNC_1";
const CREATE_ERR_2 = "Error in Poll Settings, TYPE CREATE_FUNC_2";
const CREATE_ERR_3 = "Error in Poll Options, TYPE CREATE_FUNC_3";
const CREATE_ERR_4 = "Error in Poll Url, TYPE CREATE_FUNC_4";

const GETPOLL_ERR_1 = "Poll doesn't exits, TYPE GETPOLL_FUNC_1";
const GETPOLL_ERR_2 = "Error in getting Poll Data, TYPE GETPOLL_FUNC_2";
const GETPOLL_ERR_3 = "Error in getting Poll Options, TYPE GETPOLL_FUNC_3";

const SUBMIT_ERR_1 = "You have already submitted, this poll allows only one response per poll";
const SUBMIT_ERR_2 = "Error in storing response, TYPE SUBMIT_FUNC_2";
const SUBMIT_ERR_3 = "Error in storing response, TYPE SUBMIT_FUNC_3";


const connection = mysql.createConnection({
	user: "root",
	password: "very_strong_password",
	host: "localhost",
	port: "3306",
	database: "poll_db"
});

/* make error messages local otherwise problems will occur i guess */
function sendError(type, msg, messenger) {
	if (type == 0) {
		msgObj.createMsg.error_msg = msg;
		msgObj.createMsg.error = true;
		msgObj.createMsg.short_url = null;
		msgObj.createMsg.dashboard_url = null;
		messenger.send(msgObj.createMsg);
	} else if (type == 1) {
		msgObj.getpollMsg.error = true;
		msgObj.getpollMsg.error_msg = msg;
		msgObj.getpollMsg.poll = null;
		messenger.send(msgObj.getpollMsg);
	} else if (type == 2) {
		msgObj.submitMsg.error = true;
		msgObj.submitMsg.error_msg = msg;
		messenger.send(msgObj.submitMsg);
	} else if(type == 3) {
		msgObj.updateMsg.error = true;
		messenger.send(msgObj.updateMsg);
	}
}

/* poll creation functions */

function insertURL(pollID, country, email, messenger) {

	let shortUrl = urlGen.generateShortUrl(pollID, country, email);

	connection.query(
		"INSERT INTO poll_url (pid, short_url) VALUES (?,?)",
		[pollID, shortUrl],
		(err, res, fields) => {
			if (err) {
				sendError(0, CREATE_ERR_4, messenger);
				return connection.rollback(() => { throw err });
			}
			else {
				msgObj.createMsg.error = false;
				msgObj.createMsg.error_msg = null;
				msgObj.createMsg.short_url = shortUrl;
				msgObj.createMsg.dashboard_url = "";
				messenger.send(msgObj.createMsg);
			}

		}
	);

}

function insertOptions(pollID, pollOptions, email, country, messenger) {

	let placeholder = "";
	let placeholderArray = [];

	for (let i = 0; i < pollOptions.length; i++) {
		placeholder = placeholder + "(?,?,?)" + ",";
		placeholderArray.push(pollID, pollOptions[i].text, i);
	}

	placeholder = placeholder.substring(0, placeholder.length - 1);

	connection.query(
		"INSERT INTO poll_options (pid, option_text, option_index) VALUES" + placeholder,
		placeholderArray,
		(err, res, fields) => {
			if (err) {
				sendError(0, CREATE_ERR_3, messenger);
				return connection.rollback(() => { throw err });
			}
			else {
				insertURL(pollID, country, email, messenger);
			}
		}
	);

}

function insertPollSettings(pollID, pollSettings, pollOptions, email, country, messenger) {

	for (let i of Object.keys(pollSettings)) {
		if (typeof pollSettings[i] === "boolean") {
			if (pollSettings[i])
				pollSettings[i] = 1;
			else
				pollSettings[i] = 0;
		}
	}

	connection.query(
		"INSERT INTO poll_settings (pid, ask_name , ask_email , ask_phone , allow_captcha , allow_multi_votes , allow_public_results) VALUES (?,?,?,?,?,?,?)",
		[
			pollID,
			pollSettings.settingExtraVoterName,
			pollSettings.settingExtraVoterEmail,
			pollSettings.settingExtraVoterPhone,
			pollSettings.settingGeneralCaptcha,
			pollSettings.settingGeneralMultiVotes,
			pollSettings.settingGeneralPublicRes
		],
		(err, res, fields) => {
			if (err) {
				sendError(0, CREATE_ERR_2, messenger);
				return connection.rollback(() => { throw err });
			}
			else
				insertOptions(pollID, pollOptions, email, country, messenger);
		}
	);

}

function insertPoll(poll, messenger) {

	let pollID = -1;

	if (!poll.pollSettings.settingExtraExitMsg || poll.pollSettings.settingExtraExitMsg.length < 1) {
		poll.pollSettings.settingExtraExitMsg = "Thank You ! Your response has been recorded.";
	}

	connection.beginTransaction(err => {
		if (err)
			throw err;

		connection.query(
			"INSERT INTO poll (poll_question,poll_exit_msg,poll_creator_name,poll_creator_email,poll_creation_date,poll_creator_ip,poll_creator_browser,poll_creator_os,poll_creator_country) VALUES(?,?,?,?,?,?,?,?,?)",
			[
				poll.pollSettings.question,
				poll.pollSettings.settingExtraExitMsg,
				poll.pollSettings.settingRequiredName,
				poll.pollSettings.settingRequiredEmail,
				new Date(),
				poll.pollSettings.ip,
				poll.pollSettings.browser,
				poll.pollSettings.os,
				poll.pollSettings.country
			],
			(err, res, fields) => {
				if (err) {
					sendError(0, CREATE_ERR_1, messenger);
					return connection.rollback(() => { throw err });
				} else {
					pollID = res.insertId;
					if (pollID != -1) {
						insertPollSettings(pollID, poll.pollSettings, poll.pollOptions, poll.pollSettings.settingRequiredEmail, poll.pollSettings.country, messenger);
						connection.commit(err => {
							if (err) {
								sendError(0, CREATE_ERR_1, messenger);
								return connection.rollback(() => { throw err });
							}
						});
					}
				}
			}
		);

	});

}

/* poll retrieval */

function getPollOptions(pid, poll, messenger, next) {

	connection.query("SELECT option_text, option_index FROM poll_options WHERE pid = ? ORDER BY option_index ASC",
		[pid],
		(err, res, fields) => {
			if (err) {
				sendError(1, GETPOLL_ERR_2, messenger);
			} else {
				options = [];
				for (i of res) {
					options.push(
						{
							text: i.option_text,
							idx: i.option_index,
							active: false
						});
				}
				poll.options = options;
				if (next == 1) {
					getDashboardResults(pid, poll, messenger);
				} else {
					msgObj.getpollMsg.error = false;
					msgObj.getpollMsg.error_msg = null;
					msgObj.getpollMsg.poll = poll;
					messenger.send(msgObj.getpollMsg);
				}
			}
		}
	);

}

function getPollData(pid, messenger, next) {

	connection.query(
		"SELECT poll_question, poll_exit_msg, poll_creator_name, ask_name, ask_phone, ask_email, allow_captcha, allow_multi_votes FROM poll INNER JOIN poll_settings WHERE poll.pid = ? AND poll_settings.pid = ?",
		[pid, pid],
		(err, res, fields) => {
			if (err) {
				sendError(1, GETPOLL_ERR_2, messenger);
			}
			else {
				let poll = {};
				poll.pid = pid;
				poll.question = res[0].poll_question;
				poll.exitMsg = res[0].poll_exit_msg;
				poll.creatorName = res[0].poll_creator_name;
				poll.askName = res[0].ask_name == 1;
				poll.askEmail = res[0].ask_email == 1;
				poll.askPhone = res[0].ask_phone == 1;
				poll.allowCaptcha = res[0].allow_captcha == 1;
				poll.allowMultiVotes = res[0].allow_multi_votes == 1;
				getPollOptions(pid, poll, messenger, next);
			}
		}
	);

}

function doesPollExist(shortUrl, messenger, next) {

	connection.query(
		"SELECT pid, COUNT(short_url) AS url_exist FROM poll_url WHERE short_url = ?",
		[shortUrl],
		(err, res, fields) => {
			if (err) {
				sendError(1, GETPOLL_ERR_1, messenger);
			}
			else {
				if (res[0].url_exist == 0)
					sendError(1, GETPOLL_ERR_1, messenger);
				else
					getPollData(res[0].pid, messenger, next);
			}
		}
	);

}

/* dashboard retrieval */

function getDashboardResults(pid, poll, messenger) {

	connection.query("SELECT option_index, vote_count FROM poll_response_short WHERE pid = ?",
		[pid],
		(err, res, fields) => {
			if (err) {
				console.log(err);
			}
			else {
				connection.query("SELECT * FROM poll_response WHERE pid = ?",
					[pid],
					(err_, res_, fields_) => {
						if (err_)
							console.log(err);
						else {
							msgObj.dashMsg.error = false;
							msgObj.dashMsg.short_res = res;
							msgObj.dashMsg.poll = poll;
							msgObj.dashMsg.res = res_;
							messenger.send(msgObj.dashMsg);
						}
					}
				);
			}
		}
	);
}

/* saving response */

function insertShortResponse(pid, opi, messenger) {

	connection.query(
		"SELECT pid, COUNT(pid) AS cpid FROM poll_response_short WHERE pid = ? AND option_index = ?",
		[pid, opi],
		(err, res, fields) => {
			if (err) {
				console.log(err);
			} else {
				if (res[0].cpid == 1) {
					connection.query("UPDATE poll_response_short SET vote_count = vote_count+1 WHERE pid = ? AND option_index = ?",
						[pid, opi],
						(err, res, fields) => {
							if (err) {
								sendError(2, SUBMIT_ERR_3, messenger);
							} else {
								msgObj.submitMsg.error = false;
								msgObj.submitMsg.error_msg = null;
								messenger.send(msgObj.submitMsg);
							}
						});
				} else {
					connection.query("INSERT INTO poll_response_short (pid, option_index, vote_count) VALUES(?,?,1)",
						[pid, opi],
						(err, res, fields) => {
							if (err) {
								sendError(2, SUBMIT_ERR_3, messenger);
							} else {
								msgObj.submitMsg.error = false;
								msgObj.submitMsg.error_msg = null;
								messenger.send(msgObj.submitMsg);
							}
						}
					);
				}
			}
		}
	);



}

function insertResponse(ans, messenger) {

	connection.query(
		"INSERT INTO poll_response (pid, option_index, response_name, response_email, response_phone, response_date, response_ip, response_browser, response_os, response_country) VALUES(?,?,?,?,?,?,?,?,?,?)",
		[ans.pid, ans.option_index, ans.name, ans.email, ans.phone, new Date(), ans.ip, ans.browser, ans.os, ans.country],
		(err, res, fields) => {
			if (err) {
				sendError(2, SUBMIT_ERR_2, messenger);
			} else {
				insertShortResponse(ans.pid, ans.option_index, messenger);
			}
		});

}

function checkValidResponse(ans, messenger) {

	connection.query("SELECT COUNT(response_ip) AS rip FROM poll_response WHERE pid = ? AND response_ip = ?",
		[ans.pid, ans.ip],
		(err, res, fields) => {
			console.log(res);
			console.log(ans);
			if (err)
				sendError(2, SUBMIT_ERR_1, messenger);
			else {
				if (res[0].rip == 1 && ans.allowMultiVotes == false) {
					sendError(2, SUBMIT_ERR_1, messenger)
				}
				else {
					insertResponse(ans, messenger);
				}
			}

		}
	);

}

/* update poll */

function updatePollMain(poll, messenger) {

	connection.query("UPDATE poll SET poll_question = ?, poll_exit_msg = ?, poll_creator_name = ? WHERE pid = ?",
		[poll.question, poll.exitMsg, poll.creatorName, poll.pid],
		(err, res, fields) => {
			if(err)
				sendError(3, "", messenger);
			else {
				connection.query("UPDATE poll_settings SET ask_name = ?, ask_email = ?, ask_phone = ?, allow_captcha = ?, allow_multi_votes = ? WHERE pid = ?",
					[poll.askName, poll.askEmail, poll.askPhone, poll.allowCaptcha, poll.allowMultiVotes, poll.pid],
					(err, res, fields) => {
						if(err)
						sendError(3, "", messenger)
						else
						messenger.send({error : false});
					}
				);
			}
		}
	);
}

exports.recordResponse = (ans, res) => {
	checkValidResponse(ans, res);
}

exports.createPoll = (poll, res) => {
	return insertPoll(poll, res);
}

exports.getPoll = (shortUrl, res) => {
	return doesPollExist(shortUrl, res, 0);
}

exports.getDash = (shortUrl, res) => {
	doesPollExist(shortUrl, res, 1);
}

exports.updatePoll = (poll, res) => {
	updatePollMain(poll, res);
}