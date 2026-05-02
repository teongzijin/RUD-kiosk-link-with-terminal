import { SerialPort } from 'serialport';
import WebSocket, { Server } from 'ws';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

// Import our new modules
import { Transaction } from './types';
import { ProtocolUtils } from './protocol';

const IS_DEMO_MODE = true; 
const INITIAL_DELAY = 15000; 
const WS_PORT = 8081;

/**
 * Hardware Simulator for Demo Purposes[cite: 1]
 */
class MockIM30 extends EventEmitter {
    open(cb: (err: Error | null) => void) {
        console.log("🛠️ [Mock] Simulator Online.");
        setTimeout(() => cb(null), 1000);
    }
    write(pkt: Buffer, cb?: (err: Error | null) => void) {
        setTimeout(() => {
            this.emit('data', Buffer.from([0x06])); // ACK
            setTimeout(() => {
                const mockHex = "020030" + "60000000001096000" + "1C" + "001120" + "00" + "APPROVED" + "03";
                this.emit('data', Buffer.from(mockHex, 'ascii'));
            }, 2000);
        }, 500);
        if (cb) cb(null);
    }
}

class RUDPaymentGateway {
    private port: any;
    private wss: Server;
    private currentClient: WebSocket | null = null;
    private currentTxn: Transaction | null = null;

    constructor() {
        this.port = IS_DEMO_MODE ? new MockIM30() : new SerialPort({ 
            path: this.getComPort(), 
            baudRate: 115200, 
            autoOpen: false 
        });

        this.wss = new WebSocket.Server({ port: WS_PORT });
        this.init();
    }

    private getComPort(): string {
        try {
            // Using process.cwd() to find config in the root folder[cite: 1]
            const configPath = path.join(process.cwd(), 'im30_config.txt');
            return fs.readFileSync(configPath, 'utf8').trim();
        } catch (e) { return 'COM3'; }
    }

    private init() {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log("🔌 UI Connected");
            this.currentClient = ws;
            ws.on('message', (msg: string) => this.handleWSMessage(msg));
        });

        this.port.on('data', (data: Buffer) => this.handleHardwareData(data));
        setTimeout(() => this.connectHardware(), INITIAL_DELAY);
    }

    private connectHardware() {
        this.port.open((err: any) => {
            if (err) setTimeout(() => this.connectHardware(), 10000);
            else console.log("✅ Hardware Ready");
        });
    }

    private handleWSMessage(msg: string) {
        try {
            const data: Transaction & { op: string } = JSON.parse(msg);
            if (data.op === 'sale') {
                this.currentTxn = data;
                const pkt = ProtocolUtils.buildSalePacket(data.tid, data.amount, data.sales_type);
                this.port.write(pkt);
            }
        } catch (e) { console.error("WS Error"); }
    }

    private handleHardwareData(data: Buffer) {
        const rawStr = data.toString();
        const cardIdx = rawStr.indexOf("001120");
        const qrIdx = rawStr.indexOf("001121");

        if (cardIdx !== -1 || qrIdx !== -1) {
            const idx = cardIdx !== -1 ? cardIdx : qrIdx;
            const respCode = rawStr.substr(idx + 6, 2);
            
            if (respCode === "00") {
                this.broadcast(`terminal_approved|${this.currentTxn?.tid}|${(this.currentTxn?.amount || 0) / 100}`);
            } else {
                this.broadcast(`terminal_declined|${respCode}`);
            }
        }
    }

    private broadcast(msg: string) {
        if (this.currentClient?.readyState === WebSocket.OPEN) {
            this.currentClient.send(msg);
        }
    }
}

new RUDPaymentGateway();
