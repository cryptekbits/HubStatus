import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as cron from 'cron';
import * as nmdc from 'nmdc';
import * as fs from 'fs';
import * as bodyParser from 'body-parser';
import * as favicon from 'serve-favicon';
import { HubStore } from './store';
import * as plotly from 'plotly';
import * as http2 from 'http2';
let api = JSON.parse(fs.readFileSync('api.key', 'utf8'));
let username :string;
let key :string;
for (let name in api){
    username = name;
    key = api[name];
}

plotly(username,key);

let cronJob = cron.CronJob;
let app = express();
let store = new HubStore('hubstore.db');
//TODO: remove sync call
let hubs = JSON.parse(fs.readFileSync('hubs.json', 'utf8'));
let hubBots: { [name: string]: nmdc.Nmdc } = {};
let hourTable:any = [];
let minTable: any= [];
let description_matrix:any={};
let tempclock = 0;
let cronString = '*/5 * * * * *';
for (let name in hubs) {
    store.initHub(name);
    let ip = hubs[name].ip;
    let port = hubs[name].port;
    let bot = new nmdc.Nmdc({
        address: ip,
        port: port,
        auto_reconnect: true,
        nick: "HubStatus_2",
        share: 1199511627776
    }, () => {
        store.setHubStatus(name, 1);
    });
    bot.onClosed = () => { store.setHubStatus(name, 1); }
    hubBots[name] = bot;
}
;

for (let name in hubs) {
	let currentuptime =0;
	let hourdetails: any= [];
    minTable[name]=currentuptime;
    hourTable[name] = hourdetails;
    description_matrix[name]= 0;
    let i : number;
    for (i = 0; i < 24; i++) { 
    hourTable[name].push(null);
    }
}



//app.set('port', process.env.PORT || 3000);
http2
    .createServer(app)
    .listen(3000, (err) => {
        if (err) {
            throw new Error(err);
        }

        /* eslint-disable no-console */
        console.log('Listening on port: ' + argv.port + '.');
        /* eslint-enable no-console */
    });
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(favicon('public/images/favicon_1.ico'));
app.use(bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

// Render the index page
app.get('/', function (req, res) {
    res.render('index', {
        title: 'HubStatus - Home',
        logo_url: 'images/logos/logo.png'
    });
})

// Render the Stats page
app.get('/stats', function (req, res) {
    res.render('stats', {
        title: 'HubStatus - Stats',
    });
})

// Render the About page
app.get('/about', function (req, res) {
    res.render('about', {
        title: 'HubStatus'
    });
})

// Render the FAQ page
app.get('/faq', function (req, res) {
    res.render('faq', {
        title: 'HubStatus-FAQ'
    });
})

// JSON Response for uptime values
app.get('/api/uptime', function (req, res) {
    let hubNames: string[] = [];
    for (let name in hubBots) {
        hubNames.push(name);
    }
    getAllUptimes(hubNames, res);
})

// JSON Response for uptime records
app.get('/api/records', function (req, res) {
    let hubNames: string[] = [];
    for (let name in hubBots) {
        hubNames.push(name);
    }
    getAllRecords(hubNames, res);
})

// JSON Response for current component status
app.get('/api/status', function (req, res) {
    let hubNames: string[] = [];
    for (let name in hubBots) {
        hubNames.push(name);
    }
    getAllStatuses(hubNames, res);
})

app.get('/api/hourstat', function (req, res) {
    let hubNames: string[] = [];
    for (let name in hubBots) {
        hubNames.push(name);
    }
    getHourStat(hubNames, res);
})

app.get('/api/users', function (req, res) {
    let hubNames: string[] = [];
    for (let name in description_matrix) {
        hubNames.push(name);
    }
    getUsers(hubNames, res);
})


// // JSON Response for tracker uptime with time stamps
// app.get('/api/uptime/tracker', function (req, res) {
//     store.lrange('trackeruptime', 0, -1, function (err, uptimesTrackerHistory) {
//         let jsonObj = {};
//         for (let i = 0; i < uptimesTrackerHistory.length; i++) {
//             let tokens = uptimesTrackerHistory[i].split(':')
//             jsonObj[tokens[0]] = tokens[1]
//         }
//         res.json(jsonObj)
//     })
// })

// // JSON Response for tracker uptime with time stamps [array]
// app.get('/api/2/uptime/tracker', function (req, res) {
//     store.lrange('trackeruptime', 0, -1, function (err, uptimesTrackerHistory) {
//         let jsonArray = [];
//         for (let i = 0; i < uptimesTrackerHistory.length; i++) {
//             let tokens = uptimesTrackerHistory[i].split(':')
//             jsonArray.push({
//                 timestamp: tokens[0],
//                 status: tokens[1]
//             });
//         }
//         res.json(jsonArray)
//     })
// })

http.createServer(app).listen(app.get('port'), function () {
    console.log("HubStatus server listening on port: " + app.get('port'));
});


new cronJob('0 * * * *', function () {
    console.log("[Stats] Cronjob started => Hourly Stats Update");
    updateHourly();
    /*for (let name in hubBots) {
        console.log("Hourly Uptime of " + name + " : " + hourTable[name]);
    }*/
    tempclock = 0;
}, null, true, null, null, true);

// Check Site Components (Cronjob running every minute)
new cronJob(cronString, function () {
    console.log('Checking status of hubs');
    updateStatus();
}, null, true, null, null, true);

/*
Statistics (minute)
This cronjob is incrementing the uptime counters for the various monitored components
and updating the uptime records if the current uptime > the old record.
*/

// Initialize Redis Keys to prevent "null" values

new cronJob(cronString, function () {
    console.log("[Stats] Cronjob started");
    tempclock = ++tempclock;
    updateUptime();
    for (let name in hubBots) {
        console.log("Min Uptime of " + name + " : " + Math.floor(minTable[name]/12));
    }
}, null, true, null, null, true);


async function updateStatus() {
    for (let name in hubBots) {
        let bot = hubBots[name];
        let connName = bot.getHubName();
        let usercount = 0;
        if (bot.getIsConnected() && (connName && connName.trim())) {
            for (let user in bot.users){
                usercount = ++usercount;
            }
            store.setHubStatus(name, 1);
            store.setFlag(name, 1);
            console.log(name + " has " + usercount + " users");
        }
        else {
            let hub = await store.findOne(name);
            let reply = hub.flag;
            if (reply == 1 || reply == 2) {
                store.setHubStatus(name, 2);
                usercount = 0;
            }
            else {
            	usercount = ++description_matrix[name];
                store.setHubStatus(name, 0);
            }
            let tempflag = ++reply;
            store.setFlag(name, tempflag);
        }
        description_matrix[name] = usercount; 
    }
}

async function updateUptime() {
    for (let name in hubBots) {
        let hub = await store.findOne(name);
        if (hub.status == 1) {
            store.increaseUptime(name);
            let tempmintable = ++minTable[name];
            minTable[name]=tempmintable;
            hourTable[name][23]= (Math.floor(tempmintable/tempclock))*60;
        }
    }
}



// Update Hub Uptime Record
async function updateHourly() {
	for (let name in hubs) {
        let uptimeHourly = hourTable[name];
		let currenthour=minTable[name];
		/*if ( uptimeHourly.length <24 ) {
			uptimeHourly.push(currenthour);
		}*/
		uptimeHourly.shift();
		uptimeHourly.push(currenthour);
		minTable[name]=0;
    	//console.log("Hourly Uptime of " + name + " : " + hourTable[name]);
    }
}

async function getAllUptimes(hubNames: string[], res: express.Response) {
    let uptimes = {};
    for (let name of hubNames) {
        uptimes[name] = (await store.findOne(name)).uptime;
    }
    res.json(uptimes);
}


async function getAllStatuses(hubNames: string[], res: express.Response) {
    let status = {};
    for (let name of hubNames) {
        let temparray=[];
        temparray.push((await store.findOne(name)).status);
        temparray.push(description_matrix[name]);
        temparray.push(hubs[name].ip);
        status[name] = temparray;
    }
    res.json(status);
}



async function getAllRecords(hubNames: string[], res: express.Response) {
    let records = {};
    for (let name of hubNames) {
        let hub = await store.findOne(name);
        records[name] = hub.record;
    }
    res.json(records);
}

async function getHourStat(hubNames: string[], res: express.Response) {
    let hourstat = {};
    for (let name of hubNames) {
        hourstat[name] = hourTable[name];
    }
    res.json(hourstat);
}

async function getUsers(hubNames: string[], res: express.Response) {
    let users = {};
    for (let name of hubNames) {
        users[name] = description_matrix[name];
    }
    res.json(users);
}