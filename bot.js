const tmi = require("tmi.js");
require("dotenv").config();
const axios = require("axios");

var cors = require("cors");

// Define configuration options
const opts = {
    identity: {
        username: process.env.BOT_NAME,
        password: process.env.OAUTH_TOKEN,
    },
    channels: [process.env.CHANNEL_NAME],
};

function generateRandomString(length) {
    var result = "";
    var characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * charactersLength)
        );
    }
    return result;
}

// Create a client with our options
const client = new tmi.client(opts);

// Register our event handlers (defined below)
client.on("message", onMessageHandler);
client.on("connected", onConnectedHandler);

// Connect to Twitch:
client.connect();

const querystring = require("querystring");

const express = require("express");

var app = express();

// use it before all route definitions
app.use(cors({ origin: process.env.SERVER_HOST }));

var listener = app.listen(process.env.PORT, function () {
    console.log("Listening on port " + listener.address().port); //Listening on port PORT
});

//connect to spotify
console.log("Beginning spotify authorization flow...");

var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.HOST + "/auth/callback";

app.get("/login", function (req, res) {
    var state = generateRandomString(16);
    var scope = "user-modify-playback-state user-read-playback-state";

    res.redirect(
        "https://accounts.spotify.com/authorize?" +
            querystring.stringify({
                response_type: "code",
                client_id: client_id,
                scope: scope,
                redirect_uri: redirect_uri,
                state: state,
            })
    );
});

var access_token;

app.get("/auth/callback", function (req, res) {
    console.log(req.query.code);
    const authCode = req.query.code;

    const data = querystring.stringify({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirect_uri,
    });

    const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
            "Basic " +
            Buffer.from(client_id + ":" + client_secret).toString("base64"),
    };

    axios
        .post("https://accounts.spotify.com/api/token", data, {
            headers: headers,
        })
        .then((response) => (access_token = response.data.access_token))
        .catch((e) => {
            console.log(e);
        });

    res.send(" ");
});

let queueSongEnabled = false;

app.post("/disableQueueing", function(req,res) {
    queueSongEnabled = false;
    res.sendStatus(200)
})

app.post("/enableQueueing", function(req,res) {
    queueSongEnabled = true;
    res.sendStatus(200)
})

app.get("/chat", function (req, res) {
    // Optional parameter for amount of messages to get
    const historySize = req.query.count
        ? req.query.count
        : messageHistory.length;

    const messagesStart = messageHistory.length - historySize;
    const messagePayload = messageHistory.slice(
        messagesStart >= 0 ? messagesStart : 0
    );
    res.send({ messages: messagePayload });
    console.log(messagePayload);

    messageHistory = [];
});

app.get("/spotify", async function (req, res) {
    let currentInfo = [];

    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + access_token,
    };

    const data = {
    };

    let userInfo = {"display_name": "Unknown User"};
    try {
        userInfo = (await axios.get("https://api.spotify.com/v1/me", {
            params: data,
            headers: headers,
        })).data
    }
    catch (e) {
        console.log(e)
    }

    axios.get("https://api.spotify.com/v1/me/player", {
        params: data,
        headers: headers,
    })
        .then((response) => response.data)
        .then((data) => {
            (currentInfo = data);
            console.log(currentInfo)
            res.send({
                username: userInfo.display_name,
                active_song: currentInfo.item ? currentInfo.item.uri.split("spotify:track:")[1] : undefined,
                queueingEnabled: queueSongEnabled,
            });
        })
        .catch((e) => console.log(e));
});

app.get("/health", function (req, res) {
    res.send({
        bot: true,
        spotify: access_token !== undefined,
        chat: client !== undefined,
        response: true,
    });
});

let messageHistory = [];
const MAX_HISTORY = 150;

function appendMessage() {}

// Called every time a message comes in
function onMessageHandler(target, context, msg, self) {
    console.log(msg);
    const currentTime = new Date();
    messageHistory.push({
        user: context.username,
        messageContent: msg,
        userColor: context.color,
        timestamp:
            (currentTime.getHours() % 12) +
            ":" +
            ((currentTime.getMinutes() < 10 ? "0" : "") +
                currentTime.getMinutes()) +
            (currentTime.getHours() >= 12 ? "PM" : "AM"),
    });
    if (self) {
        return;
    } // Ignore messages from the bot

    // Remove whitespace from chat message
    const splitCommand = msg.trim().split(" ");
    const commandName = splitCommand[0].trim();
    const args = splitCommand.slice(1).join(" ");

    if (commandName === "!amongouslylurking") {
        client.say(target, "shut tf up dumbass");
    }

    if (commandName === "!quip") {
        const jakeQuips = [
            ["this fucks", 50],
            ["helloing", 100],
            ["uUr uUr uUr", 10],
        ];
        let targetQuip = getQuip(jakeQuips);
        client.say(
            target,
            'You got quip "' +
                targetQuip[0] +
                '" at chance ' +
                targetQuip[1] * 100 +
                "%"
        );
    }

    // If the command is known, let's execute it
    if (commandName === "!queue") {
        if (queueSongEnabled) {
            if (access_token) {
                client.say(target, `Searching...`);
                searchSong(args).then((response) => {
                    const song = response.data.tracks.items[0];
                    console.log(song);
                    getDevices().then((response) => {
                        const devices = response.data.devices;
                        let activeDevice;
                        for (let x = 0; x < devices.length; x++) {
                            if (devices[x].is_active === true) {
                                activeDevice = devices[x];
                                break;
                            }
                        }
                        if (!activeDevice) {
                            client.say(
                                target,
                                `Sorry, the host is not currently using spotify.`
                            );
                        } else {
                            let headers = {
                                Authorization: "Bearer " + access_token,
                                "Content-Type":
                                    "application/x-www-form-urlencoded",
                            };
                            console.log(song.uri);
                            let data = {
                                uri: song.uri,
                                device_id: activeDevice.id,
                            };
                            axios
                                .post(
                                    "https://api.spotify.com/v1/me/player/queue",
                                    null,
                                    {
                                        params: data,
                                        headers: headers,
                                    }
                                )
                                .then((response) => {
                                    client.say(
                                        target,
                                        `Now queueing [${song.name}].`
                                    );
                                });
                        }
                    });
                });
            } else {
                client.say(
                    target,
                    `Sorry, the bot is not connected to a valid spotify account.`
                );
            }
        } else {
            client.say(
                target,
                `Sorry, the user has disabled the queueing of songs for the moment.`
            );
        }
    }
}

function getQuip(quips) {
    let chances = [];
    let totalSum = 0;
    for (let x = 0; x < quips.length; x++) {
        if (chances.length === 0) {
            chances.push([quips[x][0], quips[x][1]]);
        } else {
            chances.push([quips[x][0], quips[x][1] + quips[x - 1][1]]);
        }

        totalSum += quips[x][1];
    }
    let randomCount = Math.floor(Math.random() * totalSum);

    let x = 0;
    while (x < quips.length) {
        randomCount -= quips[x][1];
        if (randomCount <= 0) {
            return [quips[x][0], quips[x][1] / totalSum];
        } else {
            x++;
        }
    }

    console.log(randomCount);
}

async function getDevices() {
    return axios.get("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: "Bearer " + access_token },
    });
}

// Function called when the "dice" command is issued
async function searchSong(searchString) {
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + access_token,
    };

    const data = {
        q: searchString,
        type: "track",
        limit: 3,
    };

    return axios.get("https://api.spotify.com/v1/search", {
        params: data,
        headers: headers,
    });
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, port) {
    console.log(`* Connected to ${addr}:${port}`);
}
