const socket = io();

const topButton = document.querySelector('.top-button');
const doubleMiddleButtonSearchLeft = document.querySelector('#discardSong');
const doubleMiddleButtonSearchRight = document.querySelector('#addSong');
const doubleMiddleButtonPlaylistLeft = document.querySelector('#removePlaylist');
const doubleMiddleButtonPlaylistRight = document.querySelector('#addPlaylist');
const bottomButton = document.querySelector('.bottom-button');
const doubleBottomButton = document.querySelector('.double-bottom-button');
const doubleBottomButtonLeft = document.querySelector('.double-bottom-button-left');
const doubleBottomButtonRight = document.querySelector('.double-bottom-button-right');
const cardsContainer = document.querySelector('.cards-container');
const searchSongBtn = document.querySelector('#searchSongBtn');
const favoritesBtn = document.querySelector('#favoritesBtn');
const historyBtn = document.querySelector('#historyBtn');
const disableVibrationBtn = document.querySelector('#disableVibration');
const disableMovementBtn = document.querySelector('#disableMovement');

// TODO: implement settigns and export features (including gesture interactions)
// TODO: for the export feature, imake so that it exports the playlist as is in the DOM,
//       so it is sorted as the user wants it
// TODO: implement history
// TODO: Implement shake to search song when in the main screen
let allowCardDetails = true; // Flag to allow the card details to be shown when clicking on a card
let sortTypeOrder = 0; // 0, 1, 2, 3 (0: Alphabetical Asc. , 1: Alphabetical Desc., 2: Duration Asc., 3: Duration Desc.)
let lastSelectionChangeTime = 0; // Time of the last song selection change to be able to control the gyro scroll speed
let handleGyroScrollWithInitialBeta;
let isGyroButtonPressed = false;    // Flag to check if the gyro button is pressed to avoid the gyro not stopping whe quicky tapping
let canInteractWithSelected = false; // User can only gesture interact with the selected card after pressing the "gyro" button
let selectedSongIndex = 0; // Index of the currently selected song when scrolling with the "gyro" button
let scrollTimeout; // Variable to store the timeout of the scroll event
let swipeThreshold = 150;
let canVibrate = true;
let canMotionControl = true;
let hasVibratedSwipe = false;
let scrolling_vertically = false;
let lastAccelX = 0;
let lastAccelY = 0;
let lastGyroX = 0;
let lastGyroZ = 0;
let lastInteraction = 0;
let currentScreen = 'main-screen';
let lastScrollLeft = 0;
let isScrolling = false;
let lowestLoadedPlaylist = 0;
let prevCurrentPlaylist = 0;
let currentPlaylist = 0;
let highestLoadedPlaylist = 0;
let accelerometer = new Accelerometer({ frequency: 60 });
let gyro = new Gyroscope({ frequency: 60 });

let playlists = []
// Structure of a playlist object:
// { name: 'Playlist 1', 
//   songs: [ 
//            { title: 'Song 1', 
//              artist: 'Artist 1', 
//              duration: '3:45'
//            },
//            { title: 'Song 2',
//              artist: 'Artist 2',
//              duration: '4:00'
//            },
//            ...
//          ],
//   totalDuration: '1:00:00'
// }


async function recordAndSendAudio(user, token) {
    try {
        // Timestamp in unix time (ms)
        const timestamp = Date.now();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Send 5 sequential five-second recordings to the server
        for (let i = 0; i < 5; i++) {
            const mediaRecorder = new MediaRecorder(stream);
            let audioChunks = [];

            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener('stop', async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const fileReader = new FileReader();

                fileReader.onloadend = async () => {
                    const arrayBuffer = fileReader.result;

                    const data = {
                        user: user,
                        token: token,
                        audio: arrayBuffer,
                        timestamp: timestamp,
                        sequenceNumber: i + 1,
                    };
                    
                    // Emit the SEARCH_SONG_TEST for simulating the Shazam API
                    // Emit the SEARCH_SONG event for using the Shazam API
                    socket.emit('SEARCH_SONG', data);

                    // Listen for the SONG_IDENTIFICATION event
                    socket.on('SONG_IDENTIFICATION', (data) => {
                        console.log('Identification:', data);
                        // If the identification timestamp corresponds to the sent timestamp
                        console.log('Request timestamp:', data.responseTimestamp);
                        console.log('Sent timestamp:', timestamp);
                        // The timestamp checks that it is the response to the correct request
                        // The sequence number prevents multiple events reacting to the same response
                        // so only the one who sent the request can react to the response
                        if (data.responseTimestamp == timestamp && data.responseSequenceNumber == i + 1) {
                            console.log('Status:', data.responseStatus);
                            if (data.responseStatus == '200') {
                                console.log('Song title:', data.responseData.track.title);
                                console.log('Song artist:', data.responseData.track.subtitle);
                                // Give a random duration between 0 and 10 minutes (The Shazam API does not provide the song duration)
                                let randomSeconds = Math.floor(Math.random() * 60);
                                let randomMinutes = Math.floor(Math.random() * 11);
                                let durationString = `${randomMinutes}:${randomSeconds < 10 ? '0' + randomSeconds : randomSeconds}`;
                                console.log('Song duration:', durationString);
                                // Hide the loading circle
                                document.querySelector('.loading-circle').style.display = 'none';
                                // Write the song title, artist and duration in the search song screen
                                document.querySelector('.song-found-title').innerHTML = data.responseData.track.title;
                                document.querySelector('.song-found-artist').innerHTML = data.responseData.track.subtitle;
                                document.querySelector('.song-found-duration').innerHTML = durationString;
                                // Show the double-middle-button
                                document.querySelector('.double-middle-button').style.display = 'flex';
                                

                            } else if (data.responseStatus === '204') {
                                console.log('No song found');
                                // alert('No song found');
                                // Go back to the main screen
                                goBack();
                            } else {
                                console.log('Status:', data.responseStatus);
                                // alert('Error finding the song');
                                // If the sequence number is 5, go back to the main screen
                                if (i === 4) {
                                    goBack();
                                }
                            }
                        }
                    });
                };

                fileReader.readAsArrayBuffer(audioBlob);
            });

            mediaRecorder.start();

            await new Promise(resolve => setTimeout(resolve, 5000));

            mediaRecorder.stop();
        }
    } catch (error) {
        console.error('Error capturing audio:', error);
    }
}

/////////////////////////////////////////////////////////////////////////////////////////////


socket.on('connect', () => {
    // Send the uname and token to the server
    socket.emit('MOBILE_CONNECTED', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });

    socket.on("ACK_CONNECTION", () => {
        console.log("Connection to page acknowledged");
    });

    // Listen for the PLAYLISTS_RETRIEVED event
    socket.on('PLAYLISTS_RETRIEVED', (data) => {
        console.log('Playlists retrieved:', data);
        // Replace the playlists array with the new playlists
        playlists = [...data];
        console.log('Playlists:', playlists);
        
        if (currentScreen === 'main-screen' || currentScreen === 'add-playlist-screen'
        || currentScreen === 'remove-playlist-screen') {         
            // Hide the bottom-button
            bottomButton.style.display = 'none';
            // Change the left double-bottom-button to "back"
            doubleBottomButtonLeft.id = 'back';
            doubleBottomButtonLeft.innerHTML = 'Atrás';
            // Change the right double-bottom-button to "addRemovePlaylist"
            doubleBottomButtonRight.id = 'addRemovePlaylist';
            doubleBottomButtonRight.innerHTML = '± Playlist';
            // Show the double-bottom-button
            doubleBottomButton.style.display = 'flex';
    
            // Change the top button to export
            topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 483.97 210.23" class="export-svg">
                    <defs>
                    <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:20px;}</style>
                    </defs>
                    <path class="cls-1" d="M252.57,114.46a9.37,9.37,0,0,0-18.73,0Zm-9.36,86.4h-9.37a9.37,9.37,0,0,0,12.86,8.69Zm71.73-28.8,3.49,8.69a9.36,9.36,0,0,0,5.88-8.69Zm9.37-59.87a9.37,9.37,0,0,0-18.74,0ZM248.89,107a9.37,9.37,0,0,0-11.37,14.89Zm19.89,27-5.68,7.44a9.38,9.38,0,0,0,9.69,1Zm50.13-13.35a9.37,9.37,0,0,0-8-16.94Zm-79.19-14.89a9.37,9.37,0,0,0,7,17.39Zm78.71-11.41a9.37,9.37,0,0,0-7-17.39Zm-7,0a9.37,9.37,0,0,0,7-17.39ZM246.7,48.19a9.36,9.36,0,1,0-7,17.38Zm72.83,29.32a9.37,9.37,0,0,0-9.18,16.33Zm14.05,25.69,4,8.47A9.37,9.37,0,0,0,338.17,95Zm-22.68.52a9.37,9.37,0,0,0,8,16.94ZM308,79.38A9.37,9.37,0,1,0,321.85,92Zm-72-28.49a9.37,9.37,0,0,0,14.41,12ZM167.92,77a9.37,9.37,0,0,0,7,17.39Zm78.71-11.4a9.36,9.36,0,1,0-7-17.38ZM176,93.83a9.37,9.37,0,1,0-9.18-16.33Zm-30.2,6.23-4.59-8.16a9.37,9.37,0,0,0,.58,16.63Zm21.6,20.6a9.37,9.37,0,1,0,8-16.94ZM174.9,77a9.37,9.37,0,0,0-7,17.39Zm64.76,46.19a9.37,9.37,0,1,0,7-17.39ZM164.41,91.89a9.37,9.37,0,0,0,14-12.45Zm71.53-29a9.36,9.36,0,1,0,14.41-12Zm16.57,51.62a9.37,9.37,0,1,0-18.73,0Zm-9.37,86.38-3.48,8.69a9.36,9.36,0,0,0,12.85-8.69Zm-71.73-28.8h-9.36a9.35,9.35,0,0,0,5.87,8.69Zm9.37-59.87a9.37,9.37,0,1,0-18.73,0Zm68.05,9.72A9.37,9.37,0,0,0,237.46,107ZM217.53,134l-4,8.47a9.36,9.36,0,0,0,9.68-1Zm-42.11-30.29a9.37,9.37,0,1,0-8,16.94Zm58.42,10.74v86.4h18.73v-86.4Zm12.86,95.09,71.73-28.8-7-17.38-71.73,28.8Zm77.61-37.49V112.19H305.57v59.87Zm-86.79-50.15,25.58,19.54,11.37-14.88L248.89,107Zm35.27,20.57,46.12-21.82-8-16.94-46.12,21.82ZM246.7,123.16l71.73-28.8-7-17.39-71.73,28.8ZM318.43,77,246.7,48.19l-7,17.38,71.73,28.79Zm-8.08,16.87L336,108.24,339.61,96l-18-17ZM338.17,95l-27.27,8.69,8,16.94,18.68-9ZM174.9,94.36l71.73-28.79-7-17.38L167.92,77ZM166.82,77.5,141.21,91.9l9.18,16.33L176,93.83Zm-25,31,25.61,12.13,8-16.94L149.81,91.6ZM173.8,89l68.26,32.55,4.57-15.79L192.16,81.58Zm-9.39,2.88,14-12.45m55.37,35v86.38h18.73V114.48Zm12.85,77.69-71.73-28.8-7,17.38,71.74,28.8Zm-65.85-20.11V112.19H162.05v59.87Zm56.68-65-25.61,19.54,11.36,14.89,25.62-19.54Zm-15.92,18.52-46.12-21.82-8,16.94,46.12,21.82Z"/>
                    <polygon class="cls-1" points="196.55 172.06 174.9 163.37 171.41 172.06 167.92 180.75 239.66 209.55 246.63 192.17 196.55 172.06"/>
                    <polygon class="cls-1" points="178.34 124.22 178.34 166.52 236.34 189.95 236.21 131.22 178.34 124.22"/>
                    <polygon class="cls-1" points="254.05 118.98 264.11 126.67 330.05 97.66 320.1 92.47 254.05 118.98"/>
                    <path id="primary" class="cls-2" d="M338.17,66.25l27.72-27.72A93.67,93.67,0,0,1,474,21"/>
                    <polyline id="primary-2" class="cls-2" points="338.17 36.07 338.17 66.25 368.35 66.25"/>
                    <path id="primary-2-2" data-name="primary" class="cls-2" d="M10,19.87A93.69,93.69,0,0,1,118.08,37.43L145.8,65.14"/>
                    <polyline id="primary-2-3" data-name="primary-2" class="cls-2" points="115.62 65.14 145.8 65.14 145.8 34.96"/>
                </svg>
            `;
            topButton.id = 'exportPlaylist';

            if (currentScreen === 'main-screen') {
                // Select the main-screen and hide it
                const mainScreen = document.querySelector('.main-screen');
                mainScreen.style.display = 'none';
            }
            else if (currentScreen === 'add-playlist-screen' || currentScreen === 'remove-playlist-screen') {
                // Go back to the playlists screen
                goBack();
                goBack();
            }
            
            // Display the spacers
            console.log(document.getElementById('card-first-spacer'));
            document.getElementById('card-first-spacer').style.display = 'block';
            document.getElementById('card-last-spacer').style.display = 'block';

            lowestLoadedPlaylist = 0;
            currentPlaylist = 0;
            highestLoadedPlaylist = 0;
            // Create a card element for all the playlists, with only the fist one focused
            for (let i = 0; i < playlists.length; i++) {
                if (i === 0) {
                    // Load the first playlist
                    loadNextPlaylist(0);
                }
                else {
                    // Load the next (CONCURRENT_PLAYLISTS - 1) playlists
                    loadNextPlaylist(1);
                }
            }
            // Focus the first card
            document.querySelector('.card').classList.remove('not-focused');
            document.querySelector('.card').classList.add('focused');

            // Scroll to the first card after the first spacer
            cardsContainer.scrollLeft = document.getElementById('card-first-spacer').nextSibling.offsetLeft;

            currentScreen = 'playlists-screen';
        }
        else if (currentScreen === 'search-song-screen') {
            // Hide the search song screen
            document.querySelector('.search-song-screen').style.display = 'none';
            // Show the bottom button
            bottomButton.style.display = 'flex';
            // Change the bottom button to "addSongToPlaylist"
            bottomButton.id = 'addSongToPlaylist';
            bottomButton.innerHTML = 'Añadir a Playlist';
            
            // Display the spacers
            console.log(document.getElementById('card-first-spacer'));
            document.getElementById('card-first-spacer').style.display = 'block';
            document.getElementById('card-last-spacer').style.display = 'block';

            lowestLoadedPlaylist = 0;
            currentPlaylist = 0;
            highestLoadedPlaylist = 0;
            // Create a card element for all the playlists, with only the fist one focused
            for (let i = 0; i < playlists.length; i++) {
                if (i === 0) {
                    // Load the first playlist
                    loadNextPlaylist(0);
                }
                else {
                    // Load the next (CONCURRENT_PLAYLISTS - 1) playlists
                    loadNextPlaylist(1);
                }
            }
            // Focus the first card
            document.querySelector('.card').classList.remove('not-focused');
            document.querySelector('.card').classList.add('focused');

            // Scroll to the first card after the first spacer
            cardsContainer.scrollLeft = document.getElementById('card-first-spacer').nextSibling.offsetLeft;    
            
            currentScreen = 'add-song-to-playlist-screen';
        }
    });

    socket.on('FAVORITES_RETRIEVED', (data) => {
        console.log('Favorites retrieved:', data);

        if (currentScreen === 'main-screen') {
            sortTypeOrder = 0;  // Reset the sort type order

            // Change the top button to "exportPlaylist"
            topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 483.97 210.23" class="export-svg">
                    <defs>
                    <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:20px;}</style>
                    </defs>
                    <path class="cls-1" d="M252.57,114.46a9.37,9.37,0,0,0-18.73,0Zm-9.36,86.4h-9.37a9.37,9.37,0,0,0,12.86,8.69Zm71.73-28.8,3.49,8.69a9.36,9.36,0,0,0,5.88-8.69Zm9.37-59.87a9.37,9.37,0,0,0-18.74,0ZM248.89,107a9.37,9.37,0,0,0-11.37,14.89Zm19.89,27-5.68,7.44a9.38,9.38,0,0,0,9.69,1Zm50.13-13.35a9.37,9.37,0,0,0-8-16.94Zm-79.19-14.89a9.37,9.37,0,0,0,7,17.39Zm78.71-11.41a9.37,9.37,0,0,0-7-17.39Zm-7,0a9.37,9.37,0,0,0,7-17.39ZM246.7,48.19a9.36,9.36,0,1,0-7,17.38Zm72.83,29.32a9.37,9.37,0,0,0-9.18,16.33Zm14.05,25.69,4,8.47A9.37,9.37,0,0,0,338.17,95Zm-22.68.52a9.37,9.37,0,0,0,8,16.94ZM308,79.38A9.37,9.37,0,1,0,321.85,92Zm-72-28.49a9.37,9.37,0,0,0,14.41,12ZM167.92,77a9.37,9.37,0,0,0,7,17.39Zm78.71-11.4a9.36,9.36,0,1,0-7-17.38ZM176,93.83a9.37,9.37,0,1,0-9.18-16.33Zm-30.2,6.23-4.59-8.16a9.37,9.37,0,0,0,.58,16.63Zm21.6,20.6a9.37,9.37,0,1,0,8-16.94ZM174.9,77a9.37,9.37,0,0,0-7,17.39Zm64.76,46.19a9.37,9.37,0,1,0,7-17.39ZM164.41,91.89a9.37,9.37,0,0,0,14-12.45Zm71.53-29a9.36,9.36,0,1,0,14.41-12Zm16.57,51.62a9.37,9.37,0,1,0-18.73,0Zm-9.37,86.38-3.48,8.69a9.36,9.36,0,0,0,12.85-8.69Zm-71.73-28.8h-9.36a9.35,9.35,0,0,0,5.87,8.69Zm9.37-59.87a9.37,9.37,0,1,0-18.73,0Zm68.05,9.72A9.37,9.37,0,0,0,237.46,107ZM217.53,134l-4,8.47a9.36,9.36,0,0,0,9.68-1Zm-42.11-30.29a9.37,9.37,0,1,0-8,16.94Zm58.42,10.74v86.4h18.73v-86.4Zm12.86,95.09,71.73-28.8-7-17.38-71.73,28.8Zm77.61-37.49V112.19H305.57v59.87Zm-86.79-50.15,25.58,19.54,11.37-14.88L248.89,107Zm35.27,20.57,46.12-21.82-8-16.94-46.12,21.82ZM246.7,123.16l71.73-28.8-7-17.39-71.73,28.8ZM318.43,77,246.7,48.19l-7,17.38,71.73,28.79Zm-8.08,16.87L336,108.24,339.61,96l-18-17ZM338.17,95l-27.27,8.69,8,16.94,18.68-9ZM174.9,94.36l71.73-28.79-7-17.38L167.92,77ZM166.82,77.5,141.21,91.9l9.18,16.33L176,93.83Zm-25,31,25.61,12.13,8-16.94L149.81,91.6ZM173.8,89l68.26,32.55,4.57-15.79L192.16,81.58Zm-9.39,2.88,14-12.45m55.37,35v86.38h18.73V114.48Zm12.85,77.69-71.73-28.8-7,17.38,71.74,28.8Zm-65.85-20.11V112.19H162.05v59.87Zm56.68-65-25.61,19.54,11.36,14.89,25.62-19.54Zm-15.92,18.52-46.12-21.82-8,16.94,46.12,21.82Z"/>
                    <polygon class="cls-1" points="196.55 172.06 174.9 163.37 171.41 172.06 167.92 180.75 239.66 209.55 246.63 192.17 196.55 172.06"/>
                    <polygon class="cls-1" points="178.34 124.22 178.34 166.52 236.34 189.95 236.21 131.22 178.34 124.22"/>
                    <polygon class="cls-1" points="254.05 118.98 264.11 126.67 330.05 97.66 320.1 92.47 254.05 118.98"/>
                    <path id="primary" class="cls-2" d="M338.17,66.25l27.72-27.72A93.67,93.67,0,0,1,474,21"/>
                    <polyline id="primary-2" class="cls-2" points="338.17 36.07 338.17 66.25 368.35 66.25"/>
                    <path id="primary-2-2" data-name="primary" class="cls-2" d="M10,19.87A93.69,93.69,0,0,1,118.08,37.43L145.8,65.14"/>
                    <polyline id="primary-2-3" data-name="primary-2" class="cls-2" points="115.62 65.14 145.8 65.14 145.8 34.96"/>
                </svg>
            `;
            topButton.id = 'exportPlaylist';

            // Change the bottom button to "back"
            bottomButton.innerHTML = 'Atrás';
            bottomButton.id = 'back';

            // Hide the main screen
            document.querySelector('.main-screen').style.display = 'none';

            // Display the spacers
            console.log(document.getElementById('card-first-spacer'));
            document.getElementById('card-first-spacer').style.display = 'block';
            document.getElementById('card-last-spacer').style.display = 'block';

            lowestLoadedPlaylist = 0;
            currentPlaylist = 0;
            highestLoadedPlaylist = 0;
            // Create a card element for the favorites playlists (there is only one)
            
            // Create a new card element
            const card = document.createElement('div');
            card.classList.add('card');
            card.id = 'cardFavorites';
            card.innerHTML = `
                    <svg class="bg-front-image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1004 1674.78" preserveAspectRatio="none">
                        <path fill="#currentColor"
                            d="M1004,80.57C1004,33.33,993.36,0,917.36,0,812.29,0,712.19,57.52,712.19,57.52,665.42,82.18,593.1,134.06,503,134.06l-.48,0h0v0H502v0h0l-.48,0c-90.12,0-162.44-51.88-209.21-76.54,0,0-100.1-57.52-205.17-57.52C11.14,0,.5,33.33.5,80.57s-.5,1122-.5,1122c0,298.35,221.3,471.75,501.31,472.24h1.88c280-.49,501.31-173.89,501.31-472.24C1004.5,1202.53,1004,127.82,1004,80.57Z" />
                    </svg>
                    <div class="playlist-info-container" id="playlist-info-container-favorites">
                        <div class="playlist-top-info" id="playlist-top-info-favorites"></div>
                        <div class="playlist-title">Favoritos</div>
                    </div>
                `;
            // Add the number of songs in the playlist in top-info
            let numSongs = document.createElement('div');
            numSongs.classList.add('num-songs');
            numSongs.innerHTML = `${data.songs.length}`;
            card.querySelector('.playlist-top-info').appendChild(numSongs);

            // Add the total duration of the playlist in top-info
            let totalDuration = document.createElement('div');
            totalDuration.classList.add('total-duration');
            totalDuration.innerHTML = `${data.totalDuration}`;
            card.querySelector('.playlist-top-info').appendChild(totalDuration);

            // Add the playlist songs to the card as a list
            let playlistSongs = document.createElement('ul');
            playlistSongs.classList.add('playlist-songs');

            // Add a scroll event listener to the playlistSongs
            playlistSongs.addEventListener('scroll', function() {
                window.clearTimeout(scrollTimeout); // Clear the timeout if a scroll event is detected
                // Set the scrolling flag to true
                scrolling_vertically = true;
                console.log('Scrolling...');
                // Set a timeout to detect when the scrolling has stopped
                scrollTimeout = setTimeout(function() {
                    // Reset the scrolling flag
                    scrolling_vertically = false;
                    console.log('Scrolling has stopped');
                }, 100); // Set the delay to 100 milliseconds
                });

            data.songs.forEach(song => {
                let songElement = document.createElement('li');
                songElement.classList.add('song');
                songElement.innerHTML = `
                    <div class="song-top-info">
                        <div class="song-title">${song.title}</div>
                        <div class="song-duration">${song.duration}</div>
                    </div>
                    <div class="song-artist">${song.artist}</div>
                `;
                // Swipe right a song to remove it from the favorites playlist

                // Touch start
                songElement.addEventListener('touchstart', (event) => {
                    // Do nothing if the song does not belong to a playlist with the detailed-card class
                    if (!card.classList.contains('detailed-card')) {
                        return;
                    }
                    console.log('Song element touched:', songElement);
                    // Get the initial touch position
                    songElement.startX = event.touches[0].clientX;
                });

                // Touch move
                songElement.addEventListener('touchmove', (event) => {
                    // Do nothing if the song does not belong to a playlist with the detailed-card class
                    // or if the initial touch position is not set
                    if (!card.classList.contains('detailed-card') || !songElement.startX) {
                        return;
                    }

                    // Eliminate the transition effect
                    // (a transition effect could have been applied with the touchend event)
                    songElement.style.transition = 'none';
                    // Calculate the difference between the initial touch position and the current touch position
                    const xDiff = event.changedTouches[0].clientX - songElement.startX;

                    // When the user is swiping right
                    if (!scrolling_vertically && xDiff > 5) {   // 5 is a threshold to avoid conflicts with vertical scrolling
                        event.preventDefault(); // Prevent scrolling when swiping
                        songElement.style.transform = `translateX(${xDiff}px)`;
                        if (xDiff < swipeThreshold) {
                            // Invert the background color of the song element proportionally to the swipe distance
                            songElement.style.backgroundColor = `rgba(255, 255, 255, ${xDiff / swipeThreshold})`;
                            // Invert the font color of the song element proportionally to the swipe distance
                            songElement.style.color = `rgba(${255- (xDiff / swipeThreshold) * 255}, ${255- (xDiff / swipeThreshold) * 255}, ${255- (xDiff / swipeThreshold) * 255}, 1)`;
                            // Eliminate the font style bold
                            songElement.style.fontWeight = 'normal';
                            // Reset the vibration flag
                            hasVibratedSwipe = false;
                        }
                        else {
                            // Completely invert the background color of the song element
                            songElement.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                            // Completely invert the font color of the song element
                            songElement.style.color = 'rgba(0, 0, 0, 1)';
                            // Make the font style bold
                            songElement.style.fontWeight = 'bold';
                            // Vibrate the device if we haven't done it yet
                            if (!hasVibratedSwipe && canVibrate) {
                                navigator.vibrate(50);
                                console.log("Vibrating");
                                hasVibratedSwipe = true;
                            }
                        }
                    }

                    else if (scrolling_vertically) {
                        // Animate the item back to its original position, color and font style
                        songElement.style.transition = 'transform 0.3s ease';
                        songElement.style.transform = 'translateX(0)';
                        songElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
                        songElement.style.color = 'rgba(255, 255, 255, 1)';
                        songElement.style.fontWeight = 'normal';
                        
                        // Reset the initial touch position
                        songElement.startX = null;
                        // Reset the vibration flag
                        hasVibratedSwipe = false;
                    }
                    else {
                        // Reset the vibration flag
                        hasVibratedSwipe = false;
                    }
                });

                // Touch end
                songElement.addEventListener('touchend', (event) => {
                    // Do nothing if the song does not belong to a playlist with the detailed-card class
                    // or if the initial touch position is not set
                    if (!card.classList.contains('detailed-card') || !songElement.startX) {
                        return;
                    }
                    // Reset the scrolling flag
                    scrolling_vertically = false;
                    // Reset the vibration flag
                    hasVibratedSwipe = false;
                    // Calculate the difference between the initial touch position and the current touch position
                    const xDiff = event.changedTouches[0].clientX - songElement.startX;

                    // If the user completed the swipe to the right
                    if (xDiff > swipeThreshold) {
                        // Make a request to the server to remove the song from the playlist
                        let songTitle = songElement.querySelector('.song-title').innerHTML;
                        let songArtist = songElement.querySelector('.song-artist').innerHTML;
                        let songDuration = songElement.querySelector('.song-duration').innerHTML;
                        console.log('Removing song:', song.title);
                        requestRemoveFromFavorites(songTitle, songArtist, songDuration);
                    }
            
                    // No swipe was completed
                    else {
                        // Animate the item back to its original position, color and font style
                        console.log('No swipe was completed');
                        songElement.style.transition = 'transform 0.3s ease';
                        songElement.style.transform = 'translateX(0)';
                        songElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
                        songElement.style.color = 'rgba(255, 255, 255, 1)';
                        songElement.style.fontWeight = 'normal';

                        // Reset the initial touch position
                        songElement.startX = null;
                    }
                });
                playlistSongs.appendChild(songElement);
            });

            // Add an event listener to the card
            card.addEventListener('click', function() {
                sortTypeOrder = 0;  // Reset the sort type order

                // Replace the svg element of the top button
                topButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106.87 109.69" class="not-sorting-svg">
                        <defs>
                            <style>.cls-1{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:21px;}</style>
                        </defs>
                        <line class="cls-1" x1="10.5" y1="54.83" x2="96.37" y2="54.86"/>
                        <line class="cls-1" x1="96.37" y1="10.53" x2="10.5" y2="10.5"/>
                        <line class="cls-1" x1="10.5" y1="99.16" x2="96.37" y2="99.19"/>
                    </svg>
                `;
                // Change the top button id to "sortPlaylist"
                topButton.id = 'sortPlaylist';
                

                // Change the right double bottom button to "gyro"
                doubleBottomButtonRight.id = 'gyro';
                doubleBottomButtonRight.innerHTML = 'Gyro';

                // Hide the bottom button
                bottomButton.style.display = 'none';
                // Show the double-bottom-button
                doubleBottomButton.style.display = 'flex';
                
                // Add the class "detailed-card" to the card
                this.classList.add('detailed-card');

                // Change the current screen
                currentScreen = 'playlist-details-screen';
            });

            card.querySelector('.playlist-info-container').appendChild(playlistSongs);

            card.classList.add('focused');
            // Insert the card at the beginning of the cards-container, after the first spacer
            document.querySelector('.cards-container').insertBefore(card, document.getElementById('card-first-spacer').nextSibling);
            // Observe the card
            observer.observe(card);


            // Scroll to the first card after the first spacer
            cardsContainer.scrollLeft = document.getElementById('card-first-spacer').nextSibling.offsetLeft;

            // Prevent horizontal scrolling of the cards-container
            cardsContainer.style.overflowX = 'hidden';

            currentScreen = 'favorites-screen';
        }
    });

            



    // Listen for ADD_TO_PLAYLIST_SUCCESS event
    socket.on('ADD_TO_PLAYLIST_SUCCESS', (data) => {
        console.log('Song added to playlist:', data);
    });
    // Listen for ADD_TO_PLAYLIST_DATABASE_ERROR, ADD_TO_PLAYLIST_FORMAT_ERROR,
    // ADD_TO_PLAYLIST_ALREADY_EXISTS, ADD_TO_PLAYLIST_NOT_FOUND and ADD_TO_PLAYLIST_USER_NOT_FOUND events
    socket.on('ADD_TO_PLAYLIST_DATABASE_ERROR', () => {
        console.log('Database error adding song to playlist');
        alert('Database error adding song to playlist');
    });
    socket.on('ADD_TO_PLAYLIST_FORMAT_ERROR', () => {
        console.log('Format error adding song to playlist');
        alert('Format error adding song to playlist');
    });
    socket.on('ADD_TO_PLAYLIST_ALREADY_EXISTS', () => {
        console.log('Song already exists in playlist');
        alert('Song already exists in playlist');
    });
    socket.on('ADD_TO_PLAYLIST_NOT_FOUND', () => {
        console.log('Playlist not found');
        alert('Playlist not found');
    });
    socket.on('ADD_TO_PLAYLIST_USER_NOT_FOUND', () => {
        console.log('User not found');
        alert('User not found');
    });

    // Listen for EXPORT_PLAYLIST_SUCCESS event
    socket.on('EXPORT_PLAYLIST_SUCCESS', (playlistTitle) => {
        console.log('Playlist exported: ', playlistTitle);
        alert('Playlist exported successfully: ' + playlistTitle);
    });

    // Listen for EXPORT_PLAYLIST_WEB_CLIENT_NOT_FOUND
    socket.on('EXPORT_PLAYLIST_WEB_CLIENT_NOT_FOUND', (playlistTitle) => {
        console.log('Web client not found for exporting playlist: ', playlistTitle);
        alert('Web client not found for exporting playlist: ' + playlistTitle + '.\nPlease open the web client');
    });

});



// Function that loads the next playlist given a direction:
// -1 for loading the playlist previous to the lowest loaded playlist
// 0 for loading the current playlist (implemented to load the first playlist)
// 1 for loading the playlist next to the highest loaded playlist
function loadNextPlaylist(direction) {
    if (direction === -1) {
        // Check if the lowest loaded playlist is the first one
        if (lowestLoadedPlaylist === 0) {
            // Do nothing
            return;
        }
        // Check if the lowest loaded playlist is greater than 0
        if (lowestLoadedPlaylist > 0) {
            // Decrease the lowest loaded playlist
            lowestLoadedPlaylist--;
            // Create a new card element
            const card = createCard(lowestLoadedPlaylist);
            card.classList.add('not-focused');
            // Insert the card at the beginning of the cards-container, after the first spacer
            document.querySelector('.cards-container').insertBefore(card, document.getElementById('card-first-spacer').nextSibling);
            // Observe the card
            observer.observe(card);
        }
    } else if (direction === 0) {
        
        // Create a new card element
        const card = createCard(currentPlaylist);
        // Add the focused class to the card
        card.classList.add('focused');
        // Insert the card at the beginning of the cards-container, after the first spacer
        document.querySelector('.cards-container').insertBefore(card, document.getElementById('card-first-spacer').nextSibling);
        console.log('Playlist card loaded:', card);
        // Observe the card
        observer.observe(card);
        
    } else if (direction === 1) {
        // Check if the highest loaded playlist is the last one
        if (highestLoadedPlaylist === playlists.length - 1) {
            // Do nothing
            return;
        }
        // Check if the highest loaded playlist is less than the total number of playlists
        if (highestLoadedPlaylist < playlists.length - 1) {
            // Increase the highest loaded playlist
            highestLoadedPlaylist++;
            // Create a new card element
            const card = createCard(highestLoadedPlaylist);
            card.classList.add('not-focused');
            // Insert the card at the end of the cards-container, before the last spacer
            document.querySelector('.cards-container').insertBefore(card, document.getElementById('card-last-spacer'));
            console.log('Playlist card loaded:', card);
            // Observe the card
            observer.observe(card);
        }
    }
}

// Function that removes a playlist card given a direction (-1 for left, 1 for right)
function removePlaylistCard(direction) {
    if (direction === -1) {
        // Check if the lowest loaded playlist is less than the current playlist
        if (lowestLoadedPlaylist < currentPlaylist) {
            // Unobserve the first card after the first spacer
            observer.unobserve(document.getElementById('card-first-spacer').nextSibling);
            // Remove the first card after the first spacer
            console.log('Playlist card removed:', document.getElementById('card-first-spacer').nextSibling);
            document.getElementById('card-first-spacer').nextSibling.remove();
            // Increase the lowest loaded playlist
            lowestLoadedPlaylist++;
        }
    } else if (direction === 1) {
        // Check if the highest loaded playlist is greater than the current playlist
        if (highestLoadedPlaylist > currentPlaylist) {
            // Unobserve the last card before the last spacer
            observer.unobserve(document.getElementById('card-last-spacer').previousSibling);
            // Remove the last card before the last spacer
            console.log('Playlist card removed:', document.getElementById('card-last-spacer').previousSibling);
            document.getElementById('card-last-spacer').previousSibling.remove();
            // Decrease the highest loaded playlist
            highestLoadedPlaylist--;
        }
    }
}

// Function that creates and returns a new card element given a card id
function createCard(id) {
    // Create a new card element
    const card = document.createElement('div');
    card.classList.add('card');
    card.id = 'card' + id;
    card.innerHTML = `
            <svg class="bg-front-image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1004 1674.78" preserveAspectRatio="none">
                <path fill="#currentColor"
                    d="M1004,80.57C1004,33.33,993.36,0,917.36,0,812.29,0,712.19,57.52,712.19,57.52,665.42,82.18,593.1,134.06,503,134.06l-.48,0h0v0H502v0h0l-.48,0c-90.12,0-162.44-51.88-209.21-76.54,0,0-100.1-57.52-205.17-57.52C11.14,0,.5,33.33.5,80.57s-.5,1122-.5,1122c0,298.35,221.3,471.75,501.31,472.24h1.88c280-.49,501.31-173.89,501.31-472.24C1004.5,1202.53,1004,127.82,1004,80.57Z" />
            </svg>
            <div class="playlist-info-container" id="playlist-info-container-${id}">
                <div class="playlist-top-info" id="playlist-top-info-${id}"></div>
                <div class="playlist-title">${playlists[id].name}</div>
            </div>
        `;

    // Add the number of songs in the playlist in top-info
    let numSongs = document.createElement('div');
    numSongs.classList.add('num-songs');
    numSongs.innerHTML = `${playlists[id].songs.length}`;
    card.querySelector('.playlist-top-info').appendChild(numSongs);

    // Add the total duration of the playlist in top-info
    let totalDuration = document.createElement('div');
    totalDuration.classList.add('total-duration');
    totalDuration.innerHTML = `${playlists[id].totalDuration}`;
    card.querySelector('.playlist-top-info').appendChild(totalDuration);

    // Add the playlist songs to the card as a list
    let playlistSongs = document.createElement('ul');
    playlistSongs.classList.add('playlist-songs');

    if (currentScreen === 'main-screen' || currentScreen === 'add-playlist-screen'
    || currentScreen === 'remove-playlist-screen') {
        // Add a scroll event listener to the playlistSongs
        playlistSongs.addEventListener('scroll', function() {
        window.clearTimeout(scrollTimeout); // Clear the timeout if a scroll event is detected
        // Set the scrolling flag to true
        scrolling_vertically = true;
        console.log('Scrolling...');
        // Set a timeout to detect when the scrolling has stopped
        scrollTimeout = setTimeout(function() {
            // Reset the scrolling flag
            scrolling_vertically = false;
            console.log('Scrolling has stopped');
        }, 100); // Set the delay to 100 milliseconds
        });
    }


    playlists[id].songs.forEach(song => {
        let songElement = document.createElement('li');
        songElement.classList.add('song');
        songElement.innerHTML = `
            <div class="song-top-info">
                <div class="song-title">${song.title}</div>
                <div class="song-duration">${song.duration}</div>
            </div>
            <div class="song-artist">${song.artist}</div>
        `;

        if (currentScreen === 'main-screen' || currentScreen === 'add-playlist-screen'
        || currentScreen === 'remove-playlist-screen') {
            // Swipe right a song to remove it from the playlist
            // Swipe left a song to add it to the favorites
            // Touch start
            songElement.addEventListener('touchstart', (event) => {
                // Do nothing if the song does not belong to a playlist with the detailed-card class
                if (!card.classList.contains('detailed-card')) {
                    return;
                }
                console.log('Song element touched:', songElement);
                // Get the initial touch position
                songElement.startX = event.touches[0].clientX;
            });

            // Touch move
            songElement.addEventListener('touchmove', (event) => {
                // Do nothing if the song does not belong to a playlist with the detailed-card class
                // or if the initial touch position is not set
                if (!card.classList.contains('detailed-card') || !songElement.startX) {
                    return;
                }

                // Eliminate the transition effect
                // (a transition effect could have been applied with the touchend event)
                songElement.style.transition = 'none';
                // Calculate the difference between the initial touch position and the current touch position
                const xDiff = event.changedTouches[0].clientX - songElement.startX;

                // When the user is swiping right
                if (!scrolling_vertically && xDiff > 5) {   // 5 is a threshold to avoid conflicts with vertical scrolling
                    event.preventDefault(); // Prevent scrolling when swiping
                    songElement.style.transform = `translateX(${xDiff}px)`;
                    if (xDiff < swipeThreshold) {
                        // Invert the background color of the song element proportionally to the swipe distance
                        songElement.style.backgroundColor = `rgba(255, 255, 255, ${xDiff / swipeThreshold})`;
                        // Invert the font color of the song element proportionally to the swipe distance
                        songElement.style.color = `rgba(${255- (xDiff / swipeThreshold) * 255}, ${255- (xDiff / swipeThreshold) * 255}, ${255- (xDiff / swipeThreshold) * 255}, 1)`;
                        // Eliminate the font style bold
                        songElement.style.fontWeight = 'normal';
                        // Reset the vibration flag
                        hasVibratedSwipe = false;
                    }
                    else {
                        // Completely invert the background color of the song element
                        songElement.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                        // Completely invert the font color of the song element
                        songElement.style.color = 'rgba(0, 0, 0, 1)';
                        // Make the font style bold
                        songElement.style.fontWeight = 'bold';
                        // Vibrate the device if we haven't done it yet
                        if (!hasVibratedSwipe && canVibrate) {
                            navigator.vibrate(50);
                            console.log("Vibrating");
                            hasVibratedSwipe = true;
                        }
                    }
                }

                // When the user is swiping left
                else if (!scrolling_vertically && xDiff < -5) {   // 5 is a threshold to avoid conflicts with vertical scrolling
                    event.preventDefault(); // Prevent scrolling when swiping
                    songElement.style.transform = `translateX(${xDiff}px)`;
                    if (xDiff > -swipeThreshold) {
                        // Invert the background color of the song element proportionally to the swipe distance
                        songElement.style.backgroundColor = `rgba(255, 255, 255, ${-xDiff / swipeThreshold})`;
                        // Invert the font color of the song element proportionally to the swipe distance
                        songElement.style.color = `rgba(${255- (-xDiff / swipeThreshold) * 255}, ${255- (-xDiff / swipeThreshold) * 255}, ${255- (-xDiff / swipeThreshold) * 255}, 1)`;
                        // Eliminate the font style bold
                        songElement.style.fontWeight = 'normal';
                        // Reset the vibration flag
                        hasVibratedSwipe = false;
                    }
                    else {
                        // Completely invert the background color of the song element
                        songElement.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                        // Completely invert the font color of the song element
                        songElement.style.color = 'rgba(0, 0, 0, 1)';
                        // Make the font style bold
                        songElement.style.fontWeight = 'bold';
                        // Vibrate the device if we haven't done it yet
                        if (!hasVibratedSwipe && canVibrate) {
                            navigator.vibrate(50);
                            console.log("Vibrating");
                            hasVibratedSwipe = true;
                        }
                    }
                }
                else if (scrolling_vertically) {
                    // Animate the item back to its original position, color and font style
                    songElement.style.transition = 'transform 0.3s ease';
                    songElement.style.transform = 'translateX(0)';
                    songElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
                    songElement.style.color = 'rgba(255, 255, 255, 1)';
                    songElement.style.fontWeight = 'normal';
                    
                    // Reset the initial touch position
                    songElement.startX = null;
                    // Reset the vibration flag
                    hasVibratedSwipe = false;
                }
                else {
                    // Reset the vibration flag
                    hasVibratedSwipe = false;
                }
            });

            // Touch end
            songElement.addEventListener('touchend', (event) => {
                // Do nothing if the song does not belong to a playlist with the detailed-card class
                // or if the initial touch position is not set
                if (!card.classList.contains('detailed-card') || !songElement.startX) {
                    return;
                }
                // Reset the scrolling flag
                scrolling_vertically = false;
                // Reset the vibration flag
                hasVibratedSwipe = false;
                // Calculate the difference between the initial touch position and the current touch position
                const xDiff = event.changedTouches[0].clientX - songElement.startX;

                // If the user completed the swipe to the right
                if (xDiff > swipeThreshold) {
                    // Make a request to the server to remove the song from the playlist
                    let songTitle = songElement.querySelector('.song-title').innerHTML;
                    let songArtist = songElement.querySelector('.song-artist').innerHTML;
                    let songDuration = songElement.querySelector('.song-duration').innerHTML;
                    console.log('Removing song:', song.title);
                    requestRemoveSong(songTitle, songArtist, songDuration, playlists[id].name);
                }
                // If the user completed the swipe to the left
                else if (xDiff < -swipeThreshold) {
                    // Make a request to the server to add the song to the favorites
                    console.log('Adding song to favorites:', song.title);
                    let songTitle = songElement.querySelector('.song-title').innerHTML;
                    let songArtist = songElement.querySelector('.song-artist').innerHTML;
                    let songDuration = songElement.querySelector('.song-duration').innerHTML;
                    requestAddToFavorites(songTitle, songArtist, songDuration, playlists[id].name);
                }
                // No swipe was completed
                else {
                    // Animate the item back to its original position, color and font style
                    console.log('No swipe was completed');
                    songElement.style.transition = 'transform 0.3s ease';
                    songElement.style.transform = 'translateX(0)';
                    songElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
                    songElement.style.color = 'rgba(255, 255, 255, 1)';
                    songElement.style.fontWeight = 'normal';

                    // Reset the initial touch position
                    songElement.startX = null;
                }
            });
        }
        playlistSongs.appendChild(songElement);
    });

    card.querySelector('.playlist-info-container').appendChild(playlistSongs);

    if (currentScreen === 'main-screen' || currentScreen === 'add-playlist-screen'
    || currentScreen === 'remove-playlist-screen') {
        // Add an event listener to the card
        card.addEventListener('click', function() {
            if (allowCardDetails) {
                // Hide all other cards
                const cards = document.querySelectorAll('.card');
                for (let i = 0; i < cards.length; i++) {
                    if (cards[i] !== this) {
                        cards[i].style.display = 'none';
                    }
                }

                sortTypeOrder = 0;  // Reset the sort type order

                // Replace the svg element of the top button
                topButton.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106.87 109.69" class="not-sorting-svg">
                        <defs>
                            <style>.cls-1{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:21px;}</style>
                        </defs>
                        <line class="cls-1" x1="10.5" y1="54.83" x2="96.37" y2="54.86"/>
                        <line class="cls-1" x1="96.37" y1="10.53" x2="10.5" y2="10.5"/>
                        <line class="cls-1" x1="10.5" y1="99.16" x2="96.37" y2="99.19"/>
                    </svg>
                `;
                // Change the top button id to "sortPlaylist"
                topButton.id = 'sortPlaylist';
                

                // Change the right double bottom button to "gyro"
                doubleBottomButtonRight.id = 'gyro';
                doubleBottomButtonRight.innerHTML = 'Gyro';
                
                // Add the class "detailed-card" to the card
                this.classList.add('detailed-card');

                // Change the current screen
                currentScreen = 'playlist-details-screen';
            }
        });
    }
    return card;
}

topButton.addEventListener('click', function(e) {
    console.log('Top button clicked');
    if (this.id === 'sortPlaylist') {
        console.log('Sorting playlist:', document.querySelector('.detailed-card').querySelector('.playlist-title').innerHTML);
        let playlistSongs = document.querySelector('.detailed-card').querySelector('.playlist-songs');
        // Sort the playlist songs
        if (sortTypeOrder === 0) {   // Alphabetical Asc.
            // Replace the svg element of the top button
            topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252.48 131.82" class="sorting-svg">
                    <defs>
                        <style>.cls-1{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:21px;}</style>
                    </defs>
                    <path class="cls-1" d="M121.31,65.85h35.14M43.75,10.5V121.32M10.5,43.75,43.75,10.5M77,43.75,43.75,10.5m132.53,11h-55m0,88.65h15.31"/>
                    <polyline class="cls-1" points="177.07 121.26 210.74 45.33 241.98 121.26"/><line class="cls-1" x1="186.02" y1="101.07" x2="233.68" y2="101.07"/>
                </svg>
            `;
            sortPlaylist(playlistSongs, 0, 0);

        } else if (sortTypeOrder === 1) {   // Alphabetical Desc.
            topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252.5 131.82" class="sorting-svg">
                    <defs>
                        <style>.cls-1{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:21px;}</style>
                    </defs>
                    <path class="cls-1" d="M121.32,65.91h35.15M176.3,21.58h-55m0,88.66h15.32M43.75,10.5V121.32m0,0L10.5,88.08m33.25,33.24L77,88.08"/>
                    <polyline class="cls-1" points="177.09 121.32 210.76 45.39 242 121.32"/>
                    <line class="cls-1" x1="186.04" y1="101.14" x2="233.69" y2="101.14"/>
                </svg>
            `;
            sortPlaylist(playlistSongs, 0, 1);

        } else if (sortTypeOrder === 2) {   // Duration Asc.
            topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 249.48 131.82" class="sorting-svg">
                    <defs>
                        <style>.cls-1,.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;}.cls-1{stroke-width:21px;}.cls-2{stroke-width:15px;}</style>
                    </defs>
                    <path class="cls-1" d="M121.31,65.85h35.14M43.75,10.5V121.32M10.5,43.75,43.75,10.5M77,43.75,43.75,10.5m132.53,11h-55m0,88.65h15.31"/>
                    <polygon class="cls-2" points="189.31 121.32 240.78 51.67 188.11 51.74 241.98 121.26 189.31 121.32"/>
                </svg>
            `;
            sortPlaylist(playlistSongs, 1, 0);

        } else if (sortTypeOrder === 3) {   // Duration Desc.
            topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 249.02 131.82" class="sorting-svg">
                    <defs>
                        <style>.cls-1,.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;}.cls-1{stroke-width:21px;}.cls-2{stroke-width:15px;}</style>
                    </defs>
                    <path class="cls-1" d="M43.75,10.5V121.32m0,0L10.5,88.08m33.25,33.24L77,88.08"/>
                    <line class="cls-1" x1="120.84" y1="65.91" x2="155.99" y2="65.91"/>
                    <line class="cls-1" x1="175.82" y1="21.58" x2="120.84" y2="21.58"/>
                    <line class="cls-1" x1="120.84" y1="110.24" x2="136.15" y2="110.24"/>
                    <polygon class="cls-2" points="188.85 121.39 240.32 51.74 187.65 51.81 241.52 121.32 188.85 121.39"/>
                </svg>
            `;
            sortPlaylist(playlistSongs, 1, 1);   
        }
        sortTypeOrder = (sortTypeOrder + 1) % 4;
    }
    else if (this.id === 'settingsBtn') {
        // Hide the main screen
        document.querySelector('.main-screen').style.display = 'none';
        // Show the settings screen
        document.querySelector('.settings-screen').style.display = 'flex';
        
        // Hide the double-middle-button
        document.querySelector('.double-middle-button').style.display = 'none';
        // Change the bottom button to "back"
        bottomButton.id = 'back';
        bottomButton.innerHTML = 'Atrás';
        bottomButton.style.display = 'flex';
        // Hide the top button
        topButton.style.display = 'none';

        currentScreen = 'settings-screen';
    }
    else if (this.id === 'exportPlaylist') {
        if (currentScreen === 'playlists-screen') {
            // Send the current playlist to the server with the order it has in the DOM
            let playlistTitle = playlists[currentPlaylist].name;
            // Get the playlist-songs from the element playlist-title that matches in which innerHTML is the playlistTitle
            playlistContainer = document.querySelector('.playlist-title').innerHTML === playlistTitle ? document.querySelector('.playlist-info-container') : null;
            if (playlistContainer) {
                let playlistSongs = [];
                playlistContainer.querySelectorAll('.song').forEach(song => {
                    playlistSongs.push({
                        title: song.querySelector('.song-title').innerHTML,
                        artist: song.querySelector('.song-artist').innerHTML,
                        duration: song.querySelector('.song-duration').innerHTML
                    });
                });
                let playlistNumSongs = playlistContainer.querySelector('.num-songs').innerHTML;
                let playlistTotalDuration = playlistContainer.querySelector('.total-duration').innerHTML;
                socket.emit('EXPORT_PLAYLIST', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token'), playlistTitle: playlistTitle,
                    playlistSongs: playlistSongs, playlistNumSongs: playlistNumSongs, playlistTotalDuration: playlistTotalDuration });
                console.log('Exporting playlist:', playlistTitle);
            }
        }
        else if (currentScreen === 'favorites-screen') {
            // Send the favorites to the server with the order they have in the DOM
            let playlistSongs = [];
            document.querySelector('#cardFavorites').querySelectorAll('.song').forEach(song => {
                playlistSongs.push({
                    title: song.querySelector('.song-title').innerHTML,
                    artist: song.querySelector('.song-artist').innerHTML,
                    duration: song.querySelector('.song-duration').innerHTML
                });
            });
            let playlistNumSongs = document.querySelector('#cardFavorites').querySelector('.num-songs').innerHTML;
            let playlistTotalDuration = document.querySelector('#cardFavorites').querySelector('.total-duration').innerHTML;
            socket.emit('EXPORT_PLAYLIST', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token'), playlistTitle: 'Favorites',
                playlistSongs: playlistSongs, playlistNumSongs: playlistNumSongs, playlistTotalDuration: playlistTotalDuration });
            console.log('Exporting favorites');

        }
    }


});

searchSongBtn.addEventListener("click", function() {
    console.log('Search song button clicked');
    // Hide the main screen
    document.querySelector('.main-screen').style.display = 'none';
    // Show the search song screen
    document.querySelector('.search-song-screen').style.display = 'flex';
    // Hide the double-middle-button
    document.querySelector('.double-middle-button').style.display = 'none';
    // Hide the bottom button
    bottomButton.style.display = 'none';
    // Hide the top button
    topButton.style.display = 'none';
    // Show the spinning loading circle
    document.querySelector('.loading-circle').style.display = 'flex';

    
    currentScreen = 'search-song-screen';
    recordAndSendAudio();
});

favoritesBtn.addEventListener('click', function() {
    console.log('Favorites button clicked');
    // Make a request to the server to get the favorites
    socket.emit('GET_FAVORITES', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
});

historyBtn.addEventListener('click', function() {
    console.log('History button clicked');
    alert('Coming soon...');
});

disableVibrationBtn.addEventListener('change', function() {
    canVibrate = !this.checked;
});

disableMovementBtn.addEventListener('change', function() {
    canMotionControl = !this.checked;
});

doubleMiddleButtonSearchLeft.addEventListener('click', function() {
    console.log('Left double middle button clicked');
    // Check if the id of the clicked button is "discardSong"
    if (this.id === 'discardSong') {
        // Go back to the main screen
        goBack();
    }
});

doubleMiddleButtonSearchRight.addEventListener('click', function() {
    console.log('Right double middle button clicked');
    // Check if the id of the clicked button is "addSong"
    if (this.id === 'addSong') {
        // Emit a GET_PLAYLISTS event to the server
        socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
    }
});

doubleMiddleButtonPlaylistLeft.addEventListener('click', function() {
    console.log('Left double middle button clicked');
    // Check if the id of the clicked button is "removePlaylist"
    if (this.id === 'removePlaylist') {
        // Hide the add-remove-playlist-screen
        document.querySelector('.add-remove-playlist-screen').style.display = 'none';
        // Change the right double bottom button to "removePlaylistBottom"
        doubleBottomButtonRight.id = 'removePlaylistBottom';
        doubleBottomButtonRight.innerHTML = 'Eliminar';
        // Change the left double bottom button to "back"
        doubleBottomButtonLeft.id = 'back';
        doubleBottomButtonLeft.innerHTML = 'Atrás';
        // Show the double-bottom-button
        doubleBottomButton.style.display = 'flex';
        // Hide the top button
        topButton.style.display = 'none';
        // Do not allow to enter the card details
        allowCardDetails = false;
        // Display the cards-container
        document.querySelector('.cards-container').style.display = 'flex';
        currentScreen = 'remove-playlist-screen';
    }
});

doubleMiddleButtonPlaylistRight.addEventListener('click', function() {
    console.log('Right double middle button clicked');
    // Check if the id of the clicked button is "addPlaylist"
    if (this.id === 'addPlaylist') {
        // Get the card-info-container of the add-remove-playlist-screen
        let cardInfoContainer = document.querySelector('.add-remove-playlist-screen').querySelector('.card-info-container');
        // Change the top-text-header to Nombre de la playlist
        document.querySelector('.top-text-header').innerHTML = 'Nombre de la playlist:';
        document.querySelector('.top-text-subheader').innerHTML = '&lrm;';

        // Change the right double bottom button to "addPlaylistBottom"
        doubleBottomButtonRight.id = 'addPlaylistBottom';
        doubleBottomButtonRight.innerHTML = 'Añadir';
        // Change the left double bottom button to "back"
        doubleBottomButtonLeft.id = 'back';
        doubleBottomButtonLeft.innerHTML = 'Atrás';
        // Show the double-bottom-button
        doubleBottomButton.style.display = 'flex';
        // Hide the bottom button
        bottomButton.style.display = 'none';
        // Hide the double-middle-button
        cardInfoContainer.querySelector('.double-middle-button').style.display = 'none';
        // Show the text input
        cardInfoContainer.querySelector('#addPlaylistName').style.display = 'flex';
        // Hide the top button
        topButton.style.display = 'none';

        currentScreen = 'add-playlist-screen';
    }
});

bottomButton.addEventListener('click', function() {
    console.log('Bottom button clicked:');
    // Check if the id of the clicked button is "playlistsBtn"
    if (this.id === 'playlistsBtn') {
        console.log('Playlists button');
        // Make a request to the server to get the playlists sending the uname and token
        socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
    }
    // Check if the id of the clicked button is "back"
    else if (this.id === 'back') {
        goBack();
    }
    // Check if the id of the clicked button is "addSongToPlaylist"
    else if (this.id === 'addSongToPlaylist') {
        songTitle = document.querySelector('.song-found-title').innerHTML;
        songArtist = document.querySelector('.song-found-artist').innerHTML;
        songDuration = document.querySelector('.song-found-duration').innerHTML;
        // Emit a ADD_TO_PLAYLIST event to the server
        socket.emit('ADD_TO_PLAYLIST', { user: localStorage.getItem('uname'), token: localStorage.getItem('token'),
                                         songTitle: songTitle, songArtist: songArtist, songDuration: songDuration,
                                         playlistName: playlists[currentPlaylist].name });
        document.querySelector('.song-found-title').innerHTML = 'Buscando la canción...';
        document.querySelector('.song-found-artist').innerHTML = '&lrm;';
        document.querySelector('.song-found-duration').innerHTML = '&lrm;';
        console.log('Adding song to playlist:', songTitle);
        goBack();
    }
});

doubleBottomButtonLeft.addEventListener('click', function() {
    console.log('Left double bottom button clicked');
    // Check if the id of the clicked button is "back"
    if (this.id === 'back') {
        goBack();
    }
});


doubleBottomButtonRight.addEventListener('click', function() {
    console.log('Right double bottom button clicked');
    if (this.id === 'addRemovePlaylist') {
        console.log('Add/Remove playlist button');
        // Hide the cards-container
        document.querySelector('.cards-container').style.display = 'none';
        // Get the add-remove-playlist-screen
        let addRemovePlaylistScreen = document.querySelector('.add-remove-playlist-screen');
        addRemovePlaylistScreen.querySelector('.top-text-header').innerHTML = 'Eliminar / añadir';
        addRemovePlaylistScreen.querySelector('.top-text-subheader').innerHTML = 'Playlist';
        // Show the add-remove-playlist-screen
        addRemovePlaylistScreen.style.display = 'flex';
        // Hide the double-bottom-button
        doubleBottomButton.style.display = 'none';
        // Change the bottom button to "back"
        bottomButton.id = 'back';
        bottomButton.innerHTML = 'Atrás';
        // Show the bottom button
        bottomButton.style.display = 'flex';
        // Hide the top button
        topButton.style.display = 'none';

        currentScreen = 'add-remove-playlist-screen';
    }
    else if (this.id === 'removePlaylistBottom') {
        console.log('Removing playlist:', playlists[currentPlaylist].name);
        // Emit a REMOVE_PLAYLIST event to the server with the current playlist name
        socket.emit('REMOVE_PLAYLIST', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token'), 
                                         playlistName: playlists[currentPlaylist].name });
        // Listen for the REMOVE_PLAYLIST_SUCCESS event
        socket.on('REMOVE_PLAYLIST_SUCCESS', function(data) {
            console.log('Playlist removed successfully:', data.playlistName);
            // Emit a GET_PLAYLISTS event to the server
            socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
        });
        // Listen for REMOVE_PLAYLIST_DATABASE_ERROR, REMOVE_PLAYLIST_NOT_FOUND
        // and REMOVE_PLAYLIST_USER_NOT_FOUND events
        socket.on('REMOVE_PLAYLIST_DATABASE_ERROR', function(data) {
            console.log('Playlist database error:', data.error);
            alert('Error al eliminar la playlist: Error de base de datos');
        });
        socket.on('REMOVE_PLAYLIST_NOT_FOUND', function(data) {
            console.log('Playlist not found:', data.error);
            alert('Error al eliminar la playlist: Playlist no encontrada');
        });
        socket.on('REMOVE_PLAYLIST_USER_NOT_FOUND', function(data) {
            console.log('User not found:', data.error);
            alert('Error al eliminar la playlist: Usuario no encontrado');
        });
    }
    else if (this.id === 'addPlaylistBottom') {
        console.log('Adding playlist:', document.querySelector('#addPlaylistName').value);
        // Emit a ADD_PLAYLIST event to the server with the playlist name
        socket.emit('ADD_PLAYLIST', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token'), 
                                      playlistName: document.querySelector('#addPlaylistName').value });
        // Listen for the ADD_PLAYLIST_SUCCESS event
        socket.on('ADD_PLAYLIST_SUCCESS', function(data) {
            console.log('Playlist added successfully:', data.playlistName);
            // Emit a GET_PLAYLISTS event to the server
            socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
        });
        // Listen for ADD_PLAYLIST_FORMAT_ERROR, ADD_PLAYLIST_DATABASE_ERROR,
        // ADD_PLAYLIST_ALREADY_EXISTS, ADD_PLAYLIST_USER_NOT_FOUND events
        socket.on('ADD_PLAYLIST_FORMAT_ERROR', function(data) {
            console.log('Playlist format error:', data.error);
            alert('Error al añadir la playlist: Formato incorrecto');
        });
        socket.on('ADD_PLAYLIST_DATABASE_ERROR', function(data) {
            console.log('Playlist database error:', data.error);
            alert('Error al añadir la playlist: Error de base de datos');
        });
        socket.on('ADD_PLAYLIST_ALREADY_EXISTS', function(data) {
            console.log('Playlist already exists:', data.error);
            alert('Error al añadir la playlist: La playlist ya existe');
        });
        socket.on('ADD_PLAYLIST_USER_NOT_FOUND', function(data) {
            console.log('User not found:', data.error);
            alert('Error al añadir la playlist: Usuario no encontrado');
        });
    }
});

doubleBottomButtonRight.addEventListener('touchstart', function() {
    console.log('Right double bottom started touching');
    // Check if the id of the clicked button is "gyro"
    if (this.id === 'gyro') {
        // Vibrate the device
        if (canVibrate) {
            navigator.vibrate(50);
            console.log("Vibrating");
        }
        console.log('Gyro button');
        // Get the song items of the card that currently has the detailed-card class
        let songItems = document.querySelector('.detailed-card').querySelectorAll('.song');
        // If it is the first time pressing the "gyro" button, select the first song
        if (canInteractWithSelected === false) {
            // Select the first song
            selectSong(0, songItems);
        }
        canInteractWithSelected = true;
        isGyroButtonPressed = true;
        // Note: deviceorientation is a standard event that is fired when the device's orientation changes
        let initialBetaCapture = function(event) {
            let initialBeta = event.beta;
            console.log('Initial beta:', initialBeta);
            handleGyroScrollWithInitialBeta = function(event) {
                handleGyroScroll(event, initialBeta, songItems);
            };
            if (isGyroButtonPressed) {
                window.addEventListener('deviceorientation', handleGyroScrollWithInitialBeta);
            }
            window.removeEventListener('deviceorientation', initialBetaCapture);
        };
        window.addEventListener('deviceorientation', initialBetaCapture);
    }
});

doubleBottomButtonRight.addEventListener('touchend', function() {
    console.log('Right double bottom stopped touching');
    if (this.id === 'gyro') {
        isGyroButtonPressed = false;
        window.removeEventListener('deviceorientation', handleGyroScrollWithInitialBeta);
        // Vibrate the device
        if (canVibrate) {
            navigator.vibrate(50);
            console.log("Vibrating");
        }
    }
});

function handleGyroScroll(event, initialBeta, songItems) {
    const now = Date.now();
    const timeSinceLastChange = now - lastSelectionChangeTime;

    let betaDifference = event.beta - initialBeta;
    // console.log('Beta difference:', betaDifference);
    // console.log('Beta:', event.beta);
    // console.log('Initial beta:', initialBeta);

    // Only change song if at least 500ms have passed since the last change
    // We divide the threshold by the absolute value of the beta angle to make the threshold relative to the tilt angle
    if (timeSinceLastChange < 5000 / Math.abs(betaDifference)) {
        return;
    }

    if (betaDifference < -10) { // Tilted forwards
        if (selectedSongIndex > 0) {
            selectSong(selectedSongIndex - 1, songItems);
            lastSelectionChangeTime = now;
        }
    } else if (betaDifference > 10) { // Tilted backwards
        if (selectedSongIndex < songItems.length - 1) {
            selectSong(selectedSongIndex + 1, songItems);
            lastSelectionChangeTime = now;
        }
    }
}

function selectSong(index, songItems) {
    // Remove border from previously selected song
    console.log('Selected song:', index);
    console.log('Song items:', songItems);
    if (songItems[selectedSongIndex]) {
        songItems[selectedSongIndex].style.border = '';
    }

    // Add border to newly selected song
    selectedSongIndex = index;
    if (songItems[selectedSongIndex]) {
        songItems[selectedSongIndex].style.borderRadius = '5px';
        songItems[selectedSongIndex].style.border = '1px solid white';

        // Scroll the song into view
        songItems[selectedSongIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Vibrate the device
        if (canVibrate) {
            navigator.vibrate(50);
            console.log("Vibrating");
        }
    }
}

function goBack() {
    console.log('Current screen:', currentScreen)
    console.log('Going back to ...');
    // Check if the current screen is the playlists screen
    if (currentScreen === 'playlists-screen') {
        // Hide the double-bottom-button
        doubleBottomButton.style.display = 'none';
        // Change the top button to settingsBtn
        topButton.id = 'settingsBtn';
        // Change the svg element of the top button
        topButton.innerHTML = `
            <svg class="button-svg" id="svgSettings" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 133.08 140.09">
                <path d="M79,1.07C76.41,0,73.12,0,66.54,0S56.68,0,54.08,1.07a14.08,14.08,0,0,0-7.64,7.58,17.21,17.21,0,0,0-1,6,11.28,11.28,0,0,1-5.57,9.47,11.5,11.5,0,0,1-11.06.06A17.35,17.35,0,0,0,23,22.07a14.18,14.18,0,0,0-10.44,2.78C10.35,26.54,8.71,29.37,5.42,35S.49,43.5.12,46.26a13.93,13.93,0,0,0,2.8,10.36,17.17,17.17,0,0,0,4.77,3.89,11,11,0,0,1,0,19.07,17.17,17.17,0,0,0-4.77,3.89A13.91,13.91,0,0,0,.12,93.82c.37,2.77,2,5.59,5.3,11.25s4.93,8.48,7.16,10.17A14.23,14.23,0,0,0,23,118a17.57,17.57,0,0,0,5.78-2.16,11.47,11.47,0,0,1,11.06.06,11.28,11.28,0,0,1,5.57,9.47,17.26,17.26,0,0,0,1,6A14.08,14.08,0,0,0,54.08,139c2.6,1.07,5.88,1.07,12.46,1.07s9.87,0,12.46-1.07a14.05,14.05,0,0,0,7.64-7.58,17.26,17.26,0,0,0,1-6,11.31,11.31,0,0,1,5.58-9.47,11.47,11.47,0,0,1,11.06-.06,17.72,17.72,0,0,0,5.78,2.16,14.22,14.22,0,0,0,10.43-2.78c2.23-1.7,3.87-4.52,7.16-10.17s4.94-8.48,5.3-11.25a13.94,13.94,0,0,0-2.79-10.35,17.23,17.23,0,0,0-4.78-3.89,11,11,0,0,1,0-19.07,17.23,17.23,0,0,0,4.78-3.89A13.92,13.92,0,0,0,133,46.26c-.36-2.76-2-5.59-5.3-11.24s-4.93-8.48-7.16-10.17a14.17,14.17,0,0,0-10.43-2.78,17.27,17.27,0,0,0-5.78,2.16,11.49,11.49,0,0,1-11.06-.06,11.32,11.32,0,0,1-5.58-9.48,17.2,17.2,0,0,0-1-6A14.05,14.05,0,0,0,79,1.07Zm-12.46,90A21,21,0,1,0,45.37,70,21.09,21.09,0,0,0,66.54,91.06Z"/>
            </svg>
        `;
        // Change the bottom-button to "playlistsBtn"
        bottomButton.id = 'playlistsBtn';
        bottomButton.innerHTML = 'Playlists';
        // Show the bottom-button
        bottomButton.style.display = 'flex';
        // Select the main-screen and show it
        const mainScreen = document.querySelector('.main-screen');
        mainScreen.style.display = 'flex';
        // Hide the spacers
        document.getElementById('card-first-spacer').style.display = 'none';
        document.getElementById('card-last-spacer').style.display = 'none';

        // Remove all the cards that are not spacers
        let cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            // If the card his not in the spacer class
            if (!card.classList.contains('spacer')) {
                // Unobserve the card
                observer.unobserve(card);
                // Remove the card
                card.remove();
            }
        });
        // Reset the lowestLoadedPlaylist, currentPlaylist and highestLoadedPlaylist
        lowestLoadedPlaylist = 0;
        currentPlaylist = 0;
        highestLoadedPlaylist = 0;
        currentScreen = 'main-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'playlist-details-screen') {
        let card = document.querySelector('.detailed-card');
        // Remove the border from the selected song
        let songItems = card.querySelectorAll('.song');
        if (songItems[selectedSongIndex]) {
            songItems[selectedSongIndex].style.border = '';
        }
        // Reset the selected song index
        selectedSongIndex = 0;
        // Reset the canInteractWithSelected flag
        canInteractWithSelected = false;
        // Remove the class "detailed-card" from the card
        card.classList.remove('detailed-card');
        // Add the animate-decrease-scale-bounce class to perform an animation
        card.classList.add('animate-decrease-scale-bounce');
        // Remove the class after the animation is complete
        card.addEventListener('animationend', function() {
            card.classList.remove('animate-decrease-scale-bounce');
            console.log('Card animation ended');            
        });

        // If the card id is not cardFavorites
        if (card.id !== 'cardFavorites') {
            // Show all the cards
            let cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                card.style.display = 'flex';
            });
        }

        // Change the top button to "exportPlaylist"
        topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 483.97 210.23" class="export-svg">
                    <defs>
                    <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:20px;}</style>
                    </defs>
                    <path class="cls-1" d="M252.57,114.46a9.37,9.37,0,0,0-18.73,0Zm-9.36,86.4h-9.37a9.37,9.37,0,0,0,12.86,8.69Zm71.73-28.8,3.49,8.69a9.36,9.36,0,0,0,5.88-8.69Zm9.37-59.87a9.37,9.37,0,0,0-18.74,0ZM248.89,107a9.37,9.37,0,0,0-11.37,14.89Zm19.89,27-5.68,7.44a9.38,9.38,0,0,0,9.69,1Zm50.13-13.35a9.37,9.37,0,0,0-8-16.94Zm-79.19-14.89a9.37,9.37,0,0,0,7,17.39Zm78.71-11.41a9.37,9.37,0,0,0-7-17.39Zm-7,0a9.37,9.37,0,0,0,7-17.39ZM246.7,48.19a9.36,9.36,0,1,0-7,17.38Zm72.83,29.32a9.37,9.37,0,0,0-9.18,16.33Zm14.05,25.69,4,8.47A9.37,9.37,0,0,0,338.17,95Zm-22.68.52a9.37,9.37,0,0,0,8,16.94ZM308,79.38A9.37,9.37,0,1,0,321.85,92Zm-72-28.49a9.37,9.37,0,0,0,14.41,12ZM167.92,77a9.37,9.37,0,0,0,7,17.39Zm78.71-11.4a9.36,9.36,0,1,0-7-17.38ZM176,93.83a9.37,9.37,0,1,0-9.18-16.33Zm-30.2,6.23-4.59-8.16a9.37,9.37,0,0,0,.58,16.63Zm21.6,20.6a9.37,9.37,0,1,0,8-16.94ZM174.9,77a9.37,9.37,0,0,0-7,17.39Zm64.76,46.19a9.37,9.37,0,1,0,7-17.39ZM164.41,91.89a9.37,9.37,0,0,0,14-12.45Zm71.53-29a9.36,9.36,0,1,0,14.41-12Zm16.57,51.62a9.37,9.37,0,1,0-18.73,0Zm-9.37,86.38-3.48,8.69a9.36,9.36,0,0,0,12.85-8.69Zm-71.73-28.8h-9.36a9.35,9.35,0,0,0,5.87,8.69Zm9.37-59.87a9.37,9.37,0,1,0-18.73,0Zm68.05,9.72A9.37,9.37,0,0,0,237.46,107ZM217.53,134l-4,8.47a9.36,9.36,0,0,0,9.68-1Zm-42.11-30.29a9.37,9.37,0,1,0-8,16.94Zm58.42,10.74v86.4h18.73v-86.4Zm12.86,95.09,71.73-28.8-7-17.38-71.73,28.8Zm77.61-37.49V112.19H305.57v59.87Zm-86.79-50.15,25.58,19.54,11.37-14.88L248.89,107Zm35.27,20.57,46.12-21.82-8-16.94-46.12,21.82ZM246.7,123.16l71.73-28.8-7-17.39-71.73,28.8ZM318.43,77,246.7,48.19l-7,17.38,71.73,28.79Zm-8.08,16.87L336,108.24,339.61,96l-18-17ZM338.17,95l-27.27,8.69,8,16.94,18.68-9ZM174.9,94.36l71.73-28.79-7-17.38L167.92,77ZM166.82,77.5,141.21,91.9l9.18,16.33L176,93.83Zm-25,31,25.61,12.13,8-16.94L149.81,91.6ZM173.8,89l68.26,32.55,4.57-15.79L192.16,81.58Zm-9.39,2.88,14-12.45m55.37,35v86.38h18.73V114.48Zm12.85,77.69-71.73-28.8-7,17.38,71.74,28.8Zm-65.85-20.11V112.19H162.05v59.87Zm56.68-65-25.61,19.54,11.36,14.89,25.62-19.54Zm-15.92,18.52-46.12-21.82-8,16.94,46.12,21.82Z"/>
                    <polygon class="cls-1" points="196.55 172.06 174.9 163.37 171.41 172.06 167.92 180.75 239.66 209.55 246.63 192.17 196.55 172.06"/>
                    <polygon class="cls-1" points="178.34 124.22 178.34 166.52 236.34 189.95 236.21 131.22 178.34 124.22"/>
                    <polygon class="cls-1" points="254.05 118.98 264.11 126.67 330.05 97.66 320.1 92.47 254.05 118.98"/>
                    <path id="primary" class="cls-2" d="M338.17,66.25l27.72-27.72A93.67,93.67,0,0,1,474,21"/>
                    <polyline id="primary-2" class="cls-2" points="338.17 36.07 338.17 66.25 368.35 66.25"/>
                    <path id="primary-2-2" data-name="primary" class="cls-2" d="M10,19.87A93.69,93.69,0,0,1,118.08,37.43L145.8,65.14"/>
                    <polyline id="primary-2-3" data-name="primary-2" class="cls-2" points="115.62 65.14 145.8 65.14 145.8 34.96"/>
                </svg>
            `;
        topButton.id = 'exportPlaylist';

        // Change the right double bottom button to "± playlist"
        doubleBottomButtonRight.id = 'addRemovePlaylist';
        doubleBottomButtonRight.innerHTML = '± Playlist';
        
        // If the card id is not cardFavorites
        if (card.id !== 'cardFavorites') {
            // Show the double-bottom-button
            doubleBottomButton.style.display = 'flex';
            // Hide the bottom-button
            bottomButton.style.display = 'none';
            currentScreen = 'playlists-screen';
        } else {
            // Hide the double-bottom-button
            doubleBottomButton.style.display = 'none';
            // Change the bottom-button to "back"
            bottomButton.id = 'back';
            bottomButton.innerHTML = 'Atrás';
            // Show the bottom-button
            bottomButton.style.display = 'flex';
            currentScreen = 'favorites-screen';
        }

        console.log(currentScreen);
    }
    else if (currentScreen === 'search-song-screen') {
        // Hide the search song screen
        document.querySelector('.search-song-screen').style.display = 'none';
        // Show the main screen
        document.querySelector('.main-screen').style.display = 'flex';
        // Show the bottom button
        bottomButton.style.display = 'flex';
        // Show the top button
        topButton.style.display = 'flex';
        document.querySelector('.song-found-title').innerHTML = 'Buscando la canción...';
        document.querySelector('.song-found-artist').innerHTML = '&lrm;';
        document.querySelector('.song-found-duration').innerHTML = '&lrm;';
        currentScreen = 'main-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'add-song-to-playlist-screen') {
        // Change the bottom-button to "playlistsBtn"
        bottomButton.id = 'playlistsBtn';
        bottomButton.innerHTML = 'Playlists';
        // Show the bottom-button
        bottomButton.style.display = 'flex';
        // Show the top button
        topButton.style.display = 'flex';
        // Select the main-screen and show it
        const mainScreen = document.querySelector('.main-screen');
        mainScreen.style.display = 'flex';
        // Hide the spacers
        document.getElementById('card-first-spacer').style.display = 'none';
        document.getElementById('card-last-spacer').style.display = 'none';

        // Remove all the cards that are not spacers
        let cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            // If the card his not in the spacer class
            if (!card.classList.contains('spacer')) {
                // Unobserve the card
                observer.unobserve(card);
                // Remove the card
                card.remove();
            }
        });
        // Reset the lowestLoadedPlaylist, currentPlaylist and highestLoadedPlaylist
        lowestLoadedPlaylist = 0;
        currentPlaylist = 0;
        highestLoadedPlaylist = 0;
        currentScreen = 'main-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'favorites-screen') {
        // Change the bottom-button to "playlistsBtn"
        bottomButton.id = 'playlistsBtn';
        bottomButton.innerHTML = 'Playlists';
        // Change the top button to settingsBtn
        topButton.id = 'settingsBtn';
        // Change the svg element of the top button
        topButton.innerHTML = `
            <svg class="button-svg" id="svgSettings" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 133.08 140.09">
                <path d="M79,1.07C76.41,0,73.12,0,66.54,0S56.68,0,54.08,1.07a14.08,14.08,0,0,0-7.64,7.58,17.21,17.21,0,0,0-1,6,11.28,11.28,0,0,1-5.57,9.47,11.5,11.5,0,0,1-11.06.06A17.35,17.35,0,0,0,23,22.07a14.18,14.18,0,0,0-10.44,2.78C10.35,26.54,8.71,29.37,5.42,35S.49,43.5.12,46.26a13.93,13.93,0,0,0,2.8,10.36,17.17,17.17,0,0,0,4.77,3.89,11,11,0,0,1,0,19.07,17.17,17.17,0,0,0-4.77,3.89A13.91,13.91,0,0,0,.12,93.82c.37,2.77,2,5.59,5.3,11.25s4.93,8.48,7.16,10.17A14.23,14.23,0,0,0,23,118a17.57,17.57,0,0,0,5.78-2.16,11.47,11.47,0,0,1,11.06.06,11.28,11.28,0,0,1,5.57,9.47,17.26,17.26,0,0,0,1,6A14.08,14.08,0,0,0,54.08,139c2.6,1.07,5.88,1.07,12.46,1.07s9.87,0,12.46-1.07a14.05,14.05,0,0,0,7.64-7.58,17.26,17.26,0,0,0,1-6,11.31,11.31,0,0,1,5.58-9.47,11.47,11.47,0,0,1,11.06-.06,17.72,17.72,0,0,0,5.78,2.16,14.22,14.22,0,0,0,10.43-2.78c2.23-1.7,3.87-4.52,7.16-10.17s4.94-8.48,5.3-11.25a13.94,13.94,0,0,0-2.79-10.35,17.23,17.23,0,0,0-4.78-3.89,11,11,0,0,1,0-19.07,17.23,17.23,0,0,0,4.78-3.89A13.92,13.92,0,0,0,133,46.26c-.36-2.76-2-5.59-5.3-11.24s-4.93-8.48-7.16-10.17a14.17,14.17,0,0,0-10.43-2.78,17.27,17.27,0,0,0-5.78,2.16,11.49,11.49,0,0,1-11.06-.06,11.32,11.32,0,0,1-5.58-9.48,17.2,17.2,0,0,0-1-6A14.05,14.05,0,0,0,79,1.07Zm-12.46,90A21,21,0,1,0,45.37,70,21.09,21.09,0,0,0,66.54,91.06Z"/>
            </svg>
        `;
        // Select the main-screen and show it
        const mainScreen = document.querySelector('.main-screen');
        mainScreen.style.display = 'flex';
        // Hide the spacers
        document.getElementById('card-first-spacer').style.display = 'none';
        document.getElementById('card-last-spacer').style.display = 'none';

        // Remove the favorites card
        let cardFavorite = document.querySelector('#cardFavorites');
        cardFavorite.remove();

        // Reset the lowestLoadedPlaylist, currentPlaylist and highestLoadedPlaylist
        lowestLoadedPlaylist = 0;
        currentPlaylist = 0;
        highestLoadedPlaylist = 0;

        // Allow for horizontal scrolling in the cards container
        document.querySelector('.cards-container').style.overflowX = 'auto';

        currentScreen = 'main-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'add-remove-playlist-screen') {
        // Hide the add-remove-playlist-screen
        document.querySelector('.add-remove-playlist-screen').style.display = 'none';
        // Reset the input field
        document.querySelector('#addPlaylistName').value = '';
        // Change the top button to "exportPlaylist"
        topButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 483.97 210.23" class="export-svg">
                    <defs>
                    <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:20px;}</style>
                    </defs>
                    <path class="cls-1" d="M252.57,114.46a9.37,9.37,0,0,0-18.73,0Zm-9.36,86.4h-9.37a9.37,9.37,0,0,0,12.86,8.69Zm71.73-28.8,3.49,8.69a9.36,9.36,0,0,0,5.88-8.69Zm9.37-59.87a9.37,9.37,0,0,0-18.74,0ZM248.89,107a9.37,9.37,0,0,0-11.37,14.89Zm19.89,27-5.68,7.44a9.38,9.38,0,0,0,9.69,1Zm50.13-13.35a9.37,9.37,0,0,0-8-16.94Zm-79.19-14.89a9.37,9.37,0,0,0,7,17.39Zm78.71-11.41a9.37,9.37,0,0,0-7-17.39Zm-7,0a9.37,9.37,0,0,0,7-17.39ZM246.7,48.19a9.36,9.36,0,1,0-7,17.38Zm72.83,29.32a9.37,9.37,0,0,0-9.18,16.33Zm14.05,25.69,4,8.47A9.37,9.37,0,0,0,338.17,95Zm-22.68.52a9.37,9.37,0,0,0,8,16.94ZM308,79.38A9.37,9.37,0,1,0,321.85,92Zm-72-28.49a9.37,9.37,0,0,0,14.41,12ZM167.92,77a9.37,9.37,0,0,0,7,17.39Zm78.71-11.4a9.36,9.36,0,1,0-7-17.38ZM176,93.83a9.37,9.37,0,1,0-9.18-16.33Zm-30.2,6.23-4.59-8.16a9.37,9.37,0,0,0,.58,16.63Zm21.6,20.6a9.37,9.37,0,1,0,8-16.94ZM174.9,77a9.37,9.37,0,0,0-7,17.39Zm64.76,46.19a9.37,9.37,0,1,0,7-17.39ZM164.41,91.89a9.37,9.37,0,0,0,14-12.45Zm71.53-29a9.36,9.36,0,1,0,14.41-12Zm16.57,51.62a9.37,9.37,0,1,0-18.73,0Zm-9.37,86.38-3.48,8.69a9.36,9.36,0,0,0,12.85-8.69Zm-71.73-28.8h-9.36a9.35,9.35,0,0,0,5.87,8.69Zm9.37-59.87a9.37,9.37,0,1,0-18.73,0Zm68.05,9.72A9.37,9.37,0,0,0,237.46,107ZM217.53,134l-4,8.47a9.36,9.36,0,0,0,9.68-1Zm-42.11-30.29a9.37,9.37,0,1,0-8,16.94Zm58.42,10.74v86.4h18.73v-86.4Zm12.86,95.09,71.73-28.8-7-17.38-71.73,28.8Zm77.61-37.49V112.19H305.57v59.87Zm-86.79-50.15,25.58,19.54,11.37-14.88L248.89,107Zm35.27,20.57,46.12-21.82-8-16.94-46.12,21.82ZM246.7,123.16l71.73-28.8-7-17.39-71.73,28.8ZM318.43,77,246.7,48.19l-7,17.38,71.73,28.79Zm-8.08,16.87L336,108.24,339.61,96l-18-17ZM338.17,95l-27.27,8.69,8,16.94,18.68-9ZM174.9,94.36l71.73-28.79-7-17.38L167.92,77ZM166.82,77.5,141.21,91.9l9.18,16.33L176,93.83Zm-25,31,25.61,12.13,8-16.94L149.81,91.6ZM173.8,89l68.26,32.55,4.57-15.79L192.16,81.58Zm-9.39,2.88,14-12.45m55.37,35v86.38h18.73V114.48Zm12.85,77.69-71.73-28.8-7,17.38,71.74,28.8Zm-65.85-20.11V112.19H162.05v59.87Zm56.68-65-25.61,19.54,11.36,14.89,25.62-19.54Zm-15.92,18.52-46.12-21.82-8,16.94,46.12,21.82Z"/>
                    <polygon class="cls-1" points="196.55 172.06 174.9 163.37 171.41 172.06 167.92 180.75 239.66 209.55 246.63 192.17 196.55 172.06"/>
                    <polygon class="cls-1" points="178.34 124.22 178.34 166.52 236.34 189.95 236.21 131.22 178.34 124.22"/>
                    <polygon class="cls-1" points="254.05 118.98 264.11 126.67 330.05 97.66 320.1 92.47 254.05 118.98"/>
                    <path id="primary" class="cls-2" d="M338.17,66.25l27.72-27.72A93.67,93.67,0,0,1,474,21"/>
                    <polyline id="primary-2" class="cls-2" points="338.17 36.07 338.17 66.25 368.35 66.25"/>
                    <path id="primary-2-2" data-name="primary" class="cls-2" d="M10,19.87A93.69,93.69,0,0,1,118.08,37.43L145.8,65.14"/>
                    <polyline id="primary-2-3" data-name="primary-2" class="cls-2" points="115.62 65.14 145.8 65.14 145.8 34.96"/>
                </svg>
            `;
        topButton.id = 'exportPlaylist';
        // Change the right double bottom button to "± playlist"
        doubleBottomButtonRight.id = 'addRemovePlaylist';
        doubleBottomButtonRight.innerHTML = '± Playlist';
        // Show the double-bottom-button
        doubleBottomButton.style.display = 'flex';
        // Hide the bottom-button
        bottomButton.style.display = 'none';
        // Show the top button
        topButton.style.display = 'flex';
        // Show the cards-container
        document.querySelector('.cards-container').style.display = 'flex';
        currentScreen = 'playlists-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'remove-playlist-screen') {
        // Hide the cards-container
        document.querySelector('.cards-container').style.display = 'none';
        // Change the bottom button to "Back"
        bottomButton.id = 'back';
        bottomButton.innerHTML = 'Atrás';
        // Show the bottom button
        bottomButton.style.display = 'flex';
        // Hide the double-bottom-button
        doubleBottomButton.style.display = 'none';
        // Hide the top button
        topButton.style.display = 'none';
        // Show the add-remove-playlist-screen
        document.querySelector('.add-remove-playlist-screen').style.display = 'flex';
        // Allow to enter the card details
        allowCardDetails = true;
        currentScreen = 'add-remove-playlist-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'add-playlist-screen') {
        // Hide the text input
        document.querySelector('#addPlaylistName').style.display = 'none';
        // Reset the input field
        document.querySelector('#addPlaylistName').value = '';
        // Change the bottom button to "back"
        bottomButton.id = 'back';
        bottomButton.innerHTML = 'Atrás';
        // Show the bottom button
        bottomButton.style.display = 'flex';
        // Hide the double-bottom-button
        doubleBottomButton.style.display = 'none';
        // Hide the top button
        topButton.style.display = 'none';
        // Show the double-middle-button of the add-remove-playlist-screen
        let addRemovePlaylistScreen = document.querySelector('.add-remove-playlist-screen');
        addRemovePlaylistScreen.querySelector('.double-middle-button').style.display = 'flex';

        // Change back the top-text-header
        addRemovePlaylistScreen.querySelector('.top-text-header').innerHTML = 'Eliminar / añadir';
        addRemovePlaylistScreen.querySelector('.top-text-subheader').innerHTML = 'Playlist';

        // Show the add-remove-playlist-screen
        addRemovePlaylistScreen.style.display = 'flex';
        
        currentScreen = 'add-remove-playlist-screen';
        console.log(currentScreen);
    }
    else if (currentScreen === 'settings-screen') {
        // Hide the settings-screen
        document.querySelector('.settings-screen').style.display = 'none';
        // Show the main-screen
        document.querySelector('.main-screen').style.display = 'flex';
        // Change the bottom button to "playlistsBtn"
        bottomButton.id = 'playlistsBtn';
        bottomButton.innerHTML = 'Playlists';
        // Show the bottom button
        bottomButton.style.display = 'flex';
        // Show the top button
        topButton.style.display = 'flex';
        currentScreen = 'main-screen';
    }
}

// requestRemoveSong function
function requestRemoveSong(songTitle, songArtist, songDuration, playlistName) {
    console.log('Removing song:', songTitle, 'from playlist:', playlistName);
    // Make a request to the server to remove the song from the playlist
    socket.emit('REMOVE_SONG', { user: localStorage.getItem('uname'), token: localStorage.getItem('token'),
                                 songTitle: songTitle, songArtist: songArtist, songDuration: songDuration,
                                 playlistName: playlistName });

    // Listen for the REMOVE_SONG_SUCCESS event
    socket.on('REMOVE_SONG_SUCCESS', function(data) {
        // Check if the removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            // Find the playlist that contains the song
            let playlist = playlists.find(playlist => playlist.name === playlistName);
            // Find the index of the song in the playlist
            let songIndex = playlist.songs.findIndex(song => song.title === songTitle && song.artist === songArtist && song.duration === songDuration);
            // Remove the song from the playlist
            playlist.songs.splice(songIndex, 1);
            // Update the total duration of the playlist
            playlist.totalDuration = data.totalDuration;
            // Find the card that contains the playlist
            let card = Array.from(document.querySelectorAll('.card')).find(card => {
                let playlistTitleElement = card.querySelector('.playlist-title');
                return playlistTitleElement && playlistTitleElement.innerHTML === playlistName;
            });
            // Find the song element in the card
            let songElement = Array.from(card.querySelectorAll('.song')).find(song =>
                song.querySelector('.song-title').innerHTML === songTitle &&
                song.querySelector('.song-artist').innerHTML === songArtist &&
                song.querySelector('.song-duration').innerHTML === songDuration);
            // Remove the song element from the card
            songElement.remove();
            // Update the number of songs in the card
            let numSongs = card.querySelector('.num-songs');
            numSongs.innerHTML = `${playlist.songs.length}`;
            // Update the total duration of the playlist in the card
            let totalDuration = card.querySelector('.total-duration');
            totalDuration.innerHTML = `${playlist.totalDuration}`;
            console.log('Song removed:', songTitle, 'from playlist:', playlistName);

            // Update the playlist in the playlists array
            let playlistIndex = playlists.findIndex(playlist => playlist.name === playlistName);
            playlists[playlistIndex] = playlist;
        }
    });
    
    // Listen for REMOVE_SONG_DATABASE_ERROR, REMOVE_SONG_FORMAT_ERROR,
    // REMOVE_SONG_NOT_FOUND, REMOVE_SONG_PLAYLIST_NOT_FOUND and REMOVE_SONG_USER_NOT_FOUND
    socket.on('REMOVE_SONG_DATABASE_ERROR', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Database error removing song:', songTitle, 'from playlist:', playlistName);
            resetSongPosition(songTitle, songArtist, songDuration, playlistName);
        }
    });
    socket.on('REMOVE_SONG_FORMAT_ERROR', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Format error removing song:', songTitle, 'from playlist:', playlistName);
            resetSongPosition(songTitle, songArtist, songDuration, playlistName);
        }
    });
    socket.on('REMOVE_SONG_NOT_FOUND', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Song not found:', songTitle, 'in playlist:', playlistName);
            resetSongPosition(songTitle, songArtist, songDuration, playlistName);
        }
    });
    socket.on('REMOVE_SONG_PLAYLIST_NOT_FOUND', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Playlist not found:', playlistName);
            resetSongPosition(songTitle, songArtist, songDuration, playlistName);
        }
    });
    socket.on('REMOVE_SONG_USER_NOT_FOUND', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        console.log('User not found when removing song:', localStorage.getItem('uname'));
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('User not found:', localStorage.getItem('uname'));
            resetSongPosition(songTitle, songArtist, songDuration, playlistName);
        }
    });
}

// requestRemoveFromFavorites function
function requestRemoveFromFavorites(songTitle, songArtist, songDuration) {
    console.log('Removing song from favorites:', songTitle);
    // Make a request to the server to remove the song from the favorites
    socket.emit('REMOVE_FROM_FAVORITES', { user: localStorage.getItem('uname'), token: localStorage.getItem('token'),
                                           songTitle: songTitle, songArtist: songArtist, songDuration: songDuration });
    
    // Listen for the REMOVE_FROM_FAVORITES_SUCCESS event
    socket.on('REMOVE_FROM_FAVORITES_SUCCESS', function(data) {
        // Check if the removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            // Find the card that contains the favorites
            let card = document.querySelector('#cardFavorites');
            // Find the song element in the card
            let songElement = Array.from(card.querySelectorAll('.song')).find(song =>
                song.querySelector('.song-title').innerHTML === songTitle &&
                song.querySelector('.song-artist').innerHTML === songArtist &&
                song.querySelector('.song-duration').innerHTML === songDuration);
            // Remove the song element from the card
            songElement.remove();
            // Update the number of songs in the card
            let numSongs = card.querySelector('.num-songs');
            let numSongsCount = card.querySelectorAll('.song').length;
            numSongs.innerHTML = `${numSongsCount}`;
            
            console.log('Song removed from favorites:', songTitle);
        }
    });

    // Listen for REMOVE_FROM_FAVORITES_DATABASE_ERROR, REMOVE_FROM_FAVORITES_FORMAT_ERROR,
    // REMOVE_FROM_FAVORITES_NOT_FOUND and REMOVE_FROM_FAVORITES_USER_NOT_FOUND
    socket.on('REMOVE_FROM_FAVORITES_DATABASE_ERROR', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Database error removing song from favorites:', songTitle);
            alert('Database error removing song from favorites:', songTitle);
        }
    });
    socket.on('REMOVE_FROM_FAVORITES_FORMAT_ERROR', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Format error removing song from favorites:', songTitle);
            alert('Format error removing song from favorites:', songTitle);
        }
    });
    socket.on('REMOVE_FROM_FAVORITES_NOT_FOUND', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Song not found in favorites:', songTitle);
            alert('Song not found in favorites:', songTitle);
        }
    });
    socket.on('REMOVE_FROM_FAVORITES_USER_NOT_FOUND', function(data) {
        // Check if the faulty removed song is the one we requested to remove
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('User not found when removing song from favorites:', localStorage.getItem('uname'));
            alert('User not found when removing song from favorites:', localStorage.getItem('uname'));
        }
    });
}



function resetSongPosition(songTitle, songArtist, songDuration, playlistName) {
    // Returns the song to its original position, color and font style
    // Get the card that contains the playlist
    let card = Array.from(document.querySelectorAll('.card')).find(card => {
        let playlistTitleElement = card.querySelector('.playlist-title');
        return playlistTitleElement && playlistTitleElement.innerHTML === playlistName;
    });
    console.log('Card:', card);
    // Get the song element in the card that matches the song title, artist and duration
    let songElement = Array.from(card.querySelectorAll('.song')).find(song => 
        song.querySelector('.song-title').innerHTML === songTitle && 
        song.querySelector('.song-artist').innerHTML === songArtist && 
        song.querySelector('.song-duration').innerHTML === songDuration);
    // Animate the item back to its original position, color and font style
    songElement.style.transition = 'transform 0.3s ease';
    songElement.style.transform = 'translateX(0)';
    songElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    songElement.style.color = 'rgba(255, 255, 255, 1)';
    songElement.style.fontWeight = 'normal';
    // Reset the initial touch position
    songElement.startX = null;
    // Reset the vibration flag
    hasVibratedSwipe = false;
}

// requestAddToFavorites function
// playlistName is optional and is only used when the song is added to the favorites from a playlist
function requestAddToFavorites(songTitle, songArtist, songDuration, playlistName) {
    console.log('Adding song to favorites:', songTitle);
    // Make a request to the server to add the song to the favorites
    socket.emit('ADD_TO_FAVORITES', { user: localStorage.getItem('uname'), token: localStorage.getItem('token'),
                                      songTitle: songTitle, songArtist: songArtist, songDuration: songDuration });

    // Listen for the ADD_TO_FAVORITES_SUCCESS event
    socket.on('ADD_TO_FAVORITES_SUCCESS', function(data) {
        // Check if the added song is the one we requested to add
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Song added to favorites:', songTitle);
            if (playlistName) {
                resetSongPosition(songTitle, songArtist, songDuration, playlistName);
            }
            alert('Song added to favorites:', songTitle);
        }
    });

    // Listen for ADD_TO_FAVORITES_DATABASE_ERROR, ADD_TO_FAVORITES_FORMAT_ERROR,
    // ADD_TO_FAVORITES_ALREADY_EXISTS and ADD_TO_FAVORITES_USER_NOT_FOUND events
    socket.on('ADD_TO_FAVORITES_DATABASE_ERROR', function(data) {
        // Check if the faulty added song is the one we requested to add
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Database error adding song to favorites:', songTitle);
            if (playlistName) {
                resetSongPosition(songTitle, songArtist, songDuration, playlistName);
            }
            alert('Database error adding song to favorites:', songTitle);
        }
    });
    socket.on('ADD_TO_FAVORITES_FORMAT_ERROR', function(data) {
        // Check if the faulty added song is the one we requested to add
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Format error adding song to favorites:', songTitle);
            if (playlistName) {
                resetSongPosition(songTitle, songArtist, songDuration, playlistName);
            }
            alert('Format error adding song to favorites:', songTitle);
        }
    });
    socket.on('ADD_TO_FAVORITES_ALREADY_EXISTS', function(data) {
        // Check if the faulty added song is the one we requested to add
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('Song already exists in favorites:', songTitle);
            if (playlistName) {
                resetSongPosition(songTitle, songArtist, songDuration, playlistName);
            }
            alert('Song already exists in favorites:', songTitle);
        }
    });
    socket.on('ADD_TO_FAVORITES_USER_NOT_FOUND', function(data) {
        // Check if the faulty added song is the one we requested to add
        if (data.songTitle === songTitle && data.songArtist === songArtist && data.songDuration === songDuration) {
            console.log('User not found when adding song to favorites:', localStorage.getItem('uname'));
            if (playlistName) {
                resetSongPosition(songTitle, songArtist, songDuration, playlistName);
            }
            alert('User not found when adding song to favorites:', localStorage.getItem('uname'));
        }
    });
}

/*************************** THIS IS A BIT BUGGY ****************************
 * Code to prevent horizontal scrolling in the cards container
 * past the first and last card
 * 
cardsContainer.addEventListener('scroll', function(e) {
    if (currentScreen === 'playlists-screen') {
        // If the user is already scrolling, don't interfere
        if (isScrolling) {
            return;
        }
        // If the focused card is the first card after the first spacer and the user scrolls to the left
        if (document.getElementById('card-first-spacer').nextSibling.classList.contains('focused') && cardsContainer.scrollLeft < lastScrollLeft) {
            // Prevent scrolling to the left by resetting the scroll position
            isScrolling = true;
            cardsContainer.scrollLeft = lastScrollLeft;
            isScrolling = false;
        }
        // Check if the last playlist is in view
        else if (document.getElementById('card-last-spacer').previousSibling.classList.contains('focused') && cardsContainer.scrollLeft > lastScrollLeft) {
            // Prevent scrolling to the right by resetting the scroll position
            isScrolling = true;
            cardsContainer.scrollLeft = lastScrollLeft;
            isScrolling = false;
        }

        // Update lastScrollLeft
        lastScrollLeft = cardsContainer.scrollLeft;
    }
});
*
*
*
******************************************************************************/

let observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.intersectionRatio <= 0) {
            // console.log('Card not in the viewport:', entry.target.id, 'Intersection ratio:', entry.intersectionRatio);
            // Set display to none if the card is not in the viewport
            // entry.target.style.display = 'none';
        } else {
            // Print the card in the viewport and its intersection ratio
            // console.log('Card in the viewport:', entry.target.id, 'Intersection ratio:', entry.intersectionRatio);
            // Focus the card if the intersection ratio is greater than 0.75
            if (entry.intersectionRatio > 0.7) {
                // If the card is not focused, focus it
                if (entry.target.classList.contains('not-focused')) {
                    // Remove the focus from the current card
                    entry.target.classList.remove('not-focused');
                    entry.target.classList.add('focused');
                    currentPlaylist = parseInt(entry.target.id.slice(4));
                    console.log('Current playlist card:', currentPlaylist);
                    // Vibrate the device
                    if (canVibrate) {
                        navigator.vibrate(50);
                        console.log("Vibrating");
                    }
                }
            } else {
                // If the card is focused, remove the focus
                if (entry.target.classList.contains('focused')) {
                    // Remove the focus from the current card
                    entry.target.classList.remove('focused');
                    entry.target.classList.add('not-focused');
                }
            }
        }
    });
}, {threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });


accelerometer.addEventListener('reading', e => {
    let currentTimestamp = performance.now();
    if ((currentTimestamp - lastInteraction < 300) || !canMotionControl) {
        return;
    }
    let accelXChange = Math.abs(accelerometer.x - lastAccelX);
    let gyroZChange = Math.abs(gyro.z - lastGyroZ);
    let accelYChange = Math.abs(accelerometer.y - lastAccelY);
    let gyroXChange = Math.abs(gyro.x - lastGyroX);

    // If the movement is to the right
    if (accelerometer.x < -6 && accelXChange > 3 && gyroZChange > 2 && gyro.z < -1) {
        if (currentScreen === 'main-screen') {
            console.log('Opening history');
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            alert('Coming soon...');
            lastInteraction = currentTimestamp;
        }   
        else if (currentScreen === 'playlists-screen' || currentScreen === 'add-song-to-playlist-screen'
                || currentScreen === 'remove-playlist-screen') {
            console.log('Scrolling to the right');
            // Check if the current playlist is less than the total number of playlists
            if (currentPlaylist < playlists.length - 1) {
                console.log('Changing to the next playlist');
                // Scroll to the next card
                cardsContainer.scrollLeft = document.getElementById('card' + currentPlaylist).nextElementSibling.offsetLeft;
                lastInteraction = currentTimestamp;
            }
        }
        else if (currentScreen === 'playlist-details-screen') {
            if (!isGyroButtonPressed && canInteractWithSelected) {
                let playlistElement = document.querySelector('.detailed-card');
                lastInteraction = currentTimestamp;
                let songElement = playlistElement.querySelectorAll('.song')[selectedSongIndex];
                let songTitle = songElement.querySelector('.song-title').innerHTML;
                let songArtist = songElement.querySelector('.song-artist').innerHTML;
                let songDuration = songElement.querySelector('.song-duration').innerHTML;

                // If the detailed card is not the favorites card
                if (playlistElement.id !== 'cardFavorites') {
                    console.log('Requested song elimination');
                    let playlistName = playlistElement.querySelector('.playlist-title').innerHTML;
                    requestRemoveSong(songTitle, songArtist, songDuration, playlistName);
                    // Vibrate the device
                    if (canVibrate) {
                        navigator.vibrate(50);
                        console.log("Vibrating");
                    }
                } else {
                    console.log('Requested song elimination from favorites');
                    requestRemoveFromFavorites(songTitle, songArtist, songDuration);
                    // Vibrate the device
                    if (canVibrate) {
                        navigator.vibrate(50);
                        console.log("Vibrating");
                    }
                }         
            }
        }
        else if (currentScreen === 'search-song-screen') {
            console.log('Pasando a add-song-to-playlist-screen')
            // Emit a GET_PLAYLISTS event to the server
            socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'add-remove-playlist-screen') {
            // Get the card-info-container of the add-remove-playlist-screen
            let cardInfoContainer = document.querySelector('.add-remove-playlist-screen').querySelector('.card-info-container');
            // Change the top-text-header to Nombre de la playlist
            document.querySelector('.top-text-header').innerHTML = 'Nombre de la playlist:';
            document.querySelector('.top-text-subheader').innerHTML = '&lrm;';

            // Change the right double bottom button to "addPlaylistBottom"
            doubleBottomButtonRight.id = 'addPlaylistBottom';
            doubleBottomButtonRight.innerHTML = 'Añadir';
            // Change the left double bottom button to "back"
            doubleBottomButtonLeft.id = 'back';
            doubleBottomButtonLeft.innerHTML = 'Atrás';
            // Show the double-bottom-button
            doubleBottomButton.style.display = 'flex';
            // Hide the bottom button
            bottomButton.style.display = 'none';
            // Hide the double-middle-button
            cardInfoContainer.querySelector('.double-middle-button').style.display = 'none';
            // Show the text input
            cardInfoContainer.querySelector('#addPlaylistName').style.display = 'flex';
            // Hide the top button
            topButton.style.display = 'none';
            currentScreen = 'add-playlist-screen';
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }

            lastInteraction = currentTimestamp;
        }

    }
    // If the movement is to the left
    else if (accelerometer.x > 6 && accelXChange > 3 && gyroZChange > 2 && gyro.z > 1) {
        if (currentScreen === 'main-screen') {
            console.log('Abriendo favoritos');
            socket.emit('GET_FAVORITES', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'playlists-screen' || currentScreen === 'add-song-to-playlist-screen'
                || currentScreen === 'remove-playlist-screen') {
            console.log('Scrolling to the left');
            // Check if the current playlist is greater than 0
            if (currentPlaylist > 0) {
                // Remove the focus from the current card
                // Scroll to the focused card
                cardsContainer.scrollLeft = document.getElementById('card' + currentPlaylist).previousElementSibling.offsetLeft;
                lastInteraction = currentTimestamp;
            }
        }
        else if (currentScreen === 'playlist-details-screen') {
            if (!isGyroButtonPressed && canInteractWithSelected) {
                let playlistElement = document.querySelector('.detailed-card');
                    // If the detailed card is not the favorites card
                    if (playlistElement.id !== 'cardFavorites') {

                        console.log('Requested song addition to favorites');
                        lastInteraction = currentTimestamp;
                        let songElement = playlistElement.querySelectorAll('.song')[selectedSongIndex];
                        let songTitle = songElement.querySelector('.song-title').innerHTML;
                        let songArtist = songElement.querySelector('.song-artist').innerHTML;
                        let songDuration = songElement.querySelector('.song-duration').innerHTML;
                        let playlistName = playlistElement.querySelector('.playlist-title').innerHTML;
                        requestAddToFavorites(songTitle, songArtist, songDuration, playlistName);
                        // Vibrate the device
                        if (canVibrate) {
                            navigator.vibrate(50);
                            console.log("Vibrating");
                        }
                    }
            }
        }
        else if (currentScreen === 'add-remove-playlist-screen') {
            // Hide the add-remove-playlist-screen
            document.querySelector('.add-remove-playlist-screen').style.display = 'none';
            // Change the right double bottom button to "removePlaylistBottom"
            doubleBottomButtonRight.id = 'removePlaylistBottom';
            doubleBottomButtonRight.innerHTML = 'Eliminar';
            // Change the left double bottom button to "back"
            doubleBottomButtonLeft.id = 'back';
            doubleBottomButtonLeft.innerHTML = 'Atrás';
            // Show the double-bottom-button
            doubleBottomButton.style.display = 'flex';
            // Hide the top button
            topButton.style.display = 'none';
            // Do not allow to enter the card details
            allowCardDetails = false;
            // Display the cards-container
            document.querySelector('.cards-container').style.display = 'flex';
            currentScreen = 'remove-playlist-screen';
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }

            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'search-song-screen') {
            console.log('Pasando a main-screen')
            // Hide the search song screen
            document.querySelector('.search-song-screen').style.display = 'none';
            // Show the main screen
            document.querySelector('.main-screen').style.display = 'flex';
            // Show the bottom button
            bottomButton.style.display = 'flex';
            // Show the top button
            topButton.style.display = 'flex';
            document.querySelector('.song-found-title').innerHTML = 'Buscando la canción...';
            document.querySelector('.song-found-artist').innerHTML = '&lrm;';
            document.querySelector('.song-found-duration').innerHTML = '&lrm;';
            currentScreen = 'main-screen';
            console.log(currentScreen);
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
    }

    // If the movement is downwards
    if (accelerometer.y < -4 && accelYChange > 3 && gyroXChange > 2 && gyro.x < -0.5) {
        console.log('Downwards movement');  
        if (currentScreen === 'main-screen') {
            console.log('Opening Settings');
            // Hide the main screen
            document.querySelector('.main-screen').style.display = 'none';
            // Show the settings screen
            document.querySelector('.settings-screen').style.display = 'flex';
            
            // Hide the double-middle-button
            document.querySelector('.double-middle-button').style.display = 'none';
            // Change the bottom button to "back"
            bottomButton.id = 'back';
            bottomButton.innerHTML = 'Atrás';
            bottomButton.style.display = 'flex';
            // Hide the top button
            topButton.style.display = 'none';

            currentScreen = 'settings-screen';
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'playlists-screen'){
            console.log('Exporting playlist');
            // Send the current playlist to the server with the order it has in the DOM
            let playlistTitle = playlists[currentPlaylist].name;
            // Get the playlist-songs from the element playlist-title that matches in which innerHTML is the playlistTitle
            playlistContainer = document.querySelector('.playlist-title').innerHTML === playlistTitle ? document.querySelector('.playlist-info-container') : null;
            if (playlistContainer) {
                let playlistSongs = [];
                playlistContainer.querySelectorAll('.song').forEach(song => {
                    playlistSongs.push({
                        title: song.querySelector('.song-title').innerHTML,
                        artist: song.querySelector('.song-artist').innerHTML,
                        duration: song.querySelector('.song-duration').innerHTML
                    });
                });
                let playlistNumSongs = playlistContainer.querySelector('.num-songs').innerHTML;
                let playlistTotalDuration = playlistContainer.querySelector('.total-duration').innerHTML;
                socket.emit('EXPORT_PLAYLIST', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token'), playlistTitle: playlistTitle,
                    playlistSongs: playlistSongs, playlistNumSongs: playlistNumSongs, playlistTotalDuration: playlistTotalDuration });
                console.log('Exporting playlist:', playlistTitle);
            }
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'favorites-screen') {
            console.log('Exporting favorites');
            // Send the favorites to the server with the order they have in the DOM
            let playlistSongs = [];
            document.querySelector('#cardFavorites').querySelectorAll('.song').forEach(song => {
                playlistSongs.push({
                    title: song.querySelector('.song-title').innerHTML,
                    artist: song.querySelector('.song-artist').innerHTML,
                    duration: song.querySelector('.song-duration').innerHTML
                });
            });
            let playlistNumSongs = document.querySelector('#cardFavorites').querySelector('.num-songs').innerHTML;
            let playlistTotalDuration = document.querySelector('#cardFavorites').querySelector('.total-duration').innerHTML;
            socket.emit('EXPORT_PLAYLIST', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token'), playlistTitle: 'Favorites',
                playlistSongs: playlistSongs, playlistNumSongs: playlistNumSongs, playlistTotalDuration: playlistTotalDuration });
            console.log('Exporting favorites');
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'playlist-details-screen') {
            if (!isGyroButtonPressed) {
                console.log('Sorting playlist:', document.querySelector('.detailed-card').querySelector('.playlist-title').innerHTML);
                let playlistSongs = document.querySelector('.detailed-card').querySelector('.playlist-songs');
                // Sort the playlist songs
                if (sortTypeOrder === 0) {   // Alphabetical Asc.
                    // Replace the svg element of the top button
                    topButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252.48 131.82" class="sorting-svg">
                            <defs>
                                <style>.cls-1{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:21px;}</style>
                            </defs>
                            <path class="cls-1" d="M121.31,65.85h35.14M43.75,10.5V121.32M10.5,43.75,43.75,10.5M77,43.75,43.75,10.5m132.53,11h-55m0,88.65h15.31"/>
                            <polyline class="cls-1" points="177.07 121.26 210.74 45.33 241.98 121.26"/><line class="cls-1" x1="186.02" y1="101.07" x2="233.68" y2="101.07"/>
                        </svg>
                    `;
                    sortPlaylist(playlistSongs, 0, 0);

                } else if (sortTypeOrder === 1) {   // Alphabetical Desc.
                    topButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252.5 131.82" class="sorting-svg">
                            <defs>
                                <style>.cls-1{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;stroke-width:21px;}</style>
                            </defs>
                            <path class="cls-1" d="M121.32,65.91h35.15M176.3,21.58h-55m0,88.66h15.32M43.75,10.5V121.32m0,0L10.5,88.08m33.25,33.24L77,88.08"/>
                            <polyline class="cls-1" points="177.09 121.32 210.76 45.39 242 121.32"/>
                            <line class="cls-1" x1="186.04" y1="101.14" x2="233.69" y2="101.14"/>
                        </svg>
                    `;
                    sortPlaylist(playlistSongs, 0, 1);

                } else if (sortTypeOrder === 2) {   // Duration Asc.
                    topButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 249.48 131.82" class="sorting-svg">
                            <defs>
                                <style>.cls-1,.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;}.cls-1{stroke-width:21px;}.cls-2{stroke-width:15px;}</style>
                            </defs>
                            <path class="cls-1" d="M121.31,65.85h35.14M43.75,10.5V121.32M10.5,43.75,43.75,10.5M77,43.75,43.75,10.5m132.53,11h-55m0,88.65h15.31"/>
                            <polygon class="cls-2" points="189.31 121.32 240.78 51.67 188.11 51.74 241.98 121.26 189.31 121.32"/>
                        </svg>
                    `;
                    sortPlaylist(playlistSongs, 1, 0);

                } else if (sortTypeOrder === 3) {   // Duration Desc.
                    topButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 249.02 131.82" class="sorting-svg">
                            <defs>
                                <style>.cls-1,.cls-2{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round;}.cls-1{stroke-width:21px;}.cls-2{stroke-width:15px;}</style>
                            </defs>
                            <path class="cls-1" d="M43.75,10.5V121.32m0,0L10.5,88.08m33.25,33.24L77,88.08"/>
                            <line class="cls-1" x1="120.84" y1="65.91" x2="155.99" y2="65.91"/>
                            <line class="cls-1" x1="175.82" y1="21.58" x2="120.84" y2="21.58"/>
                            <line class="cls-1" x1="120.84" y1="110.24" x2="136.15" y2="110.24"/>
                            <polygon class="cls-2" points="188.85 121.39 240.32 51.74 187.65 51.81 241.52 121.32 188.85 121.39"/>
                        </svg>
                    `;
                    sortPlaylist(playlistSongs, 1, 1);   
                }
                sortTypeOrder = (sortTypeOrder + 1) % 4;

                lastInteraction = currentTimestamp;
                // Vibrate the device
                if (canVibrate) {
                    navigator.vibrate(50);
                    console.log("Vibrating");
                }
            }
        }

    }
    // If the movement is upwards
    else if (accelerometer.y > 4 && accelYChange > 3 && gyroXChange > 2 && gyro.x > 0.5) {
        console.log('Upwards movement');
        if (currentScreen === 'main-screen') {
            // Make a request to the server to get the playlists sending the uname and token
            console.log('Changing to the playlists screen');
            socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'playlists-screen') {
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'playlist-details-screen') {
            if (!isGyroButtonPressed) {
                goBack();
                // Vibrate the device
                if (canVibrate) {
                    navigator.vibrate(50);
                    console.log("Vibrating");
                }
                lastInteraction = currentTimestamp;
            }
        }
        else if (currentScreen === 'add-song-to-playlist-screen') {
            let songTitle = document.querySelector('.song-found-title').innerHTML;
            let songArtist = document.querySelector('.song-found-artist').innerHTML;
            let songDuration = document.querySelector('.song-found-duration').innerHTML;
            // Emit a ADD_TO_PLAYLIST event to the server
            socket.emit('ADD_TO_PLAYLIST', { user: localStorage.getItem('uname'), token: localStorage.getItem('token'),
                                             songTitle: songTitle, songArtist: songArtist, songDuration: songDuration,
                                             playlistName: playlists[currentPlaylist].name });
            document.querySelector('.song-found-title').innerHTML = 'Buscando la canción...';
            document.querySelector('.song-found-artist').innerHTML = '&lrm;';
            document.querySelector('.song-found-duration').innerHTML = '&lrm;';
            console.log('Adding song to playlist:', songTitle);
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'favorites-screen') {
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'add-remove-playlist-screen') {
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'remove-playlist-screen') {
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'add-playlist-screen') {
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
        else if (currentScreen === 'settings-screen') {
            goBack();
            // Vibrate the device
            if (canVibrate) {
                navigator.vibrate(50);
                console.log("Vibrating");
            }
            lastInteraction = currentTimestamp;
        }
    }    

    lastAccelY = accelerometer.y;
    lastGyroX = gyro.x;
    lastAccelX = accelerometer.x;
    lastGyroZ = gyro.z;
});

// Function to sort a playlist (modifies the playlist object)
function sortPlaylist(playlistSongs, sortType, sortOrder) {
    // Note:
    // let songItems = playlistSongs.querySelectorAll('.song');
    // sortType: 0 - alphabetical, 1 - duration
    // sortOrder: 0 - ascending, 1 - descending

    let songItems = playlistSongs.querySelectorAll('.song');

    // Sort the song items without modifying the DOM
    let sortedSongItems = Array.from(songItems).sort((a, b) => {
        let aTitle = a.querySelector('.song-title').innerHTML;
        let bTitle = b.querySelector('.song-title').innerHTML;
        let aDuration = a.querySelector('.song-duration').innerHTML;
        let bDuration = b.querySelector('.song-duration').innerHTML;

        if (sortType === 0) {
            if (sortOrder === 0) {
                return aTitle.localeCompare(bTitle);
            } else {
                return bTitle.localeCompare(aTitle);
            }
        } else {
            if (sortOrder === 0) {
                return aDuration.localeCompare(bDuration);
            } else {
                return bDuration.localeCompare(aDuration);
            }
        }
    });

    // Remove the song items from the playlist
    songItems.forEach(song => song.remove());

    // Add the sorted song items to the playlist
    sortedSongItems.forEach(song => playlistSongs.appendChild(song));
}

    

accelerometer.start();
gyro.start();
