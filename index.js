const Discord = require("discord.js");
const request = require('request');
const dateFormat = require('dateformat');
const Random = require('random-js');
const crypto = require('crypto');
const fs = require('fs');
const client = new Discord.Client();
var db = {};

function randomWithProbability(probability,seed) {
	var random = new Random(Random.engines.mt19937().seedWithArray(seed));
	return random.bool(probability);
}

function registerBet(user,probability,amount) {
	var timestamp = (new Date()).getTime();
	if(!(user.id in db.users)) {
		updateBalance(user.id,0);
	}
	if(!('wagered' in db.users[user.id])) {
		db.users[user.id].wagered = 0;
		db.users[user.id].bets = 0;
	}
	db.users[user.id].wagered += amount;
	db.users[user.id].latest_bet = {'probability': probability, 'timestamp': timestamp, 'server_seed': db.server_seed, 'client_seed': db.users[user.id].client_seed }
	db.users[user.id].bets++;
	db.users[user.id].name = client.users.get(user.id).username;
	var won = randomWithProbability(probability,[db.server_seed, db.users[user.id].client_seed, timestamp]);
	if(won) {
		updateBalance(user.id,((1/probability)-1)*amount);
	} else {
		updateBalance(user.id,0-amount);
	}
	return Object.assign(db.users[user.id].latest_bet,{'won': won});
}

function regenerateServerSeed(callback) {
	request('https://www.random.org/strings/?num=100&len=20&digits=on&upperalpha=on&loweralpha=on&unique=off&format=plain&rnd=new',function(err,response,data) {
		if(response.statusCode == 200) {
			db.server_seed = crypto.createHash('sha256').update(data.replace(/\n|\r/g, "")).digest('hex');
			callback();
		} else {
			console.log("Error bij genereren van nieuwe server seed");
			process.abort();
		}
	});
}

function updateBalance(user_id,amount) {
	user_id = parseInt(user_id.toString().replace(/\D/g,''));
	if(user_id in db.users || user_id.toString() in db.users) {
		db.users[user_id].balance += amount;
	} else {
		db.users[user_id] = {
			'client_seed': crypto.createHash('sha256').update(user_id.toString()).digest('hex'),
			'balance': amount,
			'bets': 0,
			'wagered': 0,
			'name': client.users.get(user_id.toString()).username,
			'admin': false,
			'faucet': 0,
			'latest_bet': {},
		}
	}
}

function getBalance(user_id) {
	user_id = parseInt(user_id.toString().replace(/\D/g,''));
	if(user_id in db.users) {
		return db.users[user_id].balance;
	} else {
		return 0;
	}
}

function isAdmin(user) {
	if(user.id in db.users) {
		return db.users[user.id].admin;
	} else {
		return false;
	}
}

client.on('ready', () => {
	console.log("Logged in as " + client.user.tag + "!");
});

client.on('message', msg => {
	if(msg.content.startsWith("$") && ["363650292547584000","369717343292751873"].includes(msg.channel.id)) {
		var command = msg.content.substr(1).split(" ");
		if(command[0] == "balance") {
			if(1 in command && 0 in Array.from(msg.mentions.users) && Array.from(msg.mentions.users)[0].length == 2) {
				msg.reply(Array.from(msg.mentions.users)[0][1] + " heeft op dit moment " + getBalance(Array.from(msg.mentions.users)[0][1]).toFixed(2) + " coins");
			} else {
				msg.reply("Je hebt op dit moment " + getBalance(msg.author.id).toFixed(2) + " coins");
			}
		} else if(command[0] == "flip") {
			if(1 in command && !isNaN(parseFloat(command[1])) && parseFloat(command[1]) >= 0.01) {
				if(getBalance(msg.author.id) >= parseFloat(command[1])) {
					if(registerBet(msg.author,0.5,parseFloat(command[1])).won) {
						msg.reply("Gefeliciteerd! Je hebt " + parseFloat(command[1]).toFixed(2) + " coins gewonnen");
					} else {
						msg.reply("Je hebt " + parseFloat(command[1]).toFixed(2) + " coins verloren");
					}
				} else {
					msg.reply("Je hebt niet genoeg coins.");
				}
			} else {
				msg.reply("Gebruik het commando op deze manier: `$flip <bedrag>`");
			}
		} else if(command[0] == "dice") {
			if(1 in command && !isNaN(parseFloat(command[1])) && parseFloat(command[1]) >= 0.01) {
				if(getBalance(msg.author.id) >= parseFloat(command[1])) {
					if(registerBet(msg.author,(1/6),parseFloat(command[1])).won) {
						msg.reply("Gefeliciteerd! Je hebt " + (parseFloat(command[1])*6).toFixed(2) + " coins gewonnen");
					} else {
						msg.reply("Je hebt " + parseFloat(command[1]).toFixed(2) + " coins verloren");
					}
				} else {
					msg.reply("Je hebt niet genoeg coins.");
				}
			} else {
				msg.reply("Gebruik het commando op deze manier: `$dice <bedrag>`");
			}
		} else if(command[0] == "seed") {
			if(1 in command) {
				var seed = command.join(" ").replace("seed ","");
				if(seed == "reset") {
					seed = msg.author.id;
				}
				if(!isNaN(parseInt(seed)) && seed.length == 18 && parseInt(seed) != parseInt(msg.author.id)) {
					msg.reply("Je kunt niet iemand anders Discord ID als seed doen");
				} else if(msg.author.id in db.users && seed != "") {
					seed = crypto.createHash('sha256').update(seed).digest('hex')
					if(db.users[msg.author.id].client_seed != seed) {
						msg.reply("Client seed gewijzigd van " + db.users[msg.author.id].client_seed + " naar " + seed + " (SHA-256)");
						db.users[msg.author.id].client_seed = seed;
					}
				}
			} else {
				msg.reply("Je huidige seed is " + db.users[msg.author.id].client_seed);
			}
		} else if(command[0] == "tip") {
			if(1 in command && !isNaN(parseFloat(command[1])) && parseFloat(command[1]) >= 0.01 && 0 in Array.from(msg.mentions.users) && Array.from(msg.mentions.users)[0].length == 2) {
				if(getBalance(msg.author.id) >= parseFloat(command[1])) {
					updateBalance(Array.from(msg.mentions.users)[0][1],parseFloat(command[1]));
					updateBalance(msg.author.id,0-parseFloat(command[1]));
					msg.reply("je hebt " + parseFloat(command[1]).toFixed(2) + " coins getipt aan " + Array.from(msg.mentions.users)[0][1] + "!");
				} else {
					msg.reply("Je hebt niet genoeg coins.");
				}
			} else {
				msg.reply("Gebruik het commando op deze manier: `$tip 1 @User`")
			}
		} else if(command[0] == "prove" || command[0] == "proof") {
			if(msg.author.id in db.users && Object.keys(db.users[msg.author.id].latest_bet) != 0) {
				var latest_bet = db.users[msg.author.id].latest_bet;
				regenerateServerSeed(function() {
					var r = new Random(Random.engines.mt19937().seedWithArray([latest_bet.server_seed, latest_bet.client_seed, latest_bet.timestamp]));
					var won = r.bool(latest_bet.probability);
					var proof = "\n**Server seed**: " + latest_bet.server_seed + "\n";
					proof += "**Client seed**: " + latest_bet.client_seed + "\n";
					proof += "**Timestamp**: " + latest_bet.timestamp + " (" + dateFormat(new Date(latest_bet.timestamp), "dd-mm-yyyy HH:MM:ss Z") + ")\n\n";
					proof += "Bet aan het reproduceren met " + (latest_bet.probability*100) + "% kans: " + won.toString().replace('false','verloren').replace('true','gewonnen') + ".\n\n";
					proof += "**Code**: https://runkit.com/mrluit/provably-fair-2-0\n";
					proof += "**Draai code**: https://runkit.io/mrluit/provably-fair-2-0/branches/master?s=" + latest_bet.server_seed + "&c=" + latest_bet.client_seed + "&t=" + latest_bet.timestamp + "&p=" + latest_bet.probability;
					msg.reply(proof);
				});
			} else {
				msg.reply("Geen bets om te bewijzen");
			}
		} else if(command[0] == "jackpot") {
			if(1 in command) {
				
			} else {
				
			}
		} else if(command[0] == "supertip") {
			if(isAdmin(msg.author)) {
				if(1 in command && !isNaN(parseFloat(command[1])) && parseFloat(command[1]) >= 0.01 && 0 in Array.from(msg.mentions.users) && Array.from(msg.mentions.users)[0].length == 2) {
					updateBalance(Array.from(msg.mentions.users)[0][1],parseFloat(command[1]));
					msg.reply("je hebt " + parseFloat(command[1]).toFixed(2) + " coins getipt aan " + Array.from(msg.mentions.users)[0][1] + "!");
				} else {
					msg.reply("Gebruik het commando op deze manier: `$tip 1 @User`")
				}
			} else {
				msg.reply("Nee dankje <:dab:359383950860484608>");
			}
		} else if(command[0] == "leaderboard") {
			var leaderboard = "**Leaderboard**:\n\n";
			var i = 0;
			Object.keys(db.users).sort(function(a,b){return db.users[b].balance-db.users[a].balance}).forEach(function(userid) {
				i++;
				if(i <= 10) {
					leaderboard += client.users.get(userid.toString()).username + ": " + db.users[userid].balance.toFixed(2) + " coins\n";
				}
			});
			msg.reply(leaderboard);
		} else if(command[0] == "refund") {
			msg.reply("<:dab:359383950860484608>");
		} else if(command[0] == "faucet") {
			if(!(msg.author.id in db.users) || (new Date).getTime()-db.users[msg.author.id].faucet > 60*10*1000 || (Math.round(db.users[msg.author.id].balance) == 0 && (new Date).getTime()-db.users[msg.author.id].faucet > 60*1000)) {
				msg.reply("Hier zijn je gratis 10 coins!")
				updateBalance(msg.author.id,10);
				db.users[msg.author.id].faucet = (new Date).getTime();
			} else {
				if(Math.round(db.users[msg.author.id].balance) == 0) {
					var tijd = (60*1000)-((new Date).getTime()-db.users[msg.author.id].faucet);
				} else {
					var tijd = (60*10*1000)-((new Date).getTime()-db.users[msg.author.id].faucet);
				}
				if(tijd > 60*1000) {
					tijd = Math.round(tijd/1000/60) + " minuten";
				} else {
					tijd = Math.round(tijd/1000) + " seconden";
				}
				msg.reply("Nog " + tijd + " tot je weer gratis coins kan krijgen");
			}
		} else if(command[0] == "help") {
			var help = "**Commando's**:\n\n**Balance**: `$balance` - Je aantal coins\n";
			help += "**Faucet**: `$faucet` - Krijg gratis 10 coins\n";
			help += "**Tip**: `$tip 1 @User` - Stuur geld naar een andere gebruiker\n";
			help += "**Leaderboard**: `$leaderboard` - Zie wie er de meeste coins heeft\n";
			help += "**Seed**: `$seed <nieuwe client seed>` - Verander je client seed\n";
			help += "**Proof**: `$prove` - Bewijs de laatste bet\n\n";
			help += "**Flip**: `$flip <bedrag>` - Gok met 50% kans (2x beloning)\n";
			help += "**Dice**: `$dice <bedrag>` - Gok met 0.166666667% kans (6x beloning)\n";
			help += "**Jackpot**: `$jackpot` - Bekijk de huidige jackpotpool";
			msg.reply(help);
		} else {
			msg.reply("waseggie?");
		}
	}
});

if(!fs.existsSync("db.json")) {
	db = {'token': '', 'users': {}};
	regenerateServerSeed(function() {
		fs.writeFile("db.json",JSON.stringify(db, null, 2),function() {
			console.log("Voeg de Discord token toe aan db.json");
			process.abort();
		});
	});
} else {
	fs.readFile("db.json",function(err,local_db) {
		db = JSON.parse(local_db);
		client.login(db.token);
	});
}

setInterval(function() {
	fs.writeFileSync("db.json",JSON.stringify(db, null, 2));
},30 * 1000);

process.on('SIGINT', function() {
    fs.writeFileSync("db.json",JSON.stringify(db, null, 2));
	process.exit();
});