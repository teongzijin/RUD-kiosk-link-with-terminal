# RUD-kiosk-link-with-terminal
Multi-Protocol Payment Terminal Middleware
Enterprise-grade Node.js middleware bridging web-based Kiosks with physical payment hardware (PAX IM30 / A920).

System Architecture
The middleware acts as a high-reliability gateway that overcomes browser security sandboxing, allowing web interfaces to communicate with local hardware via WebSocket.

Architectural Highlights:
Driver-based Abstraction: Implements a Factory Pattern to support polymorphic hardware communication, decoupling business logic from hardware-specific protocols.

Protocol Diversity: Seamlessly handles Binary/BCD/LRC streams for Serial devices (IM30) and JSON-over-TCP for Android-based devices (A920).

Robust State Management: Built-in handling for hardware interrupts, ACK/NAK synchronization, and connection timeouts to ensure transactional integrity.

Key Features
1. Unified Hardware API
By using a TerminalFactory, the frontend only needs to send a standardized JSON request. The middleware automatically instantiates the correct driver:

A920 Driver: Manages TCP/IP sockets and asynchronous JSON packet delivery.

IM30 Driver: Handles low-level serial communication (RS232), BCD encoding, and Longitudinal Redundancy Check (LRC) validation.

2. Failure Recovery & Security
Idempotency Protection: Ensures transaction IDs are tracked to prevent duplicate billing in case of network jitters.

Automatic Reconnect: Implements exponential backoff for TCP connections to mitigate ECONNREFUSED errors during terminal sleep modes.

Signature Verification: Supports HMAC-SHA256 signing for all outgoing Instant Payment Notifications (IPN).

Tech Stack
Runtime: Node.js

Protocols: WebSocket (ws), TCP (net), Serial (serialport)

Design Patterns: Factory Method, Strategy Pattern, Singleton

Project Structure
Plaintext
/src
  ├── /drivers
  │    ├── BaseDriver.js    # Abstract base class for all terminals
  │    ├── A920Driver.js    # TCP/JSON Implementation
  │    └── IM30Driver.js    # Serial/BCD Implementation
  ├── TerminalFactory.js    # Dynamic driver instantiation logic
  └── Server.js             # WebSocket server entry point

Disclosure & NDA
Notice: This repository is an architectural showcase. Due to non-disclosure agreements (NDA) with the client, proprietary business logic, sensitive IP addresses, and private encryption keys have been abstracted or removed. The code focuses on demonstrating system integration, protocol parsing, and hardware orchestration capabilities.
