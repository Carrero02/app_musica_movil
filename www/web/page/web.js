const socket = io();
let mymap;
let origen;
let destino;
let playlists = [];
let favorites = [];
let tiempoDeViaje;
let playlistButton = document.querySelector('#playlistButton');
let favoriteButton = document.querySelector('#favoriteButton');
let recomendacionButton = document.querySelector('#recomendacionButton');



playlistButton.addEventListener('click', function(){
    socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
}
);
favoriteButton.addEventListener('click', function(){
    socket.emit('GET_FAVORITES', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
}
);

recomendacionButton.addEventListener('click', function(){
    /*showMap();*/
});

socket.on('connect', () => {
    socket.emit('WEB_CONNECTED', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
    socket.emit('GET_PLAYLISTS', { uname: localStorage.getItem('uname'), token: localStorage.getItem('token') });
    socket.on("ACK_CONNECTION", () => {
    });

    socket.on('PLAYLISTS_RETRIEVED', (data) => {
        console.log('Playlists retrieved:', data);
        // Replace the playlists array with the new playlists
        playlists = [...data];
        showplaylists()
    });

    socket.on('FAVORITES_RETRIEVED', (data) => {
        console.log('Favorites retrieved:', data);
        // Replace the playlists array with the new playlists
        favorites = [...data.songs];
        console.log('Favorites:', favorites);
        showFavorites();
    });

    socket.on('EXPORT_PLAYLIST', (data) => {
        console.log('Export playlist:', data);
        // Create a playlist object with the data
        let playlist = {
            name: data.playlistTitle,
            songs: data.playlistSongs,
            numSongs: data.playlistNumSongs,
            totalDuration: data.playlistTotalDuration
        };
        alert(`Playlist received from mobile:\nName: ${playlist.name}\nNumber of songs: ${playlist.numSongs}\nDuration: ${playlist.totalDuration}`);
        // Download the playlist as a JSON file
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(playlist)));
        let filename = playlist.name.replace(/ /g, '_') + '-' + Date.now() + '.json';
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        
    });

});

function showplaylists(){
    /*reset the container*/
    let container = document.querySelector('#container');
    container.innerHTML = '';
        for (let i = 0; i < playlists.length; i++) {
        let playlist = playlists[i];
        let div = document.createElement('div');
        div.classList.add('playlist');
        div.id = i;
        div.innerHTML = '<h2>'+playlist.name+'</h2>';
        div.innerHTML += '<p> songs: ' + playlist.songs.length + '</p>';
        div.innerHTML += '<p> duration: ' + playlist.totalDuration + '</p>';
        div.addEventListener('click', function(){
            let container = document.querySelector('#container');
            container.innerHTML = '';
            let playlist = playlists[this.id];
            for (let i = 0; i < playlist.songs.length; i++) {
                let song = playlist.songs[i];
                let div = document.createElement('div');
                div.classList.add('playlist');
                div.innerHTML = '<h2>'+song.title+'</h2>';
                div.innerHTML += '<p> artist: ' + song.artist + '</p>';
                div.innerHTML += '<p> duration: ' + song.duration + '</p>';
                container.appendChild(div);
            }
        });

        container.appendChild(div);
    }
    console.log(container);
}

function showFavorites(){
    let container = document.querySelector('#container');
    container.innerHTML = '';
    /* want to show each playlist in a div but the div is not created*/
    console.log(favorites);
    for (let i = 0; i < favorites.length; i++) {
        let favorite = favorites[i];
        let div = document.createElement('div');
        div.classList.add('playlist');
        div.innerHTML = '<h2>'+favorite.title+'</h2>';
        div.innerHTML += '<p> songs: ' + favorite.artist + '</p>';
        div.innerHTML += '<p> duration: ' + favorite.duration + '</p>';
        container.appendChild(div);
    }
}

function showMap(){
    let container = document.querySelector('#container');
    mymap= L.map('sample_map');
    origen = L.marker().bindPopup("ORIGEN");
    destino = L.marker().bindPopup("DESTINO");
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
        maxZoom: 18
}).addTo(mymap);
    container.innerHTML = '';
    let div = document.createElement('div');
    div.innerHTML = '<label for="modo-transporte">Modo de transporte:</label>';
    div.innerHTML += '<select id="modo-transporte">';
    div.innerHTML += '<option value="andando">Andando</option>';
    div.innerHTML += '<option value="bici">Bici</option>';
    div.innerHTML += '<option value="coche">Coche</option>';
    div.innerHTML += '</select>';
    div.innerHTML += '<button onclick="calcularTiempoDeViaje()">Calcular tiempo de viaje</button>';
    div.innerHTML += '<p id="resultado"></p>';
    container.appendChild(div);
    let map = document.createElement('div');
    map.id = 'sample_map';
    navigator.geolocation.getCurrentPosition(setMapView);
}


function setMapView(pos){
    mymap.setView([pos.coords.latitude, pos.coords.longitude],15);
    origen.setLatLng([pos.coords.latitude, pos.coords.longitude]).addTo(mymap);
}


mymap.on('click',function(e){destino.setLatLng(e.latlng).addTo(mymap)})

// Función para calcular el tiempo de viaje
function calcularTiempoDeViaje() {

    if(destino.getLatLng()==null){
        alert("Selecciona primero un destino");
        return 
    }
    var modoDeTransporte = document.getElementById("modo-transporte").value;

    // Calcular la distancia entre los puntos de origen y destino
    var distancia = mymap.distance(origen._latlng,destino._latlng);
    console.log(distancia,"distance");
    // Calcular el tiempo de viaje
    calcularTiempoDeViajes(modoDeTransporte,distancia);

}

// Función para calcular el tiempo de viaje en base al modo de transporte y la distancia
/*function calcularTiempoDeViajes(modoDeTransporte, distancia) {
    var velocidad; // Velocidad en metros por segundo (m/s)
    console.log("transpote",modoDeTransporte);
    // Convertir la velocidad según el modo de transporte
    if (modoDeTransporte === 'andando') {
        velocidad = 5 * 1000 / 3600; // Convertir km/h a m/s
    } else if (modoDeTransporte === 'bici') {
        velocidad = 10 * 1000 / 3600; // Convertir km/h a m/s
    } else if (modoDeTransporte === 'coche') {
        velocidad = 50 * 1000 / 3600; // Convertir km/h a m/s
    } else {
        console.error("Modo de transporte no válido");
        return;
    }

    // Calcular el tiempo de viaje en horas
    var tiempoEnHoras = distancia / (velocidad * 3600);
    if (tiempoEnHoras < 1){
        tiempoEnHoras= tiempoEnHoras * 60;
        document.getElementById("resultado").innerText = "Tiempo de viaje en " + modoDeTransporte + ": " + tiempoEnHoras.toFixed(2) + " minutos";
    }
    else{
        document.getElementById("resultado").innerText = "Tiempo de viaje en " + modoDeTransporte + ": " + tiempoEnHoras.toFixed(2) + " horas";
    }
    tiempoDeViaje = tiempoEnHoras;
}

function recomendarPlaylist(){
    tiempoDeViajeSegundos = tiempoDeViaje*3600;
    let playlistCercana;
    let diferencia = null;
    for (let i = 0; i < playlists.length; i++) {
        let playlist = playlists[i];
        playlistDuration = parseTime(playlist.totalDuration);
        let diferenciaActual = Math.abs(playlistDuration - tiempoDeViajeSegundos);
        if (diferencia == null || diferenciaActual < diferencia){
            diferencia = diferenciaActual;
            playlistCercana = playlist;
        }
    }
    alert("La playlist mas cercana a tu tiempo de viaje es: " + playlistCercana.name);

}

function parseTime(time){
    const totalDurationParts = time.split(':');
    let totalDurationInSeconds = 0;

    if (totalDurationParts.length === 3) {
        totalDurationInSeconds = parseInt(totalDurationParts[0]) * 3600 + parseInt(totalDurationParts[1]) * 60 + parseInt(totalDurationParts[2]);
    } else if (totalDurationParts.length === 2) {
        totalDurationInSeconds = parseInt(totalDurationParts[0]) * 60 + parseInt(totalDurationParts[1]);
    } else if (totalDurationParts.length === 1) {
        totalDurationInSeconds = parseInt(totalDurationParts[0]);
    } else {
        console.log('Invalid total duration format');
    }
    return totalDurationInSeconds;
}*/