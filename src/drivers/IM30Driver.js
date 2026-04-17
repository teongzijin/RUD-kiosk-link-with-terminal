const { SerialPort } = require('serialport');

const TAG_MAP = {
    '40': 'Amount',
    '41': 'Tip Amount',
    '02': 'Response Text',
    '01': 'Approval Code',
    '77': 'POS Transaction ID',

};

class IM30Driver {
    constructor(config) {
        this.port = new SerialPort({
            path: config.path || 'COM3',
            baudRate: 115200,
            autoOpen: false
        });
        this.currentTxn = null;
    }

    async execute(data, onResponse, onError) {
        try {
            if (!this.port.isOpen) {
                await new Promise((resolve, reject) => {
                    this.port.open((err) => err ? reject(err) : resolve());
                });
            }

            this.currentTxn = { tid: data.tid, amount: data.amount };
            
            const pkt = this._buildPacket(data.tid, data.amount, data.sales_type);
            
            this.port.write(pkt, (err) => {
                if (err) return onError(err);
            });

            // use once to prevent memory leak
            this.port.once('data', (raw) => {
                const result = this._parseResponse(raw);
                if (result) onResponse(result);
            });

        } catch (err) {
            onError(err);
        }
    }

    //logic to build packet
    _buildPacket(transactionId, amountCents, sales_type) {
        const STX = 0x02, ETX = 0x03, FS = 0x1C;
        const tipsCents = 0;

        let body = Buffer.concat([
            this._ascii('60'), this._ascii('0000'), this._ascii('0000'), this._ascii('1'),
            this._ascii('0'), this._ascii((sales_type || '00').toString()), this._ascii('00'), this._ascii('0'),
            this._bytes(FS)
        ]);

        body = Buffer.concat([
            body, this._ascii('40'), this._bcdLLLL(12), this._ascii(amountCents.toString().padStart(12, '0')), this._bytes(FS)
        ]);

        body = Buffer.concat([
            body, this._ascii('77'), this._bcdLLLL(50), this._ascii(this._padRight(transactionId, 50, ' ')), this._bytes(FS)
        ]);

        const llll = this._bcdLLLL(body.length);
        const withoutLRC = Buffer.concat([this._bytes(STX), llll, body, this._bytes(ETX)]);
        const lrc = this._calcLRC(withoutLRC.subarray(1));
        
        return Buffer.concat([withoutLRC, this._bytes(lrc)]);
    }

    _parseResponse(buffer) {
        const STX = 0x02, ETX = 0x03, FS = 0x1C;
        
        if (buffer[0] !== STX && buffer[0] !== 0x06) return null; 
        if (buffer[0] === 0x06) return { status: "ACK", msg: "Terminal Received Request" };

        const etxIndex = buffer.indexOf(ETX);
        let offset = 1 + 2; 
        
        const header = buffer.slice(offset, offset + 14).toString('ascii');
        offset += 14;

        const fields = [];
        while (offset < etxIndex && offset < buffer.length) {
            if (buffer[offset] === FS) { offset++; continue; }
            
            const tag = buffer.slice(offset, offset + 2).toString('ascii');
            offset += 2;

            const hi = buffer[offset], lo = buffer[offset + 1];
            offset += 2;
            const length = ((hi >> 4) * 1000) + ((hi & 0x0F) * 100) +
                           ((lo >> 4) * 10) + (lo & 0x0F);

            const value = buffer.slice(offset, offset + length).toString('ascii').trim();
            offset += length;

            fields.push({
                tag,
                name: TAG_MAP[tag] || 'Unknown',
                value
            });

            if (buffer[offset] === FS) offset++;
        }
        return { header, fields };
    }


    _ascii(s) { return Buffer.from(s, 'ascii'); }
    
    _bytes(...vals) { return Buffer.from(vals.flat()); }

    _bcdLLLL(n) {
        const s = n.toString().padStart(4, '0');
        const hi = ((s.charCodeAt(0) - 48) << 4) | (s.charCodeAt(1) - 48);
        const lo = ((s.charCodeAt(2) - 48) << 4) | (s.charCodeAt(3) - 48);
        return Buffer.from([hi, lo]);
    }

    _padRight(s, len, ch = ' ') {
        s = String(s);
        return s.length >= len ? s.slice(0, len) : s + ch.repeat(len - s.length);
    }

    _calcLRC(buf) {
        let x = 0;
        for (const b of buf) x ^= b;
        return x & 0xFF;
    }
}

module.exports = IM30Driver;
