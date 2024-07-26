Integrantes:
	100451286--Raúl Miguel Carrero Martín
	100451112--Darío Caballero Polo
	100451025--Carlos Pérez Gómez

Introducción:
	El concepto de la app consiste en una app móvil que permite a los usuarios crear playlists de canciones
	y añadir canciones mediante búsqueda por audio. La app permite a los usuarios añadir canciones a favoritos,
	ordenar las canciones dentro de las playlists, y exportar las playlists a un archivo JSON, enviándolo desde
	el móvil al ordenador donde haya iniciado sesión por última vez en la web.

¿Cómo lanzar la aplicación?
	- Para lanzar la aplicación, se debe descargar FFmpeg (y añadirlo al PATH del sistema si da error al lanzar el servidor)
	  Se puede descargar en el siguiente enlace: https://ffmpeg.org/download.html
	- Una vez descargado, se debe ejecutar el servidor 'index.js' en el directorio raíz
	- Para acceder a la aplicación móvil, se ha de entrar a la URL https://localhost:3000/mobile
	- Para acceder a la aplicación web, se ha de entrar a la URL https://localhost:3000/web
	- Tras el inicio de sesión, se habrá accedido a https://localhost:3000/mobile/page o https://localhost:3000/web/page
	- Si se refresca la página pasado el inicio de sesión, se obtendrá un Forbidden error y será necesario
	  volver a la página de inicio de sesión

Interacciones móvil:
	- Todas las pantallas y el proceso de navegación por ellas se detallan en la imagen '/tutorial/interaction flow.png'
	- El botón de "Exportar canción", con un icono de una caja, no muestra ninguna interacción en la imagen, porque no desplaza
	  la pantalla. Este envía la canción seleccionada al servidor, y del servidor a la web del mismo usuario. Al llegar,
	  muestra la información básica en pantalla, la duración total, que sería nuestro "checkout", y descarga un archivo
	  JSON con toda esa información
	- La playlist enviada se envía con las canciones ordenadas de la forma en la que el usuario haya decidido la momento de enviarla

Interaccionnes por movimiento:
    Hay cuatro interacciones principales:
        - Movimiento rápido con la muñeca, inclinando el móvil hacia detrás:
			- Acciona el botón de la barra de arriba
		- Movimiento rápido con la muñeca, inclinando el móvil hacia adelante
			- Acciona el botón de la barra de abajo
			- En caso de que la barra de abajo tenga dos botonoes, se acciona el botón de la izquierda
		- Movimiento rápido con la muñeca, inclinando el móvil hacia la derecha
			- Acciona el botón se encuentre a la derecha
			- En las pantallas donde se puede navegar por las playlist, se navega a la siguiente playlist
		- Movimiento rápido con la muñeca, inclinando el móvil hacia la izquierda
			- Acciona el botón se encuentre a la izquierda
			- En las pantallas donde se puede navegar por las playlist, se navega a la anterior playlist
	
	Estas interacciones se ejemplifican en la imagen '/tutorial/movement controls.png'
	
	Adicionalmente, hay una interacción especial en la pantalla de detalles de una playlist,
	al presionar sobre la tarjeta de una playlist en la pantalla de playlists:
		- Interacción de "Gyro Scroll":
			- Manteniendo pulsado el botón "Gyro", aparece un recuadro seector sobre la primera canción de la playlist
			- Desde esa posición, al inclinar el móvil hacia detrás o hacia delante, se desplaza la lista de canciones
				hacia arriba o hacia abajo, respectivamente
			- Al soltar el botón "Gyro", el selector se queda sobre la canción seleccionada
			- Ahora, al realizar el giro rápido de muñeca hacia la derecha, se elimina la canción seleccionada de la playlist
			- Al realizar el giro rápido de muñeca hacia la izquierda, se añade la canción seleccionada a favoritos
		- Esta interacción se ejemplifica en la imagen '/tutorial/gyro scroll.png'

Otras interacciones interesantes:
	- En la pantalla de detalles de una playlist, al deslizar una canción hacia la izquierda, se añade a favoritos
	- En la pantalla de detalles de una playlist, al deslizar una canción hacia la derecha, se elimina de la playlist
	- En la pantalla de favoritos, al deslizar una canción hacia la derecha, se elimina de favoritos

	- Estas interacciones de deslizamiento de los elementos de las listas han sido programadas para no ser sensibles a movimientos
		pequeños, evitando así que se activen por accidente. No se permite el scroll vertical con los elementos de las
		playlist, si mientras tanto se está deslizando horizontalmente un elemento de la lista y viceversa
	
	- Cuando se sobrepasa el umbral a partir del cual se eliminará o añadirá a favoritos una canción, el teléfono vibra
		para indicar que la acción se realizará al soltar el dedo. También se muestra el texto en negrita
	- Adicionalmente, los elementos cambian progresivamente de color a medida que se acerca al umbral, informando al usuario
		del alcance de su acción

Funcionalidades adicionales:
	- Se ha implementado una pantalla de ajustes, que permite activar y desactivar tanto la vibración como las interacciones
		por movimiento, ya que pueden resultar incómodas para algunos usuarios
	- Toda la interfaz móvil, a excepción de la pantalla de inicio de sesión, es responsive, y se adaptará a cualquier
		tamaño y relación de aspecto de pantalla, aunque está optimizada para pantallas verticales

Funcionalidades no implementadas:
	- No se ha implementado la funcionalidad de historial de reproducción, pero hacerlo sería trivial, ya que tan solo
	  habría que guardar un campo similar al de favoritos en la base de datos, en el que se guardaran las canciones
	  reconocidas por la API de Shazam
	- Se ha implementado el sistema de recomendación de playlists por ruta obtenida en un mapa según la duración
	  de la misma. Sin embargo, por falta de tiempo no se ha conseguido que el JavaScript dedicado a la web reconozca
	  las funcionalidades propias de la API de leaflet map
	- A pesar de tener una interacción por sonido (la identificación de canciones), no se ha implementado la capacidad
	  de interactuar con la aplicación mediante comandos de voz debido a la falta de tiempo y a la complejidad de la
	  correcta implementación de la API de Shazam, la cual se consiguió que funcionara correctamente

Claves de la API de Shazam (en caso de que se superen las 500 peticiones gratuitas):
	- 85f65a81aamsha4f7588e8ce9cdep1e256bjsnb0fe7219b610
	- db6876d12emshf18ac51cfbcceb8p164ec8jsn0ffea9350292

	- Para cambiar la clave, se debe modificar el parámetro 'X-RapidAPI-Key' de la cabecera de la petición a la API
	  en el archivo 'index.js' del directorio raíz
	
	- Si no se lograra que la búsqueda de canciones fuese exitosa, se puede reemplazar la petición 'SEARCH_SONG'
	  por 'SEARCH_SONG_TEST' en el archivo '/www/page/mobile.js' para obtener una respuesta simulada de la
	  petición a la API de Shazam. Esta funciona emulando al proceso real, enviando 25 segundos de audio
	  segmentados en 5 partes. Cada parte que recibe el servidor tiene una probabilidad del 30% de identificar
	  la canción, un 10% de dar error, y un 60% de no identificar nada. Igual que con la función real, si la
	  canción se identifica con una de las partes, las posteriores son descartadas por parte del servidor
	  para ahorrar llamadas a la API

¿Por qué se ha utilizado HTTPS en lugar de HTTP?
	- Las interacciones por movimiento se desactivan en HTTP, ya que el navegador no permite acceder a los sensores
	  del dispositivo en páginas no seguras
	- El certificado es autofirmado, por lo que el navegador advertirá de que la conexión no es segura. Se ha de aceptar
	  la conexión no segura para poder acceder a la aplicación
	- El certificado SSL se ha generado con OpenSSL