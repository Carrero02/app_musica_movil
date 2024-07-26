document.addEventListener('DOMContentLoaded', (event) => {
    const socket = io();

    socket.on('connect', () => {
        socket.emit('MOBILE_LOGIN_CONNECTED', { id: 1 });

        socket.on("ACK_CONNECTION", () => {
            console.log("Connection acknowledged");
        });

        socket.on('INVALID_UNAME_FORMAT', () => {
            console.log('Username cannot be empty');
            // Show an alert to the user
            alert('Username cannot be empty');
        });

        socket.on('INVALID_PWD_FORMAT', () => {
            console.log('Password cannot be empty');
            // Show an alert to the user
            alert('Password cannot be empty');
        });

        socket.on('USER_ALREADY_REGISTERED', () => {
            console.log('User already registered');
            // Show an alert to the user
            alert('User already registered');
        });

        socket.on('DATABASE_ERROR', () => {
            console.log('Database error');
            // Show an alert to the user
            alert('Database error');
        });

        socket.on('USER_EXISTS', () => {
            console.log('User exists');
            // Show an alert to the user
            alert('Username already taken');
        });

        socket.on('INCORRECT_UNAME_PWD', () => {
            console.log('Incorrect username or password');
            // Show an alert to the user
            alert('Incorrect username or password');
        });

        ///////////////// AUTHENTICATION DONE //////////////////
        socket.on('USER_REGISTRATION_SUCCESS', (token) => {
            console.log('User registration success');
            // Show an alert to the user
            // alert('User registered successfully');
            // Store the token
            localStorage.setItem('token', token);
            console.log('Stored token:', localStorage.getItem('token'));
            // Redirect to the mobile page
            fetch('/mobile/page', {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            })
            .then(response => response.text())
            .then(page => {
                // Replace the current page with the new page
                document.documentElement.innerHTML = page;
                // Create a new script element
                let script = document.createElement('script');
                script.src = '/mobile/page/mobile.js';
                // Append the script element to the body
                document.body.appendChild(script);
                // Change the URL without reloading the page
                history.pushState(null, '', '/mobile/page');
            })
            .catch(error => {
                console.log('Error:', error);
            });
        });

        socket.on('USER_LOGIN_SUCCESS', (token) => {
            console.log('User login success');
            // Show an alert to the user
            // alert('User logged in successfully');
            // Store the token
            localStorage.setItem('token', token);
            console.log('Stored token:', localStorage.getItem('token'));
            // Redirect to the mobile page
            fetch('/mobile/page', {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            })
            .then(response => response.text())
            .then(page => {
                // Replace the current page with the new page
                document.documentElement.innerHTML = page;
                // Create a new script element
                let script = document.createElement('script');
                script.src = '/mobile/page/mobile.js';
                // Append the script element to the body
                document.body.appendChild(script);
                // Change the URL without reloading the page
                history.pushState(null, '', '/mobile/page');
            })
            .catch(error => {
                console.log('Error:', error);
            });
        });
        ////////////////////////////////////////////////////////

    });

    // REGISTRATION
    document.getElementById('registerBtn').addEventListener('click', function(event) {
        event.preventDefault(); // Prevent form submission
        console.log('Register button clicked');
        let uname = document.getElementsByName('uname')[0].value;
        let psw = document.getElementsByName('psw')[0].value;
    
        let data = {
            uname: uname,
            psw: psw
        };

        // Store the username
        localStorage.setItem('uname', data.uname);
    
        // Emit a socket event with the user data
        socket.emit('USER_REGISTRATION', data);
    });

    // LOGIN
    document.getElementById('loginBtn').addEventListener('click', function(event) {
        event.preventDefault(); // Prevent form submission
        console.log('Login button clicked');
        let uname = document.getElementsByName('uname')[0].value;
        let psw = document.getElementsByName('psw')[0].value;
    
        let data = {
            uname: uname,
            psw: psw
        };

        // Store the username
        localStorage.setItem('uname', data.uname);
    
        // Emit a socket event with the user data
        socket.emit('USER_LOGIN', data);
    });
    //////////////////////////////////////////////
});