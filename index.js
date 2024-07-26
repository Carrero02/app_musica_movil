const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');    // jsonwebtoken for authentication
const path = require('path');
const https = require('https');
const fs = require('fs');
const axios = require('axios');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require('fluent-ffmpeg');
const e = require('express');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

let mobileClients = new Map();
let webClients = new Map();
let clientsData = new Map();
let userSocketsMobile = {};
let userSocketsWeb = {};
let userMobileWebPairs = {};    // {uname: {mobile: socket, web: socket}}
let userQueues = {};
let userLastCumDuration = {};
let userLastIdentification = {}
let userApiRequestCount = {};

const SECRET_KEY = 'my-secret-key'; // Should be an environment variable

// Read the key and cert files
const serverKey = fs.readFileSync('server.key');
const serverCert = fs.readFileSync('server.cert');

// Create an HTTPS service
const server = https.createServer({ key: serverKey, cert: serverCert }, app);

const io = require('socket.io')(server);

io.on('connection', (socket) => {

    console.log(`Socket connected ${socket.id}`);

    socket.on('MOBILE_LOGIN_CONNECTED', () => {
        console.log('Mobile login connected');
        mobileClients.set(socket.id, socket);
        socket.emit('ACK_CONNECTION');
    });

    socket.on('MOBILE_CONNECTED', (data) => {
        console.log('Mobile connected');
        mobileClients.set(socket.id, socket);
        socket.emit('ACK_CONNECTION');
        // Associate the user with the socket
        userSocketsMobile[socket.id] = data.uname;

        // Add the socket to the userMobileWebPairs object
        if (userMobileWebPairs[data.uname]) {
            userMobileWebPairs[data.uname].mobile = socket;
        } else {
            userMobileWebPairs[data.uname] = { mobile: socket, web: null };
        }
        
    });

    socket.on('WEB_LOGIN_CONNECTED', () => {
        console.log('Web login connected');
        webClients.set(socket.id, socket);
        socket.emit('ACK_CONNECTION');
    });

    socket.on('WEB_CONNECTED', (data) => {
        console.log('Web connected');
        webClients.set(socket.id, socket);
        socket.emit('ACK_CONNECTION');
        // Associate the user with the socket
        userSocketsWeb[socket.id] = data.uname;

        // Add the socket to the userMobileWebPairs object
        if (userMobileWebPairs[data.uname]) {
            userMobileWebPairs[data.uname].web = socket;
        } else {
            userMobileWebPairs[data.uname] = { mobile: null, web: socket };
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected ${socket.id}`);
        if (mobileClients.has(socket.id)) {
            mobileClients.delete(socket.id);
            // Get the user associated with the socket
            const user = userSocketsMobile[socket.id];
            // Clear the user's queue
            if (user) {
                userQueues[user] = [];
            }
            // Remove the user from the userSocketsMobile object
            delete userSocketsMobile[socket.id];

        } else if (webClients.has(socket.id)) {
            webClients.delete(socket.id);
            // Remove the user from the userSocketsWeb object
            delete userSocketsWeb[socket.id];
        }
        // Remove the socket from the userMobileWebPairs object
        for (const user in userMobileWebPairs) {
            if (userMobileWebPairs[user].mobile === socket) {
                userMobileWebPairs[user].mobile = null;
            } else if (userMobileWebPairs[user].web === socket) {
                userMobileWebPairs[user].web = null;
            }
        }
    });

    socket.on('USER_REGISTRATION', (data) => {
        console.log('User registration data:', data);
        // Chack that the username is not empty
        if (data.uname === '') {
            console.log('Username cannot be empty');
            // Emit an event to the client to inform that the username cannot be empty
            socket.emit('INVALID_UNAME_FORMAT');
            return;
        }

        // Check that the password is not empty
        if (data.psw === '') {
            console.log('Password cannot be empty');
            // Emit an event to the client to inform that the password cannot be empty
            socket.emit('INVALID_PWD_FORMAT');
            return;
        }

        // Check if the user is already registered in the database JSON
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the user registration failed
                socket.emit('DATABASE_ERROR');
                return;
            }

            const users = JSON.parse(jsonString);
            const userExists = users.some(user => user.uname === data.uname);

            if (userExists) {
                console.log('User already exists');
                // Emit an event to the client to inform that the user already exists
                socket.emit('USER_EXISTS');
            } else {
                console.log('User does not exist');
                // Add a "playlists" field to the user object with an empty array
                data.playlists = [];
                // Add a "favorites" object to the user object with two fields: "songs" (array) and totalDuration
                data.favorites = { songs: [], totalDuration: 0 };
                // Add the new user to the database JSON
                users.push(data);

                // Write the updated database JSON to the file
                fs.writeFile('database.json', JSON.stringify(users), (err) => {
                    if (err) {
                        console.log("File write failed:", err);
                        // Emit an event to the client to inform that the user registration failed
                        socket.emit('DATABASE_ERROR');
                        return;
                    }

                    console.log('User added to the database');
                    // Create a JWT token for the user
                    const token = jwt.sign({ uname: data.uname }, SECRET_KEY);
                    // Associate the user with the socket
                    userSocketsMobile[socket.id] = uname;
                    // Emit an event to the client to inform that the user was successfully registered
                    // and send the JWT token
                    socket.emit('USER_REGISTRATION_SUCCESS', token);
                });
            }
        });
    });

    socket.on('USER_LOGIN', (data) => {
        console.log('User login data:', data);
        // Chack that the username is not empty
        if (data.uname === '') {
            console.log('Username cannot be empty');
            // Emit an event to the client to inform that the username cannot be empty
            socket.emit('INVALID_UNAME_FORMAT');
            return;
        }

        // Check that the password is not empty
        if (data.psw === '') {
            console.log('Password cannot be empty');
            // Emit an event to the client to inform that the password cannot be empty
            socket.emit('INVALID_PWD_FORMAT');
            return;
        }

        // Check if the user is already registered in the database JSON
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the user login failed
                socket.emit('DATABASE_ERROR');
                return;
            }

            const users = JSON.parse(jsonString);
            const user = users.find(user => user.uname === data.uname && user.psw === data.psw);

            if (user) {
                console.log('User found');
                // Create a JWT token for the user
                const token = jwt.sign({ uname: data.uname }, SECRET_KEY);
                // Associate the user with the socket
                if (mobileClients.has(socket.id)) {
                    userSocketsMobile[socket.id] = user;
                    console.log('Mobile user socket id:', socket.id);
                }
                else if (webClients.has(socket.id)) {
                    userSocketsWeb[socket.id] = user;
                    console.log('Web user socket id:', socket.id);
                }
                // Emit an event to the client to inform that the user was successfully logged in
                // and send the JWT token
                socket.emit('USER_LOGIN_SUCCESS', token);
            } else {
                console.log('User not found or incorrect password');
                // Emit an event to the client to inform that the user was not found
                socket.emit('INCORRECT_UNAME_PWD');
            }
        });
    });

    socket.on('GET_PLAYLISTS', (data) => {
        console.log('Get playlists:', data);
        // Verify the JWT token
        jwt.verify(data.token, SECRET_KEY, (err, authData) => {
            if (err) {
                console.log('Invalid token');
                // Emit an event to the client to inform that the token is invalid
                socket.emit('INVALID_TOKEN');
            } else {
                // Check if the username in the token is the same as the one in the request
                if (authData.uname !== data.uname) {
                    console.log('Invalid token');
                    // Emit an event to the client to inform that the token is invalid
                    socket.emit('INVALID_TOKEN');
                    return;
                }
                console.log('Valid token');
                // Read the database JSON file
                fs.readFile('database.json', 'utf8', (err, jsonString) => {
                    if (err) {
                        console.log("File read failed:", err);
                        // Emit an event to the client to inform that the database read failed
                        socket.emit('DATABASE_ERROR');
                        return;
                    }

                    const users = JSON.parse(jsonString);
                    const user = users.find(user => user.uname === data.uname);

                    if (user) {
                        console.log('User found');
                        // Emit an event to the client to inform that the playlists were successfully retrieved
                        socket.emit('PLAYLISTS_RETRIEVED', user.playlists);
                    } else {
                        console.log('User not found');
                        // Emit an event to the client to inform that the user was not found
                        socket.emit('USER_NOT_FOUND');
                    }
                });
            }
        });
    });

    socket.on('GET_FAVORITES', (data) => {
        console.log('Get favorites:', data);
        // Verify the JWT token
        jwt.verify(data.token, SECRET_KEY, (err, authData) => {
            if (err) {
                console.log('Invalid token');
                // Emit an event to the client to inform that the token is invalid
                socket.emit('INVALID_TOKEN');
            } else {
                // Check if the username in the token is the same as the one in the request
                if (authData.uname !== data.uname) {
                    console.log('Invalid token');
                    // Emit an event to the client to inform that the token is invalid
                    socket.emit('INVALID_TOKEN');
                    return;
                }
                console.log('Valid token');
                // Read the database JSON file
                fs.readFile('database.json', 'utf8', (err, jsonString) => {
                    if (err) {
                        console.log("File read failed:", err);
                        // Emit an event to the client to inform that the database read failed
                        socket.emit('DATABASE_ERROR');
                        return;
                    }

                    const users = JSON.parse(jsonString);
                    const user = users.find(user => user.uname === data.uname);

                    if (user) {
                        console.log('User found');
                        // Emit an event to the client to inform that the favorites were successfully retrieved
                        socket.emit('FAVORITES_RETRIEVED', user.favorites);
                    } else {
                        console.log('User not found');
                        // Emit an event to the client to inform that the user was not found
                        socket.emit('USER_NOT_FOUND');
                    }
                });
            }
        });
    });

    socket.on('SEARCH_SONG_TEST', (data) => {

        const { user } = data;
    
        // Create a new queue for the user if it doesn't exist
        if (!userQueues[user]) {
            userQueues[user] = [];
        }
    
        // Push the received data to the user's queue
        userQueues[user].push(data);
 
        processAudioDataTest(user, socket);

    }); 

    socket.on('SEARCH_SONG', (data) => {
        const { user } = data;
    
        // Create a new queue for the user if it doesn't exist
        if (!userQueues[user]) {
            userQueues[user] = [];
        }
    
        // Push the received data to the user's queue
        userQueues[user].push(data);
    
        processAudioData(user, socket);
    });

    socket.on('REMOVE_SONG', (data) => {
        const { user, songTitle, songArtist, songDuration, playlistName } = data;
        // Remove the song that matches the title, artist, and duration from the playlist
        // with the name playlistName
        console.log('Remove song:', data)

        // Read the database JSON file
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the database read failed
                socket.emit('REMOVE_SONG_DATABASE_ERROR', {songTitle, songArtist, songDuration, playlistName});
                return;
            }

            const users = JSON.parse(jsonString);
            console.log('Users:', users)
            console.log('User:', user)
            const userIndex = users.findIndex(userObject => userObject.uname === user);

            if (userIndex !== -1) { // userIndex is -1 if the user is not found
                const playlistIndex = users[userIndex].playlists.findIndex(playlist => playlist.name === playlistName);

                if (playlistIndex !== -1) {
                    const songIndex = users[userIndex].playlists[playlistIndex].songs.findIndex(song => song.title === songTitle && song.artist === songArtist && song.duration === songDuration);

                    if (songIndex !== -1) {
                        users[userIndex].playlists[playlistIndex].songs.splice(songIndex, 1);   // splice() removes the element at the specified index

                        // Calculate the new total duration of the playlist
                        let totalDuration = users[userIndex].playlists[playlistIndex].totalDuration;
                        // Subtract the duration of the removed song
                        // Note that the duration and totalDuration are in format hh:mm:ss
                        const durationParts = songDuration.split(':');
                        const totalDurationParts = totalDuration.split(':');
                        let durationInSeconds = 0;
                        let totalDurationInSeconds = 0;

                        if (durationParts.length === 3) {
                            durationInSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
                        } else if (durationParts.length === 2) {
                            durationInSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
                        } else if (durationParts.length === 1) {
                            durationInSeconds = parseInt(durationParts[0]);
                        } else {
                            console.log('Invalid song duration format');
                            socket.emit('REMOVE_SONG_FORMAT_ERROR', {songTitle, songArtist, songDuration, playlistName});
                        }

                        if (totalDurationParts.length === 3) {
                            totalDurationInSeconds = parseInt(totalDurationParts[0]) * 3600 + parseInt(totalDurationParts[1]) * 60 + parseInt(totalDurationParts[2]);
                        } else if (totalDurationParts.length === 2) {
                            totalDurationInSeconds = parseInt(totalDurationParts[0]) * 60 + parseInt(totalDurationParts[1]);
                        } else if (totalDurationParts.length === 1) {
                            totalDurationInSeconds = parseInt(totalDurationParts[0]);
                        } else {
                            console.log('Invalid total duration format');
                            socket.emit('REMOVE_SONG_FORMAT_ERROR', {songTitle, songArtist, songDuration, playlistName});
                        }

                        totalDurationInSeconds -= durationInSeconds;

                        // Convert the total duration back to the format hh:mm:ss (or mm:ss)
                        let hours = Math.floor(totalDurationInSeconds / 3600);
                        let minutes = Math.floor((totalDurationInSeconds % 3600) / 60);
                        let seconds = totalDurationInSeconds % 60;
                        totalDuration = `${hours}:${minutes}:${seconds}`;

                        // Update the total duration of the playlist
                        users[userIndex].playlists[playlistIndex].totalDuration = totalDuration;
                    
                        // Write the updated database JSON to the file
                        fs.writeFile('database.json', JSON.stringify(users), (err) => {
                            if (err) {
                                console.log("File write failed:", err);
                                // Emit an event to the client to inform that the song removal failed
                                socket.emit('REMOVE_SONG_DATABASE_ERROR', {songTitle, songArtist, songDuration, playlistName});
                                return;
                            }

                            console.log('Song removed from the playlist');
                            // Emit an event to the client to inform that the song was successfully removed
                            socket.emit('REMOVE_SONG_SUCCESS', {songTitle, songArtist, songDuration, playlistName, totalDuration});
                        });
                    } else {
                        console.log('Song not found');
                        // Emit an event to the client to inform that the song was not found
                        socket.emit('REMOVE_SONG_NOT_FOUND', {songTitle, songArtist, songDuration, playlistName});
                    }
                } else {
                    console.log('Playlist not found');
                    // Emit an event to the client to inform that the playlist was not found
                    socket.emit('REMOVE_SONG_PLAYLIST_NOT_FOUND', {songTitle, songArtist, songDuration, playlistName});
                }
            } else {
                console.log('User not found');
                // Emit an event to the client to inform that the user was not found
                socket.emit('REMOVE_SONG_USER_NOT_FOUND', {songTitle, songArtist, songDuration, playlistName});
                console.log('REMOVE_SONG_USER_NOT_FOUND emitted');
            }
        });
    });

    // Listen to REMOVE_FROM_FAVORITES events
    socket.on('REMOVE_FROM_FAVORITES', (data) => {
        const { user, songTitle, songArtist, songDuration } = data;
        console.log('Remove from favorites:', data);

        // Read the database JSON file
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the database read failed
                socket.emit('REMOVE_FROM_FAVORITES_DATABASE_ERROR', {songTitle, songArtist, songDuration});
                return;
            }

            const users = JSON.parse(jsonString);
            const userIndex = users.findIndex(userObject => userObject.uname === user);

            if (userIndex !== -1) { // userIndex is -1 if the user is not found
                const songIndex = users[userIndex].favorites.songs.findIndex(song => song.title === songTitle && song.artist === songArtist && song.duration === songDuration);

                if (songIndex !== -1) {
                    users[userIndex].favorites.songs.splice(songIndex, 1);   // splice() removes the element at the specified index

                    // Calculate the new total duration of the favorites
                    let totalDuration = users[userIndex].favorites.totalDuration;
                    // Subtract the duration of the removed song
                    // Note that the duration and totalDuration are in format hh:mm:ss
                    const durationParts = songDuration.split(':');
                    const totalDurationParts = totalDuration.split(':');
                    let durationInSeconds = 0;
                    let totalDurationInSeconds = 0;

                    if (durationParts.length === 3) {
                        durationInSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
                    } else if (durationParts.length === 2) {
                        durationInSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
                    } else if (durationParts.length === 1) {
                        durationInSeconds = parseInt(durationParts[0]);
                    } else {
                        console.log('Invalid song duration format');
                        socket.emit('REMOVE_FROM_FAVORITES_FORMAT_ERROR', {songTitle, songArtist, songDuration});
                    }

                    if (totalDurationParts.length === 3) {
                        totalDurationInSeconds = parseInt(totalDurationParts[0]) * 3600 + parseInt(totalDurationParts[1]) * 60 + parseInt(totalDurationParts[2]);
                    } else if (totalDurationParts.length === 2) {
                        totalDurationInSeconds = parseInt(totalDurationParts[0]) * 60 + parseInt(totalDurationParts[1]);
                    } else if (totalDurationParts.length === 1) {
                        totalDurationInSeconds = parseInt(totalDurationParts[0]);
                    } else {
                        console.log('Invalid total duration format');
                        socket.emit('REMOVE_FROM_FAVORITES_FORMAT_ERROR', {songTitle, songArtist, songDuration});
                    }

                    totalDurationInSeconds -= durationInSeconds;

                    // Convert the total duration back to the format hh:mm:ss (or mm:ss)
                    let hours = Math.floor(totalDurationInSeconds / 3600);
                    let minutes = Math.floor((totalDurationInSeconds % 3600) / 60);
                    let seconds = totalDurationInSeconds % 60;
                    totalDuration = `${hours}:${minutes}:${seconds}`;

                    // Update the total duration of the favorites
                    users[userIndex].favorites.totalDuration = totalDuration;

                    // Write the updated database JSON to the file
                    fs.writeFile('database.json', JSON.stringify(users), (err) => {
                        if (err) {
                            console.log("File write failed:", err);
                            // Emit an event to the client to inform that the song removal failed
                            socket.emit('REMOVE_FROM_FAVORITES_DATABASE_ERROR', {songTitle, songArtist, songDuration});
                            return;
                        }

                        console.log('Song removed from favorites');
                        // Emit an event to the client to inform that the song was successfully removed
                        socket.emit('REMOVE_FROM_FAVORITES_SUCCESS', {songTitle, songArtist, songDuration, totalDuration});
                    });
                } else {
                    console.log('Song not found');
                    // Emit an event to the client to inform that the song was not found
                    socket.emit('REMOVE_FROM_FAVORITES_NOT_FOUND', {songTitle, songArtist, songDuration});
                }
            } else {
                console.log('User not found');
                // Emit an event to the client to inform that the user was not found
                socket.emit('REMOVE_FROM_FAVORITES_USER_NOT_FOUND', {songTitle, songArtist, songDuration});
            }
        });
    });

    // Listen for ADD_TO_FAVORITES events
    socket.on('ADD_TO_FAVORITES', (data) => {
        const { user, songTitle, songArtist, songDuration } = data;
        console.log('Add to favorites:', data);

        // Read the database JSON file
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the database read failed
                socket.emit('ADD_TO_FAVORITES_DATABASE_ERROR', {songTitle, songArtist, songDuration});
                return;
            }

            const users = JSON.parse(jsonString);
            const userIndex = users.findIndex(userObject => userObject.uname === user);

            if (userIndex !== -1) { // userIndex is -1 if the user is not found
                const songExists = users[userIndex].favorites.songs.some(song => song.title === songTitle && song.artist === songArtist && song.duration === songDuration);

                if (!songExists) {
                    // Add the song to the user's favorites
                    console.log(users[userIndex]);
                    console.log(users[userIndex].favorites);
                    console.log(users[userIndex].favorites.songs);
                    users[userIndex].favorites.songs.push({ title: songTitle, artist: songArtist, duration: songDuration });

                    // Calculate the new total duration of the favorites
                    let totalDuration = users[userIndex].favorites.totalDuration;
                    // Add the duration of the added song
                    // Note that the duration and totalDuration are in format hh:mm:ss
                    const durationParts = songDuration.split(':');
                    const totalDurationParts = totalDuration.split(':');
                    let durationInSeconds = 0;
                    let totalDurationInSeconds = 0;

                    if (durationParts.length === 3) {
                        durationInSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
                    } else if (durationParts.length === 2) {
                        durationInSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
                    } else if (durationParts.length === 1) {
                        durationInSeconds = parseInt(durationParts[0]);
                    } else {
                        console.log('Invalid song duration format');
                        socket.emit('ADD_TO_FAVORITES_FORMAT_ERROR', {songTitle, songArtist, songDuration});
                    }

                    if (totalDurationParts.length === 3) {
                        totalDurationInSeconds = parseInt(totalDurationParts[0]) * 3600 + parseInt(totalDurationParts[1]) * 60 + parseInt(totalDurationParts[2]);
                    }
                    else if (totalDurationParts.length === 2) {
                        totalDurationInSeconds = parseInt(totalDurationParts[0]) * 60 + parseInt(totalDurationParts[1]);
                    } else if (totalDurationParts.length === 1) {
                        totalDurationInSeconds = parseInt(totalDurationParts[0]);
                    } else {
                        console.log('Invalid total duration format');
                        socket.emit('ADD_TO_FAVORITES_FORMAT_ERROR', {songTitle, songArtist, songDuration});
                    }

                    totalDurationInSeconds += durationInSeconds;

                    // Convert the total duration back to the format hh:mm:ss (or mm:ss)
                    let hours = Math.floor(totalDurationInSeconds / 3600);
                    let minutes = Math.floor((totalDurationInSeconds % 3600) / 60);
                    let seconds = totalDurationInSeconds % 60;
                    totalDuration = `${hours}:${minutes}:${seconds}`;

                    // Update the total duration of the favorites
                    users[userIndex].favorites.totalDuration = totalDuration;

                    // Write the updated database JSON to the file
                    fs.writeFile('database.json', JSON.stringify(users), (err) => {
                        if (err) {
                            console.log("File write failed:", err);
                            // Emit an event to the client to inform that the song addition failed
                            socket.emit('ADD_TO_FAVORITES_DATABASE_ERROR', {songTitle, songArtist, songDuration});
                            return;
                        }

                        console.log('Song added to favorites');
                        // Emit an event to the client to inform that the song was successfully added to the favorites
                        socket.emit('ADD_TO_FAVORITES_SUCCESS', {songTitle, songArtist, songDuration, totalDuration});
                    });
                }
                else {
                    console.log('Song already in favorites');
                    // Emit an event to the client to inform that the song is already in the favorites
                    socket.emit('ADD_TO_FAVORITES_ALREADY_EXISTS', {songTitle, songArtist, songDuration});
                }
            }
            else {
                console.log('User not found');
                // Emit an event to the client to inform that the user was not found
                socket.emit('ADD_TO_FAVORITES_USER_NOT_FOUND', {songTitle, songArtist, songDuration});
            }
        });
    });

    // Listen for ADD_TO_PLAYLIST events
    socket.on('ADD_TO_PLAYLIST', (data) => {
        const { user, songTitle, songArtist, songDuration, playlistName } = data;
        console.log('Add to playlist:', data);

        // Read the database JSON file
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the database read failed
                socket.emit('ADD_TO_PLAYLIST_DATABASE_ERROR', {songTitle, songArtist, songDuration, playlistName});
                return;
            }

            const users = JSON.parse(jsonString);
            const userIndex = users.findIndex(userObject => userObject.uname === user);

            if (userIndex !== -1) { // userIndex is -1 if the user is not found
                const playlistIndex = users[userIndex].playlists.findIndex(playlist => playlist.name === playlistName);

                if (playlistIndex !== -1) {
                    const songExists = users[userIndex].playlists[playlistIndex].songs.some(song => song.title === songTitle && song.artist === songArtist && song.duration === songDuration);

                    if (!songExists) {
                        // Add the song to the playlist
                        users[userIndex].playlists[playlistIndex].songs.push({ title: songTitle, artist: songArtist, duration: songDuration });

                        // Calculate the new total duration of the playlist
                        let totalDuration = users[userIndex].playlists[playlistIndex].totalDuration;
                        // Add the duration of the added song
                        // Note that the duration and totalDuration are in format hh:mm:ss
                        const durationParts = songDuration.split(':');
                        const totalDurationParts = totalDuration.split(':');
                        let durationInSeconds = 0;
                        let totalDurationInSeconds = 0;

                        if (durationParts.length === 3) {
                            durationInSeconds = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
                        } else if (durationParts.length === 2) {
                            durationInSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
                        } else if (durationParts.length === 1) {
                            durationInSeconds = parseInt(durationParts[0]);
                        } else {
                            console.log('Invalid song duration format');
                            socket.emit('ADD_TO_PLAYLIST_FORMAT_ERROR', {songTitle, songArtist, songDuration, playlistName});
                        }

                        if (totalDurationParts.length === 3) {
                            totalDurationInSeconds = parseInt(totalDurationParts[0]) * 3600 + parseInt(totalDurationParts[1]) * 60 + parseInt(totalDurationParts[2]);
                        }
                        else if (totalDurationParts.length === 2) {
                            totalDurationInSeconds = parseInt(totalDurationParts[0]) * 60 + parseInt(totalDurationParts[1]);
                        }
                        else if (totalDurationParts.length === 1) {
                            totalDurationInSeconds = parseInt(totalDurationParts[0]);
                        }
                        else {
                            console.log('Invalid total duration format');
                            socket.emit('ADD_TO_PLAYLIST_FORMAT_ERROR', {songTitle, songArtist, songDuration, playlistName});
                        }

                        totalDurationInSeconds += durationInSeconds;

                        // Convert the total duration back to the format hh:mm:ss (or mm:ss)
                        let hours = Math.floor(totalDurationInSeconds / 3600);
                        let minutes = Math.floor((totalDurationInSeconds % 3600) / 60);
                        let seconds = totalDurationInSeconds % 60;
                        totalDuration = `${hours}:${minutes}:${seconds}`;

                        // Update the total duration of the playlist
                        users[userIndex].playlists[playlistIndex].totalDuration = totalDuration;

                        // Write the updated database JSON to the file
                        fs.writeFile('database.json', JSON.stringify(users), (err) => {
                            if (err) {
                                console.log("File write failed:", err);
                                // Emit an event to the client to inform that the song addition failed
                                socket.emit('ADD_TO_PLAYLIST_DATABASE_ERROR', {songTitle, songArtist, songDuration, playlistName});
                                return;
                            }

                            console.log('Song added to the playlist');
                            // Emit an event to the client to inform that the song was successfully added to the playlist
                            socket.emit('ADD_TO_PLAYLIST_SUCCESS', {songTitle, songArtist, songDuration, playlistName, totalDuration});
                        });
                    }
                    else {
                        console.log('Song already in playlist');
                        // Emit an event to the client to inform that the song is already in the playlist
                        socket.emit('ADD_TO_PLAYLIST_ALREADY_EXISTS', {songTitle, songArtist, songDuration, playlistName});
                    }
                }
                else {
                    console.log('Playlist not found');
                    // Emit an event to the client to inform that the playlist was not found
                    socket.emit('ADD_TO_PLAYLIST_NOT_FOUND', {songTitle, songArtist, songDuration, playlistName});
                }
            }
            else {
                console.log('User not found');
                // Emit an event to the client to inform that the user was not found
                socket.emit('ADD_TO_PLAYLIST_USER_NOT_FOUND', {songTitle, songArtist, songDuration, playlistName});
            }
        });
    });

    // Listen for ADD_PLAYLIST events
    socket.on('ADD_PLAYLIST', (data) => {
        const { uname, playlistName } = data;
        console.log('Add playlist:', data);

        // Check if the playlist name is empty
        if (playlistName === '') {
            console.log('Playlist name cannot be empty');
            // Emit an event to the client to inform that the playlist name has an invalid format
            socket.emit('ADD_PLAYLIST_FORMAT_ERROR');
            return;
        }

        // Read the database JSON file
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the database read failed
                socket.emit('ADD_PLAYLIST_DATABASE_ERROR', playlistName);
                return;
            }

            const users = JSON.parse(jsonString);
            const userIndex = users.findIndex(userObject => userObject.uname === uname);

            if (userIndex !== -1) { // userIndex is -1 if the user is not found
                const playlistExists = users[userIndex].playlists.some(playlist => playlist.name === playlistName);

                if (!playlistExists) {
                    // Add the playlist to the user's playlists
                    users[userIndex].playlists.push({ name: playlistName, songs: [], totalDuration: '0:00:00' });

                    // Write the updated database JSON to the file
                    fs.writeFile('database.json', JSON.stringify(users), (err) => {
                        if (err) {
                            console.log("File write failed:", err);
                            // Emit an event to the client to inform that the playlist addition failed
                            socket.emit('ADD_PLAYLIST_DATABASE_ERROR', playlistName);
                            return;
                        }

                        console.log('Playlist added:', playlistName);
                        // Emit an event to the client to inform that the playlist was successfully added
                        socket.emit('ADD_PLAYLIST_SUCCESS', playlistName);
                    });
                }
                else {
                    console.log('Playlist already exists');
                    // Emit an event to the client to inform that the playlist already exists
                    socket.emit('ADD_PLAYLIST_ALREADY_EXISTS', playlistName);
                }
            }
            else {
                console.log('User not found');
                // Emit an event to the client to inform that the user was not found
                socket.emit('ADD_PLAYLIST_USER_NOT_FOUND', playlistName);
            }
        });
    });

    // Listen for REMOVE_PLAYLIST
    socket.on('REMOVE_PLAYLIST', (data) => {
        const { uname, playlistName } = data;
        console.log('Remove playlist:', data);

        // Read the database JSON file
        fs.readFile('database.json', 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err);
                // Emit an event to the client to inform that the database read failed
                socket.emit('REMOVE_PLAYLIST_DATABASE_ERROR', playlistName);
                return;
            }

            const users = JSON.parse(jsonString);
            const userIndex = users.findIndex(userObject => userObject.uname === uname);

            if (userIndex !== -1) { // userIndex is -1 if the user is not found
                const playlistIndex = users[userIndex].playlists.findIndex(playlist => playlist.name === playlistName);

                if (playlistIndex !== -1) {
                    // Remove the playlist from the user's playlists
                    users[userIndex].playlists.splice(playlistIndex, 1);   // splice() removes the element at the specified index

                    // Write the updated database JSON to the file
                    fs.writeFile('database.json', JSON.stringify(users), (err) => {
                        if (err) {
                            console.log("File write failed:", err);
                            // Emit an event to the client to inform that the playlist removal failed
                            socket.emit('REMOVE_PLAYLIST_DATABASE_ERROR', playlistName);
                            return;
                        }

                        console.log('Playlist removed:', playlistName);
                        // Emit an event to the client to inform that the playlist was successfully removed
                        socket.emit('REMOVE_PLAYLIST_SUCCESS', playlistName);
                    });
                }
                else {
                    console.log('Playlist not found');
                    // Emit an event to the client to inform that the playlist was not found
                    socket.emit('REMOVE_PLAYLIST_NOT_FOUND', playlistName);
                }
            }
            else {
                console.log('User not found');
                // Emit an event to the client to inform that the user was not found
                socket.emit('REMOVE_PLAYLIST_USER_NOT_FOUND', playlistName);
            }
        });
    });

    // Listen for EXPORT_PLAYLIST events
    socket.on('EXPORT_PLAYLIST', (data) => {
        // Receives the data from the Mobile client and sends it to the Web client
        const { uname, playlistTitle, playlistSongs, playlistNumSongs, playlistTotalDuration } = data;
        console.log('Export playlist:', data);

        // Get the Web Client socket from the userMobileWebPairs object
        const webSocket = userMobileWebPairs[uname].web;

        if (!webSocket) {
            console.log('Web client not found');
            socket.emit('EXPORT_PLAYLIST_WEB_CLIENT_NOT_FOUND', playlistTitle);
            return;
        }
        // Emit an event to the Web client to inform that the playlist was exported
        console.log('Sending playlist to the Web client with uname:', uname, 'and socket id:', webSocket.id);
        webSocket.emit('EXPORT_PLAYLIST', { playlistTitle, playlistSongs, playlistNumSongs, playlistTotalDuration });
        socket.emit('EXPORT_PLAYLIST_SUCCESS', playlistTitle);
    });

});

function verifyToken(req, res, next) {
    // Function that checks if the request contains a valid JWT token in the header
    // If so, it adds the token to the request object and calls the next middleware
    // If not, it sends a 403 Forbidden status code
    console.log(req.headers)
    const bearerHeader = req.headers['authorization'];
    console.log('Received token:', bearerHeader);
    if(typeof bearerHeader !== 'undefined') {
        // Split at the space
        const bearer = bearerHeader.split(' ');
        // Get the token from the array
        const bearerToken = bearer[1];
        // Set the token
        req.token = bearerToken;
        // Call the next middleware
        next();
    } else {
        res.sendStatus(403);    // Forbidden
    }
}

async function processAudioData(user, socket) {
    if (userQueues[user].length === 0) {
        return;
    }

    // Get and remove the current item from the user's queue
    let userQueueData = userQueues[user].shift();

    const { audio, timestamp, sequenceNumber } = userQueueData

    const dir = path.join(__dirname, 'tmp');
    const fileName = path.join(dir, 'audio' + Date.now());
    const outputFileName = path.join(dir, 'audio' + Date.now());

    // Check if the timestamp is the same as the last identification
    // Note that the timestamp is the same for the same audio file
    // So different chunks of the same audio file will have the same timestamp
    if (userLastIdentification[user] && userLastIdentification[user] === timestamp) {
        console.log('Song already identified');
        return;
    } else {
        console.log('Identifying a new song');
        userLastIdentification[user] = 0;
        userApiRequestCount[user] = 0;
    }

    if (sequenceNumber == 1) {
        // Reset the API request count for the user
        userApiRequestCount[user] = 0;
        // And the cumulative duration
        userLastCumDuration[user] = 0;
    }

    let apiRequestCount = userApiRequestCount[user] || 0;

    // Ensure the directory exists
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(fileName, new Buffer.from(audio));

    // Save the audio file in a standard WAV format
    ffmpeg(fileName)
        .outputOptions('-ac', '1', '-ar', '44100')
        .outputFormat('wav')
        .save(`${outputFileName}.wav`)
        .on('end', () => {
            if (fs.existsSync(`${outputFileName}.wav`)) {
                // Calculate the duration of the audio file
                ffmpeg.ffprobe(`${outputFileName}.wav`, (err, metadata) => {
                    if (err) {
                        console.error(`Error getting audio metadata: ${err}`);
                        socket.emit('SONG_IDENTIFICATION', { responseStatus: 500, responseData: {}, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
                        // Remove the current item from the user's queue
                        userQueues[user].shift();
                        return;
                    }

                    const durationInMs = metadata.format.duration * 1000;
                    console.log(`Audio duration: ${durationInMs} ms`);

                    // Update the cummulative duration
                    const newCummulativeDuration = userLastCumDuration[user] ? userLastCumDuration[user] + durationInMs : durationInMs;
                    userLastCumDuration[user] = newCummulativeDuration;
                    console.log(`New cumulative duration: ${newCummulativeDuration} ms`);

                    // Convert the audio file to the raw format
                    ffmpeg(`${outputFileName}.wav`)
                        .outputOptions('-ac', '1', '-f', 's16le', '-ar', '44100')
                        .save(`${outputFileName}_raw.wav`)
                        .on('end', () => {
                            // Read the raw audio file and convert it to base64
                            const rawAudioData = fs.readFileSync(`${outputFileName}_raw.wav`);
                            const base64Audio = Buffer.from(rawAudioData).toString('base64');

                            // Make a request to the Shazam API with rapidapi.com to identify the song
                            const options = {
                                method: 'POST',
                                url: 'https://shazam.p.rapidapi.com/songs/v2/detect',
                                params: {
                                timezone: 'Europe/Madrid',
                                locale: 'en-US',
                                identifier: `${user}_${timestamp}`,
                                timestamp: timestamp,
                                samplems: newCummulativeDuration
                                },
                                headers: {
                                'content-type': 'text/plain',
                                'X-RapidAPI-Key': '85f65a81aamsha4f7588e8ce9cdep1e256bjsnb0fe7219b610',
                                'X-RapidAPI-Host': 'shazam.p.rapidapi.com'
                                },
                                data: base64Audio
                            };
                            
                            // Another check in case the song was identified in the meantime
                            if (userLastIdentification[user] && userLastIdentification[user] === timestamp) {
                                console.log('Song already identified');
                                return;
                            }
                            console.log('Making an API request');
                            console.log('API request count:', apiRequestCount);
                            apiRequestCount++;
                            axios.request(options)
                            .then((response) => {
                                apiRequestCount++;
                                console.log("status:\n", response.status);
                                console.log("data:\n", response.data);
                                // If the song was successfully identified, emit an event to the client and stop processing
                                if (response.data.matches && response.data.matches.length > 0) {
                                    // Another check to ensure the song identification is not sent twice
                                    if (userLastIdentification[user] && userLastIdentification[user] === timestamp) {
                                        console.log('Song already identified');
                                        return;
                                    }
                                    console.log('Song identified');
                                    socket.emit('SONG_IDENTIFICATION', { responseStatus: response.status, responseData: response.data, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
                                    // Add the timestamp to the userLastIdentification object
                                    userLastIdentification[user] = timestamp;
                                } else {
                                    // If the song was not identified
                                    if (apiRequestCount < 5) { // Only process the next item if less than 5 API requests have been made
                                        console.log('Song not identified. Retrying...');
                                    } else { // If 5 API requests have been made, emit a SONG_IDENTIFICATION event with a 204 No Content status
                                        console.log('Song not identified. Maximum number of retries reached');
                                        socket.emit('SONG_IDENTIFICATION', { responseStatus: 204, responseData: {}, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
                                    }
                                }
                                // Delete the temporary files
                                fs.unlinkSync(fileName);
                                fs.unlinkSync(`${outputFileName}.wav`);
                                fs.unlinkSync(`${outputFileName}_raw.wav`);
                            })
                    .catch((error) => {
                        console.error(error);
                        socket.emit('SONG_IDENTIFICATION', { responseStatus: 500, responseData: data, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
                        // Delete the temporary files
                        if (fs.existsSync(fileName)) {
                            fs.unlinkSync(fileName);
                        }
                        if (fs.existsSync(`${outputFileName}.wav`)) {
                            fs.unlinkSync(`${outputFileName}.wav`);
                        }
                        if (fs.existsSync(`${outputFileName}_raw.wav`)) {
                            fs.unlinkSync(`${outputFileName}_raw.wav`);
                        }
                    });
                        })
                        .on('error', (error) => {
                            console.error(`Error converting audio: ${error}`);
                            // 500: Internal Server Error
                            socket.emit('SONG_IDENTIFICATION', { responseStatus: 500, responseData: {}, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
                            // Delete the temporary files
                            if (fs.existsSync(fileName)) {
                                fs.unlinkSync(fileName);
                            }
                            if (fs.existsSync(`${outputFileName}.wav`)) {
                                fs.unlinkSync(`${outputFileName}.wav`);
                            }
                        });
                });
            } else {
                console.error(`File ${outputFileName}.wav does not exist`);
                socket.emit('SONG_IDENTIFICATION', { responseStatus: 500, responseData: {}, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
            }
        })
        .on('error', (error) => {
            console.error(`Error saving audio: ${error}`);
            socket.emit('SONG_IDENTIFICATION', { responseStatus: 500, responseData: {}, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
            // Delete the temporary files
            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            }
        });
}

async function processAudioDataTest(user, socket) {
    if (userQueues[user].length === 0) {
        return;
    }

    // Get and remove the current item from the user's queue
    let userQueueData = userQueues[user].shift();

    const { audio, timestamp, sequenceNumber } = userQueueData

    if (userLastIdentification[user] && userLastIdentification[user] === timestamp) {
        console.log('Song already identified');
        return;
    } else if (userLastIdentification[user]) {
        console.log('Identifying a new song');
        userLastIdentification[user] = 0;
        userApiRequestCount[user] = 0;
    }

    if (sequenceNumber == 1) {
        // Reset the API request count for the user
        userApiRequestCount[user] = 0;
    }

    let apiRequestCount = userApiRequestCount[user] || 0;

    // With a probability of 30%, identify the song
    // With a probability of 10%, return an error
    // With a probability of 60%, return No Content

    const random = Math.random();
    let data = {};

    // Generate a random delay between 0 and 3 seconds
    const delay = Math.random() * 3000;

    setTimeout(() => {
        // Simulate an API request
        console.log('Making an API request')
        apiRequestCount++;
        userApiRequestCount[user] = apiRequestCount;
        console.log('API request count:', apiRequestCount);
    
        if (random < 0.3) { // Success
            if (userLastIdentification[user] && userLastIdentification[user] === timestamp) {
                console.log('Song already identified');
                return;
            }
            // Read the example response from the example_api_response.json file
            const exampleResponse = fs.readFileSync('example_api_response.json', 'utf8');
            data = JSON.parse(exampleResponse);
            console.log('Song identified');
            socket.emit('SONG_IDENTIFICATION', { responseStatus: 200, responseData: data, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
            // Add the timestamp to the userLastIdentification object
            userLastIdentification[user] = timestamp;
        } else if (random < 0.4) {  // Error
            console.log('Error identifying song');
            socket.emit('SONG_IDENTIFICATION', { responseStatus: 500, responseData: data, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
        }
        else {  // No Content
            if (apiRequestCount < 5) { // Only process the next item if less than 5 API requests have been made
                console.log('Song not identified. Retrying...');
            } else { // If 5 API requests have been made, emit a SONG_IDENTIFICATION event with a 204 No Content status
                console.log('Song not identified. Maximum number of retries reached');
                socket.emit('SONG_IDENTIFICATION', { responseStatus: 204, responseData: {}, responseTimestamp: timestamp, responseSequenceNumber: sequenceNumber});
            }
        }
    
    }, delay);
}


// WEB
// Serve static files from the 'www/web/login' directory when the user enters the URL with '/web'
app.use('/web', express.static(path.join(__dirname, 'www/web/login')));
// Serve the web page when the user enters the URL with '/web'
app.get('/web', function(req, res) {
    res.sendFile(path.join(__dirname, 'www/web/login', 'login_web.html'));
});
// Serve static files from the 'www/mobile/page' directory when the user enters the URL with '/mobile/page'
app.use('/web/page', express.static(path.join(__dirname, 'www/web/page')));
// Serve the main page when the user enters the URL with '/mobile/page'
// and verify the JWT token before serving the page
app.get('/web/page', verifyToken, function(req, res) {
    jwt.verify(req.token, SECRET_KEY, (err, authData) => {
        if(err) {
            res.sendStatus(403);
        } else {
            res.sendFile(path.join(__dirname, 'www/web/page', 'web.html'));
        }
    });
});


// APP
// Serve static files from the 'www/mobile/assets' directory
app.use('/mobile/assets', express.static(path.join(__dirname, 'www/mobile/assets')));

// Serve static files from the 'www/mobile/login' directory when the user enters the URL with '/mobile'
app.use('/mobile', express.static(path.join(__dirname, 'www/mobile/login')));
// Serve the login page when the user enters the URL with '/mobile'
app.get('/mobile', function(req, res) {
    res.sendFile(path.join(__dirname, 'www/mobile/login', 'login_mobile.html'));
});

// Serve static files from the 'www/mobile/page' directory when the user enters the URL with '/mobile/page'
app.use('/mobile/page', express.static(path.join(__dirname, 'www/mobile/page')));
// Serve the main page when the user enters the URL with '/mobile/page'
// and verify the JWT token before serving the page
app.get('/mobile/page', verifyToken, function(req, res) {
    jwt.verify(req.token, SECRET_KEY, (err, authData) => {
        if(err) {
            res.sendStatus(403);
        } else {
            res.sendFile(path.join(__dirname, 'www/mobile/page', 'mobile.html'));
        }
    });
});

server.listen(3000, () => {
  console.log('Listening on port 3000');
});