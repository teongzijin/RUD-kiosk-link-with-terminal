import { SerialPort } from 'serialport';
import WebSocket, { Server } from 'ws';
import EventEmitter from 'events';

// ====== Types & Interfaces ======
interface Transaction {
    tid: string;
    amount: number;
    sales_type: '00' | '01'; // 00=Card, 01=QR
}

// ====== Configuration ======
const IS_DEMO_MODE = true; // Set to true for GitHub Demo
const WS_PORT = 8081;

// ====== Mock Hardware Simulator ======
class MockIM30 extends EventEmitter {
    open(cb: (err: Error | null) => void) {
        console.log("🛠️ [Mock] Initializing Hardware...");
        setTimeout(() => cb(null), 1000);
    }
    write(pkt: Buffer, cb?: (err: Error | null) => void) {
        console.log("🛠️ [Mock] Received Packet:", pkt.toString('hex'));
        setTimeout(() => {
            this.emit('data', Buffer.from([0x06])); // Send ACK
            setTimeout(() => {
                // Simulate a successful Card Sale (001120 + status 00)
                const mockHex = "020030" + "60000000001096000" + "1C" + "001120" + "00" + "APPROVED" + "03";
                this.emit('data', Buffer.from(mockHex, 'ascii'));
            }, 2000);
        }, 500);
        if (cb) cb(null);
    }
}

// ====== Core Gateway Logic ======
class RUDPaymentGateway {
    private port: any;
    private wss: Server;
    private currentClient: WebSocket | null = null;
    private currentTxn: Transaction | null = null;

    constructor() {
        this.port = IS_DEMO_MODE ? new MockIM30() : new SerialPort({ path: 'COM3', baudRate: 115200, autoOpen: false });
        this.wss = new WebSocket.Server({ port: WS_PORT });
        this.init();
    }

    private init() {
        this.wss.on('connection', (ws) => {
            console.log("🔌 Kiosk UI Connected");
            this.currentClient = ws;
            ws.on('message', (msg) => this.handleWSMessage(msg.toString()));
        });

        this.port.on('data', (data: Buffer) => this.handleHardwareData(data));
        
        console.log(`🚀 RUD Gateway running. Demo Mode: ${IS_DEMO_MODE}`);
        setTimeout(() => this.connectHardware(), 2000); // Simulated delay
    }

    private connectHardware() {
        this.port.open((err: any) => {
            if (err) setTimeout(() => this.connectHardware(), 5000);
            else console.log("✅ Hardware Connected");
        });
    }

    private handleWSMessage(msg: string) {
        const data = JSON.parse(msg);
        if (data.op === 'sale') {
            this.currentTxn = data;
            const pkt = this.buildPacket(data.tid, data.amount, data.sales_type);
            this.port.write(pkt);
        }
    }

    private handleHardwareData(data: Buffer) {
        const str = data.toString();
        // Logical detection for Card (1120) or QR (1121)[cite: 1]
        const cardIdx = str.indexOf("001120");
        const qrIdx = str.indexOf("001121");

        if (cardIdx !== -1 || qrIdx !== -1) {
            const idx = cardIdx !== -1 ? cardIdx : qrIdx;
            const status = str.substr(idx + 6, 2);
            
            if (status === "00") { // SUCCESS[cite: 1]
                this.broadcast(`terminal_approved|${this.currentTxn?.tid}|${(this.currentTxn?.amount || 0)/100}`);
            } else {
                this.broadcast(`terminal_declined|${status}`);
            }
        }
    }

    private buildPacket(tid: string, amt: number, type: string): Buffer {
        // ... (Your existing buildCardSalePacket logic here)
        return Buffer.from("..."); 
    }

    private broadcast(msg: string) {
        if (this.currentClient?.readyState === WebSocket.OPEN) {
            this.currentClient.send(msg);
        }
    }
}

new RUDPaymentGateway();
