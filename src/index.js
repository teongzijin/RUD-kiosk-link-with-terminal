const WebSocket = require('ws');
const A920Driver = require('./drivers/A920Driver');
const IM30Driver = require('./drivers/IM30Driver');

const wss = new WebSocket.Server({ port: 8082 });

wss.on("connection", (ws) => {
    console.log("Kiosk Terminal Link Established");

    ws.on("message", async (msg) => {
        try {
          
            const request = JSON.parse(msg.toString());
            const { hardware_type, ...params } = request;
          
            const driver = hardware_type === 'IM30' 
                ? new IM30Driver({ path: 'COM3' }) 
                : new A920Driver({ ip: '192.168.1.6' });

            await driver.execute(params, 
                (resp) => ws.send(JSON.stringify({ status: 'SUCCESS', data: resp })),
                (err) => ws.send(JSON.stringify({ status: 'ERROR', message: err.message }))
            );

        } catch (err) {
            console.error("Critical Middleware Error:", err);
        }
    });
});
