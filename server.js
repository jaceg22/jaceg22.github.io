const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game configuration
const defaultLocations = Array.from(new Set([
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine",
    "Daycare", "Amazon Rainforest", "Concert Hall", "Space Station",
    "High School", "Haunted Mansion", "Beach"
]));

// NEW: Player lists for new game types
const nbaPlayers = Array.from(new Set([
    "Lebron James", "Kawhi Leonard", "Steph Curry", "Klay Thompson", "Damian Lillard", "Giannis Antetokounmpo", 
    "Chris Paul", "Zion Williamson", "Ja Morant", "Scottie Barnes", "Chet Holmgren", "Paolo Banchero", 
    "Franz Wagner", "Gradey Dick", "Kyle Lowry", "DeMar DeRozan", "CJ McCollum", "Anthony Davis", 
    "Fred VanVleet", "Miles Bridges", "James Harden", "Russell Westbrook", "Joel Embiid", "Tyrese Maxey", 
    "Mikal Bridges", "Jalen Brunson", "Julius Randle", "OG Anunoby", "Mitchell Robinson", "Kelly Oubre Jr.", 
    "Donte DiVincenzo", "Josh Hart", "Immanuel Quickley", "RJ Barrett", "Jakob Poeltl", "Cam Thomas", 
    "Ben Simmons", "Nic Claxton", "Spencer Dinwiddie", "Jayson Tatum", "Jaylen Brown", "Derrick White", 
    "Jrue Holiday", "Kristaps Porzingis", "Al Horford", "Gary Trent Jr.", "Brook Lopez", "Khris Middleton", 
    "Bobby Portis", "Tyrese Haliburton", "Pascal Siakam", "Myles Turner", "Bennedict Mathurin", "Obi Toppin", 
    "Darius Garland", "Donovan Mitchell", "Evan Mobley", "Jarrett Allen", "Zach LaVine", 
    "Nikola Vucevic", "Josh Giddey", "Cade Cunningham", "Jaden Ivey", "Ausar Thompson", "Jalen Duren", 
    "Tobias Harris", "Jimmy Butler", "Bam Adebayo", "Terry Rozier", "Tyler Herro", "Duncan Robinson", 
    "Trae Young", "Clint Capela", "Zaccharie Risacher", "LaMelo Ball", "Brandon Miller", 
    "Grant Williams", "Seth Curry", "Kyle Kuzma", "Jordan Poole", "Alex Sarr", "Shai Gilgeous-Alexander", 
    "Jalen Williams", "Lu Dort", "Alex Caruso", "Nikola Jokic", "Jamal Murray", "Michael Porter Jr.", 
    "Aaron Gordon", "Bruce Brown", "Anthony Edwards", "Mike Conley", "Rudy Gobert", "Karl-Anthony Towns", 
    "Jaden McDaniels", "Naz Reid", "Norman Powell", "Luka Doncic", "Kyrie Irving", "Daniel Gafford", 
    "Kevin Durant", "Devin Booker", "Bradley Beal", "Jusuf Nurkic", "Brandon Ingram", "Dejounte Murray", 
    "Herbert Jones", "D'Angelo Russell", "Austin Reaves", "De'Aaron Fox", "Domantas Sabonis", 
    "Malik Monk", "Buddy Hield", "Andrew Wiggins", "Draymond Green", "Jonathan Kuminga", 
    "Alperen Sengun", "Jalen Green", "Amen Thompson", "Dillon Brooks", "Collin Sexton", "Isaiah Stewart", 
    "Lauri Markkanen", "Walker Kessler", "Jordan Clarkson", "Jaren Jackson Jr.", "Desmond Bane", 
    "Marcus Smart", "Zach Edey", "Victor Wembanyama", "Keldon Johnson", "Devin Vassell", "Jeremy Sochan", 
    "Anfernee Simons", "Scoot Henderson", "Deandre Ayton", "Jerami Grant", "Shaedon Sharpe", 
    "Deni Avdija", "Cooper Flagg"
]));

const rappers = Array.from(new Set([
    "Drake", "Future", "21 Savage", "Travis Scott", "Kanye", "XXXTentacion", "Nav", "Roddy Ricch", "A Boogie wit da Hoodie", 
    "Post Malone", "Lil Baby", "Lil Wayne", "Baby Keem", "Kendrick Lamar", "Lil Tecca", "Don Toliver", "Chris Brown", 
    "Coi Leray", "Nicki Minaj", "Cardi B", "DaBaby", "J. Cole", "Eminem", "Gunna", "Quavo", "Jay-Z", "Juice WRLD", "Big Black Banana Man", 
    "The Weeknd", "Kid Cudi", "Kodak Black", "Lil Durk", "Lil Skies", "Lil Tjay", "Lil Uzi Vert", "Meek Mill", "Nas", "PARTYNEXTDOOR",
    "Offset", "Playboi Carti", "Polo G", "Pop Smoke", "Swae Lee", "Tory Lanez", "Young Thug", "Ty Dolla $ign"
]));

// The Mole question system (unchanged)
const questions = [
    "Would you expect to see me here?",
    "What is the last thing you said?",
    "Would you be scared if someone was near you?",
    "What do you see around you?",
    "What do you think of the food?",
    "What's that smell?",
    "What's that noise?",
    "What is the price of admission?",
    "What time of day is it here?",
    "Who else might you meet here?",
    "Would you want to take a picture here?",
    "What kind of clothing would you wear here?",
    "How long would you stay here?",
    "What is the weather like?",
    "What did you bring with you?",
    "How would you describe the vibe?",
    "Would you need a ticket to enter?",
    "Do you feel safe here?",
    "What language do people speak here?",
    "What type of transportation would you use to get here?",
    "What celebrity would you expect to meet here?",
    "What is everyone wearing?",
    "What is this place's motto?",
    "Would you take a date here?",
    "What is the floor made out of?",
    "If you were an actor, who would you be?",
    "Where's a good place to smoke around here?",
    "What do you think would happen if I touched this button?",
    "How stressed are people around here?",
    "If Taylor Swift were here, what would she be doing?",
    "Is your family here?",
    "Do you find the people here attractive?",
    "What animal is that?",
    "What's in that corner?",
    "Why are they whispering?",
    "How's your phone reception?",
    "What's the seating situation like around here?",
    "Are any crimes being committed here?"
];

const questionPrompts = [
    ["Would you expect to see me here?", "yes, no, maybe, probably, probably not"],
    ["What is the last thing you said?", "pretend youre at this location, what is the last thing you wouldve said? be very vague"],
    ["Would you be scared if someone was near you?", "yes, no, a little, not really, very, not at all"],
    ["What do you see around you?", "name something broad, like animals, a lot of people, something that would make sense for multiple locations in the location list"],
    ["What do you think of the food?", "good, bad, decent, a word like that"],
    ["What's that smell?", "answer without using a word that would only be used to describe the location"],
    ["What's that noise?", ""],
    ["What is the price of admission?", "just give an approximate value in CAD (dont mention CAD)"],
    ["What time of day is it here?", "either an approximate time like 12:00PM, or something like daytime, afternoon, morning, midnight, evening"],
    ["Who else might you meet here?", "friends, family, something like that"],
    ["Would you want to take a picture here?", "yes, no, definitely, definitely not, maybe"],
    ["What kind of clothing would you wear here?", "t shirt and shorts? sweater and pants? jacket? something like that"],
    ["How long would you stay here?", "just say n hours or n days, or even half a day, something like that"],
    ["What is the weather like?", "vague weather examples, like sunny, hot..."],
    ["What did you bring with you?", "water, food, camera, something basic that you can bring to multiple other locations"],
    ["How would you describe the vibe?", "something basic, like fun, scared..."],
    ["Would you need a ticket to enter?", "yes or no"],
    ["Do you feel safe here?", "yes, no, a little, not really, very, not at all"],
    ["What language do people speak here?", "usually say english, or a bunch of different languages"],
    ["What type of transportation would you use to get here?", "car, bus, walk, plane, boat, anything like that, but usually car"],
    ["What celebrity would you expect to meet here?", "Name a celebrity that you would expect to be here."],
    ["What is everyone wearing?", "base it off the expected weather at the location. t shirt and shorts? sweater and pants? jacket? something like that. if youre at the beach, instead of saying swimming suit, say something like 'something light'"],
    ["What is this place's motto?", "make up a motto without using words that give away the location"],
    ["Would you take a date here?", "yes, no, maybe, i can, probably not"],
    ["What is the floor made out of?", "name a basic floor material, like wood, concrete, ground..."],
    ["If you were an actor, who would you be?", "name an actor who you would expect to be here. if its dingy drug deal motel, name someone who has used drugs. if haunted mansion, name someone who has explored haunted houses in a movie... just give the name of the actor, nothing else"],
    ["Where's a good place to smoke around here?", "nowhere, anywhere, everywhere, outside"],
    ["What do you think would happen if I touched this button?", "name something very basic"],
    ["How stressed are people around here?", "very, a little, not at all, kinda. small answers like that"],
    ["If Taylor Swift were here, what would she be doing?", "performing, exploring, having fun, travelling"],
    ["Is your family here?", "yes, no, maybe, probably, probably not"],
    ["Do you find the people here attractive?", "yes, no, a little, not really, very, not at all"],
    ["What animal is that?", "usually dog, maybe fish, wolf, leopard. something that can be said for multiple locations in the location list"],
    ["What's in that corner?", "something that can be in a lot of corners"],
    ["Why are they whispering?", "something very basic that makes sense for this location, just say why they're whispering, dont justify"],
    ["How's your phone reception?", "great, good, decent, not good, no reception"],
    ["What's the seating situation like around here?", "organized, very organized, all over the place, no seating"],
    ["Are any crimes being committed here?", "yes, no, maybe, probably, probably not"]
];

const questionPromptsMap = new Map(questionPrompts);

// Store game rooms
const gameRooms = new Map();

// Bot AI logic (only for The Mole)
class BotAI {
    constructor(botId, difficulty = 'medium') {
        this.botId = botId;
        this.difficulty = difficulty;
        this.suspicion = new Map(); 
        this.observedAnswers = [];
        this.locationHints = [];
    }

    generateResponse(question, location, isImposter, observedAnswers = [], prompt = "") {
        const questionLower = question.toLowerCase();
        
        if (isImposter) {
            return this.generateImposterResponse(question, observedAnswers, prompt);
        } else {
            return this.generateLocationResponse(question, location, prompt);
        }
    }

    generateImposterResponse(question, observedAnswers, prompt) {
        const questionLower = question.toLowerCase();
        
        if (prompt) {
            return this.generatePromptBasedResponse(question, null, true, prompt, observedAnswers);
        }
        
        if (questionLower.includes('safe') || questionLower.includes('scared')) {
            return this.randomChoice(['maybe', 'not really', 'somewhat', 'a little']);
        }
        if (questionLower.includes('weather')) {
            return this.randomChoice(['nice', 'okay', 'decent']);
        }
        if (questionLower.includes('see around')) {
            return this.randomChoice(['people', 'workers', 'visitors']);
        }
        if (questionLower.includes('meet')) {
            return this.randomChoice(['friends', 'family', 'people']);
        }
        if (questionLower.includes('celebrity')) {
            return this.randomChoice(['Tom Hanks', 'Jennifer Lawrence', 'Ryan Reynolds']);
        }
        
        return this.randomChoice(['not sure', 'maybe', 'depends', 'hard to say']);
    }

    generateLocationResponse(question, location, prompt) {
        const questionLower = question.toLowerCase();
        const locationLower = location.toLowerCase();
        
        if (prompt) {
            return this.generatePromptBasedResponse(question, location, false, prompt);
        }
        
        if (locationLower.includes('space station')) {
            if (questionLower.includes('weather')) return 'controlled';
            if (questionLower.includes('transportation')) return 'rocket';
            if (questionLower.includes('see around')) return 'equipment';
            if (questionLower.includes('safe')) return 'yes';
        }
        
        if (locationLower.includes('beach')) {
            if (questionLower.includes('weather')) return 'sunny';
            if (questionLower.includes('clothing')) return 'light clothes';
            if (questionLower.includes('see around')) return 'people';
            if (questionLower.includes('safe')) return 'yes';
        }
        
        return this.randomChoice(['good', 'nice', 'okay', 'decent']);
    }

    generatePromptBasedResponse(question, location, isImposter, prompt, observedAnswers = []) {
        const questionLower = question.toLowerCase();
        const promptLower = prompt.toLowerCase();
        
        if (promptLower.includes('yes, no, maybe, probably')) {
            return this.randomChoice(['yes', 'no', 'maybe', 'probably', 'probably not']);
        }
        
        if (promptLower.includes('good, bad, decent')) {
            if (!isImposter && location) {
                const locationLower = location.toLowerCase();
                if (locationLower.includes('burning orphanage') || locationLower.includes('prison')) return 'terrible';
                if (locationLower.includes('space station') || locationLower.includes('submarine')) return 'there is no food here';
                if (locationLower.includes('amusement park') || locationLower.includes('circus')) return 'good';
            }
            return this.randomChoice(['good', 'bad', 'decent', 'there is no food here']);
        }
        
        return this.randomChoice(['not sure', 'maybe', 'okay', 'decent']);
    }

    chooseQuestionTarget(players, suspicionLevels) {
        const availableTargets = players.filter(p => !p.isBot || p.id !== this.botId);
        
        if (availableTargets.length === 0) return null;
        
        let target = availableTargets[0];
        let maxSuspicion = 0;
        
        for (const player of availableTargets) {
            const suspicion = suspicionLevels.get(player.id) || 0;
            if (suspicion > maxSuspicion || (suspicion === maxSuspicion && Math.random() > 0.5)) {
                maxSuspicion = suspicion;
                target = player;
            }
        }
        
        return target.id;
    }

    chooseVoteTarget(players, isImposter, suspicionLevels) {
        const availableTargets = players.filter(p => !p.isBot || p.id !== this.botId);
        
        if (availableTargets.length === 0) return null;
        
        if (isImposter) {
            return this.randomChoice(availableTargets).id;
        } else {
            let mostSuspicious = availableTargets[0];
            let maxSuspicion = suspicionLevels.get(mostSuspicious.id) || 0;
            
            for (const player of availableTargets) {
                const suspicion = suspicionLevels.get(player.id) || 0;
                if (suspicion > maxSuspicion) {
                    maxSuspicion = suspicion;
                    mostSuspicious = player;
                }
            }
            
            return mostSuspicious.id;
        }
    }

    updateSuspicion(playerId, answer, question, location, isImposter) {
        if (!this.suspicion.has(playerId)) {
            this.suspicion.set(playerId, 0);
        }
        
        let suspicionChange = 0;
        const answerLower = answer.toLowerCase();
        
        if (!isImposter) {
            if (answerLower.includes('maybe') || answerLower.includes('not sure')) {
                suspicionChange += 5;
            }
            
            if (answer.split(' ').length <= 2) {
                suspicionChange += 3;
            }
        }
        
        const currentSuspicion = this.suspicion.get(playerId);
        this.suspicion.set(playerId, Math.max(0, Math.min(100, currentSuspicion + suspicionChange)));
    }

    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

class GameRoom {
    constructor(roomCode, gameType = 'mole', roomType = 'public') {
        this.roomCode = roomCode;
        this.gameType = gameType;
        this.roomType = roomType;
        this.createdAt = new Date();
        this.players = new Map();
        this.bots = new Map();
        this.gameState = {
            status: 'waiting',
            location: null,
            imposter: null,
            currentRound: 1,
            currentTurn: 0,
            questionsThisRound: 0,
            hintsThisRound: 0,
            questionsPerRound: null,
            hintsPerRound: null,
            questionQueue: [...questions],
            gameHistory: [],
            votes: new Map(),
            playerAnswers: new Map(),
            currentQuestion: null,
            readyToVoteCount: 0,
            readyToVotePlayers: new Set(),
            questionAskedThisTurn: false,
            waitingForAnswer: false
        };
        this.playerOrder = [];
        this.scoreboard = new Map();
        this.gameHistory = [];
        this.customLocations = [];
        this.botSuspicion = new Map();
    }

    generateUniqueName(requestedName) {
        const existingNames = Array.from(this.players.values()).map(p => p.name);
        
        const nameLower = requestedName.toLowerCase();
        if (nameLower.startsWith('bot') || nameLower.startsWith('b0t')) {
            requestedName = 'Player';
        }
        
        if (!existingNames.includes(requestedName)) {
            return requestedName;
        }
        
        let counter = 2;
        let uniqueName = `${requestedName} ${counter}`;
        
        while (existingNames.includes(uniqueName)) {
            counter++;
            uniqueName = `${requestedName} ${counter}`;
        }
        
        return uniqueName;
    }

    setRoomType(roomType) {
        if (['public', 'private', 'locked'].includes(roomType)) {
            this.roomType = roomType;
            return true;
        }
        return false;
    }

    isJoinable() {
        return this.roomType !== 'locked' && this.gameState.status === 'waiting' && this.players.size < 8;
    }

    addPlayer(socketId, requestedName, isHost = false) {
        const uniqueName = this.generateUniqueName(requestedName);
        
        this.players.set(socketId, {
            name: uniqueName,
            isHost,
            isReady: false,
            isBot: false,
            role: null
        });
        
        this.scoreboard.set(socketId, {
            name: uniqueName,
            gamesPlayed: 0,
            gamesWon: 0,
            timesImposter: 0,
            timesImposterWon: 0,
            questionsAnswered: 0,
            questionsAsked: 0,
            hintsGiven: 0,
            correctVotes: 0,
            totalVotes: 0,
            roundsSurvived: 0,
            score: 0
        });
        
        if (isHost) {
            this.hostId = socketId;
        }

        return uniqueName;
    }

    addBot(difficulty = 'medium') {
        if (this.gameType !== 'mole') {
            return { error: 'Bots are only available for The Mole game' };
        }
        
        const totalPlayers = this.players.size;
        if (totalPlayers >= 8) {
            return { error: 'Room is full (8/8 players)' };
        }
        
        if (this.customLocations.length > 0) {
            return { error: 'Cannot add bots when using custom locations' };
        }
        
        const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const botNames = [
            'Bot-1', 'Bot-2', 'Bot-3', 'Bot-4', 'Bot-5', 
            'Bot-6', 'Bot-7', 'Bot-8'
        ];
        
        const usedBotNames = Array.from(this.players.values())
            .filter(p => p.isBot)
            .map(p => p.name);
        
        const availableBotNames = botNames.filter(name => !usedBotNames.includes(name));
        const botName = availableBotNames.length > 0 ? availableBotNames[0] : `Bot-${this.players.size + 1}`;
        
        this.players.set(botId, {
            name: botName,
            isHost: false,
            isReady: true,
            isBot: true,
            role: null
        });
        
        this.bots.set(botId, new BotAI(botId, difficulty));
        
        this.scoreboard.set(botId, {
            name: botName,
            gamesPlayed: 0,
            gamesWon: 0,
            timesImposter: 0,
            timesImposterWon: 0,
            questionsAnswered: 0,
            questionsAsked: 0,
            hintsGiven: 0,
            correctVotes: 0,
            totalVotes: 0,
            roundsSurvived: 0,
            score: 0
        });
        
        return { success: true, botId, botName };
    }

    removeBot(botId) {
        const bot = this.players.get(botId);
        if (!bot || !bot.isBot) {
            return { error: 'Bot not found' };
        }
        
        this.players.delete(botId);
        this.bots.delete(botId);
        
        return { success: true, botName: bot.name };
    }

    removeAllBots() {
        const removedBots = [];
        
        for (const [playerId, player] of this.players.entries()) {
            if (player.isBot) {
                removedBots.push(player.name);
                this.players.delete(playerId);
                this.bots.delete(playerId);
            }
        }
        
        return removedBots;
    }

    kickPlayer(hostSocketId, targetSocketId) {
        if (hostSocketId !== this.hostId) {
            return { error: 'Only the host can kick players' };
        }

        if (hostSocketId === targetSocketId) {
            return { error: 'You cannot kick yourself' };
        }

        const targetPlayer = this.players.get(targetSocketId);
        if (!targetPlayer) {
            return { error: 'Player not found' };
        }

        this.removePlayer(targetSocketId);
        
        return { 
            success: true, 
            kickedPlayerName: targetPlayer.name,
            wasBot: targetPlayer.isBot
        };
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        this.players.delete(socketId);
        
        if (player && player.isBot) {
            this.bots.delete(socketId);
        }
        
        if (socketId === this.hostId && this.players.size > 0) {
            let newHost = null;
            for (const [id, p] of this.players.entries()) {
                if (!p.isBot) {
                    newHost = id;
                    break;
                }
            }
            
            if (!newHost) {
                newHost = this.players.keys().next().value;
            }
            
            if (newHost) {
                this.players.get(newHost).isHost = true;
                this.hostId = newHost;
            }
        }
        
        return player;
    }

    setCustomLocations(locations) {
        const removedBots = this.removeAllBots();
        this.customLocations = locations;
        return removedBots;
    }

    getLocations() {
        if (this.gameType === 'nba') {
            return nbaPlayers;
        } else if (this.gameType === 'rapper') {
            return rappers;
        } else {
            return this.customLocations.length > 0 ? this.customLocations : defaultLocations;
        }
    }

    startGame() {
        if (this.players.size < 3) return false;
        
        this.playerOrder = Array.from(this.players.keys());
        this.shuffleArray(this.playerOrder);
        
        const locations = this.getLocations();
        this.gameState.location = locations[Math.floor(Math.random() * locations.length)];
        const imposterIndex = Math.floor(Math.random() * this.playerOrder.length);
        this.gameState.imposter = this.playerOrder[imposterIndex];
        
        console.log(`${this.gameType.toUpperCase()} game started in room ${this.roomCode}:`);
        console.log(`${this.gameType === 'mole' ? 'Location' : this.gameType === 'nba' ? 'NBA Player' : 'Rapper'}: ${this.gameState.location}`);
        console.log(`Imposter: ${this.players.get(this.gameState.imposter).name}`);
        
        // Reset all players and assign roles
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            stats.gamesPlayed++;
            
            if (socketId === this.gameState.imposter) {
                player.role = 'imposter';
                stats.timesImposter++;
            } else {
                player.role = this.gameState.location;
            }
        });
        
        this.gameState.status = 'playing';
        this.gameState.currentTurn = 0;
        this.gameState.questionsThisRound = 0;
        this.gameState.hintsThisRound = 0;
        
        if (this.gameType === 'mole') {
            this.gameState.questionsPerRound = this.players.size;
        } else {
            this.gameState.hintsPerRound = this.players.size;
        }
        
        this.gameState.gameHistory = [];
        this.gameState.votes.clear();
        this.gameState.playerAnswers.clear();
        this.gameState.currentQuestion = null;
        this.gameState.readyToVoteCount = 0;
        this.gameState.readyToVotePlayers.clear();
        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        
        if (this.gameType === 'mole') {
            this.botSuspicion.clear();
            for (const [botId, bot] of this.bots.entries()) {
                bot.suspicion.clear();
                for (const playerId of this.playerOrder) {
                    if (playerId !== botId) {
                        bot.suspicion.set(playerId, 0);
                    }
                }
            }
            this.shuffleArray(this.gameState.questionQueue);
        }
        
        return true;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    getCurrentPlayer() {
        return this.playerOrder[this.gameState.currentTurn];
    }

    getNextQuestion() {
        if (this.gameState.questionQueue.length === 0) {
            this.gameState.questionQueue = [...questions];
            this.shuffleArray(this.gameState.questionQueue);
        }
        const question = this.gameState.questionQueue.shift();
        const prompt = questionPromptsMap.get(question) || "";
        return { question, prompt };
    }

    handleAskQuestion(askerId, targetId) {
        if (this.gameType !== 'mole') {
            return { error: 'Questions only available in The Mole game' };
        }
        
        if (this.getCurrentPlayer() !== askerId) {
            return { error: 'Not your turn' };
        }

        if (this.gameState.questionAskedThisTurn) {
            return { error: 'Question already asked this turn' };
        }

        if (this.gameState.waitingForAnswer) {
            return { error: 'Waiting for answer to previous question' };
        }

        const { question, prompt } = this.getNextQuestion();
        const askerName = this.players.get(askerId).name;
        const targetName = this.players.get(targetId).name;

        this.gameState.currentQuestion = {
            askerId,
            targetId,
            question,
            prompt
        };

        this.gameState.questionAskedThisTurn = true;
        this.gameState.waitingForAnswer = true;

        console.log(`Question asked in room ${this.roomCode}: ${askerName} asks ${targetName} "${question}"`);

        return {
            success: true,
            asker: askerName,
            target: targetName,
            question,
            prompt,
            askerId,
            targetId
        };
    }

    handleGiveHint(playerId, hint) {
        if (this.gameType === 'mole') {
            return { error: 'Hints not available in The Mole game' };
        }
        
        if (this.getCurrentPlayer() !== playerId) {
            return { error: 'Not your turn' };
        }

        const playerName = this.players.get(playerId).name;
        const player = this.players.get(playerId);

        console.log(`Hint given in room ${this.roomCode}: ${playerName} says "${hint}"`);

        this.gameState.gameHistory.push({
            player: playerName,
            hint: hint,
            round: this.gameState.currentRound
        });

        const playerStats = this.scoreboard.get(playerId);
        playerStats.hintsGiven++;

        this.gameState.hintsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;

        console.log(`Hints this round: ${this.gameState.hintsThisRound}/${this.gameState.hintsPerRound}`);
        console.log(`Next turn: ${this.gameState.currentTurn} (${this.players.get(this.getCurrentPlayer()).name})`);

        return {
            success: true,
            player: playerName,
            hint: hint,
            hintsThisRound: this.gameState.hintsThisRound,
            currentTurn: this.gameState.currentTurn
        };
    }

    handleBotAskQuestion(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return null;
        
        const availablePlayers = this.playerOrder.filter(id => id !== botId);
        if (availablePlayers.length === 0) return null;
        
        const targetId = bot.chooseQuestionTarget(
            availablePlayers.map(id => ({ id, isBot: this.players.get(id).isBot })), 
            bot.suspicion
        );
        
        if (!targetId) return null;
        
        return this.handleAskQuestion(botId, targetId);
    }

    generateBotAnswer(botId, question, prompt = "") {
        const bot = this.bots.get(botId);
        const player = this.players.get(botId);
        
        if (!bot || !player) return 'not sure';
        
        const isImposter = botId === this.gameState.imposter;
        const location = this.gameState.location;
        
        return bot.generateResponse(question, location, isImposter, this.gameState.gameHistory, prompt);
    }

    processAnswer(askerId, targetId, question, answer) {
        console.log(`Processing answer in room ${this.roomCode}:`);
        console.log(`Asker: ${this.players.get(askerId).name}, Target: ${this.players.get(targetId).name}`);
        console.log(`Question: ${question}, Answer: ${answer}`);
        
        this.gameState.gameHistory.push({
            asker: this.players.get(askerId).name,
            target: this.players.get(targetId).name,
            question,
            answer,
            round: this.gameState.currentRound
        });

        const askerStats = this.scoreboard.get(askerId);
        const targetStats = this.scoreboard.get(targetId);
        askerStats.questionsAsked++;
        targetStats.questionsAnswered++;

        const targetName = this.players.get(targetId).name;
        if (!this.gameState.playerAnswers.has(targetName)) {
            this.gameState.playerAnswers.set(targetName, []);
        }
        this.gameState.playerAnswers.get(targetName).push(answer);

        for (const [botId, bot] of this.bots.entries()) {
            if (botId !== targetId) {
                bot.updateSuspicion(
                    targetId, 
                    answer, 
                    question, 
                    this.gameState.location, 
                    botId === this.gameState.imposter
                );
            }
        }

        this.gameState.questionAskedThisTurn = false;
        this.gameState.waitingForAnswer = false;
        this.gameState.currentQuestion = null;

        this.gameState.questionsThisRound++;
        this.gameState.currentTurn = (this.gameState.currentTurn + 1) % this.playerOrder.length;

        console.log(`Questions this round: ${this.gameState.questionsThisRound}/${this.gameState.questionsPerRound}`);
        console.log(`Next turn: ${this.gameState.currentTurn} (${this.players.get(this.getCurrentPlayer()).name})`);
    }

    readyToVote(playerId) {
        const player = this.players.get(playerId);
        if (!player || player.isHost || player.isBot) {
            // Only non-host, non-bot players can ready up
            return;
        }
        if (this.gameState.readyToVotePlayers.has(playerId)) {
            console.log(`Player ${player.name} already marked ready to vote`);
            return;
        }
        this.gameState.readyToVotePlayers.add(playerId);
        this.gameState.readyToVoteCount = this.gameState.readyToVotePlayers.size;
        // Calculate required count: all non-host, non-bot players
        const requiredCount = Array.from(this.players.values()).filter(p => !p.isHost && !p.isBot).length;
        console.log(`${player.name} is ready to vote. Count: ${this.gameState.readyToVoteCount}/${requiredCount}`);
        // Emit ready count update
        if (this.roomCode) {
            io.to(this.roomCode).emit('ready_count_updated', {
                readyCount: this.gameState.readyToVoteCount,
                requiredCount
            });
        }
        if (this.gameState.readyToVoteCount >= requiredCount) {
            console.log('Enough players ready, starting voting phase');
            this.startVoting();
            // Notify all clients to show voting
            if (this.roomCode) {
                io.to(this.roomCode).emit('game_updated', this.getGameStateForPlayer(this.hostId));
            }
        }
    }

    startVoting() {
        this.gameState.status = 'voting';
        this.gameState.votes.clear();
        console.log(`Voting started in room ${this.roomCode}`);
    }

    submitVote(voterId, targetId, reasoning = null) {
        const voter = this.players.get(voterId);
        if (!voter || voter.isBot) return;
        if (voterId === targetId) {
            console.log(`Player ${this.players.get(voterId).name} tried to vote for themselves - ignored`);
            return;
        }
        
        console.log(`Vote submitted: ${this.players.get(voterId).name} votes for ${this.players.get(targetId)?.name || 'Unknown'}`);
        this.gameState.votes.set(voterId, targetId);
        
        const voterStats = this.scoreboard.get(voterId);
        voterStats.totalVotes++;
        if (targetId === this.gameState.imposter) {
            voterStats.correctVotes++;
        }
        
        // Count only human players (not bots)
        const humanPlayerCount = Array.from(this.players.values()).filter(p => !p.isBot).length;
        if (this.gameState.votes.size === humanPlayerCount) {
            console.log('All votes received, processing results');
            this.processVotingResults();
        }
    }

    handleBotVote(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return;
        
        const isImposter = botId === this.gameState.imposter;
        const availablePlayers = this.playerOrder.filter(id => id !== botId);
        
        const targetId = bot.chooseVoteTarget(
            availablePlayers.map(id => ({ id, isBot: this.players.get(id).isBot })),
            isImposter,
            bot.suspicion
        );
        
        if (targetId) {
            this.submitVote(botId, targetId, 'Bot reasoning');
        }
    }

    processVotingResults() {
        const voteCounts = new Map();
        
        this.gameState.votes.forEach((targetId) => {
            const count = voteCounts.get(targetId) || 0;
            voteCounts.set(targetId, count + 1);
        });

        console.log('Vote counts:', Array.from(voteCounts.entries()).map(([id, count]) => 
            `${this.players.get(id)?.name || 'Unknown'}: ${count}`
        ));

        let maxVotes = 0;
        let mostVoted = null;
        voteCounts.forEach((count, playerId) => {
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = playerId;
            }
        });

        const requiredVotes = this.players.size - 1;
        console.log(`Required votes: ${requiredVotes}, Max votes: ${maxVotes}`);
        
        if (maxVotes >= requiredVotes && mostVoted) {
            const wasImposter = mostVoted === this.gameState.imposter;
            console.log(`${this.players.get(mostVoted).name} got enough votes. Was imposter: ${wasImposter}`);
            
            if (wasImposter) {
                const winnerType = this.gameType === 'mole' ? 'location_wins' : 'player_wins';
                this.endGame(winnerType, `${this.players.get(mostVoted).name} was correctly identified as the imposter!`);
            } else {
                this.endGame('imposter_wins', `${this.players.get(mostVoted).name} was innocent. The imposter wins!`);
            }
        } else {
            console.log('Votes too spread out, imposter wins by default');
            const teamType = this.gameType === 'mole' ? 'Location team' : 'Player team';
            this.endGame('imposter_wins', `${teamType} failed to coordinate their votes. The imposter wins!`);
        }
    }

    imposterGuess(guess) {
        console.log(`Imposter guess: ${this.players.get(this.gameState.imposter).name} guessed ${guess} (correct: ${this.gameState.location})`);
        const wasCorrect = guess === this.gameState.location;
        
        if (wasCorrect) {
            const itemType = this.gameType === 'nba' ? 'NBA player' : 'rapper';
            this.endGame('imposter_wins', `Imposter correctly guessed the ${itemType}: ${this.gameState.location}`);
        } else {
            const winnerType = 'player_wins';
            const itemType = this.gameType === 'nba' ? 'NBA player' : 'rapper';
            this.endGame(winnerType, `Imposter guessed wrong! ${itemType} was ${this.gameState.location}, not ${guess}`);
        }
    }

    imposterReveal(locationGuess) {
        console.log(`Imposter reveal: ${this.players.get(this.gameState.imposter).name} guessed ${locationGuess} (correct: ${this.gameState.location})`);
        const wasCorrect = locationGuess === this.gameState.location;
        
        if (wasCorrect) {
            this.endGame('imposter_wins', `Imposter correctly guessed the location: ${this.gameState.location}`);
        } else {
            this.endGame('location_wins', `Imposter guessed wrong! Location was ${this.gameState.location}, not ${locationGuess}`);
        }
    }

    endGame(winner, message) {
        if (this.gameState.status === 'ended') {
            console.warn('endGame called more than once – ignored.');
            return;
        }
    
        console.log(`Game ended in room ${this.roomCode}: ${winner} - ${message}`);
        this.gameState.status = 'ended';
        this.gameState.gameResult = {
            winner,
            message,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name
        };

        this.updateScoreboardAfterGame(winner);
        this.saveGameToHistory();
        
        console.log(`Game state after ending: status=${this.gameState.status}, winner=${winner}`);
    }

    updateScoreboardAfterGame(winner) {
        console.log(`Updating scoreboard for winner: ${winner}`);
        
        this.players.forEach((player, socketId) => {
            const stats = this.scoreboard.get(socketId);
            const isImposter = socketId === this.gameState.imposter;
            
            let didWin = false;
            
            if (winner === 'imposter_wins') {
                if (isImposter) {
                    didWin = true;
                    stats.timesImposterWon++;
                    console.log(`${player.name} (imposter) gets win point`);
                }
            } else if (winner === 'location_wins' || winner === 'player_wins') {
                if (!isImposter) {
                    didWin = true;
                    console.log(`${player.name} (${this.gameType === 'mole' ? 'location' : 'player'} team) gets win point`);
                }
            }
            
            if (didWin) {
                stats.gamesWon++;
            }
            
            stats.score = stats.gamesWon;
            
            console.log(`${player.name} final stats: ${stats.gamesWon}/${stats.gamesPlayed} wins, score: ${stats.score}`);
        });
    }

    saveGameToHistory() {
        const gameRecord = {
            gameNumber: this.gameHistory.length + 1,
            gameType: this.gameType,
            date: new Date(),
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name,
            winner: this.gameState.gameResult.winner,
            rounds: this.gameState.currentRound,
            players: Array.from(this.players.entries()).map(([id, player]) => ({
                name: player.name,
                role: player.role,
                wasImposter: id === this.gameState.imposter,
                isBot: player.isBot
            })),
            finalScores: Array.from(this.scoreboard.entries()).map(([id, stats]) => ({
                name: stats.name,
                score: stats.score
            }))
        };
        
        this.gameHistory.push(gameRecord);
        console.log(`Game saved to history: ${this.gameType.toUpperCase()} Game #${gameRecord.gameNumber}`);
    }

    getGameStats() {
        return { totalGames: 0, totalQuestions: 0, totalVotes: 0 };
    }

    getScoreboardData() {
        return Array.from(this.scoreboard.entries())
            .map(([socketId, stats]) => ({
                ...stats,
                isOnline: this.players.has(socketId),
                isBot: this.players.get(socketId)?.isBot || false
            }))
            .sort((a, b) => b.score - a.score);
    }

    getGameStateForPlayer(socketId) {
        const player = this.players.get(socketId);
        const isImposter = socketId === this.gameState.imposter;
        
        return {
            status: this.gameState.status,
            location: this.gameState.location,
            currentRound: this.gameState.currentRound,
            currentTurn: this.gameState.currentTurn,
            questionsThisRound: this.gameState.questionsThisRound,
            hintsThisRound: this.gameState.hintsThisRound,
            questionsPerRound: this.gameState.questionsPerRound,
            hintsPerRound: this.gameState.hintsPerRound,
            gameHistory: this.gameState.gameHistory,
            currentQuestion: this.gameState.currentQuestion,
            readyToVoteCount: this.gameState.readyToVoteCount,
            readyToVotePlayers: Array.from(this.gameState.readyToVotePlayers),
            questionAskedThisTurn: this.gameState.questionAskedThisTurn,
            waitingForAnswer: this.gameState.waitingForAnswer,
            gameType: this.gameType,
            roomType: this.roomType,
            playerRole: player?.role,
            isImposter,
            playerOrder: this.playerOrder.map(id => ({
                id,
                name: this.players.get(id).name,
                isYou: id === socketId,
                isBot: this.players.get(id).isBot
            })),
            imposter: this.gameState.status === 'ended' ? this.gameState.imposter : null,
            scoreboard: this.getScoreboardData(),
            gameStats: this.getGameStats(),
            botCount: this.bots.size,
            usingCustomLocations: this.customLocations.length > 0
        };
    }
}

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    let currentRoom = null;
    let playerName = null;
    let gameType = null;

    socket.on('create_room', (data) => {
        const { playerName: name, gameType: type, roomType = 'public' } = data;
        
        if (!name || !type) {
            socket.emit('error', { message: 'Name and game type are required' });
            return;
        }

        const roomCode = generateRoomCode();
        const room = new GameRoom(roomCode, type, roomType);
        
        const actualName = room.addPlayer(socket.id, name, true);
        gameRooms.set(roomCode, room);
        
        socket.join(roomCode);
        currentRoom = roomCode;
        playerName = actualName;
        gameType = type;
        
        console.log(`Room created: ${roomCode} (${type}) by ${actualName}`);
        
        socket.emit('room_created', {
            roomCode,
            isHost: true,
            actualName,
            gameType: type,
            roomType: roomType
        });
        
        io.to(roomCode).emit('room_updated', {
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id,
                name: player.name,
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('join_room', (data) => {
        const { roomCode, playerName: name, gameType: type } = data;
        
        if (!name || !roomCode) {
            socket.emit('error', { message: 'Name and room code are required' });
            return;
        }

        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        if (!room.isJoinable()) {
            socket.emit('error', { message: 'Room is not joinable' });
            return;
        }

        const actualName = room.addPlayer(socket.id, name, false);
        socket.join(roomCode);
        currentRoom = roomCode;
        playerName = actualName;
        gameType = type || room.gameType;
        
        console.log(`Player joined: ${actualName} joined ${roomCode}`);
        
        socket.emit('room_joined', {
            roomCode,
            isHost: false,
            actualName,
            gameType: room.gameType,
            roomType: room.roomType
        });
        
        io.to(roomCode).emit('room_updated', {
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id,
                name: player.name,
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('get_public_lobbies', () => {
        const publicLobbies = Array.from(gameRooms.values())
            .filter(room => room.roomType === 'public' && room.isJoinable())
            .map(room => ({
                roomCode: room.roomCode,
                gameType: room.gameType,
                playerCount: room.players.size,
                createdAt: room.createdAt
            }))
            .sort((a, b) => b.createdAt - a.createdAt);
        
        socket.emit('public_lobbies', publicLobbies);
    });

    socket.on('change_room_type', (data) => {
        const { roomType } = data;
        const room = gameRooms.get(currentRoom);
        
        if (!room || room.hostId !== socket.id) {
            socket.emit('error', { message: 'Only the host can change room type' });
            return;
        }
        
        if (room.setRoomType(roomType)) {
            io.to(currentRoom).emit('room_updated', {
                players: Array.from(room.players.entries()).map(([id, player]) => ({
                    id,
                    name: player.name,
                    isHost: player.isHost,
                    isReady: player.isReady,
                    isBot: player.isBot
                })),
                scoreboard: room.getScoreboardData(),
                roomType: room.roomType,
                botCount: room.bots.size,
                usingCustomLocations: room.customLocations.length > 0,
                gameType: room.gameType
            });
        }
    });

    socket.on('toggle_ready', () => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        const player = room.players.get(socket.id);
        if (!player) return;
        
        player.isReady = !player.isReady;
        
        io.to(currentRoom).emit('room_updated', {
            players: Array.from(room.players.entries()).map(([id, p]) => ({
                id,
                name: p.name,
                isHost: p.isHost,
                isReady: p.isReady,
                isBot: p.isBot
            })),
            scoreboard: room.getScoreboardData(),
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('start_game', () => {
        const room = gameRooms.get(currentRoom);
        if (!room || room.hostId !== socket.id) return;
        
        if (room.startGame()) {
            // Emit game started to all players in the room
            io.to(currentRoom).emit('game_started', room.getGameStateForPlayer(socket.id));
            
            // Also emit individual game states to each player
            room.players.forEach((player, playerSocketId) => {
                const playerSocket = io.sockets.sockets.get(playerSocketId);
                if (playerSocket) {
                    playerSocket.emit('game_started', room.getGameStateForPlayer(playerSocketId));
                }
            });
        }
    });

    socket.on('ask_question', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        const result = room.handleAskQuestion(socket.id, data.targetId);
        if (result.success) {
            io.to(currentRoom).emit('question_asked', result);
            
            const targetSocket = io.sockets.sockets.get(data.targetId);
            if (targetSocket) {
                targetSocket.emit('answer_question', {
                    question: result.question,
                    prompt: result.prompt,
                    asker: result.asker
                });
            }
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('submit_answer', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        const { question, answer } = data;
        const currentQuestion = room.gameState.currentQuestion;
        
        if (currentQuestion && currentQuestion.targetId === socket.id) {
            room.processAnswer(currentQuestion.askerId, socket.id, question, answer);
            
            io.to(currentRoom).emit('answer_submitted', {
                asker: room.players.get(currentQuestion.askerId).name,
                target: room.players.get(socket.id).name,
                question,
                answer
            });
            
            io.to(currentRoom).emit('game_state_update', room.getGameStateForPlayer(socket.id));
        }
    });

    socket.on('give_hint', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        const result = room.handleGiveHint(socket.id, data.hint);
        if (result.success) {
            io.to(currentRoom).emit('hint_given', result);
            io.to(currentRoom).emit('game_state_update', room.getGameStateForPlayer(socket.id));
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('ready_to_vote', () => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        room.readyToVote(socket.id);
        io.to(currentRoom).emit('game_state_update', room.getGameStateForPlayer(socket.id));
    });

    socket.on('submit_vote', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        room.submitVote(socket.id, data.targetId, data.reasoning);
        
        if (room.gameState.status === 'ended') {
            io.to(currentRoom).emit('game_ended', {
                winner: room.gameState.gameResult.winner,
                message: room.gameState.gameResult.message,
                location: room.gameState.gameResult.location,
                imposter: room.gameState.gameResult.imposter,
                scoreboard: room.getScoreboardData()
            });
        }
    });

    socket.on('imposter_guess', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        room.imposterGuess(data.guess);
        // Always emit game_ended after processing
        if (room.gameState && room.gameState.status === 'ended') {
            io.to(currentRoom).emit('game_ended', {
                winner: room.gameState.gameResult.winner,
                message: room.gameState.gameResult.message,
                location: room.gameState.gameResult.location,
                imposter: room.gameState.gameResult.imposter,
                scoreboard: room.getScoreboardData()
            });
        }
    });

    socket.on('imposter_reveal', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        room.imposterReveal(data.locationGuess);
        // Always emit game_ended after processing
        if (room.gameState && room.gameState.status === 'ended') {
            io.to(currentRoom).emit('game_ended', {
                winner: room.gameState.gameResult.winner,
                message: room.gameState.gameResult.message,
                location: room.gameState.gameResult.location,
                imposter: room.gameState.gameResult.imposter,
                scoreboard: room.getScoreboardData()
            });
        }
    });

    socket.on('add_bot', () => {
        const room = gameRooms.get(currentRoom);
        if (!room || room.hostId !== socket.id) return;
        
        const result = room.addBot();
        if (result.success) {
            io.to(currentRoom).emit('bot_added', result);
            io.to(currentRoom).emit('room_updated', {
                players: Array.from(room.players.entries()).map(([id, player]) => ({
                    id,
                    name: player.name,
                    isHost: player.isHost,
                    isReady: player.isReady,
                    isBot: player.isBot
                })),
                scoreboard: room.getScoreboardData(),
                roomType: room.roomType,
                botCount: room.bots.size,
                usingCustomLocations: room.customLocations.length > 0,
                gameType: room.gameType
            });
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('remove_bot', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room || room.hostId !== socket.id) return;
        
        const result = room.removeBot(data.botId);
        if (result.success) {
            io.to(currentRoom).emit('bot_removed', result);
            io.to(currentRoom).emit('room_updated', {
                players: Array.from(room.players.entries()).map(([id, player]) => ({
                    id,
                    name: player.name,
                    isHost: player.isHost,
                    isReady: player.isReady,
                    isBot: player.isBot
                })),
                scoreboard: room.getScoreboardData(),
                roomType: room.roomType,
                botCount: room.bots.size,
                usingCustomLocations: room.customLocations.length > 0,
                gameType: room.gameType
            });
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('kick_player', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room) return;
        
        const result = room.kickPlayer(socket.id, data.targetId);
        if (result.success) {
            const targetSocket = io.sockets.sockets.get(data.targetId);
            if (targetSocket) {
                targetSocket.emit('kicked', { message: 'You were kicked from the room' });
                targetSocket.leave(currentRoom);
            }
            
            io.to(currentRoom).emit('player_kicked', {
                kickedPlayerName: result.kickedPlayerName,
                wasBot: result.wasBot,
                players: Array.from(room.players.entries()).map(([id, player]) => ({
                    id,
                    name: player.name,
                    isHost: player.isHost,
                    isReady: player.isReady,
                    isBot: player.isBot
                })),
                scoreboard: room.getScoreboardData(),
                roomType: room.roomType,
                botCount: room.bots.size
            });
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    socket.on('set_custom_locations', (data) => {
        const room = gameRooms.get(currentRoom);
        if (!room || room.hostId !== socket.id) return;
        
        const removedBots = room.setCustomLocations(data.locations);
        
        io.to(currentRoom).emit('custom_locations_set', {
            locations: data.locations,
            removedBots
        });
        
        io.to(currentRoom).emit('room_updated', {
            players: Array.from(room.players.entries()).map(([id, player]) => ({
                id,
                name: player.name,
                isHost: player.isHost,
                isReady: player.isReady,
                isBot: player.isBot
            })),
            scoreboard: room.getScoreboardData(),
            roomType: room.roomType,
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        if (currentRoom) {
            const room = gameRooms.get(currentRoom);
            if (room) {
                const removedPlayer = room.removePlayer(socket.id);
                
                if (removedPlayer) {
                    console.log(`${removedPlayer.name} left room ${currentRoom}`);
                    
                    if (room.players.size === 0) {
                        console.log(`Room ${currentRoom} is empty, removing it`);
                        gameRooms.delete(currentRoom);
                    } else {
                        io.to(currentRoom).emit('player_left', {
                            playerName: removedPlayer.name,
                            players: Array.from(room.players.entries()).map(([id, player]) => ({
                                id,
                                name: player.name,
                                isHost: player.isHost,
                                isReady: player.isReady,
                                isBot: player.isBot
                            })),
                            scoreboard: room.getScoreboardData(),
                            roomType: room.roomType,
                            botCount: room.bots.size
                        });
                    }
                }
            }
        }
    });
});

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});