const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const allGameData = [];

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced lobby endpoint to get public lobbies
app.get('/api/public-lobbies', (req, res) => {
    const gameType = req.query.gameType; // Get game type from query parameter
    const publicLobbies = [];
    
    for (const [roomCode, room] of gameRooms.entries()) {
        if (room.roomType === 'public' && room.gameState.status === 'waiting') {
            // Filter by game type if specified
            if (gameType && room.gameType !== gameType) {
                continue;
            }
            
            publicLobbies.push({
                roomCode: room.roomCode,
                gameType: room.gameType,
                playerCount: room.players.size,
                maxPlayers: 8,
                hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                usingCustomLocations: room.customLocations.length > 0,
                botCount: room.bots.size,
                createdAt: room.createdAt
            });
        }
    }
    
    // Sort by creation time (newest first) and limit to 10
    publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(publicLobbies.slice(0, 10));
});

app.get('/download-all-games', (req, res) => {
    if (allGameData.length === 0) {
        res.status(404).send('No game data available yet');
        return;
    }

    let output = '';
    allGameData.forEach(gameData => {
        output += '============================================================\n';
        output += `GAME ${gameData.gameNumber}\n`;
        output += `Game Type: ${gameData.gameType}\n`;
        output += `Timestamp: ${gameData.timestamp}\n`;
        output += `Room: ${gameData.roomCode}\n`;
        output += `${gameData.gameType === 'mole' ? 'Location' : gameData.gameType === 'nba' ? 'NBA Player' : 'Rapper'}: ${gameData.location}\n`;
        output += `Imposter: ${gameData.imposter}\n`;
        output += `Outcome: ${gameData.outcome}\n`;
        output += '\n';
        
        if (gameData.gameType === 'mole') {
            output += 'QUESTIONS AND ANSWERS:\n';
            gameData.playerQAs.forEach(qa => {
                output += `${qa.asker} asks ${qa.target}: "${qa.question}"\n`;
                output += `${qa.target} (${qa.targetRole}): "${qa.answer}"\n`;
                output += '\n';
            });
        } else {
            output += 'HINTS:\n';
            gameData.playerHints.forEach(hint => {
                output += `${hint.player} (${hint.playerRole}): "${hint.hint}"\n`;
                output += '\n';
            });
        }
        
        output += 'VOTES:\n';
        gameData.playerVotes.forEach(vote => {
            const correctText = vote.wasCorrect ? 'CORRECT' : 'WRONG';
            output += `${vote.voter} votes for ${vote.votedFor} (${correctText})\n`;
            if (vote.reasoning) {
                output += `Reasoning: ${vote.reasoning}\n`;
            }
        });
        
        output += '============================================================\n\n';
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `game-collection-all-games-${timestamp}.txt`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(output);
});

// Game configuration
const defaultLocations = [
    "Circus", "Amusement Park", "Crashing Airplane", "Titanic",
    "Burning Orphanage", "Dingy Motel Drug Deal", "Prison", "Safari",
    "Zombie Apocalypse", "Organ-Harvesting Hospital", "Nuclear Submarine",
    "Daycare", "Amazon Rainforest", "Concert Hall", "Space Station",
    "High School", "Haunted Mansion", "Beach"
];

// NEW: Player lists for new game types
const nbaPlayers = ["Lebron James", "Kawhi Leonard", "Steph Curry", "Klay Thompson", "Damian Lillard", "Giannis Antetokounmpo", 
    "Chris Paul", "Zion Williamson", "Ja Morant", "Scottie Barnes", "Chet Holmgren", "Paolo Banchero", 
    "Franz Wagner", "Gradey Dick", "Kyle Lowry", "DeMar DeRozan", "CJ McCollum", "Anthony Davis", 
    "Fred VanVleet", "Miles Bridges", "James Harden", "Russell Westbrook", "Joel Embiid", "Tyrese Maxey", 
    "Mikal Bridges", "Jalen Brunson", "Julius Randle", "OG Anunoby", "Mitchell Robinson", "Kelly Oubre Jr.", 
    "Donte DiVincenzo", "Josh Hart", "Immanuel Quickley", "RJ Barrett", "Jakob Poeltl", "Cam Thomas", 
    "Ben Simmons", "Nic Claxton", "Spencer Dinwiddie", "Jayson Tatum", "Jaylen Brown", "Derrick White", 
    "Jrue Holiday", "Kristaps Porzingis", "Al Horford", "Gary Trent Jr.", "Brook Lopez", "Khris Middleton", 
    "Bobby Portis", "Tyrese Haliburton", "Pascal Siakam", "Myles Turner", "Bennedict Mathurin", "Obi Toppin", 
    "Darius Garland", "Donovan Mitchell", "Evan Mobley", "Jarrett Allen", "DeMar DeRozan", "Zach LaVine", 
    "Nikola Vucevic", "Josh Giddey", "Cade Cunningham", "Jaden Ivey", "Ausar Thompson", "Jalen Duren", 
    "Tobias Harris", "Jimmy Butler", "Bam Adebayo", "Terry Rozier", "Tyler Herro", "Duncan Robinson", 
    "Trae Young", "Clint Capela", "Zaccharie Risacher", "LaMelo Ball", "Miles Bridges", "Brandon Miller", 
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
    "Deni Avdija", "Cooper Flagg"];

const rappers = ["Drake", "Future", "21 Savage", "Travis Scott", "Kanye", "XXXTentacion", "Nav", "Roddy Ricch", "A Boogie wit da Hoodie", 
    "Post Malone", "Lil Baby", "Lil Wayne", "Baby Keem", "Kendrick Lamar", "Lil Tecca", "Don Toliver", "Chris Brown", 
    "Coi Leray", "Nicki Minaj", "Cardi B", "DaBaby", "J. Cole", "Eminem", "Gunna", "Quavo", "Jay-Z", "Juice WRLD", "Big Black Banana Man", 
    "The Weeknd", "Kid Cudi", "Kodak Black", "Lil Durk", "Lil Skies", "Lil Tjay", "Lil Uzi Vert", "Meek Mill", "Nas", "PARTYNEXTDOOR",
    "Offset", "PARTYNEXTDOOR", "Playboi Carti", "Polo G", "Pop Smoke", "Swae Lee", "Tory Lanez", "Young Thug", "Ty Dolla $ign", "Nicki Minaj"];

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

// Bot AI logic (only for The Mole - unchanged)
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
        this.gameType = gameType; // Track game type
        this.roomType = roomType; // NEW: Track room type (public, private, locked)
        this.createdAt = new Date(); // NEW: Track creation time for sorting
        this.players = new Map();
        this.bots = new Map();
        this.disconnectedPlayers = new Map(); // NEW: Track disconnected players
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
        
        this.currentGameData = {
            gameNumber: 1,
            gameType: gameType,
            location: null,
            imposter: null,
            playerQAs: [],
            playerHints: [],
            playerVotes: [],
            outcome: null,
            timestamp: null,
            roomCode: this.roomCode
        };
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

    // NEW: Set room type instead of just locked
    setRoomType(roomType) {
        if (['public', 'private', 'locked'].includes(roomType)) {
            this.roomType = roomType;
            return true;
        }
        return false;
    }

    // NEW: Check if room is joinable
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

    // Bot functions only work for The Mole
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
                const newHostPlayer = this.players.get(newHost);
                newHostPlayer.isHost = true;
                newHostPlayer.isReady = false; // Remove ready status when becoming host
                this.hostId = newHost;
            }
        }
        
        return player;
    }

    // NEW: Handle player disconnection during game
    handlePlayerDisconnect(socketId) {
        const player = this.players.get(socketId);
        if (!player) return null;
        
        // If game is not in progress, just remove the player
        if (this.gameState.status !== 'playing') {
            return this.removePlayer(socketId);
        }
        
        // Check if disconnecting player is the imposter
        if (socketId === this.gameState.imposter) {
            this.endGame('imposter_left', 'Imposter left the game! No one wins.');
            return player;
        }
        
        // Store disconnected player info for potential reconnection
        this.disconnectedPlayers.set(player.name, {
            socketId: socketId,
            player: player,
            disconnectTime: Date.now(),
            wasCurrentTurn: this.getCurrentPlayer() === socketId,
            turnWhenDisconnected: this.gameState.currentTurn
        });
        
        // Remove from active players but keep in scoreboard
        this.players.delete(socketId);
        
        // Update player order to remove disconnected player
        this.playerOrder = this.playerOrder.filter(id => id !== socketId);
        
        // Adjust current turn if needed
        if (this.playerOrder.length > 0) {
            this.gameState.currentTurn = this.gameState.currentTurn % this.playerOrder.length;
        }
        
        console.log(`Player ${player.name} disconnected from room ${this.roomCode}. Can reconnect within 60 seconds.`);
        
        return player;
    }

    // NEW: Handle player reconnection
    handlePlayerReconnect(socketId, playerName) {
        const disconnectedInfo = this.disconnectedPlayers.get(playerName);
        if (!disconnectedInfo) return null;
        
        const timeSinceDisconnect = Date.now() - disconnectedInfo.disconnectTime;
        if (timeSinceDisconnect > 60000) { // 60 seconds
            console.log(`Player ${playerName} reconnection attempt too late (${timeSinceDisconnect}ms)`);
            this.disconnectedPlayers.delete(playerName);
            return null;
        }
        
        // Restore player
        const player = disconnectedInfo.player;
        this.players.set(socketId, player);
        this.disconnectedPlayers.delete(playerName);
        
        // Update player order to include reconnected player
        if (!this.playerOrder.includes(socketId)) {
            this.playerOrder.push(socketId);
        }
        
        console.log(`Player ${playerName} reconnected to room ${this.roomCode}`);
        
        return player;
    }

    // NEW: Check for expired disconnections
    cleanupExpiredDisconnections() {
        const now = Date.now();
        const expiredPlayers = [];
        
        for (const [playerName, info] of this.disconnectedPlayers.entries()) {
            if (now - info.disconnectTime > 60000) {
                expiredPlayers.push(playerName);
            }
        }
        
        expiredPlayers.forEach(playerName => {
            this.disconnectedPlayers.delete(playerName);
            console.log(`Player ${playerName} reconnection window expired`);
        });
        
        return expiredPlayers;
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
        
        this.currentGameData = {
            gameNumber: this.gameHistory.length + 1,
            gameType: this.gameType,
            location: this.gameState.location,
            imposter: this.players.get(this.gameState.imposter).name,
            playerQAs: [],
            playerHints: [],
            playerVotes: [],
            outcome: null,
            timestamp: new Date().toISOString(),
            roomCode: this.roomCode
        };
        
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
        
        // Initialize bot suspicion tracking (only for The Mole)
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

    // The Mole question handling (unchanged)
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

    // NEW: Hint handling for NBA/Rapper games
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

        // Save hint to game data
        this.currentGameData.playerHints.push({
            player: playerName,
            hint: hint,
            playerRole: player.role,
            wasPlayerImposter: playerId === this.gameState.imposter,
            round: this.gameState.currentRound
        });

        // Save to game history
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

        const targetPlayer = this.players.get(targetId);
        this.currentGameData.playerQAs.push({
            asker: this.players.get(askerId).name,
            target: targetPlayer.name,
            question: question,
            answer: answer,
            targetRole: targetPlayer.role,
            wasTargetImposter: targetId === this.gameState.imposter,
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

        // Update bot suspicion levels
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
        if (this.gameState.readyToVotePlayers.has(playerId)) {
            console.log(`Player ${this.players.get(playerId).name} already marked ready to vote`);
            return;
        }

        this.gameState.readyToVotePlayers.add(playerId);
        this.gameState.readyToVoteCount++;
        
        console.log(`${this.players.get(playerId).name} is ready to vote. Count: ${this.gameState.readyToVoteCount}/${this.players.size - 1}`);

        if (this.gameState.readyToVoteCount >= this.players.size - 1) {
            console.log('Enough players ready, starting voting phase');
            this.startVoting();
        }
    }

    startVoting() {
        this.gameState.status = 'voting';
        this.gameState.votes.clear();
        console.log(`Voting started in room ${this.roomCode}`);
    }

    submitVote(voterId, targetId, reasoning = null) {
        if (voterId === targetId) {
            console.log(`Player ${this.players.get(voterId).name} tried to vote for themselves - ignored`);
            return;
        }
        
        console.log(`Vote submitted: ${this.players.get(voterId).name} votes for ${this.players.get(targetId)?.name || 'Unknown'}`);
        this.gameState.votes.set(voterId, targetId);
        
        const voterPlayer = this.players.get(voterId);
        const targetPlayer = this.players.get(targetId);
        this.currentGameData.playerVotes.push({
            voter: voterPlayer.name,
            votedFor: targetPlayer?.name || 'Unknown',
            wasCorrect: targetId === this.gameState.imposter,
            voterWasImposter: voterId === this.gameState.imposter,
            reasoning: reasoning || null
        });
        
        const voterStats = this.scoreboard.get(voterId);
        voterStats.totalVotes++;
        if (targetId === this.gameState.imposter) {
            voterStats.correctVotes++;
        }
        
        if (this.gameState.votes.size === this.players.size) {
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

    // NEW: Handle imposter guess for NBA/Rapper games
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

    // The Mole location reveal (unchanged)
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

        this.currentGameData.outcome = winner;
        this.updateScoreboardAfterGame(winner);
        this.saveGameToHistory();
        this.saveGameData();
        
        console.log(`Game state after ending: status=${this.gameState.status}, winner=${winner}`);
    }

    saveGameData() {
        if (this.gameType === 'mole' && this.currentGameData.playerQAs.length === 0) {
            console.log('No Mole game data to save');
            return;
        }
        if (this.gameType !== 'mole' && this.currentGameData.playerHints.length === 0) {
            console.log('No hint game data to save');
            return;
        }
    
        allGameData.push(JSON.parse(JSON.stringify(this.currentGameData)));
        console.log(`📊 Total games stored: ${allGameData.length} (available for download)`);
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
            ...this.gameState,
            gameType: this.gameType,
            roomType: this.roomType, // NEW: Include room type
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
            readyToVoteCount: this.gameState.readyToVoteCount,
            readyToVotePlayers: Array.from(this.gameState.readyToVotePlayers),
            gameStats: this.getGameStats(),
            botCount: this.bots.size,
            usingCustomLocations: this.customLocations.length > 0
        };
    }
}

function generateRoomCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return result;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // NEW: Get public lobbies
    socket.on('get_public_lobbies', ({ gameType }) => {
        const publicLobbies = [];
        
        for (const [roomCode, room] of gameRooms.entries()) {
            if (room.roomType === 'public' && room.gameState.status === 'waiting') {
                // Filter by game type if specified
                if (gameType && room.gameType !== gameType) {
                    continue;
                }
                
                publicLobbies.push({
                    roomCode: room.roomCode,
                    gameType: room.gameType,
                    playerCount: room.players.size,
                    maxPlayers: 8,
                    hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                    usingCustomLocations: room.customLocations.length > 0,
                    botCount: room.bots.size,
                    createdAt: room.createdAt
                });
            }
        }
        
        // Sort by creation time (newest first) and limit to 10
        publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        socket.emit('public_lobbies', publicLobbies.slice(0, 10));
    });

    socket.on('create_room', ({ playerName, gameType = 'mole', roomType = 'public' }) => {
        const roomCode = generateRoomCode();
        const room = new GameRoom(roomCode, gameType, roomType);
        const actualName = room.addPlayer(socket.id, playerName, true);
        gameRooms.set(roomCode, room);
        
        socket.join(roomCode);
        socket.emit('room_created', { 
            roomCode, 
            isHost: true, 
            actualName, 
            gameType,
            roomType 
        });
        socket.emit('room_updated', { 
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

    socket.on('join_room', ({ roomCode, playerName, gameType }) => {
        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        // Check if trying to join with wrong game type
        if (room.gameType !== gameType) {
            const gameNames = {
                'mole': 'The Mole',
                'nba': 'NBA Imposter', 
                'rapper': 'Rapper Imposter'
            };
            socket.emit('error', `This room is playing ${gameNames[room.gameType]}, not ${gameNames[gameType]}`);
            return;
        }
        
        // Check if player is trying to reconnect (was previously disconnected)
        const wasDisconnected = room.disconnectedPlayers.has(playerName);
        
        // NEW: Check room type and joinability (allow reconnection even if game in progress)
        if (!wasDisconnected && !room.isJoinable()) {
            if (room.roomType === 'locked') {
                socket.emit('error', 'Room is locked');
            } else if (room.players.size >= 8) {
                socket.emit('error', 'Room is full');
            } else if (room.gameState.status !== 'waiting') {
                socket.emit('error', 'Game already in progress');
            } else {
                socket.emit('error', 'Cannot join room');
            }
            return;
        }

        // If player was disconnected, handle reconnection
        if (wasDisconnected) {
            const reconnectedPlayer = room.handlePlayerReconnect(socket.id, playerName);
            if (!reconnectedPlayer) {
                socket.emit('error', 'Reconnection failed. Time window expired or player not found.');
                return;
            }
            
            socket.join(roomCode);
            
            // Update host status if needed
            if (reconnectedPlayer.isHost) {
                room.hostId = socket.id;
            }
            
            socket.emit('reconnected', {
                roomCode: room.roomCode,
                isHost: reconnectedPlayer.isHost,
                actualName: reconnectedPlayer.name,
                gameType: room.gameType,
                roomType: room.roomType
            });
            
            // Send current game state
            if (room.gameState.status === 'playing') {
                socket.emit('game_started', room.getGameStateForPlayer(socket.id));
            } else {
                socket.emit('room_updated', { 
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
            
            // Notify other players
            io.to(room.roomCode).emit('player_reconnected', {
                playerName: reconnectedPlayer.name,
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
            
            console.log(`${reconnectedPlayer.name} reconnected to room ${room.roomCode}`);
            return;
        }

        // Normal join flow for new players
        const actualName = room.addPlayer(socket.id, playerName);
        socket.join(roomCode);
        socket.emit('room_joined', { 
            roomCode, 
            isHost: false, 
            actualName,
            gameType: room.gameType,
            roomType: room.roomType,
            nameChanged: actualName !== playerName
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
        
        if (actualName !== playerName) {
            socket.emit('name_changed', { 
                originalName: playerName, 
                newName: actualName 
            });
        }
    });

    // Bot management (only for The Mole)
    socket.on('add_bot', ({ difficulty = 'medium' }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can add bots');
            return;
        }

        const result = room.addBot(difficulty);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('bot_added', {
            botName: result.botName,
            botCount: room.bots.size
        });

        io.to(room.roomCode).emit('room_updated', { 
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

    // NEW: Change room type (replaces toggle_lock)
    socket.on('change_room_type', ({ roomType }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) {
            socket.emit('error', 'Only the host can change room type');
            return;
        }

        if (!room.setRoomType(roomType)) {
            socket.emit('error', 'Invalid room type');
            return;
        }
        
        io.to(room.roomCode).emit('room_updated', { 
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
        
        const typeMessages = {
            public: 'Room is now public - visible in lobby browser and joinable by code',
            private: 'Room is now private - only joinable by code',
            locked: 'Room is now locked - no new players can join'
        };
        
        io.to(room.roomCode).emit('room_type_changed', { 
            roomType: room.roomType,
            message: typeMessages[room.roomType]
        });
    });

    socket.on('kick_player', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        const result = room.kickPlayer(socket.id, targetId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        if (!result.wasBot) {
            io.to(targetId).emit('kicked', { 
                message: 'You have been kicked from the room by the host',
                roomCode: room.roomCode
            });

            const kickedSocket = io.sockets.sockets.get(targetId);
            if (kickedSocket) {
                kickedSocket.leave(room.roomCode);
            }
        }

        io.to(room.roomCode).emit('player_kicked', {
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
            botCount: room.bots.size,
            usingCustomLocations: room.customLocations.length > 0,
            gameType: room.gameType
        });
    });

    socket.on('toggle_ready', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (player && !player.isBot) {
            player.isReady = !player.isReady;

            io.to(room.roomCode).emit('room_updated', { 
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

    socket.on('start_game', (data) => {
        const room = findPlayerRoom(socket.id);
        if (!room || !room.players.get(socket.id)?.isHost) return;

        // Handle custom locations for The Mole only
        if (room.gameType === 'mole' && data && data.customLocations && Array.isArray(data.customLocations)) {
            const removedBots = room.setCustomLocations(data.customLocations);
            if (removedBots.length > 0) {
                io.to(room.roomCode).emit('bots_removed_custom_locations', {
                    removedBots,
                    message: 'Bots removed due to custom locations'
                });
            }
        }

        const humanPlayers = Array.from(room.players.values()).filter(p => !p.isBot);
        const allHumansReady = humanPlayers.every(player => 
            player.isHost || player.isReady
        );

        if (!allHumansReady) {
            socket.emit('error', 'Not all human players are ready');
            return;
        }

        if (room.startGame()) {
            room.players.forEach((player, socketId) => {
                if (!player.isBot) {
                    io.to(socketId).emit('game_started', room.getGameStateForPlayer(socketId));
                }
            });

            // Start the first turn
            setTimeout(() => {
                if (room.gameType === 'mole') {
                    handleBotTurn(room);
                } else {
                    handleHintTurn(room);
                }
            }, 1000);
        } else {
            socket.emit('error', 'Need at least 3 players to start');
        }
    });

    // The Mole question handling
    socket.on('ask_question', ({ targetId }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        const result = room.handleAskQuestion(socket.id, targetId);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('question_asked', result);

        const targetPlayer = room.players.get(targetId);
        if (targetPlayer && targetPlayer.isBot) {
            setTimeout(() => {
                const prompt = result.prompt || "";
                const answer = room.generateBotAnswer(targetId, result.question, prompt);
                
                room.processAnswer(socket.id, targetId, result.question, answer);

                io.to(room.roomCode).emit('answer_submitted', {
                    asker: result.asker,
                    target: result.target,
                    question: result.question,
                    answer
                });

                room.players.forEach((player, socketId) => {
                    if (!player.isBot) {
                        io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                    }
                });

                setTimeout(() => {
                    handleBotTurn(room);
                }, 1000);
            }, 1500);
        }
    });

    socket.on('submit_answer', ({ asker, target, question, answer }) => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        let askerId = null;
        if (room.gameState.currentQuestion && room.gameState.currentQuestion.targetId === socket.id) {
            askerId = room.gameState.currentQuestion.askerId;
        } else {
            for (const [id, player] of room.players.entries()) {
                if (player.name === asker) {
                    askerId = id;
                    break;
                }
            }
        }

        if (!askerId) {
            console.error('Could not find asker ID for answer submission');
            return;
        }

        console.log(`Answer submitted in room ${room.roomCode}: ${answer}`);

        room.processAnswer(askerId, socket.id, question, answer);

        io.to(room.roomCode).emit('answer_submitted', {
            asker: room.players.get(askerId).name,
            target: room.players.get(socket.id).name,
            question,
            answer
        });

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
        });

        setTimeout(() => {
            handleBotTurn(room);
        }, 1000);
    });

    // NEW: Hint handling for NBA/Rapper games
    socket.on('give_hint', ({ hint }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        const result = room.handleGiveHint(socket.id, hint);
        
        if (result.error) {
            socket.emit('error', result.error);
            return;
        }

        io.to(room.roomCode).emit('hint_given', result);

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
        });

        // Continue to next turn
        setTimeout(() => {
            handleHintTurn(room);
        }, 1000);
    });

    socket.on('ready_to_vote', () => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'playing') return;

        room.readyToVote(socket.id);

        io.to(room.roomCode).emit('ready_count_updated', {
            readyCount: room.gameState.readyToVoteCount,
            requiredCount: room.players.size - 1
        });

        if (room.gameState.status === 'voting') {
            room.players.forEach((player, socketId) => {
                if (!player.isBot) {
                    io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                }
            });

            // Handle bot voting (only for The Mole)
            if (room.gameType === 'mole') {
                setTimeout(() => {
                    for (const [botId, bot] of room.bots.entries()) {
                        if (!room.gameState.votes.has(botId)) {
                            room.handleBotVote(botId);
                        }
                    }
                }, 2000);
            }
        }
    });

    socket.on('submit_vote', ({ targetId, reasoning }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || room.gameState.status !== 'voting') return;

        room.submitVote(socket.id, targetId, reasoning);

        const voterName = room.players.get(socket.id).name;
        const targetName = room.players.get(targetId)?.name || 'Unknown';
        
        io.to(room.roomCode).emit('vote_submitted', {
            voter: voterName,
            target: targetName,
            votesReceived: room.gameState.votes.size,
            totalPlayers: room.players.size
        });

        if (room.gameState.votes.size === room.players.size) {
            io.to(room.roomCode).emit('all_votes_received');
            
            setTimeout(() => {
                console.log(`Processing voting results for room ${room.roomCode}`);
                
                room.processVotingResults();
                
                console.log(`After processing votes: status=${room.gameState.status}`);
                
                room.players.forEach((player, socketId) => {
                    if (!player.isBot) {
                        const gameStateForPlayer = room.getGameStateForPlayer(socketId);
                        console.log(`Sending game update to ${player.name}: status=${gameStateForPlayer.status}, round=${gameStateForPlayer.currentRound}`);
                        io.to(socketId).emit('game_updated', gameStateForPlayer);
                    }
                });
                
                if (room.gameState.status === 'ended') {
                    console.log('Game ended, sending game_over event');
                    io.to(room.roomCode).emit('game_over', room.gameState.gameResult);
                }
            }, 2000);
        }
    });

    // The Mole imposter reveal
    socket.on('imposter_reveal', ({ locationGuess }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || socket.id !== room.gameState.imposter) {
            console.log(`Imposter reveal failed: room=${!!room}, isImposter=${socket.id === room?.gameState.imposter}`);
            socket.emit('error', 'You are not the imposter');
            return;
        }

        console.log(`Imposter reveal in room ${room.roomCode}: ${locationGuess}`);
        room.imposterReveal(locationGuess);

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
        });
    });

    // NEW: NBA/Rapper imposter guess
    socket.on('imposter_guess', ({ guess }) => {
        const room = findPlayerRoom(socket.id);
        if (!room || socket.id !== room.gameState.imposter) {
            console.log(`Imposter guess failed: room=${!!room}, isImposter=${socket.id === room?.gameState.imposter}`);
            socket.emit('error', 'You are not the imposter');
            return;
        }

        console.log(`Imposter guess in room ${room.roomCode}: ${guess}`);
        room.imposterGuess(guess);

        room.players.forEach((player, socketId) => {
            if (!player.isBot) {
                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
            }
        });
    });

    socket.on('request_scoreboard', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;

        socket.emit('scoreboard_updated', {
            scoreboard: room.getScoreboardData(),
            gameHistory: room.gameHistory
        });
    });

    socket.on('get_game_stats', () => {
        const room = findPlayerRoom(socket.id);
        if (!room) return;
        
        socket.emit('game_stats_updated', room.getGameStats());
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const room = findPlayerRoom(socket.id);
        if (room) {
            const player = room.handlePlayerDisconnect(socket.id);
            
            if (room.players.size === 0 && room.disconnectedPlayers.size === 0) {
                gameRooms.delete(room.roomCode);
                console.log(`Room ${room.roomCode} deleted (no players left)`);
                // Emit updated public lobbies to all clients
                const publicLobbies = [];
                for (const [roomCode, room] of gameRooms.entries()) {
                    if (room.roomType === 'public' && room.gameState.status === 'waiting') {
                        publicLobbies.push({
                            roomCode: room.roomCode,
                            gameType: room.gameType,
                            playerCount: room.players.size,
                            maxPlayers: 8,
                            hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                            usingCustomLocations: room.customLocations.length > 0,
                            botCount: room.bots.size,
                            createdAt: room.createdAt
                        });
                    }
                }
                publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                io.emit('public_lobbies', publicLobbies.slice(0, 10));
            } else {
                // Clean up expired disconnections
                const expiredPlayers = room.cleanupExpiredDisconnections();
                
                io.to(room.roomCode).emit('player_left', {
                    playerName: player?.name,
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
                    gameType: room.gameType,
                    disconnectedPlayers: Array.from(room.disconnectedPlayers.keys())
                });
                
                // If game is in progress, continue the game
                if (room.gameState.status === 'playing') {
                    room.players.forEach((player, socketId) => {
                        if (!player.isBot) {
                            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                        }
                    });
                    
                    // Continue game flow
                    setTimeout(() => {
                        if (room.gameType === 'mole') {
                            handleBotTurn(room);
                        } else {
                            handleHintTurn(room);
                        }
                    }, 1000);
                }
            }
        }
    });

    // NEW: Handle player reconnection
    socket.on('reconnect_to_game', ({ roomCode, playerName }) => {
        const room = gameRooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        const reconnectedPlayer = room.handlePlayerReconnect(socket.id, playerName);
        if (!reconnectedPlayer) {
            socket.emit('error', 'Reconnection failed. Time window expired or player not found.');
            return;
        }
        
        socket.join(roomCode);
        
        // Update host status if needed
        if (reconnectedPlayer.isHost) {
            room.hostId = socket.id;
        }
        
        socket.emit('reconnected', {
            roomCode: room.roomCode,
            isHost: reconnectedPlayer.isHost,
            actualName: reconnectedPlayer.name,
            gameType: room.gameType,
            roomType: room.roomType
        });
        
        // Send current game state
        if (room.gameState.status === 'playing') {
            socket.emit('game_started', room.getGameStateForPlayer(socket.id));
        } else {
            socket.emit('room_updated', { 
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
        
        // Notify other players
        io.to(room.roomCode).emit('player_reconnected', {
            playerName: reconnectedPlayer.name,
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
        
        console.log(`${reconnectedPlayer.name} reconnected to room ${room.roomCode}`);
    });

    // NEW: Handle player leaving intentionally
    socket.on('leave_room', () => {
        const room = findPlayerRoom(socket.id);
        if (room) {
            // Remove player without adding to disconnectedPlayers
            const player = room.removePlayer(socket.id);
            
            if (room.players.size === 0 && room.disconnectedPlayers.size === 0) {
                gameRooms.delete(room.roomCode);
                console.log(`Room ${room.roomCode} deleted (no players left)`);
                // Emit updated public lobbies to all clients
                const publicLobbies = [];
                for (const [roomCode, room] of gameRooms.entries()) {
                    if (room.roomType === 'public' && room.gameState.status === 'waiting') {
                        publicLobbies.push({
                            roomCode: room.roomCode,
                            gameType: room.gameType,
                            playerCount: room.players.size,
                            maxPlayers: 8,
                            hostName: Array.from(room.players.values()).find(p => p.isHost)?.name || 'Unknown',
                            usingCustomLocations: room.customLocations.length > 0,
                            botCount: room.bots.size,
                            createdAt: room.createdAt
                        });
                    }
                }
                publicLobbies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                io.emit('public_lobbies', publicLobbies.slice(0, 10));
            } else {
                io.to(room.roomCode).emit('player_left', {
                    playerName: player?.name,
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
                    gameType: room.gameType,
                    disconnectedPlayers: Array.from(room.disconnectedPlayers.keys())
                });
                
                // If game is in progress, continue the game
                if (room.gameState.status === 'playing') {
                    room.players.forEach((player, socketId) => {
                        if (!player.isBot) {
                            io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                        }
                    });
                    
                    // Continue game flow
                    setTimeout(() => {
                        if (room.gameType === 'mole') {
                            handleBotTurn(room);
                        } else {
                            handleHintTurn(room);
                        }
                    }, 1000);
                }
            }
        }
    });

    function findPlayerRoom(socketId) {
        for (const room of gameRooms.values()) {
            if (room.players.has(socketId)) {
                return room;
            }
        }
        return null;
    }
});

// NEW: Periodic cleanup of expired disconnections
setInterval(() => {
    for (const room of gameRooms.values()) {
        const expiredPlayers = room.cleanupExpiredDisconnections();
        if (expiredPlayers.length > 0) {
            console.log(`Cleaned up ${expiredPlayers.length} expired disconnections in room ${room.roomCode}`);
        }
    }
}, 30000); // Check every 30 seconds

// NEW: Handle hint turns for NBA/Rapper games
function handleHintTurn(room) {
    if (room.gameState.status !== 'playing' || room.gameType === 'mole') return;
    
    const currentPlayer = room.getCurrentPlayer();
    const player = room.players.get(currentPlayer);
    
    if (!player) return;
    
    console.log(`${room.gameType.toUpperCase()} hint turn: ${player.name}`);
    
    // Notify the current player it's their turn
    if (!player.isBot) {
        io.to(currentPlayer).emit('your_hint_turn');
    }
    // Note: No bots in NBA/Rapper games, so we don't handle bot hints
}

// Handle bot turns for The Mole (unchanged)
function handleBotTurn(room) {
    if (room.gameState.status !== 'playing' || room.gameType !== 'mole') return;
    
    const currentPlayer = room.getCurrentPlayer();
    const player = room.players.get(currentPlayer);
    
    if (!player || !player.isBot) return;
    
    console.log(`Bot turn: ${player.name}`);
    
    if (!room.gameState.questionAskedThisTurn && !room.gameState.waitingForAnswer) {
        setTimeout(() => {
            const result = room.handleBotAskQuestion(currentPlayer);
            
            if (result && result.success) {
                room.players.forEach((p, socketId) => {
                    if (!p.isBot) {
                        io.to(socketId).emit('question_asked', result);
                    }
                });
                
                const targetPlayer = room.players.get(result.targetId);
                if (targetPlayer && targetPlayer.isBot) {
                    setTimeout(() => {
                        const prompt = result.prompt || "";
                        const answer = room.generateBotAnswer(result.targetId, result.question, prompt);
                        
                        room.processAnswer(result.askerId, result.targetId, result.question, answer);
                        
                        room.players.forEach((p, socketId) => {
                            if (!p.isBot) {
                                io.to(socketId).emit('answer_submitted', {
                                    asker: result.asker,
                                    target: result.target,
                                    question: result.question,
                                    answer
                                });
                                
                                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                            }
                        });
                        
                        setTimeout(() => {
                            handleBotTurn(room);
                        }, 1000);
                    }, 1500);
                }
            } else {
                console.log('Bot failed to ask question, skipping turn');
                room.gameState.questionsThisRound++;
                room.gameState.currentTurn = (room.gameState.currentTurn + 1) % room.playerOrder.length;
                
                setTimeout(() => {
                    handleBotTurn(room);
                }, 500);
            }
        }, 2000);
    }
    
    if (room.gameState.questionsThisRound >= room.gameState.questionsPerRound) {
        if (!room.gameState.readyToVotePlayers.has(currentPlayer)) {
            const bot = room.bots.get(currentPlayer);
            const shouldBeReady = bot ? shouldBotBeReadyToVote(bot, room) : false;
            
            if (shouldBeReady) {
                setTimeout(() => {
                    room.readyToVote(currentPlayer);
                    
                    room.players.forEach((p, socketId) => {
                        if (!p.isBot) {
                            io.to(socketId).emit('ready_count_updated', {
                                readyCount: room.gameState.readyToVoteCount,
                                requiredCount: room.players.size - 1
                            });
                        }
                    });
                    
                    if (room.gameState.status === 'voting') {
                        room.players.forEach((p, socketId) => {
                            if (!p.isBot) {
                                io.to(socketId).emit('game_updated', room.getGameStateForPlayer(socketId));
                            }
                        });
                        
                        setTimeout(() => {
                            for (const [botId, bot] of room.bots.entries()) {
                                if (!room.gameState.votes.has(botId)) {
                                    room.handleBotVote(botId);
                                }
                            }
                        }, 2000);
                    }
                }, 3000);
            }
        }
    }
}

function shouldBotBeReadyToVote(bot, room) {
    const isImposter = room.playerOrder[room.gameState.currentTurn] === room.gameState.imposter;
    
    if (isImposter) {
        return Math.random() < 0.3;
    } else {
        let maxSuspicion = 0;
        let suspiciousPlayerCount = 0;
        
        for (const [playerId, suspicion] of bot.suspicion.entries()) {
            if (suspicion > maxSuspicion) {
                maxSuspicion = suspicion;
            }
            if (suspicion > 30) {
                suspiciousPlayerCount++;
            }
        }
        
        const hasStrongSuspicion = maxSuspicion > 50;
        const hasModerateEvidence = maxSuspicion > 25 && suspiciousPlayerCount <= 2;
        const manyRounds = room.gameState.currentRound > 2;
        
        if (hasStrongSuspicion) return true;
        if (hasModerateEvidence && Math.random() < 0.6) return true;
        if (manyRounds && Math.random() < 0.4) return true;
        
        return false;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Game Collection: The Mole, NBA Imposter, and Rapper Imposter');
    console.log('Enhanced lobby system: Public, Private, and Locked rooms');
    console.log('Bot support enabled for The Mole only');
});