import { SerialPort } from 'serialport';
import WebSocket, { Server } from 'ws';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

// Import our modular components
import { Transaction } from './types';
import { ProtocolUtils } from './protocol';

const IS_DEMO_MODE = true; 
const INITIAL_DELAY = 15000; // 15s cold-start for Kiosk environments
const WS_PORT = 8081;

/**
 * Hardware Simulator for Demo Purposes
 */
class MockIM30 extends EventEmitter {
    open(cb: (err: Error | null) => void) {
        console.log("[Mock] Simulator Online.");
        setTimeout(() => cb(null), 1000);
    }
    write(pkt: Buffer, cb?: (err: Error | null) => void) {
        setTimeout(() => {
            this.emit('data', Buffer.from([0x06])); // Send ACK
            setTimeout(() => {
                /**
                 * Simulating fragmented response: 
                 * STX + LLLL + Header + Media(001120) + Status(00) + APPROVED + ETX + LRC
                 */
                const fullHex = "020030" + "60000000001096000" + "1C" + "001120" + "00" + "APPROVED" + "03" + "5A";
                const buf = Buffer.from(fullHex, 'ascii');
                
                // Simulate fragmentation by sending in 3 pieces
                this.emit('data', buf.subarray(0, 10));
                setTimeout(() => this.emit('data', buf.subarray(10, 25)), 300);
                setTimeout(() => this.emit('data', buf.subarray(25)), 600);
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
    
    // Class-level buffer to handle serial data fragmentation
    private serialBuffer: Buffer = Buffer.alloc(0);

    constructor() {
        this.port = IS_DEMO_MODE ? new MockIM30() : new SerialPort({ 
            path: this.getComPort(), 
            baudRate: 115200, 
            autoOpen: false 
        });

        this.wss = new WebSocket.Server({ port: WS_PORT });
        this.init();
    }

    //im30_config.txt example is for demo purpose.  
    private getComPort(): string {
        try {
            const configPath = path.join(process.cwd(), 'im30_config.txt');
            return fs.readFileSync(configPath, 'utf8').trim();
        } catch (e) { return 'COM3'; }
    }

    private init() {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log("UI Connected");
            this.currentClient = ws;
            ws.on('message', (msg: string) => this.handleWSMessage(msg));
        });

        this.port.on('data', (data: Buffer) => this.handleHardwareData(data));
        setTimeout(() => this.connectHardware(), INITIAL_DELAY);
    }

    private connectHardware() {
        this.port.open((err: any) => {
            if (err) setTimeout(() => this.connectHardware(), 10000);
            else console.log("Hardware Ready");
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

    /**
     * STREAM BUFFER RE-ASSEMBLY LOGIC
     * Uses STX (0x02) and ETX (0x03) for frame synchronization.
     */
    private handleHardwareData(data: Buffer) {
        // Accumulate incoming fragments
        this.serialBuffer = Buffer.concat([this.serialBuffer, data]);

        while (this.serialBuffer.length > 0) {
            const stxIndex = this.serialBuffer.indexOf(0x02);

            // Discard junk data before STX
            if (stxIndex === -1) {
                this.serialBuffer = Buffer.alloc(0);
                break;
            }
            if (stxIndex > 0) {
                this.serialBuffer = this.serialBuffer.subarray(stxIndex);
            }

            const etxIndex = this.serialBuffer.indexOf(0x03);
            
            // Check if we have a full frame (ends with LRC byte after ETX)
            if (etxIndex !== -1 && this.serialBuffer.length > etxIndex + 1) {
                const packetLength = etxIndex + 2; 
                const fullPacket = this.serialBuffer.subarray(0, packetLength);
                
                this.processFullPacket(fullPacket);

                // Prepare buffer for next potential packet
                this.serialBuffer = this.serialBuffer.subarray(packetLength);
            } else {
                // Wait for more fragments
                break;
            }
        }
    }

    private processFullPacket(packet: Buffer) {
        const rawStr = packet.toString();
        console.log("Full Frame Reconstructed:", rawStr);

        // Core Business Logic: Detect Payment Media and Status
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
