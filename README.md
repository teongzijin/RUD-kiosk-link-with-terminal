# Project Background: The RUD Ecosystem

RUD is a comprehensive O2O ecosystem designed for the modern go-karting industry. It seamlessly integrates on-site hardware with mobile convenience to streamline the user journey from ticket purchase to the podium.  The full ecosystem consists of:
1. Smart Kiosk Terminal: A self-service station that integrates with PAX A920/IM30 for secure on-site payments. It issues physical tickets with QR codes, which staff scan to assign karts and manage track entry.
2. RUD Mobile App: A multi-functional app where users can purchase tickets via a Payment Gateway API, view their transaction history, and access digital QR tickets.
3. Real-time Performance Tracking: After the race, the app synchronizes with 3rd-party timing systems via WebSocket/API to display live race results and leaderboards.

Note: This repository specifically demonstrates the IM30 Payment Integration Layer—the critical bridge between the Kiosk UI and the hardware terminal. 

# RUD Kiosk Payment Gateway (IM30 Integration)

A robust Node.js & TypeScript payment middleware designed for the **RUD Go-Kart Ecosystem**. This gateway handles the complex communication between a Windows-based Kiosk UI and the **PAX IM30** hardware terminal.

## The Core Problem Solved
In a real-world kiosk environment, software stability is challenged by hardware latency and OS-level driver conflicts. This project addresses:
- **Windows Driver Conflict**: Implements a 20s cold-start delay to avoid serial port "Access Denied" errors during system boot[cite: 1].
- **Protocol Precision**: Accurately parses the PAX ECR protocol, specifically differentiating between **Card (001120)** and **QR (001121)** payments[cite: 1].
- **High Availability**: Features a recursive auto-retry mechanism and PM2 process protection for 24/7 unattended operation[cite: 1].

## Tech Stack
- **Backend**: Node.js, TypeScript
- **Communication**: WebSocket (for Frontend), SerialPort (for Hardware)
- **Protocols**: PAX ECR (BCD LLLL, LRC Checksum)
- **Process Management**: PM2

## Key Features
- **Intelligent Response Parsing**: Detects transaction success only when the `00` status code follows the media identifier[cite: 1].
- **Mock Hardware Mode**: A built-in simulator allows developers to test the entire payment flow (ACK -> STX -> APPROVED) without physical hardware[cite: 1].
- **Reliability Engineering**: Handles common terminal errors like `TO` (Timeout) and `LC` (Line Control Loss) with automatic frame re-sending[cite: 1].

## Quick Start (Demo Mode)
1. **Clone the repo**: `git clone <your-repo-link>`
2. **Install dependencies**: `npm install`
3. **Start the service**: `npm run demo`
   *This will launch the WebSocket server and the Hardware Simulator.*
4. **Access the Kiosk UI**: Open `public/index.html` in your browser.

## Technical Deep Dive: LRC Calculation
The project implements the Longitudinal Redundancy Check (LRC) required by PAX ECR:
```typescript
function calcLRC(buf: Buffer): number {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 0xFF;
}
