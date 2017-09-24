var server = require('./config').server;
var socket = require('socket.io-client')(server);

socket.on('connect', function(){});
socket.on('event', function(data){});
socket.on('disconnect', function(){});

socket.on('start', function() {
    execLogs();
});

function cleanData(data) {
    var res = [];

    // Split lines, using a sync loop to keep order
    var dataArray = data.toString().split(/\r?\n/);
    for(var idx in dataArray) {
        var msg = dataArray[idx];
        if(msg.replace(/\s/g, '').length > 0)
            res.push(msg);
    }

    return res;
}


function execLogs() {
    const spawn = require('child_process').spawn;
    console.log(process.env.HOME);
    const logs = spawn('docker-compose', ['logs', '-f', '-t'], {cwd: process.env.HOME + '/chainpoint-node'});

    logs.stdout.on('data', (data) => {
        socket.emit('log', {level: 'info', data: cleanData(data)});
    });

    logs.stderr.on('data', (data) => {
        socket.emit('log', {level: 'info', data: cleanData(data)});
    });

    logs.on('close', (code) => {
        socket.emit('log', {level: 'info', data: ['Exited with code: ' + code]});
        console.log(`child process exited with code ${code}`);
    });
}
