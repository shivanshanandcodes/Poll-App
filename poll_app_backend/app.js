const dbMan = require("./db_manager")
const express = require('express')
const cors = require("cors")
const app = express()
const port = 3000

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

app.post("/updatepoll", (req,res) => {
	dbMan.updatePoll(req.body, res);
});

app.post("/getdash", (req, res) => {
	dbMan.getDash(req.body.shortUrl, res);
});

app.post("/submit", (req, res) => {
	dbMan.recordResponse(req.body, res);
});

app.post("/getpoll", (req, res) => {
	dbMan.getPoll(req.body.shortUrl, res);
});

app.post("/create", (req, res) => {
	dbMan.createPoll(req.body, res);
});

app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`)
})