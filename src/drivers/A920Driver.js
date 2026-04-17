const net = require('net');

class A920Driver {
    constructor(config) {
        this.ip = config.ip;
        this.port = config.port || 8080;
    }

    async execute(data, onResponse, onError) {
        const client = new net.Socket();
        
        client.connect(this.port, this.ip, () => {
            console.log(`Connected to A920 at ${this.ip}`);
          
            const payload = {
                pay_function: "01",
                pay_type: data.method,
                pay_pos_txn_id: data.order_id,
                pay_amount: data.amount,
                ...(data.camera && { pay_camera_mode: data.camera })
            };
            client.write(JSON.stringify(payload) + '\n');
        });

        client.on('data', (raw) => onResponse(raw.toString()));
        client.on('error', (err) => {
            client.destroy();
            onError(err);
        });
        client.setTimeout(10000, () => client.destroy()); 
    }
}

module.exports = A920Driver;
