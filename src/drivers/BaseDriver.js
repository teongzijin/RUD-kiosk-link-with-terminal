
class BaseDriver {
    constructor(config) {
        this.config = config;
    }

    async execute(params, onData, onError) {
        throw new Error("Method 'execute()' must be implemented.");
    }

    // for logging
    log(message) {
        console.log(`[${this.constructor.name}] ${message}`);
    }
}

module.exports = BaseDriver;
